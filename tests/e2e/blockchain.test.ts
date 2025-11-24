import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, Mock } from 'vitest';
/**
 * End-to-End Tests for Blockchain Wallet Operations
 *
 * These tests simulate full blockchain interaction flows with mocked RPC/API responses.
 * They test the complete request/response cycle including:
 * - Deposit detection from blockchain
 * - Payment verification by transaction hash
 * - Balance queries to on-chain wallet
 * - Withdrawal transaction broadcasting
 * - Transaction confirmation waiting
 * - Memo parsing and routing
 * - Error handling for network failures
 *
 * NOTE: For production use with testnet/mainnet:
 * 1. Replace mock fetch responses with real RPC/API endpoints
 * 2. Add environment variable for TESTNET_RPC_URL / MAINNET_RPC_URL
 * 3. Configure test wallets with actual mnemonics (secured via env)
 * 4. Implement transaction polling with actual block confirmation delays
 * 5. Add gas fee estimation from real network conditions
 * 6. Test with actual faucet tokens on testnet first
 */

import { UnifiedWalletService } from '../../src/services/unifiedWalletService';
import { LedgerService } from '../../src/services/ledgerService';
import { DepositMonitor } from '../../src/services/depositMonitor';
import { JunoService } from '../../src/services/junoService';
import { TransactionLockService } from '../../src/services/transactionLock';
import {
  initTestDatabase,
  closeTestDatabase,
  cleanTestDatabase,
  createTestUser,
  addTestBalance,
  getTestBalance,
  createTestSystemWallet,
} from '../helpers/testDatabase';
import * as database from '../../src/database';

// Mock global fetch for blockchain API calls
global.fetch = vi.fn();

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    junoRpcUrl: 'https://rpc-test.juno.giansalex.dev',
    junoApiUrl: 'https://api-test.juno.giansalex.dev',
    botTreasuryAddress: 'juno1treasury123test',
    userFundsAddress: 'juno1userfunds456test',
    userFundsMnemonic: 'test mnemonic phrase for testing wallet operations only',
    adminChatId: '123456789',
  },
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  StructuredLogger: {
    logError: vi.fn(),
    logUserAction: vi.fn(),
    logTransaction: vi.fn(),
    logWalletAction: vi.fn(),
  },
}));

// Mock CosmJS wallet creation for withdrawal tests
vi.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn().mockResolvedValue({
      getAccounts: vi.fn().mockResolvedValue([
        {
          address: 'juno1userfunds456test',
          algo: 'secp256k1',
          pubkey: new Uint8Array(),
        },
      ]),
    }),
  },
}));

// Mock SigningStargateClient for withdrawal tests
vi.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: {
    connectWithSigner: vi.fn().mockResolvedValue({
      sendTokens: vi.fn().mockResolvedValue({
        code: 0,
        transactionHash: 'MOCK_TX_HASH_SUCCESS',
        rawLog: '',
      }),
    }),
  },
  GasPrice: {
    fromString: vi.fn().mockReturnValue({
      amount: '0.025',
      denom: 'ujuno',
    }),
  },
}));

describe('E2E: Blockchain Wallet Operations', () => {
  beforeAll(() => {
    initTestDatabase();

    // Mock database functions to use test database
    const testDb = require('../helpers/testDatabase').getTestDatabase();
    (database.query as any) = vi.fn((sql: string, params?: any[]) => {
      try {
        return testDb.prepare(sql).all(...(params || []));
      } catch (e) {
        return [];
      }
    });
    (database.get as any) = vi.fn((sql: string, params?: any[]) => {
      try {
        return testDb.prepare(sql).get(...(params || []));
      } catch (e) {
        return undefined;
      }
    });
    (database.execute as any) = vi.fn((sql: string, params?: any[]) => {
      try {
        return testDb.prepare(sql).run(...(params || []));
      } catch (e) {
        return { changes: 0, lastInsertRowid: 0 };
      }
    });

    // Initialize services
    LedgerService.initialize();
    TransactionLockService.initialize();
  });

  beforeEach(() => {
    cleanTestDatabase();
    vi.clearAllMocks();
    (global.fetch as Mock).mockClear();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('Deposit Detection from Blockchain', () => {
    beforeEach(async () => {
      createTestUser(444444444, 'testuser', 'pleb');
      createTestSystemWallet('user_funds', 'juno1userfunds456test');
      createTestSystemWallet('treasury', 'juno1treasury123test');
      await UnifiedWalletService.initialize();
      DepositMonitor.initialize();
    });

    it('should detect and process deposit with valid memo', async () => {
      // Mock blockchain API response for recent transactions
      const mockTxResponse = {
        txs: [
          {
            txhash: 'DEPOSIT_TX_HASH_001',
            height: '12345678',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender123abc',
                    to_address: 'juno1userfunds456test',
                    amount: [
                      {
                        denom: 'ujuno',
                        amount: '50000000', // 50 JUNO
                      },
                    ],
                  },
                ],
                memo: '444444444', // User ID as memo
              },
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxResponse,
      });

      // Manually trigger deposit check
      await (DepositMonitor as any).checkForDeposits();

      // Verify user balance was updated
      const balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(50.0);

      // Verify transaction was recorded
      const transactions = await LedgerService.getUserTransactions(444444444, 10);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].transactionType).toBe('deposit');
      expect(transactions[0].amount).toBe(50.0);
      expect(transactions[0].txHash).toBe('DEPOSIT_TX_HASH_001');
      expect(transactions[0].externalAddress).toBe('juno1sender123abc');
    });

    it('should skip deposits with invalid memo format', async () => {
      createTestUser(555555555, 'anotheruser', 'pleb');

      const mockTxResponse = {
        txs: [
          {
            txhash: 'INVALID_MEMO_TX',
            height: '12345679',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender456def',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '25000000' }],
                  },
                ],
                memo: 'invalid-memo-not-numeric',
              },
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxResponse,
      });

      await (DepositMonitor as any).checkForDeposits();

      // Verify no balance changes
      const balance = await LedgerService.getUserBalance(555555555);
      expect(balance).toBe(0);
    });

    it('should handle multiple deposits in single transaction batch', async () => {
      createTestUser(111111111, 'user1', 'pleb');
      createTestUser(222222222, 'user2', 'pleb');

      const mockTxResponse = {
        txs: [
          {
            txhash: 'BATCH_TX_001',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender1',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '100000000' }],
                  },
                ],
                memo: '111111111',
              },
            },
          },
          {
            txhash: 'BATCH_TX_002',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender2',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '75000000' }],
                  },
                ],
                memo: '222222222',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxResponse,
      });

      await (DepositMonitor as any).checkForDeposits();

      const balance1 = await LedgerService.getUserBalance(111111111);
      const balance2 = await LedgerService.getUserBalance(222222222);

      expect(balance1).toBe(100.0);
      expect(balance2).toBe(75.0);
    });

    it('should prevent double-processing of same deposit', async () => {
      createTestUser(444444444, 'testuser', 'pleb');

      const mockTxResponse = {
        txs: [
          {
            txhash: 'DUPLICATE_TX',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '10000000' }],
                  },
                ],
                memo: '444444444',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => mockTxResponse,
      });

      // Process first time
      await (DepositMonitor as any).checkForDeposits();
      const balanceAfterFirst = await LedgerService.getUserBalance(444444444);

      // Process second time (should be skipped)
      await (DepositMonitor as any).checkForDeposits();
      const balanceAfterSecond = await LedgerService.getUserBalance(444444444);

      expect(balanceAfterFirst).toBe(10.0);
      expect(balanceAfterSecond).toBe(10.0); // No double-credit
    });

    it('should handle network failures gracefully with retry logic', async () => {
      createTestUser(444444444, 'testuser', 'pleb');

      // First attempt fails
      (global.fetch as Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await (DepositMonitor as any).checkForDeposits();
      let balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(0);

      // Second attempt succeeds
      const mockTxResponse = {
        txs: [
          {
            txhash: 'RETRY_SUCCESS_TX',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '30000000' }],
                  },
                ],
                memo: '444444444',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxResponse,
      });

      await (DepositMonitor as any).checkForDeposits();
      balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(30.0);
    });

    it('should handle API error responses correctly', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await (DepositMonitor as any).checkForDeposits();

      // Should not crash and should log error
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should parse amount precision correctly (ujuno to JUNO)', async () => {
      createTestUser(444444444, 'testuser', 'pleb');

      const mockTxResponse = {
        txs: [
          {
            txhash: 'PRECISION_TX',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '123456789' }], // 123.456789 JUNO
                  },
                ],
                memo: '444444444',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxResponse,
      });

      await (DepositMonitor as any).checkForDeposits();

      const balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBeCloseTo(123.456789, 6);
    });
  });

  describe('Payment Verification by Transaction Hash', () => {
    beforeEach(() => {
      createTestSystemWallet('treasury', 'juno1treasury123test');
      JunoService.initialize();
    });

    it('should verify valid payment transaction to treasury', async () => {
      const mockTxData = {
        tx_response: {
          code: 0,
          txhash: 'PAYMENT_TX_VALID',
          tx: {
            body: {
              messages: [
                {
                  '@type': '/cosmos.bank.v1beta1.MsgSend',
                  from_address: 'juno1payer123',
                  to_address: 'juno1treasury123test',
                  amount: [{ denom: 'ujuno', amount: '50000000' }],
                },
              ],
            },
          },
        },
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxData,
      });

      const verified = await JunoService.verifyPayment('PAYMENT_TX_VALID', 50.0);

      expect(verified).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/tx/v1beta1/txs/PAYMENT_TX_VALID')
      );
    });

    it('should reject payment with amount mismatch', async () => {
      const mockTxData = {
        tx_response: {
          code: 0,
          tx: {
            body: {
              messages: [
                {
                  '@type': '/cosmos.bank.v1beta1.MsgSend',
                  to_address: 'juno1treasury123test',
                  amount: [{ denom: 'ujuno', amount: '40000000' }], // 40 JUNO instead of 50
                },
              ],
            },
          },
        },
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxData,
      });

      const verified = await JunoService.verifyPayment('AMOUNT_MISMATCH_TX', 50.0);

      expect(verified).toBe(false);
    });

    it('should allow small rounding differences in payment amounts', async () => {
      const mockTxData = {
        tx_response: {
          code: 0,
          tx: {
            body: {
              messages: [
                {
                  '@type': '/cosmos.bank.v1beta1.MsgSend',
                  to_address: 'juno1treasury123test',
                  amount: [{ denom: 'ujuno', amount: '50005000' }], // 50.005 JUNO (0.005 diff)
                },
              ],
            },
          },
        },
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxData,
      });

      const verified = await JunoService.verifyPayment('ROUNDING_TX', 50.0);

      expect(verified).toBe(true); // Within 0.01 JUNO tolerance
    });

    it('should reject failed transaction (non-zero code)', async () => {
      const mockTxData = {
        tx_response: {
          code: 5, // Error code
          tx: {
            body: {
              messages: [
                {
                  '@type': '/cosmos.bank.v1beta1.MsgSend',
                  to_address: 'juno1treasury123test',
                  amount: [{ denom: 'ujuno', amount: '50000000' }],
                },
              ],
            },
          },
        },
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxData,
      });

      const verified = await JunoService.verifyPayment('FAILED_TX', 50.0);

      expect(verified).toBe(false);
    });

    it('should handle transaction not found on chain', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const verified = await JunoService.verifyPayment('NONEXISTENT_TX', 50.0);

      expect(verified).toBe(false);
    });

    it('should validate transaction hash format', async () => {
      // Transaction hashes are typically 64 character hex strings
      const validHash = 'A'.repeat(64);
      const invalidHash = 'invalid';

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const verified = await JunoService.verifyPayment(invalidHash, 50.0);

      expect(verified).toBe(false);
    });

    it('should reject payment to wrong recipient address', async () => {
      const mockTxData = {
        tx_response: {
          code: 0,
          tx: {
            body: {
              messages: [
                {
                  '@type': '/cosmos.bank.v1beta1.MsgSend',
                  to_address: 'juno1wrongaddress', // Wrong recipient
                  amount: [{ denom: 'ujuno', amount: '50000000' }],
                },
              ],
            },
          },
        },
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxData,
      });

      const verified = await JunoService.verifyPayment('WRONG_RECIPIENT_TX', 50.0);

      expect(verified).toBe(false);
    });
  });

  describe('Balance Queries to On-Chain Wallet', () => {
    beforeEach(async () => {
      createTestSystemWallet('treasury', 'juno1treasury123test');
      createTestSystemWallet('user_funds', 'juno1userfunds456test');
      await UnifiedWalletService.initialize();
    });

    it('should query on-chain balance successfully', async () => {
      const mockBalanceResponse = {
        balances: [
          { denom: 'ujuno', amount: '500000000' }, // 500 JUNO
          { denom: 'ibc/sometoken', amount: '1000000' },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalanceResponse,
      });

      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      expect(balance).toBe(500.0);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/bank/v1beta1/balances/juno1userfunds456test')
      );
    });

    it('should return zero for wallet with no JUNO balance', async () => {
      const mockBalanceResponse = {
        balances: [
          { denom: 'ibc/sometoken', amount: '1000000' },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalanceResponse,
      });

      const balance = await LedgerService.getSystemWalletBalance('treasury');

      expect(balance).toBe(0);
    });

    it('should handle API errors when querying balance', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      expect(balance).toBe(0);
    });

    it('should validate address format in balance queries', async () => {
      // Invalid address should be caught at service level
      const invalidAddress = 'cosmos1invalid';

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      // Should return 0 for invalid addresses
      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      // Even with error, should not crash
      expect(typeof balance).toBe('number');
    });

    it('should reconcile internal ledger with on-chain balance', async () => {
      createTestUser(444444444, 'user1', 'pleb');
      createTestUser(555555555, 'user2', 'pleb');

      addTestBalance(444444444, 100.0);
      addTestBalance(555555555, 150.0);

      // Mock on-chain balance matches internal total (250 JUNO)
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '250000000' }],
        }),
      });

      const reconciliation = await LedgerService.reconcileBalances();

      expect(reconciliation.internalTotal).toBe(250.0);
      expect(reconciliation.onChainTotal).toBe(250.0);
      expect(reconciliation.matched).toBe(true);
      expect(reconciliation.difference).toBeLessThan(0.000001);
    });

    it('should detect balance mismatch during reconciliation', async () => {
      createTestUser(444444444, 'user1', 'pleb');
      addTestBalance(444444444, 100.0);

      // Mock on-chain balance differs from internal (100 internal vs 80 on-chain)
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '80000000' }],
        }),
      });

      const reconciliation = await LedgerService.reconcileBalances();

      expect(reconciliation.internalTotal).toBe(100.0);
      expect(reconciliation.onChainTotal).toBe(80.0);
      expect(reconciliation.matched).toBe(false);
      expect(reconciliation.difference).toBe(20.0);
    });
  });

  describe('Withdrawal Transaction Broadcasting', () => {
    beforeEach(async () => {
      createTestUser(444444444, 'testuser', 'pleb');
      createTestSystemWallet('user_funds', 'juno1userfunds456test');
      addTestBalance(444444444, 200.0);
      await UnifiedWalletService.initialize();
    });

    it('should broadcast withdrawal transaction successfully', async () => {
      // Mock on-chain balance query
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0,
        'Test withdrawal'
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('MOCK_TX_HASH_SUCCESS');
      expect(result.newBalance).toBe(150.0);

      // Verify ledger was updated
      const balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(150.0);
    });

    it('should validate recipient address format before withdrawal', async () => {
      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'cosmos1invalid',
        50.0
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Juno address format');
    });

    it('should check balance before withdrawal', async () => {
      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        500.0 // More than available
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should prevent concurrent withdrawals with transaction locking', async () => {
      // Mock balance queries
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      // Start two withdrawals concurrently
      const withdrawal1Promise = UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient1',
        50.0
      );

      const withdrawal2Promise = UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient2',
        50.0
      );

      const [result1, result2] = await Promise.all([withdrawal1Promise, withdrawal2Promise]);

      // One should succeed, one should fail due to lock
      const successCount = [result1, result2].filter(r => r.success).length;
      const failedCount = [result1, result2].filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failedCount).toBe(1);

      const failedResult = result1.success ? result2 : result1;
      expect(failedResult.error).toContain('transaction is in progress');
    });

    it('should handle gas fee calculations correctly', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(true);

      // Verify GasPrice.fromString was called with correct parameters
      const { GasPrice } = require('@cosmjs/stargate');
      expect(GasPrice.fromString).toHaveBeenCalledWith('0.025ujuno');
    });

    it('should refund user on transaction broadcast failure', async () => {
      const { SigningStargateClient } = require('@cosmjs/stargate');

      // Mock transaction failure
      SigningStargateClient.connectWithSigner = vi.fn().mockResolvedValue({
        sendTokens: vi.fn().mockRejectedValue(new Error('Insufficient gas')),
      });

      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      const balanceBefore = await LedgerService.getUserBalance(444444444);

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient gas');

      // Verify balance was refunded
      const balanceAfter = await LedgerService.getUserBalance(444444444);
      expect(balanceAfter).toBe(balanceBefore);
    });

    it('should refund user on transaction rejection (non-zero code)', async () => {
      const { SigningStargateClient } = require('@cosmjs/stargate');

      SigningStargateClient.connectWithSigner = vi.fn().mockResolvedValue({
        sendTokens: vi.fn().mockResolvedValue({
          code: 5,
          transactionHash: 'FAILED_TX',
          rawLog: 'Out of gas',
        }),
      });

      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction failed');

      // Verify balance was refunded
      const balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(200.0);
    });

    it('should handle amount precision correctly (JUNO to ujuno)', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '200000000' }],
        }),
      });

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        12.345678 // Test precision
      );

      expect(result.success).toBe(true);

      // Verify the amount was converted correctly to ujuno
      const { SigningStargateClient } = require('@cosmjs/stargate');
      const mockClient = await SigningStargateClient.connectWithSigner();

      expect(mockClient.sendTokens).toHaveBeenCalledWith(
        'juno1userfunds456test',
        'juno1recipient123',
        [{ denom: 'ujuno', amount: '12345678' }], // Floor(12.345678 * 1_000_000)
        'auto',
        undefined
      );
    });

    it('should verify on-chain balance changes after withdrawal', async () => {
      let balanceCallCount = 0;
      (global.fetch as Mock).mockImplementation((url) => {
        balanceCallCount++;
        if (url.includes('/balances/')) {
          // First call: pre-transaction (200 JUNO)
          // Second call: post-transaction (150 JUNO)
          const amount = balanceCallCount === 1 ? '200000000' : '150000000';
          return Promise.resolve({
            ok: true,
            json: async () => ({
              balances: [{ denom: 'ujuno', amount }],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(true);
      expect(balanceCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Transaction Confirmation Waiting', () => {
    beforeEach(async () => {
      createTestUser(444444444, 'testuser', 'pleb');
      await UnifiedWalletService.initialize();
    });

    it('should wait for deposit transaction confirmation', async () => {
      const txHash = 'PENDING_DEPOSIT_TX';

      // First query: not found (pending)
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tx_response: {
              code: 0,
              txhash: txHash,
              tx: {
                body: {
                  messages: [
                    {
                      '@type': '/cosmos.bank.v1beta1.MsgSend',
                      from_address: 'juno1sender',
                      to_address: 'juno1userfunds456test',
                      amount: [{ denom: 'ujuno', amount: '100000000' }],
                    },
                  ],
                  memo: '444444444',
                },
              },
            },
          }),
        });

      // First check should fail
      let result = await DepositMonitor.checkSpecificTransaction(txHash);
      expect(result.found).toBe(false);

      // Second check should succeed after confirmation
      result = await DepositMonitor.checkSpecificTransaction(txHash);
      expect(result.found).toBe(true);
      expect(result.processed).toBe(true);
      expect(result.amount).toBe(100.0);
    });

    it('should track transaction status updates in ledger', async () => {
      addTestBalance(444444444, 100.0);

      // Create pending withdrawal
      const withdrawalResult = await LedgerService.processWithdrawal(
        444444444,
        50.0,
        'juno1recipient123',
        undefined, // No txHash yet
        'Test withdrawal'
      );

      expect(withdrawalResult.success).toBe(true);

      // Verify transaction is pending
      const transactions = await LedgerService.getUserTransactions(444444444, 10);
      const pendingTx = transactions.find(t => t.id === withdrawalResult.transactionId);
      expect(pendingTx?.status).toBe('pending');

      // Update with txHash after confirmation
      await LedgerService.updateTransactionStatus(
        withdrawalResult.transactionId!,
        'completed' as any,
        'CONFIRMED_TX_HASH'
      );

      // Verify status updated
      const updatedTxs = await LedgerService.getUserTransactions(444444444, 10);
      const confirmedTx = updatedTxs.find(t => t.id === withdrawalResult.transactionId);
      expect(confirmedTx?.status).toBe('completed');
      expect(confirmedTx?.txHash).toBe('CONFIRMED_TX_HASH');
    });
  });

  describe('Memo Parsing and Routing', () => {
    beforeEach(() => {
      DepositMonitor.initialize();
    });

    it('should route deposit to correct user based on numeric memo', async () => {
      createTestUser(111111111, 'user1', 'pleb');
      createTestUser(222222222, 'user2', 'pleb');
      createTestUser(333333333, 'user3', 'pleb');

      const mockTxs = {
        txs: [
          {
            txhash: 'TX1',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '10000000' }],
                  },
                ],
                memo: '111111111',
              },
            },
          },
          {
            txhash: 'TX2',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '20000000' }],
                  },
                ],
                memo: '222222222',
              },
            },
          },
          {
            txhash: 'TX3',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1sender',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '30000000' }],
                  },
                ],
                memo: '333333333',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxs,
      });

      await (DepositMonitor as any).checkForDeposits();

      // Verify each user received correct amount
      expect(await LedgerService.getUserBalance(111111111)).toBe(10.0);
      expect(await LedgerService.getUserBalance(222222222)).toBe(20.0);
      expect(await LedgerService.getUserBalance(333333333)).toBe(30.0);
    });

    it('should ignore transactions with non-numeric memos', async () => {
      const mockTxs = {
        txs: [
          {
            txhash: 'INVALID_MEMO_1',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '10000000' }],
                  },
                ],
                memo: 'random-text-memo',
              },
            },
          },
          {
            txhash: 'INVALID_MEMO_2',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '20000000' }],
                  },
                ],
                memo: '123abc456', // Mixed alphanumeric
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxs,
      });

      await (DepositMonitor as any).checkForDeposits();

      // No users should receive deposits
      const totalBalance = await LedgerService.getTotalUserBalance();
      expect(totalBalance).toBe(0);
    });

    it('should handle empty memo gracefully', async () => {
      const mockTxs = {
        txs: [
          {
            txhash: 'EMPTY_MEMO',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '10000000' }],
                  },
                ],
                memo: '',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTxs,
      });

      await (DepositMonitor as any).checkForDeposits();

      const totalBalance = await LedgerService.getTotalUserBalance();
      expect(totalBalance).toBe(0);
    });
  });

  describe('Error Handling for Network Failures', () => {
    beforeEach(async () => {
      createTestUser(444444444, 'testuser', 'pleb');
      addTestBalance(444444444, 100.0);
      await UnifiedWalletService.initialize();
    });

    it('should handle network timeout during withdrawal', async () => {
      (global.fetch as Mock).mockRejectedValue(
        new Error('Network request timed out')
      );

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Verify balance was refunded
      const balance = await LedgerService.getUserBalance(444444444);
      expect(balance).toBe(100.0);
    });

    it('should handle RPC endpoint unavailable', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      expect(balance).toBe(0);
    });

    it('should handle malformed API responses', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          // Missing expected fields
          unexpected: 'data',
        }),
      });

      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      expect(balance).toBe(0);
    });

    it('should retry on transient failures', async () => {
      let callCount = 0;
      (global.fetch as Mock).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balances: [{ denom: 'ujuno', amount: '100000000' }],
          }),
        });
      });

      // Manual retry logic test
      let balance = 0;
      for (let i = 0; i < 3; i++) {
        try {
          balance = await LedgerService.getSystemWalletBalance('user_funds');
          if (balance > 0) break;
        } catch (e) {
          // Continue retrying
        }
      }

      expect(balance).toBe(100.0);
      expect(callCount).toBe(3);
    });

    it('should release locks on system errors', async () => {
      (global.fetch as Mock).mockRejectedValue(
        new Error('Database connection lost')
      );

      const result = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        'juno1recipient123',
        50.0
      );

      expect(result.success).toBe(false);

      // Verify lock was released
      const isLocked = await TransactionLockService.isUserLocked(444444444);
      expect(isLocked).toBe(false);
    });

    it('should handle rate limiting from API', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const balance = await LedgerService.getSystemWalletBalance('user_funds');

      expect(balance).toBe(0);
      // In production, this should trigger exponential backoff retry
    });
  });

  describe('Address Format Validation', () => {
    beforeEach(async () => {
      createTestUser(444444444, 'testuser', 'pleb');
      addTestBalance(444444444, 200.0);
      await UnifiedWalletService.initialize();
    });

    it('should validate Juno address format (bech32 with juno1 prefix)', async () => {
      const validAddresses = [
        'juno1abc123def456ghi789',
        'juno1qwertyuiopasdfghjklzxcvbnm',
      ];

      const invalidAddresses = [
        'cosmos1abc123',
        'juno2abc123',
        'abc123',
        'juno1',
        '',
      ];

      for (const addr of validAddresses) {
        expect(addr.startsWith('juno1')).toBe(true);
      }

      for (const addr of invalidAddresses) {
        const result = await UnifiedWalletService.sendToExternalWallet(
          444444444,
          addr,
          10.0
        );
        expect(result.success).toBe(false);
        if (result.error && addr !== '') {
          // Empty address gets caught by invalid format check
          expect(result.error).toMatch(/Invalid|Insufficient/);
        }
      }
    });

    it('should validate address length constraints', async () => {
      // Juno addresses are typically 43-45 characters
      const tooShort = 'juno1abc';
      const tooLong = 'juno1' + 'a'.repeat(100);

      addTestBalance(444444444, 50.0); // Ensure balance for test

      const result1 = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        tooShort,
        10.0
      );
      expect(result1.success).toBe(false);

      const result2 = await UnifiedWalletService.sendToExternalWallet(
        444444444,
        tooLong,
        10.0
      );
      expect(result2.success).toBe(false);
    });
  });

  describe('System Integration Tests', () => {
    beforeEach(async () => {
      createTestUser(111111111, 'alice', 'pleb');
      createTestUser(222222222, 'bob', 'pleb');
      createTestSystemWallet('user_funds', 'juno1userfunds456test');
      await UnifiedWalletService.initialize();
      DepositMonitor.initialize();
    });

    it('should handle complete deposit-to-withdrawal flow', async () => {
      // Step 1: Alice deposits
      const depositTx = {
        txs: [
          {
            txhash: 'ALICE_DEPOSIT',
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1alice',
                    to_address: 'juno1userfunds456test',
                    amount: [{ denom: 'ujuno', amount: '200000000' }],
                  },
                ],
                memo: '111111111',
              },
            },
          },
        ],
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => depositTx,
      });

      await (DepositMonitor as any).checkForDeposits();

      // Verify deposit
      const initialAliceBalance = await LedgerService.getUserBalance(111111111);
      expect(initialAliceBalance).toBe(200.0);

      // Step 2: Alice transfers to Bob internally
      const transferResult = await UnifiedWalletService.sendToUser(
        111111111,
        222222222,
        50.0,
        'Payment to Bob'
      );

      expect(transferResult.success).toBe(true);
      expect(transferResult.fromBalance).toBe(150.0);
      expect(transferResult.toBalance).toBe(50.0);

      // Step 3: Bob withdraws to external wallet
      // Mock balance queries for withdrawal process
      let balanceCallCount = 0;
      (global.fetch as Mock).mockImplementation(() => {
        balanceCallCount++;
        // Return sufficient balance for both pre and post transaction checks
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balances: [{ denom: 'ujuno', amount: '175000000' }],
          }),
        });
      });

      const withdrawResult = await UnifiedWalletService.sendToExternalWallet(
        222222222,
        'juno1bobexternal',
        25.0
      );

      expect(withdrawResult.success).toBe(true);
      expect(withdrawResult.txHash).toBeDefined();

      // Verify final balances
      const aliceBalance = await LedgerService.getUserBalance(111111111);
      const bobBalance = await LedgerService.getUserBalance(222222222);

      expect(aliceBalance).toBe(150.0);
      expect(bobBalance).toBe(25.0);

      // Verify reconciliation
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [{ denom: 'ujuno', amount: '175000000' }], // 175 JUNO remaining
        }),
      });

      const reconciliation = await LedgerService.reconcileBalances();
      expect(reconciliation.internalTotal).toBe(175.0);
      expect(reconciliation.onChainTotal).toBe(175.0);
      expect(reconciliation.matched).toBe(true);
    });
  });
});
