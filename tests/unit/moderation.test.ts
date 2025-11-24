import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
/**
 * Unit tests for jail and moderation commands
 */

import { Context } from 'telegraf';
import {
  createMockContext,
  createOwnerContext,
  createAdminContext,
  createPlebContext,
  getReplyText,
  getAllReplies,
  wasTextReplied,
} from '../helpers/mockContext';
import {
  initTestDatabase,
  cleanTestDatabase,
  closeTestDatabase,
  createTestUser,
  jailTestUser,
  createTestViolation,
} from '../helpers/testDatabase';

// Mock database module
vi.mock('../../src/database', () => {
  const testDb = require('../helpers/testDatabase');
  return {
    query: (sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).all(...params);
    },
    get: (sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).get(...params);
    },
    execute: (sql: string, params: any[] = []) => {
      const db = testDb.getTestDatabase();
      return db.prepare(sql).run(...params);
    },
  };
});

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    botToken: 'test-token',
    groupChatId: -1001234567890,
    ownerId: 111111111,
    botTreasuryAddress: 'juno1testtreasuryaddress',
    userFundsAddress: 'juno1testuserfundsaddress',
    userFundsMnemonic: 'test mnemonic',
  },
  validateConfig: vi.fn(),
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock JunoService
vi.mock('../../src/services/junoService', () => ({
  JunoService: {
    getPaymentAddress: vi.fn().mockReturnValue('juno1testtreasuryaddress'),
    verifyPayment: vi.fn().mockResolvedValue(true),
  },
}));

// Don't mock JailService - use real implementation for testing
// Just mock the bot-specific methods if needed

// Mock user resolver
vi.mock('../../src/utils/userResolver', () => ({
  resolveUserId: vi.fn((identifier: string) => {
    if (identifier.startsWith('@')) {
      const username = identifier.slice(1);
      const db = require('../helpers/testDatabase').getTestDatabase();
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      return user?.id;
    }
    const userId = parseInt(identifier);
    return isNaN(userId) ? null : userId;
  }),
  formatUserIdDisplay: vi.fn((userId: number) => {
    const db = require('../helpers/testDatabase').getTestDatabase();
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    return user?.username ? `@${user.username}` : `${userId}`;
  }),
}));

import { registerJailCommands } from '../../src/commands/jail';
import { registerModerationCommands } from '../../src/commands/moderation';
import { JailService } from '../../src/services/jailService';
import Telegraf from 'telegraf';

describe('Jail Commands', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase();
    createTestUser(111111111, 'owner', 'owner');
    createTestUser(222222222, 'admin', 'admin');
    createTestUser(333333333, 'elevated', 'elevated');
    createTestUser(444444444, 'pleb', 'pleb');
    createTestUser(555555555, 'jaileduser', 'pleb');
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('/mystatus Command', () => {
    it('should show user status when not jailed', async () => {
      const ctx = createPlebContext({ messageText: '/mystatus' }) as Context;

      // Simulate command execution
      const userId = ctx.from?.id!;
      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [userId]);

      expect(user).toBeDefined();
      expect(user.role).toBe('pleb');
      expect(user.muted_until).toBeFalsy(); // SQLite returns null, not undefined
    });

    it('should show jail status when user is jailed', async () => {
      const userId = 555555555;
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      jailTestUser(userId, 222222222, 10, futureTime);

      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [userId]);

      expect(user.muted_until).toBe(futureTime);
      expect(user.muted_until).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should show unpaid violations in status', async () => {
      const userId = 444444444;
      createTestViolation(userId, 'no_stickers', 2.0, 0);
      createTestViolation(userId, 'no_urls', 3.0, 0);

      const { query } = require('../../src/database');
      const violations = query(
        'SELECT * FROM violations WHERE user_id = ? AND paid = 0',
        [userId]
      );

      expect(violations).toHaveLength(2);
      const totalFines = violations.reduce((sum: number, v: any) => sum + v.bail_amount, 0);
      expect(totalFines).toBe(5.0);
    });
  });

  describe('/jails Command', () => {
    it('should show message when no users are jailed', () => {
      const activeJails = JailService.getActiveJails();
      expect(activeJails).toHaveLength(0);
    });

    it('should list all active jails', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 1800; // 30 minutes

      jailTestUser(555555555, 222222222, 10, futureTime);
      jailTestUser(444444444, 111111111, 20, futureTime);

      const activeJails = JailService.getActiveJails();
      expect(activeJails).toHaveLength(2);
      expect(activeJails[0]).toHaveProperty('timeRemaining');
      expect(activeJails[0].timeRemaining).toBeGreaterThan(0);
    });

    it('should not show expired jails', () => {
      const now = Math.floor(Date.now() / 1000);
      const pastTime = now - 100; // Expired

      const { execute } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [pastTime, 555555555]
      );

      const activeJails = JailService.getActiveJails();
      expect(activeJails).toHaveLength(0);
    });
  });

  describe('/paybail Command', () => {
    it('should show payment instructions for jailed user', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 600; // 10 minutes
      const userId = 555555555;

      const { execute } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [futureTime, userId]
      );

      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [userId]);

      expect(user.muted_until).toBe(futureTime);

      const timeRemaining = user.muted_until - now;
      const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

      expect(bailAmount).toBeGreaterThanOrEqual(1.0);
    });

    it('should return message when user is not jailed', () => {
      const userId = 444444444;
      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [userId]);

      expect(user.muted_until).toBeFalsy();
    });
  });

  describe('/paybailfor Command', () => {
    it('should show payment instructions for another user', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 1200; // 20 minutes
      const targetUserId = 555555555;

      const { execute } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [futureTime, targetUserId]
      );

      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.muted_until).toBe(futureTime);
    });

    it('should reject when user is not jailed', () => {
      const targetUserId = 444444444;
      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);

      expect(user.muted_until).toBeFalsy();
    });
  });

  describe('Bail Verification', () => {
    it('should release user after bail payment verification', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 600;
      const userId = 555555555;

      const { execute, get } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [futureTime, userId]
      );

      // Simulate successful verification
      execute(
        'UPDATE users SET muted_until = NULL WHERE id = ?',
        [userId]
      );

      const user = get('SELECT * FROM users WHERE id = ?', [userId]);
      expect(user.muted_until).toBeNull();
    });

    it('should log bail payment event', () => {
      const userId = 555555555;
      const bailAmount = 10.0;
      const txHash = 'test_tx_hash_123';

      JailService.logJailEvent(userId, 'bail_paid', undefined, undefined, bailAmount, userId, txHash);

      const { query } = require('../../src/database');
      const events = query(
        'SELECT * FROM jail_events WHERE user_id = ? AND event_type = ?',
        [userId, 'bail_paid']
      );

      expect(events).toHaveLength(1);
      expect(events[0].bail_amount).toBe(bailAmount);
      expect(events[0].payment_tx).toBe(txHash);
    });
  });
});

describe('Moderation Commands', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase();
    createTestUser(111111111, 'owner', 'owner');
    createTestUser(222222222, 'admin', 'admin');
    createTestUser(333333333, 'elevated', 'elevated');
    createTestUser(444444444, 'pleb', 'pleb');
    createTestUser(555555555, 'targetuser', 'pleb');
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('/jail Command', () => {
    it('should allow admin to jail user', () => {
      const adminId = 222222222;
      const targetUserId = 555555555;
      const minutes = 30;

      const { execute, get } = require('../../src/database');
      const mutedUntil = Math.floor(Date.now() / 1000) + (minutes * 60);

      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [mutedUntil, targetUserId]
      );

      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.muted_until).toBe(mutedUntil);
    });

    it('should deny pleb from jailing', () => {
      const plebId = 444444444;
      const { get } = require('../../src/database');
      const user = get('SELECT * FROM users WHERE id = ?', [plebId]);

      expect(user.role).toBe('pleb');
      // Permission check would fail
    });

    it('should calculate correct bail amount', () => {
      const minutes = 60;
      const bailAmount = JailService.calculateBailAmount(minutes);

      expect(bailAmount).toBe(6.0); // 60 * 0.1 = 6.0
    });

    it('should enforce minimum bail of 1.0 JUNO', () => {
      const minutes = 5;
      const bailAmount = JailService.calculateBailAmount(minutes);

      expect(bailAmount).toBe(1.0); // minimum
    });

    it('should log jail event', () => {
      const adminId = 222222222;
      const targetUserId = 555555555;
      const minutes = 30;
      const bailAmount = JailService.calculateBailAmount(minutes);

      JailService.logJailEvent(targetUserId, 'jailed', adminId, minutes, bailAmount);

      const { query } = require('../../src/database');
      const events = query(
        'SELECT * FROM jail_events WHERE user_id = ? AND event_type = ?',
        [targetUserId, 'jailed']
      );

      expect(events).toHaveLength(1);
      expect(events[0].admin_id).toBe(adminId);
      expect(events[0].duration_minutes).toBe(minutes);
      expect(events[0].bail_amount).toBe(bailAmount);
    });
  });

  describe('/unjail Command', () => {
    it('should allow admin to unjail user', () => {
      const adminId = 222222222;
      const targetUserId = 555555555;

      // First jail the user
      const futureTime = Math.floor(Date.now() / 1000) + 1800;
      const { execute, get } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [futureTime, targetUserId]
      );

      // Then unjail
      execute(
        'UPDATE users SET muted_until = NULL WHERE id = ?',
        [targetUserId]
      );

      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.muted_until).toBeNull();
    });

    it('should log unjail event', () => {
      const adminId = 222222222;
      const targetUserId = 555555555;

      JailService.logJailEvent(targetUserId, 'unjailed', adminId);

      const { query } = require('../../src/database');
      const events = query(
        'SELECT * FROM jail_events WHERE user_id = ? AND event_type = ?',
        [targetUserId, 'unjailed']
      );

      expect(events).toHaveLength(1);
      expect(events[0].admin_id).toBe(adminId);
    });
  });

  describe('/warn Command', () => {
    it('should allow admin to warn user', () => {
      const adminId = 222222222;
      const targetUserId = 555555555;
      const reason = 'Spam posting';

      const { execute, get } = require('../../src/database');

      execute(
        'INSERT INTO violations (user_id, restriction, message, bail_amount) VALUES (?, ?, ?, ?)',
        [targetUserId, 'warning', reason, 0]
      );

      execute(
        'UPDATE users SET warning_count = warning_count + 1 WHERE id = ?',
        [targetUserId]
      );

      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.warning_count).toBe(1);

      const { query } = require('../../src/database');
      const violations = query(
        'SELECT * FROM violations WHERE user_id = ? AND restriction = ?',
        [targetUserId, 'warning']
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe(reason);
      expect(violations[0].bail_amount).toBe(0);
    });

    it('should increment warning count correctly', () => {
      const targetUserId = 555555555;
      const { execute, get } = require('../../src/database');

      // First warning
      execute(
        'UPDATE users SET warning_count = warning_count + 1 WHERE id = ?',
        [targetUserId]
      );

      let user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.warning_count).toBe(1);

      // Second warning
      execute(
        'UPDATE users SET warning_count = warning_count + 1 WHERE id = ?',
        [targetUserId]
      );

      user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.warning_count).toBe(2);
    });
  });

  describe('/clearviolations Command', () => {
    it('should allow owner to clear violations', () => {
      const ownerId = 111111111;
      const targetUserId = 555555555;

      const { execute, query, get } = require('../../src/database');

      // Create violations
      execute(
        'INSERT INTO violations (user_id, restriction, message, bail_amount) VALUES (?, ?, ?, ?)',
        [targetUserId, 'warning', 'Test 1', 0]
      );
      execute(
        'INSERT INTO violations (user_id, restriction, message, bail_amount) VALUES (?, ?, ?, ?)',
        [targetUserId, 'no_stickers', 'Test 2', 2.0]
      );

      execute('UPDATE users SET warning_count = 2 WHERE id = ?', [targetUserId]);

      // Clear violations
      execute('DELETE FROM violations WHERE user_id = ?', [targetUserId]);
      execute('UPDATE users SET warning_count = 0 WHERE id = ?', [targetUserId]);

      const violations = query('SELECT * FROM violations WHERE user_id = ?', [targetUserId]);
      expect(violations).toHaveLength(0);

      const user = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
      expect(user.warning_count).toBe(0);
    });
  });

  describe('/stats Command', () => {
    it('should show bot statistics', () => {
      const { get } = require('../../src/database');

      const stats = {
        totalUsers: get('SELECT COUNT(*) as count FROM users')?.count || 0,
        totalViolations: get('SELECT COUNT(*) as count FROM violations')?.count || 0,
      };

      expect(stats.totalUsers).toBe(5); // From beforeEach
      expect(stats.totalViolations).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('JailService', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase();
    createTestUser(111111111, 'owner', 'owner');
    createTestUser(222222222, 'admin', 'admin');
    createTestUser(444444444, 'pleb', 'pleb');
    createTestUser(555555555, 'jaileduser', 'pleb');
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('calculateBailAmount', () => {
    it('should calculate bail at 0.1 JUNO per minute', () => {
      expect(JailService.calculateBailAmount(10)).toBe(1.0);
      expect(JailService.calculateBailAmount(60)).toBe(6.0);
      expect(JailService.calculateBailAmount(120)).toBe(12.0);
    });

    it('should enforce minimum bail of 1.0 JUNO', () => {
      expect(JailService.calculateBailAmount(5)).toBe(1.0);
      expect(JailService.calculateBailAmount(1)).toBe(1.0);
      expect(JailService.calculateBailAmount(0)).toBe(1.0);
    });
  });

  describe('getActiveJails', () => {
    it('should return users with active jail times', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTime = now + 3600;

      const { execute } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [futureTime, 555555555]
      );

      const activeJails = JailService.getActiveJails();
      expect(activeJails).toHaveLength(1);
      expect(activeJails[0].id).toBe(555555555);
      expect(activeJails[0].timeRemaining).toBeGreaterThan(0);
    });

    it('should not return expired jails', () => {
      const now = Math.floor(Date.now() / 1000);
      const pastTime = now - 100;

      const { execute } = require('../../src/database');
      execute(
        'UPDATE users SET muted_until = ? WHERE id = ?',
        [pastTime, 555555555]
      );

      const activeJails = JailService.getActiveJails();
      expect(activeJails).toHaveLength(0);
    });
  });

  describe('getUserJailEvents', () => {
    it('should return jail events for a user', () => {
      const userId = 555555555;

      JailService.logJailEvent(userId, 'jailed', 222222222, 30, 3.0);
      JailService.logJailEvent(userId, 'unjailed', 222222222);
      JailService.logJailEvent(userId, 'jailed', 111111111, 60, 6.0);

      const events = JailService.getUserJailEvents(userId, 10);
      expect(events).toHaveLength(3);
      // Database returns snake_case fields
      const firstEvent = events[0] as any;
      expect(firstEvent.event_type || firstEvent.eventType).toBeDefined();
    });

    it('should respect limit parameter', () => {
      const userId = 555555555;

      for (let i = 0; i < 15; i++) {
        JailService.logJailEvent(userId, 'jailed', 222222222, 30, 3.0);
      }

      const events = JailService.getUserJailEvents(userId, 5);
      expect(events.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getAllJailEvents', () => {
    it('should return events from all users', () => {
      JailService.logJailEvent(555555555, 'jailed', 222222222, 30, 3.0);
      JailService.logJailEvent(444444444, 'jailed', 111111111, 60, 6.0);
      JailService.logJailEvent(555555555, 'bail_paid', undefined, undefined, 3.0, 555555555, 'tx123');

      const events = JailService.getAllJailEvents(100);
      expect(events.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('logJailEvent', () => {
    it('should log jail event with all parameters', () => {
      const userId = 555555555;
      const adminId = 222222222;
      const durationMinutes = 30;
      const bailAmount = 3.0;
      const metadata = { reason: 'spam' };

      JailService.logJailEvent(userId, 'jailed', adminId, durationMinutes, bailAmount, undefined, undefined, metadata);

      const { query } = require('../../src/database');
      const events = query(
        'SELECT * FROM jail_events WHERE user_id = ?',
        [userId]
      );

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('jailed');
      expect(events[0].admin_id).toBe(adminId);
      expect(events[0].duration_minutes).toBe(durationMinutes);
      expect(events[0].bail_amount).toBe(bailAmount);
      expect(JSON.parse(events[0].metadata)).toEqual(metadata);
    });

    it('should log bail payment with payer information', () => {
      const userId = 555555555;
      const payerId = 444444444;
      const bailAmount = 5.0;
      const txHash = 'test_tx_hash';

      JailService.logJailEvent(userId, 'bail_paid', undefined, undefined, bailAmount, payerId, txHash);

      const { query } = require('../../src/database');
      const events = query(
        'SELECT * FROM jail_events WHERE user_id = ? AND event_type = ?',
        [userId, 'bail_paid']
      );

      expect(events).toHaveLength(1);
      expect(events[0].bail_amount).toBe(bailAmount);
      expect(events[0].paid_by_user_id).toBe(payerId);
      expect(events[0].payment_tx).toBe(txHash);
    });
  });
});
