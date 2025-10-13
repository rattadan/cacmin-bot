import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, StargateClient, GasPrice } from '@cosmjs/stargate';
import { config } from '../config';
import { logger } from '../utils/logger';
import { LedgerService, TransactionType } from './ledgerService';
import { query, get, execute } from '../database';
import { SecureTransactionLockService } from './secureTransactionLock';
import { DepositInstructionService } from './depositInstructions';
import { AmountPrecision } from '../utils/precision';
import { RPCTransactionVerification } from './rpcTransactionVerification';

// Special user IDs for system accounts
export const SYSTEM_USER_IDS = {
  BOT_TREASURY: -1,  // Bot treasury account in internal ledger
  SYSTEM_RESERVE: -2, // System reserve for discrepancies
  UNCLAIMED: -3      // Unclaimed deposits (no memo/invalid userId)
};

interface User {
  id: number;
  username?: string;
}

interface DepositCheck {
  txHash: string;
  userId?: number;
  amount: number;
  fromAddress: string;
  memo: string;
  height: number;
  timestamp: number;
}

/**
 * Unified Wallet Service
 * Single wallet system with bot as internal ledger user
 */
export class UnifiedWalletService {
  private static wallet: DirectSecp256k1HdWallet | null = null;
  private static walletAddress: string;
  private static rpcEndpoint: string;
  private static apiEndpoint: string;
  private static depositCheckInterval: NodeJS.Timeout | null = null;
  private static lastCheckedHeight: number = 0;

  /**
   * Initialize the unified wallet service
   */
  static async initialize(): Promise<void> {
    this.rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';
    this.apiEndpoint = config.junoApiUrl || 'https://api.juno.basementnodes.ca';

    // Get wallet address from config (single wallet for all users)
    this.walletAddress = config.userFundsAddress || '';

    if (!this.walletAddress) {
      logger.error('Wallet address not configured');
      return;
    }

    // Initialize wallet signer if mnemonic is provided
    if (config.userFundsMnemonic) {
      try {
        this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(
          config.userFundsMnemonic,
          { prefix: 'juno' }
        );

        const [account] = await this.wallet.getAccounts();

        if (account.address !== this.walletAddress) {
          logger.warn('Wallet address mismatch', {
            configured: this.walletAddress,
            derived: account.address
          });
        }
      } catch (error) {
        logger.error('Failed to initialize wallet from mnemonic', error);
      }
    }

    // Initialize system users in the ledger
    await this.initializeSystemUsers();

    // Get last checked height for deposits
    const lastProcessed = get<{ height: number }>(
      'SELECT MAX(height) as height FROM processed_deposits'
    );
    this.lastCheckedHeight = lastProcessed?.height || 0;

    logger.info('Unified wallet service initialized', {
      address: this.walletAddress,
      hasSigningCapability: !!this.wallet,
      lastCheckedHeight: this.lastCheckedHeight
    });

    // Start deposit monitoring
    this.startDepositMonitoring();
  }

  /**
   * Initialize system users in the ledger
   */
  private static async initializeSystemUsers(): Promise<void> {
    // Ensure bot treasury user exists
    const botUser = get<User>('SELECT * FROM users WHERE id = ?', [SYSTEM_USER_IDS.BOT_TREASURY]);

    if (!botUser) {
      execute(
        'INSERT INTO users (id, username, role, created_at) VALUES (?, ?, ?, ?)',
        [SYSTEM_USER_IDS.BOT_TREASURY, 'BOT_TREASURY', 'system', Math.floor(Date.now() / 1000)]
      );

      // Initialize bot balance
      await LedgerService.ensureUserBalance(SYSTEM_USER_IDS.BOT_TREASURY);
      logger.info('Created bot treasury user in ledger');
    }

    // Ensure unclaimed deposits user exists
    const unclaimedUser = get<User>('SELECT * FROM users WHERE id = ?', [SYSTEM_USER_IDS.UNCLAIMED]);

    if (!unclaimedUser) {
      execute(
        'INSERT INTO users (id, username, role, created_at) VALUES (?, ?, ?, ?)',
        [SYSTEM_USER_IDS.UNCLAIMED, 'UNCLAIMED_DEPOSITS', 'system', Math.floor(Date.now() / 1000)]
      );

      await LedgerService.ensureUserBalance(SYSTEM_USER_IDS.UNCLAIMED);
      logger.info('Created unclaimed deposits user in ledger');
    }
  }

  /**
   * Start monitoring for deposits
   */
  private static startDepositMonitoring(): void {
    if (this.depositCheckInterval) {
      return;
    }

    // Check for deposits every 30 seconds
    this.depositCheckInterval = setInterval(() => {
      this.checkForDeposits().catch(error => {
        logger.error('Error checking for deposits', error);
      });
    }, 30000);

    // Do initial check
    this.checkForDeposits().catch(error => {
      logger.error('Initial deposit check failed', error);
    });

    logger.info('Deposit monitoring started');
  }

  /**
   * Check for new deposits
   */
  private static async checkForDeposits(): Promise<void> {
    try {
      const deposits = await this.fetchRecentDeposits();

      for (const deposit of deposits) {
        await this.processDeposit(deposit);
      }
    } catch (error) {
      logger.error('Failed to check deposits', error);
    }
  }

  /**
   * Fetch recent deposits from blockchain
   */
  private static async fetchRecentDeposits(): Promise<DepositCheck[]> {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${this.walletAddress}'&order_by=ORDER_BY_DESC&limit=20`
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json() as any;
      const deposits: DepositCheck[] = [];

      for (const tx of (data.tx_responses || [])) {
        // Skip if already processed
        if (parseInt(tx.height) <= this.lastCheckedHeight) {
          continue;
        }

        // Skip failed transactions
        if (tx.code !== 0) {
          continue;
        }

        // Parse transaction
        for (const msg of (tx.tx?.body?.messages || [])) {
          if (msg['@type'] === '/cosmos.bank.v1beta1.MsgSend' &&
              msg.to_address === this.walletAddress) {

            const junoAmount = msg.amount?.find((a: any) => a.denom === 'ujuno');
            if (junoAmount) {
              const amount = parseFloat(junoAmount.amount) / 1_000_000;
              const memo = tx.tx?.body?.memo || '';
              const userId = this.parseUserId(memo);

              deposits.push({
                txHash: tx.txhash,
                userId,
                amount,
                fromAddress: msg.from_address,
                memo,
                height: parseInt(tx.height),
                timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000)
              });
            }
          }
        }
      }

      return deposits;
    } catch (error) {
      logger.error('Failed to fetch deposits', error);
      return [];
    }
  }

  /**
   * Process a single deposit
   */
  private static async processDeposit(deposit: DepositCheck): Promise<void> {
    // Check if already processed
    const existing = get<any>(
      'SELECT * FROM processed_deposits WHERE tx_hash = ?',
      [deposit.txHash]
    );

    if (existing) {
      return;
    }

    // Record deposit as processing
    execute(
      `INSERT INTO processed_deposits (
        tx_hash, user_id, amount, from_address, memo, height, processed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        deposit.txHash,
        deposit.userId || null,
        deposit.amount,
        deposit.fromAddress,
        deposit.memo,
        deposit.height,
        deposit.timestamp
      ]
    );

    // Update last checked height
    if (deposit.height > this.lastCheckedHeight) {
      this.lastCheckedHeight = deposit.height;
    }

    // Determine target user
    let targetUserId = deposit.userId;

    if (!targetUserId) {
      // No valid userId in memo - send to unclaimed account
      targetUserId = SYSTEM_USER_IDS.UNCLAIMED;
      logger.info('Deposit without valid userId, sending to unclaimed', {
        txHash: deposit.txHash,
        memo: deposit.memo,
        amount: deposit.amount
      });
    } else {
      // Verify user exists
      const user = get<User>('SELECT id FROM users WHERE id = ?', [targetUserId]);
      if (!user) {
        targetUserId = SYSTEM_USER_IDS.UNCLAIMED;
        logger.warn('Deposit for non-existent user, sending to unclaimed', {
          txHash: deposit.txHash,
          userId: deposit.userId,
          amount: deposit.amount
        });
      }
    }

    // Process deposit in ledger
    const result = await LedgerService.processDeposit(
      targetUserId,
      deposit.amount,
      deposit.txHash,
      deposit.fromAddress,
      `Deposit from ${deposit.fromAddress}${deposit.memo ? ` (memo: ${deposit.memo})` : ''}`
    );

    // Update processed status
    execute(
      'UPDATE processed_deposits SET processed = 1, processed_at = ?, user_id = ?, error = ? WHERE tx_hash = ?',
      [
        Math.floor(Date.now() / 1000),
        targetUserId,
        result.success ? null : 'Ledger processing failed',
        deposit.txHash
      ]
    );

    if (result.success) {
      logger.info('Deposit processed successfully', {
        userId: targetUserId,
        amount: deposit.amount,
        txHash: deposit.txHash,
        newBalance: result.newBalance
      });
    } else {
      logger.error('Failed to process deposit', {
        userId: targetUserId,
        txHash: deposit.txHash,
        error: result.error
      });
    }
  }

  /**
   * Parse userId from memo
   */
  private static parseUserId(memo: string): number | null {
    if (!memo) return null;

    // Try direct number parsing
    const parsed = parseInt(memo.trim());
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    // Try extracting from patterns like "userId:123" or "user 123"
    const match = memo.match(/(?:user[Id]*[:\s]+)?(\d+)/i);
    if (match && match[1]) {
      const id = parseInt(match[1]);
      if (!isNaN(id) && id > 0) {
        return id;
      }
    }

    return null;
  }

  /**
   * Get deposit instructions for a user with clear warnings
   */
  static getDepositInstructions(userId: number): {
    address: string;
    memo: string;
    instructions: string;
    markdown: string;
  } {
    const instructions = DepositInstructionService.generateInstructions(userId);

    return {
      address: instructions.walletAddress,
      memo: instructions.memo,
      instructions: instructions.text,
      markdown: instructions.markdown
    };
  }

  /**
   * Process user withdrawal to external wallet with secure locking
   */
  static async processWithdrawal(
    userId: number,
    toAddress: string,
    amount: number
  ): Promise<{ success: boolean; txHash?: string; error?: string; newBalance?: number }> {
    // Validate address
    if (!toAddress.startsWith('juno1') || toAddress.length !== 43) {
      return {
        success: false,
        error: 'Invalid Juno address format'
      };
    }

    // Validate amount precision
    let validatedAmount: number;
    try {
      validatedAmount = AmountPrecision.validateAmount(amount);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid amount precision'
      };
    }

    // Check balance before acquiring lock
    const balance = await LedgerService.getUserBalance(userId);
    if (!AmountPrecision.isGreaterOrEqual(balance, validatedAmount)) {
      return {
        success: false,
        error: `Insufficient balance. You have ${AmountPrecision.format(balance)} JUNO`,
        newBalance: balance
      };
    }

    // Acquire secure withdrawal lock
    const lockResult = await SecureTransactionLockService.acquireWithdrawalLock(
      userId,
      validatedAmount,
      toAddress
    );

    if (!lockResult.success) {
      return {
        success: false,
        error: lockResult.error || 'Failed to acquire withdrawal lock',
        newBalance: balance
      };
    }

    try {
      // Create pending withdrawal in ledger (deducts from balance)
      const withdrawalResult = await LedgerService.processWithdrawal(
        userId,
        validatedAmount,
        toAddress,
        undefined,
        `Withdrawal to ${toAddress}`
      );

      if (!withdrawalResult.success) {
        // Release lock if ledger update failed
        await SecureTransactionLockService.releaseWithdrawalLock(userId, '', true);

        return {
          success: false,
          error: withdrawalResult.error,
          newBalance: withdrawalResult.newBalance
        };
      }

      // Execute on-chain transaction
      if (!this.wallet) {
        // Refund if we can't sign
        await LedgerService.processGiveaway(userId, validatedAmount, 'Withdrawal refund - signing unavailable');
        await SecureTransactionLockService.releaseWithdrawalLock(userId, '', true);

        return {
          success: false,
          error: 'Withdrawal service temporarily unavailable',
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        this.wallet,
        { gasPrice: GasPrice.fromString('0.075ujuno') }
      );

      const [account] = await this.wallet.getAccounts();
      const amountInUjuno = AmountPrecision.toMicroJuno(validatedAmount);

      let result;
      try {
        result = await client.sendTokens(
          account.address,
          toAddress,
          [{ denom: 'ujuno', amount: amountInUjuno.toString() }],
          'auto',
          `Withdrawal for user ${userId}`
        );
      } catch (txError) {
        // Transaction failed - refund and release lock
        logger.error('On-chain transaction failed', { userId, error: txError });

        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund - transaction failed');
        await SecureTransactionLockService.releaseWithdrawalLock(userId, '', true);

        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Transaction failed',
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      // Update lock with transaction hash
      await SecureTransactionLockService.updateLockWithTxHash(userId, result.transactionHash);

      // Verify transaction status
      if (result.code !== 0) {
        // Transaction failed on-chain - refund and release lock
        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund - transaction rejected');
        await SecureTransactionLockService.releaseWithdrawalLock(userId, result.transactionHash, true);

        return {
          success: false,
          error: `Transaction failed: ${result.rawLog || 'Unknown error'}`,
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      // Update transaction record with hash
      if (withdrawalResult.transactionId) {
        await LedgerService.updateTransactionStatus(
          withdrawalResult.transactionId,
          'completed' as any,
          result.transactionHash
        );
      }

      // Attempt to verify and release lock
      const releaseResult = await SecureTransactionLockService.releaseWithdrawalLock(
        userId,
        result.transactionHash,
        false // Don't force - verify first
      );

      if (!releaseResult.released) {
        // Lock not released - transaction needs manual verification
        logger.warn('Withdrawal lock not released after transaction', {
          userId,
          txHash: result.transactionHash,
          error: releaseResult.error
        });
      }

      logger.info('Withdrawal completed', {
        userId,
        toAddress,
        amount,
        txHash: result.transactionHash,
        lockReleased: releaseResult.released
      });

      return {
        success: true,
        txHash: result.transactionHash,
        newBalance: withdrawalResult.newBalance
      };
    } catch (error) {
      // Unexpected error - ensure lock is released and user is refunded
      logger.error('Unexpected error during withdrawal', { userId, error });

      try {
        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund - system error');
      } catch (refundError) {
        logger.error('Failed to refund user after error', { userId, refundError });
      }

      await SecureTransactionLockService.releaseWithdrawalLock(userId, '', true);

      return {
        success: false,
        error: 'System error during withdrawal. Your balance has been restored.',
        newBalance: await LedgerService.getUserBalance(userId)
      };
    }
  }

  /**
   * Pay fine (internal transfer to bot treasury)
   */
  static async payFine(
    userId: number,
    amount: number,
    reason?: string
  ): Promise<{ success: boolean; error?: string; newBalance?: number }> {
    // Use internal transfer to bot treasury
    const result = await LedgerService.transferBetweenUsers(
      userId,
      SYSTEM_USER_IDS.BOT_TREASURY,
      amount,
      reason || 'Fine payment'
    );

    if (result.success) {
      logger.info('Fine paid', {
        userId,
        amount,
        newBalance: result.fromBalance,
        botBalance: result.toBalance
      });
    }

    return {
      success: result.success,
      error: result.error,
      newBalance: result.fromBalance
    };
  }

  /**
   * Transfer between users (internal) with simple locking and exact precision
   */
  static async transferToUser(
    fromUserId: number,
    toUserId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; error?: string; fromBalance?: number; toBalance?: number }> {
    try {
      // Validate amount precision (exactly 6 decimals)
      const validatedAmount = AmountPrecision.validateAmount(amount);

      // Acquire simple locks for both users
      const lockResult = await SecureTransactionLockService.acquireTransferLocks(
        fromUserId,
        toUserId,
        validatedAmount
      );

      if (!lockResult.success) {
        return {
          success: false,
          error: lockResult.error
        };
      }

      try {
        // Perform the internal ledger transfer
        const result = await LedgerService.transferBetweenUsers(
          fromUserId,
          toUserId,
          validatedAmount,
          description
        );

        // Release locks after ledger update
        await SecureTransactionLockService.releaseTransferLocks(fromUserId, toUserId);

        if (result.success) {
          logger.info('Internal transfer completed', {
            fromUserId,
            toUserId,
            amount: AmountPrecision.format(validatedAmount),
            fromBalance: result.fromBalance ? AmountPrecision.format(result.fromBalance) : undefined,
            toBalance: result.toBalance ? AmountPrecision.format(result.toBalance) : undefined
          });
        }

        return result;
      } catch (error) {
        // Release locks on error
        await SecureTransactionLockService.releaseTransferLocks(fromUserId, toUserId);
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('precision')) {
        return {
          success: false,
          error: error.message
        };
      }

      logger.error('Transfer failed', {
        fromUserId,
        toUserId,
        amount,
        error
      });

      return {
        success: false,
        error: 'Transfer failed'
      };
    }
  }

  /**
   * Get user balance
   */
  static async getBalance(userId: number): Promise<number> {
    return LedgerService.getUserBalance(userId);
  }

  /**
   * Get bot treasury balance
   */
  static async getBotBalance(): Promise<number> {
    return LedgerService.getUserBalance(SYSTEM_USER_IDS.BOT_TREASURY);
  }

  /**
   * Verify transaction on blockchain
   */
  static async verifyTransaction(txHash: string): Promise<{
    verified: boolean;
    amount?: number;
    from?: string;
    to?: string;
    memo?: string;
  }> {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`
      );

      if (!response.ok) {
        return { verified: false };
      }

      const data = await response.json() as any;
      const tx = data.tx_response;

      if (tx.code !== 0) {
        return { verified: false };
      }

      // Find transfer to our wallet
      for (const msg of (tx.tx?.body?.messages || [])) {
        if (msg['@type'] === '/cosmos.bank.v1beta1.MsgSend') {
          const junoAmount = msg.amount?.find((a: any) => a.denom === 'ujuno');

          if (junoAmount) {
            return {
              verified: true,
              amount: parseFloat(junoAmount.amount) / 1_000_000,
              from: msg.from_address,
              to: msg.to_address,
              memo: tx.tx?.body?.memo || ''
            };
          }
        }
      }

      return { verified: false };
    } catch (error) {
      logger.error('Failed to verify transaction', { txHash, error });
      return { verified: false };
    }
  }

  /**
   * Get wallet statistics
   */
  static async getStats(): Promise<{
    walletAddress: string;
    onChainBalance: number;
    internalTotal: number;
    botBalance: number;
    unclaimedBalance: number;
    activeUsers: number;
    pendingDeposits: number;
    reconciled: boolean;
  }> {
    // Get on-chain balance
    let onChainBalance = 0;
    try {
      const response = await fetch(
        `${this.apiEndpoint}/cosmos/bank/v1beta1/balances/${this.walletAddress}`
      );

      if (response.ok) {
        const data = await response.json() as any;
        const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');
        onChainBalance = junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
      }
    } catch (error) {
      logger.error('Failed to get on-chain balance', error);
    }

    // Get internal totals
    const internalTotal = await LedgerService.getTotalUserBalance();
    const botBalance = await this.getBotBalance();
    const unclaimedBalance = await LedgerService.getUserBalance(SYSTEM_USER_IDS.UNCLAIMED);

    // Get active users count
    const activeUsers = get<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_balances WHERE balance > 0 AND user_id > 0'
    )?.count || 0;

    // Get pending deposits
    const pendingDeposits = get<{ count: number }>(
      'SELECT COUNT(*) as count FROM processed_deposits WHERE processed = 0'
    )?.count || 0;

    // Check reconciliation
    const difference = Math.abs(onChainBalance - internalTotal);
    const reconciled = difference < 0.01; // Allow 0.01 JUNO difference

    return {
      walletAddress: this.walletAddress,
      onChainBalance,
      internalTotal,
      botBalance,
      unclaimedBalance,
      activeUsers,
      pendingDeposits,
      reconciled
    };
  }

  /**
   * Claim unclaimed deposit
   */
  static async claimUnclaimedDeposit(
    txHash: string,
    userId: number
  ): Promise<{ success: boolean; error?: string; amount?: number }> {
    // Check if deposit exists and is unclaimed
    const deposit = get<any>(
      'SELECT * FROM processed_deposits WHERE tx_hash = ? AND user_id = ?',
      [txHash, SYSTEM_USER_IDS.UNCLAIMED]
    );

    if (!deposit) {
      return {
        success: false,
        error: 'Deposit not found or not unclaimed'
      };
    }

    // Transfer from unclaimed to user
    const result = await LedgerService.transferBetweenUsers(
      SYSTEM_USER_IDS.UNCLAIMED,
      userId,
      deposit.amount,
      `Claimed deposit ${txHash}`
    );

    if (result.success) {
      // Update deposit record
      execute(
        'UPDATE processed_deposits SET user_id = ? WHERE tx_hash = ?',
        [userId, txHash]
      );

      logger.info('Unclaimed deposit claimed', {
        txHash,
        userId,
        amount: deposit.amount
      });

      return {
        success: true,
        amount: deposit.amount
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Stop deposit monitoring
   */
  static stop(): void {
    if (this.depositCheckInterval) {
      clearInterval(this.depositCheckInterval);
      this.depositCheckInterval = null;
    }
    logger.info('Unified wallet service stopped');
  }
}