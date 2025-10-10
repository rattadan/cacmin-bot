import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { config } from '../config';
import { logger } from '../utils/logger';
import { query, execute } from '../database';

interface UserWallet {
  userId: number;
  address: string;
  hdPath: string;
  createdAt: number;
}

/**
 * HD Path Derivation Strategy:
 *
 * BIP44 standard path: m/44'/118'/0'/0/x
 * - 44' = BIP44 purpose
 * - 118' = Cosmos coin type
 * - 0' = account (hardened)
 * - 0 = change (external addresses)
 * - x = address index
 *
 * We use Telegram userId to derive the address index:
 * - Telegram userIds are typically 9-10 digits (e.g., 123456789)
 * - We use userId directly as the address index
 * - Max safe integer: 2^31 - 1 = 2,147,483,647 (plenty of room)
 *
 * This ensures:
 * 1. Deterministic wallet generation from master mnemonic
 * 2. Easy recovery: userId -> HD path -> wallet
 * 3. No collision risk (Telegram IDs are unique)
 * 4. Compatible with standard Cosmos HD paths
 */
export class WalletService {
  private static masterMnemonic: string;
  private static rpcEndpoint: string;

  /**
   * Initialize wallet service with master mnemonic
   */
  static initialize(): void {
    if (!config.junoWalletMnemonic) {
      logger.warn('Master mnemonic not configured, wallet features disabled');
      return;
    }

    this.masterMnemonic = config.junoWalletMnemonic;
    this.rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';
    logger.info('Wallet service initialized');
  }

  /**
   * Generate HD path from Telegram userId
   * Uses standard Cosmos BIP44 path with userId as address index
   */
  static generateHdPath(userId: number): string {
    // Validate userId is positive integer
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Standard Cosmos HD path with userId as the address index
    return `m/44'/118'/0'/0/${userId}`;
  }

  /**
   * Create or retrieve user wallet
   * If wallet exists in DB, return it
   * Otherwise, derive new wallet and store in DB
   */
  static async getOrCreateUserWallet(userId: number, username?: string): Promise<UserWallet> {
    // Check if wallet already exists
    const existing = query<UserWallet>(
      'SELECT * FROM user_wallets WHERE user_id = ?',
      [userId]
    )[0];

    if (existing) {
      logger.debug('Retrieved existing wallet', { userId, address: existing.address });
      return existing;
    }

    // Generate new wallet
    const hdPath = this.generateHdPath(userId);
    const wallet = await this.deriveWallet(hdPath);
    const [account] = await wallet.getAccounts();

    const userWallet: UserWallet = {
      userId,
      address: account.address,
      hdPath,
      createdAt: Math.floor(Date.now() / 1000)
    };

    // Store in database
    execute(
      'INSERT INTO user_wallets (user_id, address, hd_path, created_at) VALUES (?, ?, ?, ?)',
      [userWallet.userId, userWallet.address, userWallet.hdPath, userWallet.createdAt]
    );

    logger.info('Created new user wallet', {
      userId,
      username,
      address: account.address,
      hdPath
    });

    return userWallet;
  }

  /**
   * Derive wallet from HD path
   */
  private static async deriveWallet(hdPath: string): Promise<DirectSecp256k1HdWallet> {
    if (!this.masterMnemonic) {
      throw new Error('Master mnemonic not configured');
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(this.masterMnemonic, {
      prefix: 'juno',
      hdPaths: [hdPath as any]
    });

    return wallet;
  }

  /**
   * Get user's wallet address
   */
  static async getUserAddress(userId: number): Promise<string | null> {
    const wallet = query<UserWallet>(
      'SELECT address FROM user_wallets WHERE user_id = ?',
      [userId]
    )[0];

    return wallet?.address || null;
  }

  /**
   * Get user's wallet balance
   */
  static async getUserBalance(userId: number): Promise<number> {
    const address = await this.getUserAddress(userId);
    if (!address) return 0;

    try {
      const response = await fetch(
        `${this.rpcEndpoint}/cosmos/bank/v1beta1/balances/${address}`
      );

      if (!response.ok) {
        logger.error('Failed to query user balance', { userId, address });
        return 0;
      }

      const data = await response.json() as any;
      const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');

      return junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
    } catch (error) {
      logger.error('Error querying user balance', { userId, error });
      return 0;
    }
  }

  /**
   * Send tokens from bot treasury to user wallet
   */
  static async sendToUser(
    userId: number,
    amount: number,
    memo?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const userAddress = await this.getUserAddress(userId);
      if (!userAddress) {
        return { success: false, error: 'User wallet not found' };
      }

      // Get bot's master wallet (account 0)
      const botHdPath = "m/44'/118'/0'/0/0";
      const botWallet = await this.deriveWallet(botHdPath);
      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        botWallet,
        { gasPrice: GasPrice.fromString('0.025ujuno') }
      );

      const [botAccount] = await botWallet.getAccounts();

      // Send tokens
      const amountInUjuno = Math.floor(amount * 1_000_000);
      const result = await client.sendTokens(
        botAccount.address,
        userAddress,
        [{ denom: 'ujuno', amount: amountInUjuno.toString() }],
        'auto',
        memo
      );

      logger.info('Tokens sent to user', {
        userId,
        userAddress,
        amount,
        txHash: result.transactionHash
      });

      return {
        success: true,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Failed to send tokens to user', { userId, amount, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send tokens from user wallet to any address
   */
  static async sendFromUser(
    userId: number,
    recipientAddress: string,
    amount: number,
    memo?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const userWallet = await this.getOrCreateUserWallet(userId);
      const hdPath = userWallet.hdPath;
      const wallet = await this.deriveWallet(hdPath);

      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        wallet,
        { gasPrice: GasPrice.fromString('0.025ujuno') }
      );

      const [userAccount] = await wallet.getAccounts();

      // Send tokens to recipient
      const amountInUjuno = Math.floor(amount * 1_000_000);
      const result = await client.sendTokens(
        userAccount.address,
        recipientAddress,
        [{ denom: 'ujuno', amount: amountInUjuno.toString() }],
        'auto',
        memo
      );

      logger.info('Tokens sent from user', {
        userId,
        userAddress: userAccount.address,
        recipientAddress,
        amount,
        txHash: result.transactionHash
      });

      return {
        success: true,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Failed to send tokens from user', { userId, recipientAddress, amount, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer tokens from user wallet to bot treasury (for fine payments)
   */
  static async collectFromUser(
    userId: number,
    amount: number,
    memo?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const userWallet = await this.getOrCreateUserWallet(userId);
      const hdPath = userWallet.hdPath;
      const wallet = await this.deriveWallet(hdPath);

      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        wallet,
        { gasPrice: GasPrice.fromString('0.025ujuno') }
      );

      const [userAccount] = await wallet.getAccounts();

      // Bot treasury address (account 0)
      const botAddress = config.junoWalletAddress || '';

      // Send tokens to bot treasury
      const amountInUjuno = Math.floor(amount * 1_000_000);
      const result = await client.sendTokens(
        userAccount.address,
        botAddress,
        [{ denom: 'ujuno', amount: amountInUjuno.toString() }],
        'auto',
        memo
      );

      logger.info('Tokens collected from user', {
        userId,
        userAddress: userAccount.address,
        amount,
        txHash: result.transactionHash
      });

      return {
        success: true,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Failed to collect tokens from user', { userId, amount, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Restore wallet from userId (for recovery purposes)
   * This demonstrates that wallets can always be recovered from just the userId
   */
  static async restoreWallet(userId: number): Promise<{ address: string; hdPath: string }> {
    const hdPath = this.generateHdPath(userId);
    const wallet = await this.deriveWallet(hdPath);
    const [account] = await wallet.getAccounts();

    return {
      address: account.address,
      hdPath
    };
  }

  /**
   * Verify wallet derivation (for testing/validation)
   */
  static async verifyWalletDerivation(userId: number): Promise<boolean> {
    const stored = await this.getUserAddress(userId);
    if (!stored) return false;

    const restored = await this.restoreWallet(userId);
    const match = stored === restored.address;

    logger.info('Wallet derivation verification', {
      userId,
      stored,
      restored: restored.address,
      match
    });

    return match;
  }
}
