import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { config } from '../config';
import { logger } from '../utils/logger';
import { LedgerService, TransactionType } from './ledgerService';
import { query, get } from '../database';

interface User {
  id: number;
  username?: string;
}

/**
 * WalletService V2 - Using Internal Ledger System
 *
 * This service manages the interaction between the internal ledger and the blockchain.
 * All user balances are tracked internally, with two main on-chain wallets:
 * 1. Bot Treasury - Collects fines, distributes giveaways
 * 2. User Funds - Holds all user deposits collectively
 */
export class WalletServiceV2 {
  private static rpcEndpoint: string;
  private static apiEndpoint: string;
  private static userFundsWallet: DirectSecp256k1HdWallet | null = null;
  private static userFundsAddress: string;
  private static botTreasuryAddress: string;

  /**
   * Initialize wallet service with system wallets
   */
  static async initialize(): Promise<void> {
    this.rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';
    this.apiEndpoint = config.junoApiUrl || 'https://api.juno.basementnodes.ca';

    // Get system wallet addresses from config
    this.userFundsAddress = config.userFundsAddress || '';
    this.botTreasuryAddress = config.botTreasuryAddress || '';

    // Initialize wallet for user funds if mnemonic is provided
    if (config.userFundsMnemonic) {
      this.userFundsWallet = await DirectSecp256k1HdWallet.fromMnemonic(
        config.userFundsMnemonic,
        {
          prefix: 'juno'
        }
      );

      // Verify the address matches
      const [account] = await this.userFundsWallet.getAccounts();
      if (account.address !== this.userFundsAddress) {
        logger.warn('User funds wallet address mismatch', {
          configured: this.userFundsAddress,
          derived: account.address
        });
      }
    }

    logger.info('Wallet service V2 initialized', {
      treasury: this.botTreasuryAddress,
      userFunds: this.userFundsAddress,
      hasSigningCapability: !!this.userFundsWallet
    });
  }

  /**
   * Get user's balance from internal ledger
   */
  static async getUserBalance(userId: number): Promise<number> {
    return LedgerService.getUserBalance(userId);
  }

  /**
   * Get deposit address and memo for a user
   * Users always deposit to the same address with their userId as memo
   */
  static getDepositInfo(userId: number): {
    address: string;
    memo: string;
    instructions: string;
  } {
    return {
      address: this.userFundsAddress,
      memo: userId.toString(),
      instructions: `Send JUNO to ${this.userFundsAddress} with memo: ${userId}`
    };
  }

  /**
   * Send tokens from one user to another (internal transfer)
   */
  static async sendToUser(
    fromUserId: number,
    toUserId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; error?: string; fromBalance?: number; toBalance?: number }> {
    // Check if recipient exists
    const recipient = get<User>('SELECT * FROM users WHERE id = ?', [toUserId]);
    if (!recipient) {
      return {
        success: false,
        error: 'Recipient not found'
      };
    }

    const result = await LedgerService.transferBetweenUsers(
      fromUserId,
      toUserId,
      amount,
      description || `Transfer to @${recipient.username || `user${toUserId}`}`
    );

    return result;
  }

  /**
   * Send tokens to an external Juno wallet address (SECURE VERSION)
   * This withdraws from the user's internal balance and sends on-chain
   * Implements locking to prevent double-spending
   */
  static async sendToExternalWallet(
    userId: number,
    recipientAddress: string,
    amount: number,
    memo?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string; newBalance?: number }> {
    // Import TransactionLockService
    const { TransactionLockService } = await import('./transactionLock');

    // Step 1: Validate recipient address format
    if (!recipientAddress.startsWith('juno1')) {
      return {
        success: false,
        error: 'Invalid Juno address format'
      };
    }

    // Step 2: Acquire lock for this user
    const lockAcquired = await TransactionLockService.acquireLock(
      userId,
      'withdrawal',
      { recipientAddress, amount }
    );

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Another transaction is in progress. Please wait and try again.',
        newBalance: await LedgerService.getUserBalance(userId)
      };
    }

    try {
      // Step 3: Check user balance after lock is acquired
      const balance = await LedgerService.getUserBalance(userId);
      if (balance < amount) {
        await TransactionLockService.releaseLock(userId);
        return {
          success: false,
          error: `Insufficient balance. You have ${balance.toFixed(6)} JUNO`,
          newBalance: balance
        };
      }

      // Step 4: Get current on-chain balance of user funds wallet
      const preTransactionBalance = await this.getOnChainBalance(this.userFundsAddress);

      // Step 5: Create pending withdrawal in ledger (deduct from user balance)
      const withdrawalResult = await LedgerService.processWithdrawal(
        userId,
        amount,
        recipientAddress,
        undefined, // No txHash yet
        `Withdrawal to ${recipientAddress}`
      );

      if (!withdrawalResult.success) {
        await TransactionLockService.releaseLock(userId);
        return {
          success: false,
          error: withdrawalResult.error,
          newBalance: withdrawalResult.newBalance
        };
      }

      // Step 6: Execute on-chain transaction
      if (!this.userFundsWallet) {
        // If we don't have signing capability, keep the lock and return error
        logger.error('No signing capability for user funds wallet');
        await TransactionLockService.releaseLock(userId);

        // Refund the user since we can't complete the withdrawal
        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund (no signing capability)');

        return {
          success: false,
          error: 'Withdrawal service temporarily unavailable',
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      // Send tokens on-chain
      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        this.userFundsWallet,
        { gasPrice: GasPrice.fromString('0.025ujuno') }
      );

      const [account] = await this.userFundsWallet.getAccounts();
      const amountInUjuno = Math.floor(amount * 1_000_000);

      let result;
      try {
        result = await client.sendTokens(
          account.address,
          recipientAddress,
          [{ denom: 'ujuno', amount: amountInUjuno.toString() }],
          'auto',
          memo
        );
      } catch (txError) {
        // Transaction failed, refund the user
        logger.error('On-chain transaction failed', { userId, error: txError });

        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund (transaction failed)');
        await TransactionLockService.releaseLock(userId);

        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Transaction failed',
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      // Step 7: Verify the transaction was successful (code: 0)
      if (result.code !== 0) {
        // Transaction failed on-chain, refund the user
        logger.error('Transaction failed with non-zero code', {
          userId,
          code: result.code,
          log: result.rawLog
        });

        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund (transaction rejected)');
        await TransactionLockService.releaseLock(userId);

        return {
          success: false,
          error: `Transaction failed: ${result.rawLog || 'Unknown error'}`,
          newBalance: await LedgerService.getUserBalance(userId)
        };
      }

      // Step 8: Verify balance change on-chain (optional but recommended)
      const postTransactionBalance = await this.getOnChainBalance(this.userFundsAddress);
      const expectedDifference = amount;
      const actualDifference = preTransactionBalance - postTransactionBalance;

      // Allow for small differences due to fees
      const balanceVerified = Math.abs(actualDifference - expectedDifference) < 0.1;

      if (!balanceVerified) {
        logger.warn('Balance verification mismatch', {
          userId,
          expected: expectedDifference,
          actual: actualDifference,
          txHash: result.transactionHash
        });
      }

      // Step 9: Update transaction record with txHash
      if (withdrawalResult.transactionId) {
        await LedgerService.updateTransactionStatus(
          withdrawalResult.transactionId,
          'completed' as any,
          result.transactionHash
        );
      }

      // Step 10: Release the lock
      await TransactionLockService.releaseLock(userId);

      logger.info('Secure withdrawal completed', {
        userId,
        recipientAddress,
        amount,
        txHash: result.transactionHash,
        balanceVerified
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
        await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund (system error)');
      } catch (refundError) {
        logger.error('Failed to refund user after error', { userId, refundError });
      }

      await TransactionLockService.releaseLock(userId);

      return {
        success: false,
        error: 'System error during withdrawal. Your balance has been restored.',
        newBalance: await LedgerService.getUserBalance(userId)
      };
    }
  }

  /**
   * Helper function to get on-chain balance
   */
  private static async getOnChainBalance(address: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/cosmos/bank/v1beta1/balances/${address}`
      );

      if (!response.ok) {
        logger.error('Failed to query on-chain balance', { address });
        return 0;
      }

      const data = await response.json() as any;
      const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');

      return junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
    } catch (error) {
      logger.error('Error querying on-chain balance', { address, error });
      throw error;
    }
  }

  /**
   * Process a fine payment from user's balance
   */
  static async payFine(
    userId: number,
    amount: number,
    violationId?: number,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    return LedgerService.processFine(userId, amount, violationId, description);
  }

  /**
   * Process a bail payment from one user for another
   */
  static async payBail(
    payerUserId: number,
    bailedUserId: number,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    return LedgerService.processBail(payerUserId, bailedUserId, amount, description);
  }

  /**
   * Distribute tokens as a giveaway/airdrop
   */
  static async distributeGiveaway(
    userIds: number[],
    amountPerUser: number,
    description?: string
  ): Promise<{ succeeded: number[]; failed: number[]; totalDistributed: number }> {
    const succeeded: number[] = [];
    const failed: number[] = [];
    let totalDistributed = 0;

    for (const userId of userIds) {
      const result = await LedgerService.processGiveaway(userId, amountPerUser, description);

      if (result.success) {
        succeeded.push(userId);
        totalDistributed += amountPerUser;
      } else {
        failed.push(userId);
      }
    }

    logger.info('Giveaway distribution completed', {
      succeeded: succeeded.length,
      failed: failed.length,
      totalDistributed
    });

    return { succeeded, failed, totalDistributed };
  }

  /**
   * Get user's transaction history
   */
  static async getUserTransactionHistory(
    userId: number,
    limit: number = 10
  ): Promise<any[]> {
    return LedgerService.getUserTransactions(userId, limit);
  }

  /**
   * Check system wallet balances
   */
  static async getSystemBalances(): Promise<{
    treasury: { address: string; onChain: number };
    userFunds: { address: string; onChain: number; internal: number; difference: number };
  }> {
    const treasuryBalance = await LedgerService.getSystemWalletBalance('treasury');
    const userFundsBalance = await LedgerService.getSystemWalletBalance('user_funds');
    const internalTotal = await LedgerService.getTotalUserBalance();

    return {
      treasury: {
        address: this.botTreasuryAddress,
        onChain: treasuryBalance
      },
      userFunds: {
        address: this.userFundsAddress,
        onChain: userFundsBalance,
        internal: internalTotal,
        difference: userFundsBalance - internalTotal
      }
    };
  }

  /**
   * Reconcile balances between internal ledger and blockchain
   */
  static async reconcileBalances(): Promise<{
    matched: boolean;
    internalTotal: number;
    onChainTotal: number;
    difference: number;
  }> {
    return LedgerService.reconcileBalances();
  }

  /**
   * Helper to find user by username
   */
  static async findUserByUsername(username: string): Promise<User | null> {
    // Remove @ if present
    const cleanUsername = username.replace(/^@/, '');

    const user = get<User>(
      'SELECT * FROM users WHERE username = ?',
      [cleanUsername]
    );

    return user || null;
  }

  /**
   * Process a transfer by username instead of userId
   */
  static async sendToUsername(
    fromUserId: number,
    toUsername: string,
    amount: number,
    description?: string
  ): Promise<{ success: boolean; error?: string; recipient?: string; newBalance?: number }> {
    const recipient = await this.findUserByUsername(toUsername);

    if (!recipient) {
      return {
        success: false,
        error: `User @${toUsername.replace(/^@/, '')} not found`
      };
    }

    const result = await this.sendToUser(
      fromUserId,
      recipient.id,
      amount,
      description || `Transfer to @${recipient.username}`
    );

    return {
      ...result,
      recipient: recipient.username,
      newBalance: result.fromBalance
    };
  }

  /**
   * Get summary statistics for the ledger system
   */
  static async getLedgerStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalBalance: number;
    totalTransactions: number;
    recentDeposits: number;
    recentWithdrawals: number;
  }> {
    const stats = {
      totalUsers: 0,
      activeUsers: 0,
      totalBalance: 0,
      totalTransactions: 0,
      recentDeposits: 0,
      recentWithdrawals: 0
    };

    // Get user stats
    const userStats = get<{ total: number; active: number }>(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN balance > 0 THEN 1 END) as active
       FROM user_balances`
    );

    if (userStats) {
      stats.totalUsers = userStats.total;
      stats.activeUsers = userStats.active;
    }

    // Get total balance
    stats.totalBalance = await LedgerService.getTotalUserBalance();

    // Get transaction stats (last 24 hours)
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    const txStats = get<{ total: number; deposits: number; withdrawals: number }>(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN transaction_type = 'deposit' THEN 1 END) as deposits,
        COUNT(CASE WHEN transaction_type = 'withdrawal' THEN 1 END) as withdrawals
       FROM transactions
       WHERE created_at > ?`,
      [oneDayAgo]
    );

    if (txStats) {
      stats.totalTransactions = txStats.total;
      stats.recentDeposits = txStats.deposits;
      stats.recentWithdrawals = txStats.withdrawals;
    }

    return stats;
  }
}