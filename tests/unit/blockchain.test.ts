import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
/**
 * Comprehensive unit tests for blockchain services
 * Tests junoService, depositMonitor, and transactionLock
 */

import { JunoService } from '../../src/services/junoService';
import { DepositMonitor } from '../../src/services/depositMonitor';
import { TransactionLockService } from '../../src/services/transactionLock';
import { LedgerService } from '../../src/services/ledgerService';
import {
  initTestDatabase,
  cleanTestDatabase,
  closeTestDatabase,
  createTestUser,
  getTestDatabase
} from '../helpers/testDatabase';

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    botToken: 'test-token',
    junoRpcUrl: 'https://test-rpc.juno.com',
    junoApiUrl: 'https://test-api.juno.com',
    adminChatId: 123456789,
    groupChatId: -100123456789,
    ownerId: 111111111,
    botTreasuryAddress: 'juno1testtreasuryaddress123456789',
    userFundsAddress: 'juno1testuserfundsaddress123456789',
    userFundsMnemonic: 'test mnemonic phrase for testing wallet operations',
    databasePath: ':memory:',
    logLevel: 'silent'
  },
  validateConfig: vi.fn()
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock database to use test database
vi.mock('../../src/database', () => {
  const Database = require('better-sqlite3');
  const { join } = require('path');
  const testDbPath = join(__dirname, '../test-data/blockchain-test.db');

  let testDb: any = null;

  const getDb = () => {
    if (!testDb) {
      const { getTestDatabase } = require('../helpers/testDatabase');
      testDb = getTestDatabase();
    }
    return testDb;
  };

  return {
    query: <T>(sql: string, params: unknown[] = []): T[] => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.all(params) as T[];
    },
    execute: (sql: string, params: unknown[] = []): any => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.run(params);
    },
    get: <T>(sql: string, params: unknown[] = []): T | undefined => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.get(params) as T | undefined;
    },
    initDb: vi.fn()
  };
});

// Mock fetch for blockchain API calls
global.fetch = vi.fn();

describe('Blockchain Services - Comprehensive Tests', () => {
  beforeAll(() => {
    initTestDatabase();
    LedgerService.initialize();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase();
    vi.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  // ============================================================================
  // JUNO SERVICE TESTS
  // ============================================================================
  describe('JunoService', () => {
    describe('verifyPayment', () => {
      test('verifies valid payment with correct amount', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10000000' }] // 10 JUNO
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-api.juno.com/cosmos/tx/v1beta1/txs/test_tx_hash'
        );
      });

      test('verifies payment with small rounding difference (within tolerance)', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10005000' }] // 10.005 JUNO
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        // Should accept 10.005 JUNO when expecting 10.0 (0.005 difference < 0.01 tolerance)
        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(true);
      });

      test('rejects payment with incorrect amount (outside tolerance)', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '5000000' }] // 5 JUNO instead of 10
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(false);
      });

      test('rejects payment to wrong address', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1wrongaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10000000' }]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(false);
      });

      test('rejects failed transaction (non-zero code)', async () => {
        const mockResponse = {
          tx_response: {
            code: 5, // Error code
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10000000' }]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(false);
      });

      test('returns false when transaction not found', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404
        });

        const result = await JunoService.verifyPayment('nonexistent_tx', 10.0);
        expect(result).toBe(false);
      });

      test('handles network errors gracefully', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(false);
      });

      test('rejects payment with wrong denom', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'uatom', amount: '10000000' }] // Wrong denom
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(false);
      });

      test('handles transaction with multiple messages', async () => {
        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1someotheraddress',
                    amount: [{ denom: 'ujuno', amount: '5000000' }]
                  },
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10000000' }] // Correct one
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await JunoService.verifyPayment('test_tx_hash', 10.0);
        expect(result).toBe(true);
      });
    });

    describe('getPaymentAddress', () => {
      test('returns configured treasury address', () => {
        const address = JunoService.getPaymentAddress();
        expect(address).toBe('juno1testtreasuryaddress123456789');
      });
    });

    describe('getBalance', () => {
      test('returns balance for configured address', async () => {
        const mockResponse = {
          balances: [
            { denom: 'ujuno', amount: '50000000' }, // 50 JUNO
            { denom: 'uatom', amount: '1000000' }
          ]
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const balance = await JunoService.getBalance();
        expect(balance).toBe(50);
      });

      test('returns 0 when no JUNO balance', async () => {
        const mockResponse = {
          balances: [{ denom: 'uatom', amount: '1000000' }]
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const balance = await JunoService.getBalance();
        expect(balance).toBe(0);
      });

      test('returns 0 on query error', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500
        });

        const balance = await JunoService.getBalance();
        expect(balance).toBe(0);
      });

      test('returns 0 on network error', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        const balance = await JunoService.getBalance();
        expect(balance).toBe(0);
      });
    });
  });

  // ============================================================================
  // DEPOSIT MONITOR TESTS
  // ============================================================================
  describe('DepositMonitor', () => {
    beforeEach(() => {
      createTestUser(123456, 'depositor');
      DepositMonitor.initialize();
    });

    describe('initialization', () => {
      test('creates processed_deposits table', () => {
        const db = getTestDatabase();
        const tableInfo = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='processed_deposits'"
        ).get();

        expect(tableInfo).toBeDefined();
      });

      test('creates index on processed_at', () => {
        const db = getTestDatabase();
        const indexInfo = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_processed_deposits_time'"
        ).get();

        expect(indexInfo).toBeDefined();
      });
    });

    describe('start and stop', () => {
      test('starts monitoring', () => {
        DepositMonitor.stop(); // Ensure stopped first
        DepositMonitor.start();

        const status = DepositMonitor.getStatus();
        expect(status.isRunning).toBe(true);
      });

      test('stops monitoring', () => {
        DepositMonitor.start();
        DepositMonitor.stop();

        const status = DepositMonitor.getStatus();
        expect(status.isRunning).toBe(false);
      });

      test('does not start if already running', () => {
        DepositMonitor.stop();
        DepositMonitor.start();
        DepositMonitor.start(); // Try to start again

        // Should not throw, just warn
        const status = DepositMonitor.getStatus();
        expect(status.isRunning).toBe(true);

        DepositMonitor.stop();
      });

      test('getStatus returns correct information', () => {
        DepositMonitor.stop();

        const status = DepositMonitor.getStatus();
        expect(status).toEqual({
          isRunning: false,
          walletAddress: 'juno1testuserfundsaddress123456789',
          checkInterval: 60000
        });
      });
    });

    describe('checkSpecificTransaction', () => {
      test('processes valid deposit transaction', async () => {
        const mockResponse = {
          tx_response: {
            tx: {
              body: {
                memo: '123456', // User ID
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1senderaddress',
                    to_address: 'juno1testuserfundsaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '25000000' }] // 25 JUNO
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');

        expect(result.found).toBe(true);
        expect(result.processed).toBe(true);
        expect(result.userId).toBe(123456);
        expect(result.amount).toBe(25);

        // Verify balance was updated
        const balance = await LedgerService.getUserBalance(123456);
        expect(balance).toBe(25);
      });

      test('rejects transaction with invalid memo (not a number)', async () => {
        const mockResponse = {
          tx_response: {
            tx: {
              body: {
                memo: 'invalid_user_id',
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1senderaddress',
                    to_address: 'juno1testuserfundsaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '25000000' }]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');

        expect(result.found).toBe(true);
        expect(result.processed).toBe(false);
        expect(result.error).toContain('Invalid or missing memo');
      });

      test('rejects transaction to wrong address', async () => {
        const mockResponse = {
          tx_response: {
            tx: {
              body: {
                memo: '123456',
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1senderaddress',
                    to_address: 'juno1wrongaddress',
                    amount: [{ denom: 'ujuno', amount: '25000000' }]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');

        expect(result.found).toBe(true);
        expect(result.processed).toBe(false);
        expect(result.error).toContain('No valid transfer found');
      });

      test('prevents double processing of same transaction', async () => {
        const mockResponse = {
          tx_response: {
            tx: {
              body: {
                memo: '123456',
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1senderaddress',
                    to_address: 'juno1testuserfundsaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '10000000' }]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse
        });

        // Process first time
        const result1 = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');
        expect(result1.processed).toBe(true);
        expect(result1.amount).toBe(10);

        // Try to process again
        const result2 = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');
        expect(result2.processed).toBe(true);
        expect(result2.error).toContain('already processed');

        // Balance should only be credited once
        const balance = await LedgerService.getUserBalance(123456);
        expect(balance).toBe(10);
      });

      test('returns not found for nonexistent transaction', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404
        });

        const result = await DepositMonitor.checkSpecificTransaction('nonexistent_tx');

        expect(result.found).toBe(false);
        expect(result.processed).toBe(false);
        expect(result.error).toContain('not found');
      });

      test('handles multiple amounts in single message', async () => {
        const mockResponse = {
          tx_response: {
            tx: {
              body: {
                memo: '123456',
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    from_address: 'juno1senderaddress',
                    to_address: 'juno1testuserfundsaddress123456789',
                    amount: [
                      { denom: 'uatom', amount: '1000000' },
                      { denom: 'ujuno', amount: '15000000' } // 15 JUNO
                    ]
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await DepositMonitor.checkSpecificTransaction('test_tx_hash_123');

        expect(result.processed).toBe(true);
        expect(result.amount).toBe(15);
      });
    });

    describe('cleanupOldRecords', () => {
      test('removes old processed deposit records', () => {
        const db = getTestDatabase();
        const now = Math.floor(Date.now() / 1000);
        const thirtyOneDaysAgo = now - (31 * 24 * 60 * 60);
        const twentyNineDaysAgo = now - (29 * 24 * 60 * 60);

        // Insert old and new records
        db.prepare('INSERT INTO processed_deposits (tx_hash, processed_at) VALUES (?, ?)').run(
          'old_tx_1',
          thirtyOneDaysAgo
        );
        db.prepare('INSERT INTO processed_deposits (tx_hash, processed_at) VALUES (?, ?)').run(
          'old_tx_2',
          thirtyOneDaysAgo
        );
        db.prepare('INSERT INTO processed_deposits (tx_hash, processed_at) VALUES (?, ?)').run(
          'recent_tx',
          twentyNineDaysAgo
        );

        DepositMonitor.cleanupOldRecords();

        const remaining = db.prepare('SELECT * FROM processed_deposits').all();
        expect(remaining).toHaveLength(1);
        expect((remaining[0] as any).tx_hash).toBe('recent_tx');
      });
    });
  });

  // ============================================================================
  // TRANSACTION LOCK SERVICE TESTS
  // ============================================================================
  describe('TransactionLockService', () => {
    beforeEach(() => {
      createTestUser(123456, 'lockuser');
      TransactionLockService.initialize();
    });

    describe('initialization', () => {
      test('creates user_locks table', () => {
        const db = getTestDatabase();
        const tableInfo = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='user_locks'"
        ).get();

        expect(tableInfo).toBeDefined();
      });

      test('creates index on expires_at', () => {
        const db = getTestDatabase();
        const indexInfo = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_locks_expires'"
        ).get();

        expect(indexInfo).toBeDefined();
      });
    });

    describe('acquireLock', () => {
      test('successfully acquires lock for user', async () => {
        const acquired = await TransactionLockService.acquireLock(123456, 'withdrawal');

        expect(acquired).toBe(true);

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(true);
      });

      test('fails to acquire lock when user already locked', async () => {
        await TransactionLockService.acquireLock(123456, 'withdrawal');

        const secondAttempt = await TransactionLockService.acquireLock(123456, 'transfer');

        expect(secondAttempt).toBe(false);
      });

      test('stores lock metadata', async () => {
        const metadata = { amount: 50, destination: 'juno1xyz' };

        await TransactionLockService.acquireLock(123456, 'withdrawal', metadata);

        const lock = await TransactionLockService.getUserLock(123456);
        expect(lock).toBeDefined();
        expect(lock!.lock_type).toBe('withdrawal');
        expect(JSON.parse(lock!.metadata!)).toEqual(metadata);
      });

      test('sets correct expiration time (120 seconds)', async () => {
        const beforeTime = Math.floor(Date.now() / 1000);

        await TransactionLockService.acquireLock(123456, 'withdrawal');

        const lock = await TransactionLockService.getUserLock(123456);
        const afterTime = Math.floor(Date.now() / 1000);

        expect(lock).toBeDefined();
        expect(lock!.expires_at).toBeGreaterThanOrEqual(beforeTime + 120);
        expect(lock!.expires_at).toBeLessThanOrEqual(afterTime + 120);
      });

      test('cleans expired locks before acquiring new lock', async () => {
        const db = getTestDatabase();
        const pastTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago

        // Manually insert expired lock
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(123456, 'withdrawal', pastTime - 120, pastTime);

        // Should successfully acquire since old lock expired
        const acquired = await TransactionLockService.acquireLock(123456, 'transfer');

        expect(acquired).toBe(true);
      });

      test('allows multiple users to have locks simultaneously', async () => {
        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');

        const lock1 = await TransactionLockService.acquireLock(111111, 'withdrawal');
        const lock2 = await TransactionLockService.acquireLock(222222, 'transfer');

        expect(lock1).toBe(true);
        expect(lock2).toBe(true);

        const isLocked1 = await TransactionLockService.isUserLocked(111111);
        const isLocked2 = await TransactionLockService.isUserLocked(222222);

        expect(isLocked1).toBe(true);
        expect(isLocked2).toBe(true);
      });
    });

    describe('releaseLock', () => {
      test('successfully releases lock', async () => {
        await TransactionLockService.acquireLock(123456, 'withdrawal');

        await TransactionLockService.releaseLock(123456);

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(false);
      });

      test('does not throw when releasing non-existent lock', async () => {
        await expect(
          TransactionLockService.releaseLock(123456)
        ).resolves.not.toThrow();
      });

      test('only releases lock for specific user', async () => {
        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');

        await TransactionLockService.acquireLock(111111, 'withdrawal');
        await TransactionLockService.acquireLock(222222, 'transfer');

        await TransactionLockService.releaseLock(111111);

        const isLocked1 = await TransactionLockService.isUserLocked(111111);
        const isLocked2 = await TransactionLockService.isUserLocked(222222);

        expect(isLocked1).toBe(false);
        expect(isLocked2).toBe(true);
      });
    });

    describe('isUserLocked', () => {
      test('returns false for user without lock', async () => {
        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(false);
      });

      test('returns true for user with active lock', async () => {
        await TransactionLockService.acquireLock(123456, 'withdrawal');

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(true);
      });

      test('returns false for user with expired lock', async () => {
        const db = getTestDatabase();
        const pastTime = Math.floor(Date.now() / 1000) - 10;

        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(123456, 'withdrawal', pastTime - 120, pastTime);

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(false);
      });
    });

    describe('getUserLock', () => {
      test('returns lock details for locked user', async () => {
        const metadata = { test: 'data' };
        await TransactionLockService.acquireLock(123456, 'withdrawal', metadata);

        const lock = await TransactionLockService.getUserLock(123456);

        expect(lock).toBeDefined();
        expect(lock!.user_id).toBe(123456);
        expect(lock!.lock_type).toBe('withdrawal');
        expect(JSON.parse(lock!.metadata!)).toEqual(metadata);
      });

      test('returns null for user without lock', async () => {
        const lock = await TransactionLockService.getUserLock(123456);
        expect(lock).toBeNull();
      });

      test('returns null and cleans up expired lock', async () => {
        const db = getTestDatabase();
        const pastTime = Math.floor(Date.now() / 1000) - 10;

        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(123456, 'withdrawal', pastTime - 120, pastTime);

        const lock = await TransactionLockService.getUserLock(123456);

        expect(lock).toBeNull();

        // Verify lock was cleaned up
        const remaining = db.prepare('SELECT * FROM user_locks WHERE user_id = ?').get(123456);
        expect(remaining).toBeUndefined();
      });
    });

    describe('cleanExpiredLocks', () => {
      test('removes all expired locks', async () => {
        const db = getTestDatabase();
        const now = Math.floor(Date.now() / 1000);
        const futureTime = now + 60;
        const pastTime = now - 10;

        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');
        createTestUser(333333, 'user3');

        // Active lock
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(111111, 'withdrawal', now, futureTime);

        // Expired locks
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(222222, 'transfer', pastTime - 120, pastTime);

        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(333333, 'withdrawal', pastTime - 120, pastTime);

        await TransactionLockService.cleanExpiredLocks();

        const remaining = db.prepare('SELECT * FROM user_locks').all();
        expect(remaining).toHaveLength(1);
        expect((remaining[0] as any).user_id).toBe(111111);
      });

      test('does not remove locks that have not expired', async () => {
        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');

        await TransactionLockService.acquireLock(111111, 'withdrawal');
        await TransactionLockService.acquireLock(222222, 'transfer');

        await TransactionLockService.cleanExpiredLocks();

        const remaining = getTestDatabase().prepare('SELECT * FROM user_locks').all();
        expect(remaining).toHaveLength(2);
      });
    });

    describe('getActiveLocks', () => {
      test('returns all active locks', async () => {
        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');

        await TransactionLockService.acquireLock(111111, 'withdrawal');
        await TransactionLockService.acquireLock(222222, 'transfer');

        const activeLocks = await TransactionLockService.getActiveLocks();

        expect(activeLocks).toHaveLength(2);
        expect(activeLocks.map(l => l.user_id).sort()).toEqual([111111, 222222]);
      });

      test('does not return expired locks', async () => {
        const db = getTestDatabase();
        const now = Math.floor(Date.now() / 1000);
        const pastTime = now - 10;
        const futureTime = now + 60;

        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');

        // Active lock
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(111111, 'withdrawal', now, futureTime);

        // Expired lock
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(222222, 'transfer', pastTime - 120, pastTime);

        const activeLocks = await TransactionLockService.getActiveLocks();

        expect(activeLocks).toHaveLength(1);
        expect(activeLocks[0].user_id).toBe(111111);
      });

      test('returns empty array when no active locks', async () => {
        const activeLocks = await TransactionLockService.getActiveLocks();
        expect(activeLocks).toEqual([]);
      });
    });

    describe('releaseAllLocks', () => {
      test('removes all locks', async () => {
        createTestUser(111111, 'user1');
        createTestUser(222222, 'user2');
        createTestUser(333333, 'user3');

        await TransactionLockService.acquireLock(111111, 'withdrawal');
        await TransactionLockService.acquireLock(222222, 'transfer');
        await TransactionLockService.acquireLock(333333, 'withdrawal');

        const count = await TransactionLockService.releaseAllLocks();

        expect(count).toBe(3);

        const remaining = getTestDatabase().prepare('SELECT * FROM user_locks').all();
        expect(remaining).toHaveLength(0);
      });

      test('returns 0 when no locks to release', async () => {
        const count = await TransactionLockService.releaseAllLocks();
        expect(count).toBe(0);
      });
    });

    describe('concurrent lock attempts', () => {
      test('prevents race condition with multiple lock attempts', async () => {
        // First lock succeeds
        const lock1 = await TransactionLockService.acquireLock(123456, 'withdrawal');
        expect(lock1).toBe(true);

        // Concurrent attempts should fail
        const lock2 = await TransactionLockService.acquireLock(123456, 'transfer');
        const lock3 = await TransactionLockService.acquireLock(123456, 'withdrawal');

        expect(lock2).toBe(false);
        expect(lock3).toBe(false);

        // Only one lock should exist
        const activeLocks = await TransactionLockService.getActiveLocks();
        expect(activeLocks).toHaveLength(1);
        expect(activeLocks[0].lock_type).toBe('withdrawal');
      });

      test('allows new lock after release', async () => {
        await TransactionLockService.acquireLock(123456, 'withdrawal');
        await TransactionLockService.releaseLock(123456);

        const newLock = await TransactionLockService.acquireLock(123456, 'transfer');
        expect(newLock).toBe(true);

        const lock = await TransactionLockService.getUserLock(123456);
        expect(lock!.lock_type).toBe('transfer');
      });

      test('allows new lock after expiration', async () => {
        const db = getTestDatabase();
        const pastTime = Math.floor(Date.now() / 1000) - 10;

        // Insert expired lock
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(123456, 'withdrawal', pastTime - 120, pastTime);

        // Should be able to acquire new lock
        const newLock = await TransactionLockService.acquireLock(123456, 'transfer');
        expect(newLock).toBe(true);

        const lock = await TransactionLockService.getUserLock(123456);
        expect(lock!.lock_type).toBe('transfer');
      });
    });

    describe('edge cases', () => {
      test('handles lock with no metadata', async () => {
        await TransactionLockService.acquireLock(123456, 'withdrawal');

        const lock = await TransactionLockService.getUserLock(123456);
        expect(lock!.metadata).toBeNull();
      });

      test('handles complex metadata', async () => {
        const metadata = {
          amount: 100.5,
          destination: 'juno1xyz',
          reason: 'User requested',
          nested: {
            data: [1, 2, 3],
            obj: { key: 'value' }
          }
        };

        await TransactionLockService.acquireLock(123456, 'withdrawal', metadata);

        const lock = await TransactionLockService.getUserLock(123456);
        expect(JSON.parse(lock!.metadata!)).toEqual(metadata);
      });

      test('handles lock at exact expiration boundary', async () => {
        const db = getTestDatabase();
        const now = Math.floor(Date.now() / 1000);

        // Lock that expires right now
        db.prepare(`
          INSERT INTO user_locks (user_id, lock_type, locked_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(123456, 'withdrawal', now - 120, now);

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(false);
      });
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================
  describe('Integration Tests', () => {
    describe('deposit with transaction lock', () => {
      test('processes deposit while user has active lock', async () => {
        createTestUser(123456, 'user');

        // Acquire lock
        await TransactionLockService.acquireLock(123456, 'withdrawal');

        // Process deposit (should still work despite lock)
        const result = await LedgerService.processDeposit(
          123456,
          50,
          'test_tx_hash',
          'juno1sender'
        );

        expect(result.success).toBe(true);
        expect(result.newBalance).toBe(50);

        // Lock should still be active
        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(true);
      });
    });

    describe('payment verification with lock', () => {
      test('verifies payment and processes with lock protection', async () => {
        createTestUser(123456, 'user');

        const mockResponse = {
          tx_response: {
            code: 0,
            tx: {
              body: {
                messages: [
                  {
                    '@type': '/cosmos.bank.v1beta1.MsgSend',
                    to_address: 'juno1testtreasuryaddress123456789',
                    amount: [{ denom: 'ujuno', amount: '100000000' }] // 100 JUNO
                  }
                ]
              }
            }
          }
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        // Acquire lock before verification
        const lockAcquired = await TransactionLockService.acquireLock(123456, 'fine_payment');
        expect(lockAcquired).toBe(true);

        // Verify payment
        const verified = await JunoService.verifyPayment('tx_hash', 100);
        expect(verified).toBe(true);

        // Release lock after processing
        await TransactionLockService.releaseLock(123456);

        const isLocked = await TransactionLockService.isUserLocked(123456);
        expect(isLocked).toBe(false);
      });
    });
  });
});
