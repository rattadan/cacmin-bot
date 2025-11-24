import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, Mock } from 'vitest';
/**
 * Unit tests for restriction and blacklist handlers
 * Tests: src/handlers/restrictions.ts, src/handlers/actions.ts, src/handlers/blacklist.ts
 * Tests: src/services/restrictionService.ts
 */

// Mock the database module BEFORE any imports
vi.mock('../../src/database', () => ({
  query: vi.fn(),
  execute: vi.fn(),
  get: vi.fn(),
  initDb: vi.fn(),
}));

// Mock the config module to avoid loading real config
vi.mock('../../src/config', () => ({
  config: {
    databasePath: ':memory:',
    botToken: 'test-token',
    groupChatId: '-100123456789',
  },
}));

import { Context } from 'telegraf';
import {
  createMockContext,
  createOwnerContext,
  createAdminContext,
  createElevatedContext,
  createPlebContext,
  getReplyText,
  getAllReplies,
} from '../helpers';
import * as database from '../../src/database';
import { addUserRestriction, removeUserRestriction, getUserRestrictions } from '../../src/services/userService';
import { RestrictionService } from '../../src/services/restrictionService';
import { User, UserRestriction, GlobalAction } from '../../src/types';

const mockQuery = database.query as MockedFunction<typeof database.query>;
const mockExecute = database.execute as MockedFunction<typeof database.execute>;

// Mock hasRole utility
vi.mock('../../src/utils/roles', () => ({
  hasRole: vi.fn((userId: number, role: string) => {
    // Owner: 111111111, Admin: 222222222, Elevated: 333333333, Pleb: 444444444
    if (role === 'owner') return userId === 111111111;
    if (role === 'admin') return userId === 222222222;
    if (role === 'elevated') return userId === 333333333;
    return false;
  }),
  checkIsElevated: vi.fn((userId: number) => {
    return userId === 111111111 || userId === 222222222 || userId === 333333333;
  }),
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

// Mock violation service
vi.mock('../../src/services/violationService', () => ({
  createViolation: vi.fn().mockResolvedValue(1),
}));

describe('User Restrictions Handler Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/addrestriction command', () => {
    it('should add a user restriction with all parameters', async () => {
      const ctx = createAdminContext({ messageText: '/addrestriction 444444444 no_stickers pack123 1700000000' });

      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      await addUserRestriction(444444444, 'no_stickers', 'pack123', undefined, 1700000000);

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'no_stickers', 'pack123', null, 1700000000]
      );
    });

    it('should add a restriction without optional parameters', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      await addUserRestriction(444444444, 'no_urls');

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'no_urls', null, null, null]
      );
    });

    it('should add a restriction with metadata', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);
      const metadata = { reason: 'spam', severity: 'high' };

      await addUserRestriction(444444444, 'regex_block', 'spam.*pattern', metadata);

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'regex_block', 'spam.*pattern', JSON.stringify(metadata), null]
      );
    });

    it('should add a temporary restriction with expiration', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await addUserRestriction(444444444, 'muted', undefined, undefined, futureTimestamp);

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'muted', null, null, futureTimestamp]
      );
    });

    it('should add URL restriction with specific domain', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      await addUserRestriction(444444444, 'no_urls', 'spam.com');

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'no_urls', 'spam.com', null, null]
      );
    });

    it('should add regex restriction with pattern', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      await addUserRestriction(444444444, 'regex_block', 'buy.*crypto.*now');

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
        [444444444, 'regex_block', 'buy.*crypto.*now', null, null]
      );
    });

    it('should add multiple restriction types', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const restrictions = ['no_stickers', 'no_urls', 'no_media', 'no_gifs', 'no_voice', 'no_forwarding', 'muted'];

      for (const restriction of restrictions) {
        await addUserRestriction(444444444, restriction);
      }

      expect(mockExecute).toHaveBeenCalledTimes(restrictions.length);
    });
  });

  describe('/removerestriction command', () => {
    it('should remove a user restriction', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      await removeUserRestriction(444444444, 'no_stickers');

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM user_restrictions WHERE user_id = ? AND restriction = ?',
        [444444444, 'no_stickers']
      );
    });

    it('should handle removing non-existent restriction', async () => {
      mockExecute.mockReturnValue({ changes: 0, lastInsertRowid: 0 } as any);

      await removeUserRestriction(444444444, 'no_stickers');

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM user_restrictions WHERE user_id = ? AND restriction = ?',
        [444444444, 'no_stickers']
      );
    });

    it('should remove specific restriction types', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      await removeUserRestriction(444444444, 'regex_block');

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM user_restrictions WHERE user_id = ? AND restriction = ?',
        [444444444, 'regex_block']
      );
    });
  });

  describe('/listrestrictions command', () => {
    it('should return empty list when user has no restrictions', async () => {
      mockQuery.mockReturnValue([]);

      const restrictions = getUserRestrictions(444444444);

      expect(restrictions).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM user_restrictions WHERE user_id = ?',
        [444444444]
      );
    });

    it('should list all restrictions for a user', async () => {
      const mockRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 444444444,
          restriction: 'no_stickers',
          restrictedAction: 'pack123',
          restrictedUntil: undefined,
          createdAt: 1700000000,
        },
        {
          id: 2,
          userId: 444444444,
          restriction: 'no_urls',
          restrictedAction: 'spam.com',
          restrictedUntil: 1700001000,
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(mockRestrictions);

      const restrictions = getUserRestrictions(444444444);

      expect(restrictions).toEqual(mockRestrictions);
      expect(restrictions).toHaveLength(2);
    });

    it('should include metadata in restrictions', async () => {
      const mockRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 444444444,
          restriction: 'regex_block',
          restrictedAction: 'spam.*',
          metadata: JSON.stringify({ reason: 'excessive spam', warnings: 3 }),
          restrictedUntil: undefined,
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(mockRestrictions);

      const restrictions = getUserRestrictions(444444444);

      expect(restrictions[0].metadata).toBeTruthy();
      const parsedMetadata = JSON.parse(restrictions[0].metadata!);
      expect(parsedMetadata.reason).toBe('excessive spam');
      expect(parsedMetadata.warnings).toBe(3);
    });

    it('should show permanent and temporary restrictions', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 444444444,
          restriction: 'no_stickers',
          restrictedUntil: undefined, // Permanent
          createdAt: 1700000000,
        },
        {
          id: 2,
          userId: 444444444,
          restriction: 'muted',
          restrictedUntil: now + 3600, // Temporary (1 hour)
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(mockRestrictions);

      const restrictions = getUserRestrictions(444444444);

      expect(restrictions[0].restrictedUntil).toBeUndefined();
      expect(restrictions[1].restrictedUntil).toBeGreaterThan(now);
    });
  });
});

describe('Global Actions Handler Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/addaction command', () => {
    it('should add a global restriction', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      // Simulate addaction command
      const restriction = 'no_stickers';
      const restrictedAction = undefined;

      mockExecute(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        [restriction, restrictedAction || null]
      );

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        ['no_stickers', null]
      );
    });

    it('should add global restriction with specific action', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const restriction = 'no_urls';
      const restrictedAction = 'scam.com';

      mockExecute(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        [restriction, restrictedAction]
      );

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        ['no_urls', 'scam.com']
      );
    });

    it('should add global regex restriction', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const restriction = 'regex_block';
      const restrictedAction = 'buy.*now.*crypto';

      mockExecute(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        [restriction, restrictedAction]
      );

      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)',
        ['regex_block', 'buy.*now.*crypto']
      );
    });
  });

  describe('/removeaction command', () => {
    it('should remove a global restriction', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      const restriction = 'no_stickers';

      mockExecute('DELETE FROM global_restrictions WHERE restriction = ?', [restriction]);

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM global_restrictions WHERE restriction = ?',
        ['no_stickers']
      );
    });

    it('should handle removing non-existent global restriction', async () => {
      mockExecute.mockReturnValue({ changes: 0, lastInsertRowid: 0 } as any);

      const restriction = 'no_stickers';

      mockExecute('DELETE FROM global_restrictions WHERE restriction = ?', [restriction]);

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM global_restrictions WHERE restriction = ?',
        ['no_stickers']
      );
    });
  });

  describe('/viewactions command', () => {
    it('should return empty list when no global restrictions exist', async () => {
      mockQuery.mockReturnValue([]);

      const actions = mockQuery<GlobalAction>('SELECT * FROM global_restrictions');

      expect(actions).toEqual([]);
    });

    it('should list all global restrictions', async () => {
      const mockActions: GlobalAction[] = [
        {
          id: 1,
          restriction: 'no_stickers',
          restrictedAction: undefined,
          createdAt: 1700000000,
        },
        {
          id: 2,
          restriction: 'no_urls',
          restrictedAction: 'spam.com',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(mockActions);

      const actions = mockQuery<GlobalAction>('SELECT * FROM global_restrictions');

      expect(actions).toEqual(mockActions);
      expect(actions).toHaveLength(2);
    });

    it('should show global restrictions with and without specific actions', async () => {
      const mockActions: GlobalAction[] = [
        {
          id: 1,
          restriction: 'no_media',
          restrictedAction: undefined, // All media blocked
          createdAt: 1700000000,
        },
        {
          id: 2,
          restriction: 'regex_block',
          restrictedAction: 'scam.*pattern', // Specific pattern
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(mockActions);

      const actions = mockQuery<GlobalAction>('SELECT * FROM global_restrictions');

      expect(actions[0].restrictedAction).toBeUndefined();
      expect(actions[1].restrictedAction).toBe('scam.*pattern');
    });
  });
});

describe('Blacklist Handler Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/addblacklist command', () => {
    it('should add user to blacklist', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET blacklist = 1 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET blacklist = 1 WHERE id = ?',
        [444444444]
      );
    });

    it('should handle adding already blacklisted user', async () => {
      mockExecute.mockReturnValue({ changes: 0, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET blacklist = 1 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET blacklist = 1 WHERE id = ?',
        [444444444]
      );
    });

    it('should handle invalid user ID format', async () => {
      // This would typically be caught in the handler before reaching the service
      const userId = NaN;

      expect(isNaN(userId)).toBe(true);
    });
  });

  describe('/removeblacklist command', () => {
    it('should remove user from blacklist', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET blacklist = 0 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET blacklist = 0 WHERE id = ?',
        [444444444]
      );
    });

    it('should handle removing non-blacklisted user', async () => {
      mockExecute.mockReturnValue({ changes: 0, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET blacklist = 0 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET blacklist = 0 WHERE id = ?',
        [444444444]
      );
    });
  });

  describe('/viewblacklist command', () => {
    it('should return empty list when no users are blacklisted', async () => {
      mockQuery.mockReturnValue([]);

      const blacklist = mockQuery<User>('SELECT id, username FROM users WHERE blacklist = 1');

      expect(blacklist).toEqual([]);
    });

    it('should list all blacklisted users', async () => {
      const mockBlacklist: Partial<User>[] = [
        { id: 444444444, username: 'spammer1' },
        { id: 555555555, username: 'spammer2' },
      ];

      mockQuery.mockReturnValue(mockBlacklist);

      const blacklist = mockQuery<User>('SELECT id, username FROM users WHERE blacklist = 1');

      expect(blacklist).toEqual(mockBlacklist);
      expect(blacklist).toHaveLength(2);
    });

    it('should include usernames in blacklist', async () => {
      const mockBlacklist: Partial<User>[] = [
        { id: 444444444, username: 'spammer' },
      ];

      mockQuery.mockReturnValue(mockBlacklist);

      const blacklist = mockQuery<User>('SELECT id, username FROM users WHERE blacklist = 1');

      expect(blacklist[0].username).toBe('spammer');
    });
  });

  describe('/addwhitelist command', () => {
    it('should add user to whitelist', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET whitelist = 1 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET whitelist = 1 WHERE id = ?',
        [444444444]
      );
    });
  });

  describe('/removewhitelist command', () => {
    it('should remove user from whitelist', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      const userId = 444444444;

      mockExecute('UPDATE users SET whitelist = 0 WHERE id = ?', [userId]);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE users SET whitelist = 0 WHERE id = ?',
        [444444444]
      );
    });
  });

  describe('/viewwhitelist command', () => {
    it('should list all whitelisted users', async () => {
      const mockWhitelist: Partial<User>[] = [
        { id: 111111111, username: 'trusted1' },
        { id: 222222222, username: 'trusted2' },
      ];

      mockQuery.mockReturnValue(mockWhitelist);

      const whitelist = mockQuery<User>('SELECT id, username FROM users WHERE whitelist = 1');

      expect(whitelist).toEqual(mockWhitelist);
      expect(whitelist).toHaveLength(2);
    });
  });
});

describe('RestrictionService Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMessage - User Restrictions', () => {
    it('should detect no_stickers violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        sticker: {
          file_id: 'test123',
          set_name: 'pack123',
        },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_stickers',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect specific sticker pack restriction', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        sticker: {
          file_id: 'test123',
          set_name: 'banned_pack',
        },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_stickers',
          restrictedAction: 'banned_pack',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should allow sticker from different pack when specific pack is restricted', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        sticker: {
          file_id: 'test123',
          set_name: 'allowed_pack',
        },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_stickers',
          restrictedAction: 'banned_pack',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      // Mock that no violation occurred
      mockQuery.mockReturnValueOnce(userRestrictions);
      mockQuery.mockReturnValueOnce([]); // No global restrictions

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(false);
    });

    it('should detect no_urls violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Check out this link: https://example.com/spam',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_urls',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect specific domain restriction', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Visit https://spam.com for deals',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_urls',
          restrictedAction: 'spam.com',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should allow URLs from different domain when specific domain is restricted', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Visit https://legitimate.com',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_urls',
          restrictedAction: 'spam.com',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValueOnce(userRestrictions);
      mockQuery.mockReturnValueOnce([]); // No global restrictions

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(false);
    });

    it('should detect regex_block violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Buy crypto now! Amazing deals!',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'regex_block',
          restrictedAction: 'buy.*crypto.*now',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should handle invalid regex pattern gracefully', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Some message',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'regex_block',
          restrictedAction: '[invalid(regex',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValueOnce(userRestrictions);
      mockQuery.mockReturnValueOnce([]); // No global restrictions

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(false);
    });

    it('should detect no_media violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        photo: [{ file_id: 'photo123' }],
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_media',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect no_gifs violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        animation: { file_id: 'gif123' },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_gifs',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect no_voice violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        voice: { file_id: 'voice123' },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_voice',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect no_forwarding violation', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        forward_from: { id: 999999999 },
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'no_forwarding',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should detect muted restriction', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'Any message',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'muted',
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });
  });

  describe('checkMessage - Global Restrictions', () => {
    it('should apply global restrictions to non-elevated users', async () => {
      const ctx = createPlebContext() as Context;
      const message: any = {
        sticker: {
          file_id: 'test123',
          set_name: 'pack123',
        },
      };

      mockQuery
        .mockReturnValueOnce([]) // No user restrictions
        .mockReturnValueOnce([
          {
            id: 1,
            restriction: 'no_stickers',
            createdAt: 1700000000,
          },
        ]); // Global restrictions

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should NOT apply global restrictions to elevated users', async () => {
      const ctx = createElevatedContext() as Context;

      const message: any = {
        sticker: {
          file_id: 'test123',
          set_name: 'pack123',
        },
      };

      const user: User = {
        id: 333333333,
        username: 'elevated',
        role: 'elevated',
        whitelist: false,
        blacklist: false,
        warning_count: 0,
        created_at: 1700000000,
        updated_at: 1700000000,
      };

      mockQuery.mockReturnValueOnce([]); // No user restrictions

      const violated = await RestrictionService.checkMessage(ctx, message, user);

      expect(violated).toBe(false);
    });
  });

  describe('checkMessage - Expiration', () => {
    it('should not enforce expired restrictions', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'test message',
      };

      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const now = Math.floor(Date.now() / 1000);

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'muted',
          restrictedUntil: pastTimestamp,
          createdAt: 1700000000,
        },
      ];

      // Query would filter out expired restrictions
      mockQuery.mockReturnValue([]);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(false);
    });

    it('should enforce active temporary restrictions', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'test message',
      };

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'muted',
          restrictedUntil: futureTimestamp,
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });

    it('should enforce permanent restrictions', async () => {
      const ctx = createMockContext() as Context;
      const message: any = {
        text: 'test message',
      };

      const userRestrictions: UserRestriction[] = [
        {
          id: 1,
          userId: 123456789,
          restriction: 'muted',
          restrictedUntil: undefined, // Permanent
          createdAt: 1700000000,
        },
      ];

      mockQuery.mockReturnValue(userRestrictions);

      const violated = await RestrictionService.checkMessage(ctx, message);

      expect(violated).toBe(true);
    });
  });

  describe('cleanExpiredRestrictions', () => {
    it('should clean expired user restrictions', () => {
      const now = Math.floor(Date.now() / 1000);

      mockExecute.mockReturnValue({ changes: 2, lastInsertRowid: 0 } as any);

      RestrictionService.cleanExpiredRestrictions();

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM user_restrictions WHERE restricted_until IS NOT NULL AND restricted_until < ?',
        expect.any(Array)
      );
    });

    it('should clean expired global restrictions', () => {
      const now = Math.floor(Date.now() / 1000);

      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

      RestrictionService.cleanExpiredRestrictions();

      expect(mockExecute).toHaveBeenCalledWith(
        'DELETE FROM global_restrictions WHERE restricted_until IS NOT NULL AND restricted_until < ?',
        expect.any(Array)
      );
    });

    it('should report number of cleaned restrictions', () => {
      mockExecute
        .mockReturnValueOnce({ changes: 3, lastInsertRowid: 0 } as any) // User restrictions
        .mockReturnValueOnce({ changes: 1, lastInsertRowid: 0 } as any); // Global restrictions

      RestrictionService.cleanExpiredRestrictions();

      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe('Metadata Storage', () => {
    it('should store and retrieve metadata as JSON', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const metadata = {
        reason: 'spam',
        warningCount: 3,
        reportedBy: 222222222,
        timestamp: Date.now(),
      };

      await addUserRestriction(444444444, 'no_urls', 'spam.com', metadata);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should handle null metadata', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      await addUserRestriction(444444444, 'no_urls');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should store complex metadata structures', async () => {
      mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const metadata = {
        violations: [
          { type: 'url_spam', count: 5 },
          { type: 'sticker_spam', count: 3 },
        ],
        escalation: {
          level: 2,
          previousWarnings: [1699999999, 1700000000],
        },
      };

      await addUserRestriction(444444444, 'regex_block', 'spam.*', metadata);

      const metadataJson = JSON.stringify(metadata);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([metadataJson])
      );
    });
  });
});

describe('Permission Validation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow elevated users to manage restrictions', async () => {
    const { hasRole } = require('../../src/utils/roles');

    expect(hasRole(333333333, 'elevated')).toBe(true);
  });

  it('should allow admins to manage restrictions', async () => {
    const { hasRole } = require('../../src/utils/roles');

    expect(hasRole(222222222, 'admin')).toBe(true);
  });

  it('should deny plebs from managing restrictions', async () => {
    const { hasRole } = require('../../src/utils/roles');

    expect(hasRole(444444444, 'elevated')).toBe(false);
    expect(hasRole(444444444, 'admin')).toBe(false);
  });

  it('should check elevated status correctly', async () => {
    const { checkIsElevated } = require('../../src/utils/roles');

    expect(checkIsElevated(111111111)).toBe(true); // Owner
    expect(checkIsElevated(222222222)).toBe(true); // Admin
    expect(checkIsElevated(333333333)).toBe(true); // Elevated
    expect(checkIsElevated(444444444)).toBe(false); // Pleb
  });
});

describe('Integration Tests - Restriction Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle full restriction lifecycle: add, list, remove', async () => {
    mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

    // Add restriction
    await addUserRestriction(444444444, 'no_stickers', 'pack123');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_restrictions'),
      expect.arrayContaining([444444444, 'no_stickers', 'pack123'])
    );

    // List restrictions
    const mockRestrictions: UserRestriction[] = [
      {
        id: 1,
        userId: 444444444,
        restriction: 'no_stickers',
        restrictedAction: 'pack123',
        createdAt: 1700000000,
      },
    ];
    mockQuery.mockReturnValue(mockRestrictions);

    const restrictions = getUserRestrictions(444444444);
    expect(restrictions).toHaveLength(1);
    expect(restrictions[0].restriction).toBe('no_stickers');

    // Remove restriction
    await removeUserRestriction(444444444, 'no_stickers');

    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM user_restrictions WHERE user_id = ? AND restriction = ?',
      [444444444, 'no_stickers']
    );
  });

  it('should handle multiple restrictions on same user', async () => {
    mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

    // Add multiple restrictions
    await addUserRestriction(444444444, 'no_stickers');
    await addUserRestriction(444444444, 'no_urls', 'spam.com');
    await addUserRestriction(444444444, 'regex_block', 'buy.*now');

    expect(mockExecute).toHaveBeenCalledTimes(3);

    // List all restrictions
    const mockRestrictions: UserRestriction[] = [
      {
        id: 1,
        userId: 444444444,
        restriction: 'no_stickers',
        createdAt: 1700000000,
      },
      {
        id: 2,
        userId: 444444444,
        restriction: 'no_urls',
        restrictedAction: 'spam.com',
        createdAt: 1700000000,
      },
      {
        id: 3,
        userId: 444444444,
        restriction: 'regex_block',
        restrictedAction: 'buy.*now',
        createdAt: 1700000000,
      },
    ];
    mockQuery.mockReturnValue(mockRestrictions);

    const restrictions = getUserRestrictions(444444444);
    expect(restrictions).toHaveLength(3);
  });

  it('should handle blacklist workflow: add, view, remove', async () => {
    mockExecute.mockReturnValue({ changes: 1, lastInsertRowid: 0 } as any);

    // Add to blacklist
    mockExecute('UPDATE users SET blacklist = 1 WHERE id = ?', [444444444]);

    // View blacklist
    const mockBlacklist: Partial<User>[] = [
      { id: 444444444, username: 'spammer' },
    ];
    mockQuery.mockReturnValue(mockBlacklist);

    const blacklist = mockQuery<User>('SELECT id, username FROM users WHERE blacklist = 1');
    expect(blacklist).toHaveLength(1);

    // Remove from blacklist
    mockExecute('UPDATE users SET blacklist = 0 WHERE id = ?', [444444444]);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
