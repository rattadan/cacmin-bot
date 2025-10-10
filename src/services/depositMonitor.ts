import { LedgerService } from './ledgerService';
import { logger } from '../utils/logger';
import { config } from '../config';
import { get, execute } from '../database';

interface ProcessedDeposit {
  txHash: string;
  processedAt: number;
}

interface CosmosTransaction {
  txhash: string;
  height: string;
  tx: {
    body: {
      messages: Array<{
        '@type': string;
        from_address: string;
        to_address: string;
        amount: Array<{
          denom: string;
          amount: string;
        }>;
      }>;
      memo: string;
    };
  };
  timestamp: string;
}

export class DepositMonitor {
  private static apiEndpoint: string;
  private static userFundsAddress: string;
  private static checkInterval: number = 60000; // Check every minute
  private static intervalId: NodeJS.Timeout | null = null;
  private static isRunning: boolean = false;

  /**
   * Initialize the deposit monitor
   */
  static initialize(): void {
    this.apiEndpoint = config.junoApiUrl || 'https://api.juno.basementnodes.ca';
    this.userFundsAddress = config.userFundsAddress || '';

    if (!this.userFundsAddress) {
      logger.warn('User funds wallet address not configured, deposit monitoring disabled');
      return;
    }

    // Create table for tracking processed deposits
    this.createProcessedDepositsTable();

    logger.info('Deposit monitor initialized', {
      walletAddress: this.userFundsAddress,
      checkInterval: this.checkInterval
    });
  }

  /**
   * Create table to track processed deposits (prevent double processing)
   */
  private static createProcessedDepositsTable(): void {
    execute(`
      CREATE TABLE IF NOT EXISTS processed_deposits (
        tx_hash TEXT PRIMARY KEY,
        processed_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create index for faster lookups
    execute(`
      CREATE INDEX IF NOT EXISTS idx_processed_deposits_time
      ON processed_deposits(processed_at)
    `);
  }

  /**
   * Start monitoring for deposits
   */
  static start(): void {
    if (this.isRunning) {
      logger.warn('Deposit monitor already running');
      return;
    }

    if (!this.userFundsAddress) {
      logger.error('Cannot start deposit monitor: wallet address not configured');
      return;
    }

    this.isRunning = true;

    // Run immediately on start
    this.checkForDeposits();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkForDeposits();
    }, this.checkInterval);

    logger.info('Deposit monitor started');
  }

  /**
   * Stop monitoring
   */
  static stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Deposit monitor stopped');
  }

  /**
   * Check for new deposits
   */
  private static async checkForDeposits(): Promise<void> {
    try {
      // Query recent transactions for the user funds wallet
      const transactions = await this.getRecentTransactions(this.userFundsAddress);

      for (const tx of transactions) {
        await this.processTransaction(tx);
      }
    } catch (error) {
      logger.error('Error checking for deposits', { error });
    }
  }

  /**
   * Get recent transactions for a wallet address
   */
  private static async getRecentTransactions(address: string): Promise<CosmosTransaction[]> {
    try {
      // Query transactions where our wallet is the recipient
      // Using the events parameter to filter for receive events
      const url = `${this.apiEndpoint}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&order_by=ORDER_BY_DESC&limit=50`;

      const response = await fetch(url);

      if (!response.ok) {
        logger.error('Failed to query transactions', {
          status: response.status,
          statusText: response.statusText
        });
        return [];
      }

      const data = await response.json() as any;
      return data.txs || [];
    } catch (error) {
      logger.error('Error fetching transactions', { error });
      return [];
    }
  }

  /**
   * Process a single transaction
   */
  private static async processTransaction(tx: CosmosTransaction): Promise<void> {
    const txHash = tx.txhash;

    // Check if we've already processed this transaction
    if (await this.isTransactionProcessed(txHash)) {
      return;
    }

    try {
      // Extract memo (should be userId)
      const memo = tx.tx.body.memo;

      if (!memo || !memo.match(/^\d+$/)) {
        // Not a valid userId memo, skip
        logger.debug('Skipping transaction with invalid memo', { txHash, memo });
        await this.markTransactionProcessed(txHash);
        return;
      }

      const userId = parseInt(memo, 10);

      // Process each message in the transaction
      for (const message of tx.tx.body.messages) {
        // Check if this is a MsgSend to our wallet
        if (
          message['@type'] === '/cosmos.bank.v1beta1.MsgSend' &&
          message.to_address === this.userFundsAddress
        ) {
          // Find JUNO amount
          const junoAmount = message.amount.find(a => a.denom === 'ujuno');

          if (junoAmount) {
            const amount = parseFloat(junoAmount.amount) / 1_000_000; // Convert from ujuno to JUNO

            // Process the deposit
            const result = await LedgerService.processDeposit(
              userId,
              amount,
              txHash,
              message.from_address,
              `Deposit with memo: ${memo}`
            );

            if (result.success) {
              logger.info('Deposit processed successfully', {
                userId,
                amount,
                txHash,
                fromAddress: message.from_address,
                newBalance: result.newBalance
              });
            } else {
              logger.error('Failed to process deposit', {
                userId,
                amount,
                txHash,
                error: result.error
              });
            }
          }
        }
      }

      // Mark transaction as processed
      await this.markTransactionProcessed(txHash);
    } catch (error) {
      logger.error('Error processing transaction', { txHash, error });
    }
  }

  /**
   * Check if a transaction has already been processed
   */
  private static async isTransactionProcessed(txHash: string): Promise<boolean> {
    const result = get<ProcessedDeposit>(
      'SELECT * FROM processed_deposits WHERE tx_hash = ?',
      [txHash]
    );
    return !!result;
  }

  /**
   * Mark a transaction as processed
   */
  private static async markTransactionProcessed(txHash: string): Promise<void> {
    execute(
      'INSERT OR IGNORE INTO processed_deposits (tx_hash) VALUES (?)',
      [txHash]
    );
  }

  /**
   * Manually check a specific transaction by hash
   * Useful for testing or recovery
   */
  static async checkSpecificTransaction(txHash: string): Promise<{
    found: boolean;
    processed: boolean;
    userId?: number;
    amount?: number;
    error?: string;
  }> {
    try {
      // Query the specific transaction
      const url = `${this.apiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          found: false,
          processed: false,
          error: 'Transaction not found'
        };
      }

      const data = await response.json() as any;
      const tx = data.tx_response;

      // Check if already processed
      const alreadyProcessed = await this.isTransactionProcessed(txHash);
      if (alreadyProcessed) {
        return {
          found: true,
          processed: true,
          error: 'Transaction already processed'
        };
      }

      // Extract memo
      const memo = tx.tx.body.memo;
      if (!memo || !memo.match(/^\d+$/)) {
        return {
          found: true,
          processed: false,
          error: 'Invalid or missing memo (should be userId)'
        };
      }

      const userId = parseInt(memo, 10);

      // Find transfer to our wallet
      for (const message of tx.tx.body.messages) {
        if (
          message['@type'] === '/cosmos.bank.v1beta1.MsgSend' &&
          message.to_address === this.userFundsAddress
        ) {
          const junoAmount = message.amount.find((a: any) => a.denom === 'ujuno');

          if (junoAmount) {
            const amount = parseFloat(junoAmount.amount) / 1_000_000;

            // Process the deposit
            const result = await LedgerService.processDeposit(
              userId,
              amount,
              txHash,
              message.from_address
            );

            if (result.success) {
              await this.markTransactionProcessed(txHash);
              return {
                found: true,
                processed: true,
                userId,
                amount
              };
            } else {
              return {
                found: true,
                processed: false,
                userId,
                amount,
                error: result.error
              };
            }
          }
        }
      }

      return {
        found: true,
        processed: false,
        error: 'No valid transfer found to user funds wallet'
      };
    } catch (error) {
      logger.error('Error checking specific transaction', { txHash, error });
      return {
        found: false,
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up old processed deposits records (keep last 30 days)
   */
  static cleanupOldRecords(): void {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const result = execute(
      'DELETE FROM processed_deposits WHERE processed_at < ?',
      [thirtyDaysAgo]
    );

    logger.info('Cleaned up old deposit records', {
      deletedCount: result.changes
    });
  }

  /**
   * Get monitoring status
   */
  static getStatus(): {
    isRunning: boolean;
    walletAddress: string;
    checkInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      walletAddress: this.userFundsAddress,
      checkInterval: this.checkInterval
    };
  }
}