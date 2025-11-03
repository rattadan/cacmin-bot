import { query, execute, get } from '../database';
import { logger } from '../utils/logger';
import { config } from '../config';

// Transaction types
export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  FINE = 'fine',
  BAIL = 'bail',
  GIVEAWAY = 'giveaway',
  REFUND = 'refund'
}

// Transaction status
export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

interface UserBalance {
  userId: number;
  balance: number;
  lastUpdated: number;
  createdAt: number;
}

interface Transaction {
  id?: number;
  transactionType: TransactionType;
  fromUserId?: number;
  toUserId?: number;
  amount: number;
  balanceAfter?: number;
  description?: string;
  txHash?: string;
  externalAddress?: string;
  status: TransactionStatus;
  createdAt?: number;
  metadata?: string;
}

interface SystemWallet {
  id: string;
  address: string;
  description: string;
}

export class LedgerService {
  private static botTreasuryAddress: string;
  private static userFundsAddress: string;
  private static rpcEndpoint: string;
  private static apiEndpoint: string;

  /**
   * Initialize the ledger service
   */
  static initialize(): void {
    this.rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';
    this.apiEndpoint = config.junoApiUrl || 'https://api.juno.basementnodes.ca';

    // Get or set system wallet addresses
    this.botTreasuryAddress = config.botTreasuryAddress || '';
    this.userFundsAddress = config.userFundsAddress || '';

    if (!this.botTreasuryAddress || !this.userFundsAddress) {
      logger.warn('System wallet addresses not fully configured');
    }

    // Store system wallets in database
    this.initializeSystemWallets();

    logger.info('Ledger service initialized', {
      treasury: this.botTreasuryAddress,
      userFunds: this.userFundsAddress
    });
  }

  /**
   * Initialize system wallets in database
   */
  private static initializeSystemWallets(): void {
    if (this.botTreasuryAddress) {
      execute(
        'INSERT OR REPLACE INTO system_wallets (id, address, description) VALUES (?, ?, ?)',
        ['treasury', this.botTreasuryAddress, 'Bot treasury wallet for fines and giveaways']
      );
    }

    if (this.userFundsAddress) {
      execute(
        'INSERT OR REPLACE INTO system_wallets (id, address, description) VALUES (?, ?, ?)',
        ['user_funds', this.userFundsAddress, 'Collective user funds wallet']
      );
    }
  }

  /**
   * Get user's current balance from internal ledger
   */
  static async getUserBalance(userId: number): Promise<number> {
    const balance = get<UserBalance>(
      'SELECT * FROM user_balances WHERE user_id = ?',
      [userId]
    );

    return balance?.balance || 0;
  }

  /**
   * Get or create user balance entry
   */
  static async ensureUserBalance(userId: number): Promise<UserBalance> {
    let balance = get<UserBalance>(
      'SELECT * FROM user_balances WHERE user_id = ?',
      [userId]
    );

    if (!balance) {
      const now = Math.floor(Date.now() / 1000);
      execute(
        'INSERT INTO user_balances (user_id, balance, last_updated, created_at) VALUES (?, 0, ?, ?)',
        [userId, now, now]
      );

      balance = {
        userId,
        balance: 0,
        lastUpdated: now,
        createdAt: now
      };
    }

    return balance;
  }

  /**
   * Update user balance (internal use only, use transaction methods for actual operations)
   */
  private static async updateBalance(userId: number, newBalance: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    execute(
      'UPDATE user_balances SET balance = ?, last_updated = ? WHERE user_id = ?',
      [newBalance, now, userId]
    );
  }

  /**
   * Record a transaction in the ledger
   */
  private static async recordTransaction(transaction: Transaction): Promise<number> {
    const result = execute(
      `INSERT INTO transactions (
        transaction_type, from_user_id, to_user_id, amount, balance_after,
        description, tx_hash, external_address, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.transactionType,
        transaction.fromUserId || null,
        transaction.toUserId || null,
        transaction.amount,
        transaction.balanceAfter || null,
        transaction.description || null,
        transaction.txHash || null,
        transaction.externalAddress || null,
        transaction.status,
        transaction.metadata || null
      ]
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Process a deposit from an external wallet
   */
  static async processDeposit(
    userId: number,
    amount: number,
    txHash: string,
    fromAddress: string,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    try {
      // Ensure user has a balance entry
      await this.ensureUserBalance(userId);

      // Get current balance
      const currentBalance = await this.getUserBalance(userId);
      const newBalance = currentBalance + amount;

      // Update balance
      await this.updateBalance(userId, newBalance);

      // Record transaction
      await this.recordTransaction({
        transactionType: TransactionType.DEPOSIT,
        toUserId: userId,
        amount,
        balanceAfter: newBalance,
        description: description || `Deposit from ${fromAddress}`,
        txHash,
        externalAddress: fromAddress,
        status: TransactionStatus.COMPLETED
      });

      logger.info('Deposit processed', {
        userId,
        amount,
        newBalance,
        txHash
      });

      return { success: true, newBalance };
    } catch (error) {
      logger.error('Failed to process deposit', { userId, amount, error });
      return {
        success: false,
        newBalance: await this.getUserBalance(userId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a withdrawal to an external wallet
   */
  static async processWithdrawal(
    userId: number,
    amount: number,
    toAddress: string,
    txHash?: string,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; transactionId?: number; error?: string }> {
    try {
      // Check balance
      const currentBalance = await this.getUserBalance(userId);
      if (currentBalance < amount) {
        return {
          success: false,
          newBalance: currentBalance,
          error: 'Insufficient balance'
        };
      }

      const newBalance = currentBalance - amount;

      // Record as pending if no txHash yet
      const status = txHash ? TransactionStatus.COMPLETED : TransactionStatus.PENDING;

      // Update balance
      await this.updateBalance(userId, newBalance);

      // Record transaction
      const transactionId = await this.recordTransaction({
        transactionType: TransactionType.WITHDRAWAL,
        fromUserId: userId,
        amount,
        balanceAfter: newBalance,
        description: description || `Withdrawal to ${toAddress}`,
        txHash,
        externalAddress: toAddress,
        status
      });

      logger.info('Withdrawal processed', {
        userId,
        amount,
        newBalance,
        toAddress,
        txHash,
        transactionId
      });

      return { success: true, newBalance, transactionId };
    } catch (error) {
      logger.error('Failed to process withdrawal', { userId, amount, error });
      return {
        success: false,
        newBalance: await this.getUserBalance(userId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer tokens between users (internal ledger only)
   */
  static async transferBetweenUsers(
    fromUserId: number,
    toUserId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; fromBalance: number; toBalance: number; error?: string }> {
    try {
      // Ensure both users have balance entries
      await this.ensureUserBalance(fromUserId);
      await this.ensureUserBalance(toUserId);

      // Check sender balance
      const fromBalance = await this.getUserBalance(fromUserId);
      if (fromBalance < amount) {
        return {
          success: false,
          fromBalance,
          toBalance: await this.getUserBalance(toUserId),
          error: 'Insufficient balance'
        };
      }

      const toBalance = await this.getUserBalance(toUserId);

      // Update balances
      const newFromBalance = fromBalance - amount;
      const newToBalance = toBalance + amount;

      await this.updateBalance(fromUserId, newFromBalance);
      await this.updateBalance(toUserId, newToBalance);

      // Record transaction
      await this.recordTransaction({
        transactionType: TransactionType.TRANSFER,
        fromUserId,
        toUserId,
        amount,
        balanceAfter: newFromBalance,
        description: description || `Transfer to user ${toUserId}`,
        status: TransactionStatus.COMPLETED
      });

      logger.info('Internal transfer completed', {
        fromUserId,
        toUserId,
        amount,
        newFromBalance,
        newToBalance
      });

      return {
        success: true,
        fromBalance: newFromBalance,
        toBalance: newToBalance
      };
    } catch (error) {
      logger.error('Failed to process transfer', { fromUserId, toUserId, amount, error });
      return {
        success: false,
        fromBalance: await this.getUserBalance(fromUserId),
        toBalance: await this.getUserBalance(toUserId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a fine payment
   */
  static async processFine(
    userId: number,
    amount: number,
    violationId?: number,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    try {
      // Check balance
      const currentBalance = await this.getUserBalance(userId);
      if (currentBalance < amount) {
        return {
          success: false,
          newBalance: currentBalance,
          error: 'Insufficient balance for fine payment'
        };
      }

      const newBalance = currentBalance - amount;

      // Update balance
      await this.updateBalance(userId, newBalance);

      // Record transaction
      await this.recordTransaction({
        transactionType: TransactionType.FINE,
        fromUserId: userId,
        amount,
        balanceAfter: newBalance,
        description: description || `Fine payment${violationId ? ` for violation #${violationId}` : ''}`,
        status: TransactionStatus.COMPLETED,
        metadata: violationId ? JSON.stringify({ violationId }) : undefined
      });

      logger.info('Fine processed', {
        userId,
        amount,
        newBalance,
        violationId
      });

      return { success: true, newBalance };
    } catch (error) {
      logger.error('Failed to process fine', { userId, amount, error });
      return {
        success: false,
        newBalance: await this.getUserBalance(userId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a bail payment
   */
  static async processBail(
    paidByUserId: number,
    bailedUserId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    try {
      // Check payer balance
      const payerBalance = await this.getUserBalance(paidByUserId);
      if (payerBalance < amount) {
        return {
          success: false,
          newBalance: payerBalance,
          error: 'Insufficient balance for bail payment'
        };
      }

      const newBalance = payerBalance - amount;

      // Update payer balance
      await this.updateBalance(paidByUserId, newBalance);

      // Record transaction
      await this.recordTransaction({
        transactionType: TransactionType.BAIL,
        fromUserId: paidByUserId,
        toUserId: bailedUserId, // Track who was bailed
        amount,
        balanceAfter: newBalance,
        description: description || `Bail payment for user ${bailedUserId}`,
        status: TransactionStatus.COMPLETED
      });

      logger.info('Bail processed', {
        paidByUserId,
        bailedUserId,
        amount,
        newBalance
      });

      return { success: true, newBalance };
    } catch (error) {
      logger.error('Failed to process bail', { paidByUserId, bailedUserId, amount, error });
      return {
        success: false,
        newBalance: await this.getUserBalance(paidByUserId),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a giveaway/airdrop
   */
  static async processGiveaway(
    userId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; newBalance: number }> {
    try {
      await this.ensureUserBalance(userId);
      const currentBalance = await this.getUserBalance(userId);
      const newBalance = currentBalance + amount;

      // Update balance
      await this.updateBalance(userId, newBalance);

      // Record transaction
      await this.recordTransaction({
        transactionType: TransactionType.GIVEAWAY,
        toUserId: userId,
        amount,
        balanceAfter: newBalance,
        description: description || 'Giveaway/Airdrop',
        status: TransactionStatus.COMPLETED
      });

      logger.info('Giveaway processed', {
        userId,
        amount,
        newBalance
      });

      return { success: true, newBalance };
    } catch (error) {
      logger.error('Failed to process giveaway', { userId, amount, error });
      return {
        success: false,
        newBalance: await this.getUserBalance(userId)
      };
    }
  }

  /**
   * Get transaction history for a user
   */
  static async getUserTransactions(
    userId: number,
    limit: number = 10,
    offset: number = 0
  ): Promise<Transaction[]> {
    return query<Transaction>(
      `SELECT * FROM transactions
       WHERE from_user_id = ? OR to_user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, limit, offset]
    );
  }

  /**
   * Update transaction status (e.g., after blockchain confirmation)
   */
  static async updateTransactionStatus(
    transactionId: number,
    status: TransactionStatus,
    txHash?: string
  ): Promise<void> {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (txHash) {
      updates.push('tx_hash = ?');
      params.push(txHash);
    }

    params.push(transactionId);

    execute(
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.info('Transaction status updated', {
      transactionId,
      status,
      txHash
    });
  }

  /**
   * Get system wallet addresses
   */
  static getSystemWallets(): { treasury: string; userFunds: string } {
    return {
      treasury: this.botTreasuryAddress,
      userFunds: this.userFundsAddress
    };
  }

  /**
   * Get total balance across all users (for reconciliation)
   */
  static async getTotalUserBalance(): Promise<number> {
    const result = get<{ total: number }>(
      'SELECT SUM(balance) as total FROM user_balances'
    );
    return result?.total || 0;
  }

  /**
   * Check on-chain balance of system wallets
   */
  static async getSystemWalletBalance(walletType: 'treasury' | 'user_funds'): Promise<number> {
    const address = walletType === 'treasury' ? this.botTreasuryAddress : this.userFundsAddress;

    if (!address) {
      logger.warn(`${walletType} wallet address not configured`);
      return 0;
    }

    try {
      const response = await fetch(
        `${this.apiEndpoint}/cosmos/bank/v1beta1/balances/${address}`
      );

      if (!response.ok) {
        logger.error(`Failed to query ${walletType} wallet balance`, { address });
        return 0;
      }

      const data = await response.json() as any;
      const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');

      return junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
    } catch (error) {
      logger.error(`Error querying ${walletType} wallet balance`, { error });
      return 0;
    }
  }

  /**
   * Reconcile internal ledger with on-chain balances
   */
  static async reconcileBalances(): Promise<{
    internalTotal: number;
    onChainTotal: number;
    difference: number;
    matched: boolean;
  }> {
    const internalTotal = await this.getTotalUserBalance();
    const onChainBalance = await this.getSystemWalletBalance('treasury');

    const difference = Math.abs(internalTotal - onChainBalance);
    const matched = difference < 0.000001; // Allow for minor rounding differences

    logger.info('Balance reconciliation', {
      internalTotal,
      onChainTotal: onChainBalance,
      difference,
      matched
    });

    return {
      internalTotal,
      onChainTotal: onChainBalance,
      difference,
      matched
    };
  }

  /**
   * Reconcile balances and alert admins if mismatch detected
   * Note: Only logs warnings, does not send admin alerts to avoid spam
   * Admins should use /reconcile or /walletstats commands to manually check
   */
  static async reconcileAndAlert(): Promise<{
    internalTotal: number;
    onChainTotal: number;
    difference: number;
    matched: boolean;
  }> {
    const result = await this.reconcileBalances();

    if (!result.matched && result.difference > 0.01) {
      logger.warn('Balance mismatch detected during periodic reconciliation', {
        internalTotal: result.internalTotal,
        onChainTotal: result.onChainTotal,
        difference: result.difference,
        note: 'Admins should manually verify with /reconcile or /walletstats'
      });
    }

    return result;
  }
}