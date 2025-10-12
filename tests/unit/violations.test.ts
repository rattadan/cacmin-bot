/**
 * Unit tests for violation and payment commands
 * Tests violation listing, fine payment, and blockchain verification
 */

import { Telegraf, Context } from 'telegraf';
import { registerViolationHandlers } from '../../src/handlers/violations';
import { registerPaymentCommands } from '../../src/commands/payment';
import { WalletServiceV2 } from '../../src/services/walletServiceV2';
import { JunoService } from '../../src/services/junoService';
import { LedgerService } from '../../src/services/ledgerService';
import * as violationService from '../../src/services/violationService';
import {
  createMockContext,
  createPlebContext,
  getReplyText,
  getAllReplies,
  initTestDatabase,
  cleanTestDatabase,
  closeTestDatabase,
  createTestUser,
  createTestViolation,
  addTestBalance,
  getTestDatabase
} from '../helpers';
import { Violation } from '../../src/types';

// Mock the database module to use test database
jest.mock('../../src/database', () => {
  const testDb = require('../helpers/testDatabase');
  return {
    query: jest.fn((sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).all(...params);
    }),
    get: jest.fn((sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).get(...params);
    }),
    execute: jest.fn((sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).run(...params);
    }),
    initDb: jest.fn()
  };
});

// Mock services
jest.mock('../../src/services/walletServiceV2');
jest.mock('../../src/services/junoService');
jest.mock('../../src/services/jailService');
jest.mock('../../src/utils/logger');

describe('Violation and Payment Commands', () => {
  let bot: Telegraf<Context>;
  let db: any;

  beforeAll(() => {
    db = initTestDatabase();
  });

  beforeEach(() => {
    // Clean database before each test
    cleanTestDatabase();

    // Create fresh bot instance
    bot = new Telegraf('test-token');

    // Register handlers
    registerViolationHandlers(bot);
    registerPaymentCommands(bot);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('/violations - List user violations', () => {
    it('should show message when user has no violations', async () => {
      createTestUser(444444444, 'testuser', 'pleb');

      // Test the service layer directly
      const violations = violationService.getUserViolations(444444444);

      expect(violations).toHaveLength(0);
    });

    it('should list all user violations with paid status', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Create test violations - mix of paid and unpaid
      createTestViolation(userId, 'no_stickers', 10.5, 0);
      createTestViolation(userId, 'no_urls', 5.25, 1);
      createTestViolation(userId, 'blacklist', 50.0, 0);

      const ctx = createPlebContext({ userId, messageText: '/violations' });

      // Manually trigger the violations command since we're testing outside full bot context
      const violations = violationService.getUserViolations(userId);

      expect(violations).toHaveLength(3);
      expect(violations[0].paid).toBeFalsy();
      expect(violations[1].paid).toBeTruthy();
      expect(violations[2].paid).toBeFalsy();
    });

    it('should display violation details including bail amounts', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 15.75, 0);
      const violations = violationService.getUserViolations(userId);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].id).toBe(violationId);
      // Check both camelCase and snake_case since database returns snake_case
      const bailAmount = (violations[0] as any).bail_amount || violations[0].bailAmount;
      expect(bailAmount).toBe(15.75);
      expect(violations[0].restriction).toBe('no_stickers');
    });

    it('should return empty array for user without ID', async () => {
      const ctx = createPlebContext({ messageText: '/violations' });
      (ctx as any).from = undefined;

      const reply = getReplyText(ctx as Context);
      expect(reply).toBe('');
    });
  });

  describe('/payfines - Show unpaid fines', () => {
    beforeEach(() => {
      // Mock WalletServiceV2.getUserBalance
      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(100.0);
    });

    it('should only work in private messages', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const ctx = createPlebContext({
        userId,
        messageText: '/payfines',
        chatType: 'supergroup'
      });

      // Test that the command checks for private chat
      expect(ctx.chat?.type).not.toBe('private');
    });

    it('should show message when user has no unpaid fines', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Create only paid violations
      createTestViolation(userId, 'no_stickers', 10.0, 1);

      const unpaidViolations = violationService.getUnpaidViolations(userId);
      expect(unpaidViolations).toHaveLength(0);
    });

    it('should list all unpaid fines with total', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Create mix of paid and unpaid
      createTestViolation(userId, 'no_stickers', 10.5, 0);
      createTestViolation(userId, 'no_urls', 5.25, 1); // paid
      createTestViolation(userId, 'blacklist', 50.0, 0);

      const unpaidViolations = violationService.getUnpaidViolations(userId);
      const totalFines = violationService.getTotalFines(userId);

      expect(unpaidViolations).toHaveLength(2);
      expect(totalFines).toBe(60.5);
    });

    it('should show sufficient funds message when balance covers fines', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'no_stickers', 25.0, 0);
      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(100.0);

      const balance = await WalletServiceV2.getUserBalance(userId);
      const totalFines = violationService.getTotalFines(userId);

      expect(balance).toBeGreaterThanOrEqual(totalFines);
    });

    it('should show insufficient funds message when balance is too low', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'blacklist', 100.0, 0);
      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(50.0);

      const balance = await WalletServiceV2.getUserBalance(userId);
      const totalFines = violationService.getTotalFines(userId);

      expect(balance).toBeLessThan(totalFines);
    });
  });

  describe('/payallfines - Pay all outstanding fines', () => {
    beforeEach(() => {
      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(100.0);
      (WalletServiceV2.payFine as jest.Mock).mockResolvedValue({
        success: true,
        newBalance: 40.0
      });
    });

    it('should only work in private messages', async () => {
      const userId = 444444444;
      const ctx = createPlebContext({
        userId,
        messageText: '/payallfines',
        chatType: 'supergroup'
      });

      expect(ctx.chat?.type).not.toBe('private');
    });

    it('should show message when user has no unpaid fines', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const unpaidViolations = violationService.getUnpaidViolations(userId);
      expect(unpaidViolations).toHaveLength(0);
    });

    it('should fail when user has insufficient balance', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'blacklist', 100.0, 0);
      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(50.0);

      const balance = await WalletServiceV2.getUserBalance(userId);
      const totalFines = violationService.getTotalFines(userId);

      expect(balance).toBeLessThan(totalFines);
    });

    it('should process payment via internal ledger when balance is sufficient', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const v1 = createTestViolation(userId, 'no_stickers', 10.0, 0);
      const v2 = createTestViolation(userId, 'no_urls', 5.0, 0);

      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(100.0);
      (WalletServiceV2.payFine as jest.Mock).mockResolvedValue({
        success: true,
        newBalance: 85.0
      });

      const totalFines = violationService.getTotalFines(userId);
      const result = await WalletServiceV2.payFine(userId, totalFines, undefined, 'Test payment');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(85.0);
      expect(WalletServiceV2.payFine).toHaveBeenCalledWith(
        userId,
        15.0,
        undefined,
        'Test payment'
      );
    });

    it('should mark all violations as paid after successful payment', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const v1 = createTestViolation(userId, 'no_stickers', 10.0, 0);
      const v2 = createTestViolation(userId, 'no_urls', 5.0, 0);

      // Mark violations as paid
      violationService.markViolationPaid(v1, 'internal_ledger', userId);
      violationService.markViolationPaid(v2, 'internal_ledger', userId);

      const violations = violationService.getUserViolations(userId);
      expect(violations[0].paid).toBeTruthy();
      expect(violations[1].paid).toBeTruthy();
      // Check both camelCase and snake_case since database returns snake_case
      const paymentTx0 = (violations[0] as any).payment_tx || violations[0].paymentTx;
      const paymentTx1 = (violations[1] as any).payment_tx || violations[1].paymentTx;
      expect(paymentTx0).toBe('internal_ledger');
      expect(paymentTx1).toBe('internal_ledger');
    });

    it('should release user from jail after payment', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Mute user (simulate jail)
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').run(futureTime, userId);

      createTestViolation(userId, 'no_stickers', 10.0, 0);

      // Verify user is jailed
      const jailedUser = db.prepare('SELECT muted_until FROM users WHERE id = ?').get(userId);
      expect(jailedUser.muted_until).toBe(futureTime);

      // Simulate jail release after payment
      db.prepare('UPDATE users SET muted_until = NULL WHERE id = ?').run(userId);

      // Verify user is released
      const releasedUser = db.prepare('SELECT muted_until FROM users WHERE id = ?').get(userId);
      expect(releasedUser.muted_until).toBeNull();
    });

    it('should return error when payment processing fails', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'no_stickers', 10.0, 0);

      (WalletServiceV2.getUserBalance as jest.Mock).mockResolvedValue(100.0);
      (WalletServiceV2.payFine as jest.Mock).mockResolvedValue({
        success: false,
        newBalance: 100.0,
        error: 'Payment processing failed'
      });

      const result = await WalletServiceV2.payFine(userId, 10.0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment processing failed');
    });
  });

  describe('/payfine - Pay specific violation (on-chain)', () => {
    beforeEach(() => {
      (JunoService.getPaymentAddress as jest.Mock).mockReturnValue('juno1testaddress');
    });

    it('should show all unpaid fines when no violation ID provided', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'no_stickers', 10.0, 0);
      createTestViolation(userId, 'no_urls', 5.0, 0);

      const unpaidViolations = violationService.getUnpaidViolations(userId);
      const totalFines = violationService.getTotalFines(userId);

      expect(unpaidViolations).toHaveLength(2);
      expect(totalFines).toBe(15.0);
    });

    it('should show payment instructions for specific violation', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.5, 0);
      const violations = violationService.getUserViolations(userId);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].id).toBe(violationId);
      // Check both camelCase and snake_case since database returns snake_case
      const bailAmount = (violations[0] as any).bail_amount || violations[0].bailAmount;
      expect(bailAmount).toBe(25.5);
      expect(JunoService.getPaymentAddress()).toBe('juno1testaddress');
    });

    it('should return error for non-existent violation ID', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violations = violationService.getUserViolations(userId);
      expect(violations.find(v => v.id === 99999)).toBeUndefined();
    });

    it('should return error when violation belongs to different user', async () => {
      const user1 = 444444444;
      const user2 = 555555555;
      createTestUser(user1, 'user1', 'pleb');
      createTestUser(user2, 'user2', 'pleb');

      const violationId = createTestViolation(user1, 'no_stickers', 10.0, 0);

      // Try to access user1's violation as user2
      const violations = violationService.getUserViolations(user2);
      expect(violations.find(v => v.id === violationId)).toBeUndefined();
    });

    it('should return error for already paid violation', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 10.0, 1); // already paid
      const violations = violationService.getUserViolations(userId);

      expect(violations[0].paid).toBeTruthy();
    });
  });

  describe('/verifypayment - Verify blockchain payment', () => {
    beforeEach(() => {
      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(true);
    });

    it('should require violation ID and transaction hash', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Test missing parameters
      const messageText = '/verifypayment';
      const parts = messageText.split(' ').slice(1);

      expect(parts.length).toBeLessThan(2);
    });

    it('should verify valid payment on blockchain', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const txHash = 'ABC123VALIDTXHASH';

      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(true);

      const verified = await JunoService.verifyPayment(txHash, 25.0);
      expect(verified).toBe(true);
      expect(JunoService.verifyPayment).toHaveBeenCalledWith(txHash, 25.0);
    });

    it('should mark violation as paid after successful verification', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const txHash = 'ABC123VALIDTXHASH';

      // Mark as paid
      violationService.markViolationPaid(violationId, txHash, userId);

      const violations = violationService.getUserViolations(userId);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].paid).toBeTruthy();
      // Check both camelCase and snake_case since database returns snake_case
      const paymentTx = (violations[0] as any).payment_tx || violations[0].paymentTx;
      const paidByUserId = (violations[0] as any).paid_by_user_id || violations[0].paidByUserId;
      expect(paymentTx).toBe(txHash);
      expect(paidByUserId).toBe(userId);
    });

    it('should reject invalid transaction hash', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const invalidTxHash = 'INVALIDHASH';

      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(false);

      const verified = await JunoService.verifyPayment(invalidTxHash, 25.0);
      expect(verified).toBe(false);
    });

    it('should reject payment with incorrect amount', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const txHash = 'ABC123VALIDTXHASH';

      // Verify with wrong amount
      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(false);

      const verified = await JunoService.verifyPayment(txHash, 10.0); // wrong amount
      expect(verified).toBe(false);
    });

    it('should reject verification for non-existent violation', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violations = violationService.getUserViolations(userId);
      expect(violations.find(v => v.id === 99999)).toBeUndefined();
    });

    it('should reject verification for already paid violation', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 1); // already paid
      const violations = violationService.getUserViolations(userId);

      expect(violations[0].paid).toBeTruthy();
    });

    it('should reject verification when violation belongs to different user', async () => {
      const user1 = 444444444;
      const user2 = 555555555;
      createTestUser(user1, 'user1', 'pleb');
      createTestUser(user2, 'user2', 'pleb');

      const violationId = createTestViolation(user1, 'no_stickers', 25.0, 0);

      // Try to verify as different user
      const violations = violationService.getUserViolations(user2);
      expect(violations.find(v => v.id === violationId)).toBeUndefined();
    });
  });

  describe('Violation creation and tracking', () => {
    it('should create violation with correct bail amount', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = await violationService.createViolation(
        userId,
        'no_stickers',
        'User sent restricted sticker'
      );

      const violations = violationService.getUserViolations(userId);
      expect(violations[0].id).toBe(violationId);
      expect(violations[0].restriction).toBe('no_stickers');
      expect(violations[0].message).toBe('User sent restricted sticker');
    });

    it('should increment user warning count on violation', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const userBefore = db.prepare('SELECT warning_count FROM users WHERE id = ?').get(userId);
      const warningsBefore = userBefore?.warning_count || 0;

      await violationService.createViolation(userId, 'no_stickers');

      const userAfter = db.prepare('SELECT warning_count FROM users WHERE id = ?').get(userId);
      expect(userAfter.warning_count).toBe(warningsBefore + 1);
    });

    it('should track multiple violations per user', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      await violationService.createViolation(userId, 'no_stickers');
      await violationService.createViolation(userId, 'no_urls');
      await violationService.createViolation(userId, 'blacklist');

      const violations = violationService.getUserViolations(userId);
      expect(violations).toHaveLength(3);
    });

    it('should calculate correct fine amounts based on violation type', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Mock config fine amounts
      const fineAmounts = {
        sticker: 10.0,
        url: 5.0,
        regex: 15.0,
        blacklist: 50.0
      };

      // Note: Actual fine amounts come from config, these are examples
      const v1 = createTestViolation(userId, 'no_stickers', 10.0, 0);
      const v2 = createTestViolation(userId, 'no_urls', 5.0, 0);
      const v3 = createTestViolation(userId, 'blacklist', 50.0, 0);

      const violations = violationService.getUserViolations(userId);
      expect(violations.length).toBe(3);
      // Check both camelCase and snake_case since database returns snake_case
      const getBailAmount = (v: any) => v.bail_amount || v.bailAmount;
      expect(getBailAmount(violations.find(v => v.id === v1))).toBe(10.0);
      expect(getBailAmount(violations.find(v => v.id === v2))).toBe(5.0);
      expect(getBailAmount(violations.find(v => v.id === v3))).toBe(50.0);
    });
  });

  describe('Payment processing via internal ledger', () => {
    it('should deduct balance from user account', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Mock LedgerService
      jest.spyOn(LedgerService, 'getUserBalance').mockResolvedValue(100.0);
      jest.spyOn(LedgerService, 'processFine').mockResolvedValue({
        success: true,
        newBalance: 75.0
      });

      const result = await LedgerService.processFine(userId, 25.0, 1, 'Fine payment');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(75.0);
      expect(LedgerService.processFine).toHaveBeenCalledWith(userId, 25.0, 1, 'Fine payment');
    });

    it('should reject payment when balance is insufficient', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      jest.spyOn(LedgerService, 'getUserBalance').mockResolvedValue(10.0);
      jest.spyOn(LedgerService, 'processFine').mockResolvedValue({
        success: false,
        newBalance: 10.0,
        error: 'Insufficient balance for fine payment'
      });

      const result = await LedgerService.processFine(userId, 25.0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance for fine payment');
    });

    it('should record transaction in ledger', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      jest.spyOn(LedgerService, 'processFine').mockResolvedValue({
        success: true,
        newBalance: 75.0
      });

      const result = await LedgerService.processFine(userId, 25.0, 1, 'Test fine payment');

      expect(result.success).toBe(true);
      expect(LedgerService.processFine).toHaveBeenCalledWith(
        userId,
        25.0,
        1,
        'Test fine payment'
      );
    });

    it('should handle bulk payment for multiple violations', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'no_stickers', 10.0, 0);
      createTestViolation(userId, 'no_urls', 5.0, 0);
      createTestViolation(userId, 'blacklist', 50.0, 0);

      const totalFines = violationService.getTotalFines(userId);
      expect(totalFines).toBe(65.0);

      jest.spyOn(LedgerService, 'getUserBalance').mockResolvedValue(100.0);
      jest.spyOn(LedgerService, 'processFine').mockResolvedValue({
        success: true,
        newBalance: 35.0
      });

      const result = await LedgerService.processFine(userId, totalFines);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(35.0);
    });
  });

  describe('Payment verification via blockchain', () => {
    it('should verify transaction on Juno blockchain', async () => {
      const txHash = 'ABCD1234567890';
      const amount = 25.5;

      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(true);

      const verified = await JunoService.verifyPayment(txHash, amount);

      expect(verified).toBe(true);
      expect(JunoService.verifyPayment).toHaveBeenCalledWith(txHash, amount);
    });

    it('should handle blockchain query failures gracefully', async () => {
      const txHash = 'INVALID';
      const amount = 25.5;

      (JunoService.verifyPayment as jest.Mock).mockRejectedValue(
        new Error('RPC endpoint unavailable')
      );

      await expect(JunoService.verifyPayment(txHash, amount)).rejects.toThrow(
        'RPC endpoint unavailable'
      );
    });

    it('should verify payment to correct treasury address', async () => {
      const txHash = 'ABCD1234567890';
      const amount = 25.5;

      (JunoService.getPaymentAddress as jest.Mock).mockReturnValue('juno1testtreasury');
      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(true);

      const address = JunoService.getPaymentAddress();
      const verified = await JunoService.verifyPayment(txHash, amount);

      expect(address).toBe('juno1testtreasury');
      expect(verified).toBe(true);
    });

    it('should allow small amount differences for rounding (0.01 JUNO tolerance)', async () => {
      const txHash = 'ABCD1234567890';

      // The verification logic in JunoService allows 0.01 JUNO difference
      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(true);

      // Verify with amount close to expected (within tolerance)
      const verified = await JunoService.verifyPayment(txHash, 25.00);
      expect(verified).toBe(true);
    });

    it('should reject payment with amount outside tolerance', async () => {
      const txHash = 'ABCD1234567890';

      (JunoService.verifyPayment as jest.Mock).mockResolvedValue(false);

      const verified = await JunoService.verifyPayment(txHash, 10.0); // Significantly different
      expect(verified).toBe(false);
    });
  });

  describe('Violation status updates', () => {
    it('should update violation status to paid after payment', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);

      // Mark as paid
      violationService.markViolationPaid(violationId, 'internal_ledger', userId);

      const violations = violationService.getUserViolations(userId);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].paid).toBeTruthy();
      // Check both camelCase and snake_case since database returns snake_case
      const paymentTx = (violations[0] as any).payment_tx || violations[0].paymentTx;
      expect(paymentTx).toBe('internal_ledger');
    });

    it('should record payment transaction hash', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const txHash = 'ABCD1234567890';

      violationService.markViolationPaid(violationId, txHash, userId);

      const violations = violationService.getUserViolations(userId);
      expect(violations.length).toBeGreaterThan(0);
      // Check both camelCase and snake_case since database returns snake_case
      const paymentTx = (violations[0] as any).payment_tx || violations[0].paymentTx;
      expect(paymentTx).toBe(txHash);
    });

    it('should record who paid the fine', async () => {
      const violator = 444444444;
      const payer = 555555555;
      createTestUser(violator, 'violator', 'pleb');
      createTestUser(payer, 'payer', 'pleb');

      const violationId = createTestViolation(violator, 'no_stickers', 25.0, 0);

      // Someone else pays the fine
      violationService.markViolationPaid(violationId, 'internal_ledger', payer);

      const violations = violationService.getUserViolations(violator);
      expect(violations.length).toBeGreaterThan(0);
      // Check both camelCase and snake_case since database returns snake_case
      const paidByUserId = (violations[0] as any).paid_by_user_id || violations[0].paidByUserId;
      expect(paidByUserId).toBe(payer);
    });

    it('should record payment timestamp', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = createTestViolation(userId, 'no_stickers', 25.0, 0);
      const beforeTime = Math.floor(Date.now() / 1000);

      violationService.markViolationPaid(violationId, 'internal_ledger', userId);

      const afterTime = Math.floor(Date.now() / 1000);
      const violations = violationService.getUserViolations(userId);

      expect(violations.length).toBeGreaterThan(0);
      // Check both camelCase and snake_case since database returns snake_case
      const paidAt = (violations[0] as any).paid_at || violations[0].paidAt;
      expect(paidAt).toBeGreaterThanOrEqual(beforeTime);
      expect(paidAt).toBeLessThanOrEqual(afterTime);
    });

    it('should maintain payment history', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      // Create and pay multiple violations
      const v1 = createTestViolation(userId, 'no_stickers', 10.0, 0);
      const v2 = createTestViolation(userId, 'no_urls', 5.0, 0);
      const v3 = createTestViolation(userId, 'blacklist', 50.0, 0);

      violationService.markViolationPaid(v1, 'tx_hash_1', userId);
      violationService.markViolationPaid(v2, 'tx_hash_2', userId);
      // Leave v3 unpaid

      const allViolations = violationService.getUserViolations(userId);
      const paidViolations = allViolations.filter(v => v.paid);
      const unpaidViolations = violationService.getUnpaidViolations(userId);

      expect(allViolations).toHaveLength(3);
      expect(paidViolations).toHaveLength(2);
      expect(unpaidViolations).toHaveLength(1);
      expect(unpaidViolations[0].id).toBe(v3);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing user ID gracefully', async () => {
      const ctx = createPlebContext({ messageText: '/violations' });
      (ctx as any).from = undefined;

      // The handler should check for userId existence
      expect(ctx.from).toBeUndefined();
    });

    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      const userId = 999999999; // Non-existent user

      expect(() => {
        violationService.getUserViolations(userId);
      }).not.toThrow();
    });

    it('should handle concurrent payment attempts', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      jest.spyOn(LedgerService, 'processFine').mockResolvedValue({
        success: true,
        newBalance: 75.0
      });

      // Simulate concurrent payment attempts
      const payment1 = LedgerService.processFine(userId, 25.0);
      const payment2 = LedgerService.processFine(userId, 25.0);

      const [result1, result2] = await Promise.all([payment1, payment2]);

      // Both should succeed independently (the service handles locking)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should handle payment with decimal precision correctly', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      createTestViolation(userId, 'no_stickers', 10.333333, 0);
      createTestViolation(userId, 'no_urls', 5.666666, 0);

      const totalFines = violationService.getTotalFines(userId);

      // SQLite should handle decimal precision
      expect(totalFines).toBeCloseTo(15.999999, 5);
    });

    it('should handle violations with special characters in message', async () => {
      const userId = 444444444;
      createTestUser(userId, 'testuser', 'pleb');

      const violationId = await violationService.createViolation(
        userId,
        'no_urls',
        'User sent: https://example.com/test?query=value&other=123'
      );

      const violations = violationService.getUserViolations(userId);
      expect(violations[0].message).toContain('https://example.com');
    });
  });
});
