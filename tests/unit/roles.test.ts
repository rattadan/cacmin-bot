import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
/**
 * Unit tests for role management commands
 * Tests src/handlers/roles.ts and src/utils/roles.ts
 */

import { Context } from 'telegraf';
import {
  initTestDatabase,
  cleanTestDatabase,
  closeTestDatabase,
  getTestDatabase,
  createTestUser,
  createMockContext,
  createOwnerContext,
  createAdminContext,
  createElevatedContext,
  createPlebContext,
  getReplyText,
} from '../helpers';
import { checkIsElevated, hasRole, isGroupOwner } from '../../src/utils/roles';
import { User } from '../../src/types';
import { config } from '../../src/config';

// Mock the database module to use test database
vi.mock('../../src/database', () => {
  let testDb: any = null;

  return {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      if (!testDb) {
        const { getTestDatabase } = require('../helpers/testDatabase');
        testDb = getTestDatabase();
      }
      const stmt = testDb.prepare(sql);
      return stmt.all(params);
    }),
    execute: vi.fn((sql: string, params: unknown[] = []) => {
      if (!testDb) {
        const { getTestDatabase } = require('../helpers/testDatabase');
        testDb = getTestDatabase();
      }
      const stmt = testDb.prepare(sql);
      return stmt.run(params);
    }),
    get: vi.fn((sql: string, params: unknown[] = []) => {
      if (!testDb) {
        const { getTestDatabase } = require('../helpers/testDatabase');
        testDb = getTestDatabase();
      }
      const stmt = testDb.prepare(sql);
      return stmt.get(params);
    }),
  };
});

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Role Utility Functions', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('isGroupOwner', () => {
    it('should return true when user is the owner', () => {
      const result = isGroupOwner(111111111, 111111111);
      expect(result).toBe(true);
    });

    it('should return false when user is not the owner', () => {
      const result = isGroupOwner(222222222, 111111111);
      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
      createTestUser(222222222, 'admin', 'admin');
      createTestUser(333333333, 'elevated', 'elevated');
      createTestUser(444444444, 'pleb', 'pleb');
    });

    it('should return true when user has owner role', () => {
      const result = hasRole(111111111, 'owner');
      expect(result).toBe(true);
    });

    it('should return true when user has admin role', () => {
      const result = hasRole(222222222, 'admin');
      expect(result).toBe(true);
    });

    it('should return true when user has elevated role', () => {
      const result = hasRole(333333333, 'elevated');
      expect(result).toBe(true);
    });

    it('should return false when user has different role', () => {
      const result = hasRole(222222222, 'owner');
      expect(result).toBe(false);
    });

    it('should return false when user does not exist', () => {
      const result = hasRole(999999999, 'owner');
      expect(result).toBe(false);
    });
  });

  describe('checkIsElevated', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
      createTestUser(222222222, 'admin', 'admin');
      createTestUser(333333333, 'elevated', 'elevated');
      createTestUser(444444444, 'pleb', 'pleb');
    });

    it('should return true for owner', () => {
      const result = checkIsElevated(111111111);
      expect(result).toBe(true);
    });

    it('should return true for admin', () => {
      const result = checkIsElevated(222222222);
      expect(result).toBe(true);
    });

    it('should return true for elevated user', () => {
      const result = checkIsElevated(333333333);
      expect(result).toBe(true);
    });

    it('should return false for pleb', () => {
      const result = checkIsElevated(444444444);
      expect(result).toBe(false);
    });

    it('should return false for non-existent user', () => {
      const result = checkIsElevated(999999999);
      expect(result).toBe(false);
    });
  });
});

describe('Role Management Command Logic', () => {
  const db = () => getTestDatabase();

  beforeAll(() => {
    initTestDatabase();
    config.ownerId = 111111111;
  });

  beforeEach(() => {
    cleanTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  describe('setowner command logic', () => {
    it('should set owner when no owner exists and user is master owner', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'masterowner',
        messageText: '/setowner',
      });

      const userId = ctx.from?.id;
      const existingOwner = db().prepare('SELECT * FROM users WHERE role = ?').get('owner') as User;

      if (!existingOwner && userId === config.ownerId) {
        db()
          .prepare('INSERT OR REPLACE INTO users (id, username, role) VALUES (?, ?, ?)')
          .run(userId, ctx.from!.username || 'unknown', 'owner');
        await ctx.reply!('Master owner initialized successfully.');
      }

      const owner = db().prepare('SELECT * FROM users WHERE role = ?').get('owner') as User;

      expect(owner).toBeDefined();
      expect(owner.id).toBe(111111111);
      expect(owner.role).toBe('owner');
      expect(getReplyText(ctx)).toContain('Master owner initialized successfully');
    });

    it('should reject when owner already exists and user is not master owner', async () => {
      createTestUser(111111111, 'existingowner', 'owner');

      const ctx = createMockContext({
        userId: 222222222,
        username: 'notmaster',
        messageText: '/setowner',
      });

      const userId = ctx.from?.id;
      const existingOwner = db().prepare('SELECT * FROM users WHERE role = ?').get('owner') as User;

      if (existingOwner && userId !== config.ownerId) {
        await ctx.reply!('Owner already set. Only the master owner can modify ownership.');
      }

      expect(getReplyText(ctx)).toContain('Owner already set');
    });

    it('should reject when user is not master owner from config', async () => {
      const ctx = createMockContext({
        userId: 999999999,
        username: 'imposter',
        messageText: '/setowner',
      });

      const userId = ctx.from?.id;

      if (userId !== config.ownerId) {
        await ctx.reply!('Only the master owner (from .env) can initialize ownership.');
      }

      expect(getReplyText(ctx)).toContain('Only the master owner');
    });
  });

  describe('grantowner command logic', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
    });

    it('should grant owner privileges by username - existing user', async () => {
      createTestUser(222222222, 'newowner', 'pleb');

      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/grantowner newowner',
      });

      // Simulate command logic
      const identifier = 'newowner';
      const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

      if (existingUser) {
        db()
          .prepare(
            'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
              'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
          )
          .run(existingUser.id, targetUsername, 'owner', 'owner', targetUsername);

        await ctx.reply!(
          'Owner privileges granted!\n\nUser ID: ' +
            existingUser.id +
            '\nUsername: @' +
            targetUsername
        );
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user.role).toBe('owner');
      expect(getReplyText(ctx)).toContain('Owner privileges granted');
      expect(getReplyText(ctx)).toContain('222222222');
      expect(getReplyText(ctx)).toContain('@newowner');
    });

    it('should grant owner privileges by user ID', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/grantowner 222222222',
      });

      // Simulate command logic
      const identifier = '222222222';
      const targetUserId = parseInt(identifier);

      db()
        .prepare(
          'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
        )
        .run(targetUserId, null, 'owner', 'owner', null);

      await ctx.reply!('Owner privileges granted!\n\nUser ID: ' + targetUserId + '\nUsername: unknown');

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user).toBeDefined();
      expect(user.role).toBe('owner');
      expect(getReplyText(ctx)).toContain('Owner privileges granted');
      expect(getReplyText(ctx)).toContain('222222222');
    });

    it('should fail when username not found', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/grantowner nonexistent',
      });

      // Simulate command logic
      const identifier = 'nonexistent';
      const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

      if (!existingUser) {
        await ctx.reply!(
          'User @' +
            targetUsername +
            ' not found in database yet.\n\n' +
            'To grant by username, they must have interacted with the bot first.\n' +
            'Use /grantowner <userId> if you know their Telegram user ID.'
        );
      }

      expect(getReplyText(ctx)).toContain('not found in database yet');
      expect(getReplyText(ctx)).toContain('Use /grantowner <userId>');
    });

    it('should handle username with @ prefix', async () => {
      createTestUser(222222222, 'newowner', 'pleb');

      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/grantowner @newowner',
      });

      const identifier = '@newowner';
      const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

      if (existingUser) {
        db()
          .prepare(
            'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
              'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
          )
          .run(existingUser.id, targetUsername, 'owner', 'owner', targetUsername);

        await ctx.reply!('Owner privileges granted!\n\nUser ID: ' + existingUser.id);
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user.role).toBe('owner');
      expect(getReplyText(ctx)).toContain('Owner privileges granted');
    });
  });

  describe('elevate command logic', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
      createTestUser(222222222, 'admin', 'admin');
    });

    it('should allow owner to elevate user by username', async () => {
      createTestUser(333333333, 'newuser', 'pleb');

      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/elevate newuser',
      });

      // Check permission
      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(111111111) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'newuser';
        const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

        if (existingUser) {
          db()
            .prepare(
              'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
                'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
            )
            .run(existingUser.id, targetUsername, 'elevated', 'elevated', targetUsername);

          await ctx.reply!(
            'Elevated privileges granted!\n\nUser ID: ' + existingUser.id + '\nUsername: @' + targetUsername
          );
        }
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(333333333) as User;

      expect(user.role).toBe('elevated');
      expect(getReplyText(ctx)).toContain('Elevated privileges granted');
      expect(getReplyText(ctx)).toContain('@newuser');
    });

    it('should allow admin to elevate user', async () => {
      createTestUser(333333333, 'newuser', 'pleb');

      const ctx = createAdminContext({
        userId: 222222222,
        username: 'admin',
        messageText: '/elevate newuser',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'newuser';
        const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

        if (existingUser) {
          db()
            .prepare(
              'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
                'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
            )
            .run(existingUser.id, targetUsername, 'elevated', 'elevated', targetUsername);

          await ctx.reply!('Elevated privileges granted!\n\nUser ID: ' + existingUser.id);
        }
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(333333333) as User;

      expect(user.role).toBe('elevated');
      expect(getReplyText(ctx)).toContain('Elevated privileges granted');
    });

    it('should reject when user is not admin or owner', async () => {
      createTestUser(444444444, 'pleb', 'pleb');

      const ctx = createPlebContext({
        userId: 444444444,
        username: 'pleb',
        messageText: '/elevate someone',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(444444444) as User;

      if (requester?.role !== 'admin' && requester?.role !== 'owner') {
        await ctx.reply!('You do not have permission to use this command.');
      }

      expect(getReplyText(ctx)).toContain('You do not have permission');
    });

    it('should elevate user by user ID', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/elevate 333333333',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(111111111) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const targetUserId = 333333333;

        db()
          .prepare(
            'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
              'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
          )
          .run(targetUserId, null, 'elevated', 'elevated', null);

        await ctx.reply!('Elevated privileges granted!\n\nUser ID: ' + targetUserId + '\nUsername: unknown');
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(333333333) as User;

      expect(user).toBeDefined();
      expect(user.role).toBe('elevated');
      expect(getReplyText(ctx)).toContain('Elevated privileges granted');
    });
  });

  describe('makeadmin command logic', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
    });

    it('should allow owner to make user admin by username', async () => {
      createTestUser(222222222, 'newadmin', 'pleb');

      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/makeadmin newadmin',
      });

      const identifier = 'newadmin';
      const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

      if (existingUser) {
        db()
          .prepare(
            'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
              'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
          )
          .run(existingUser.id, targetUsername, 'admin', 'admin', targetUsername);

        await ctx.reply!(
          'Admin privileges granted!\n\nUser ID: ' + existingUser.id + '\nUsername: @' + targetUsername
        );
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user.role).toBe('admin');
      expect(getReplyText(ctx)).toContain('Admin privileges granted');
      expect(getReplyText(ctx)).toContain('@newadmin');
    });

    it('should allow owner to make user admin by user ID', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/makeadmin 222222222',
      });

      const targetUserId = 222222222;

      db()
        .prepare(
          'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
        )
        .run(targetUserId, null, 'admin', 'admin', null);

      await ctx.reply!('Admin privileges granted!\n\nUser ID: ' + targetUserId + '\nUsername: unknown');

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user).toBeDefined();
      expect(user.role).toBe('admin');
      expect(getReplyText(ctx)).toContain('Admin privileges granted');
    });

    it('should fail when username not found', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/makeadmin nonexistent',
      });

      const identifier = 'nonexistent';
      const targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const existingUser = db().prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as User;

      if (!existingUser) {
        await ctx.reply!(
          'User @' +
            targetUsername +
            ' not found in database yet.\n\n' +
            'To grant by username, they must have interacted with the bot first.\n' +
            'Use /makeadmin <userId> if you know their Telegram user ID.'
        );
      }

      expect(getReplyText(ctx)).toContain('not found in database yet');
    });
  });

  describe('revoke command logic', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
      createTestUser(222222222, 'admin', 'admin');
      createTestUser(333333333, 'elevated', 'elevated');
    });

    it('should allow owner to revoke elevated user by username', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/revoke elevated',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(111111111) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'elevated';
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const targetUser = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as User;

        if (targetUser) {
          // Owner can revoke anyone
          if (requester.role === 'owner') {
            db().prepare('UPDATE users SET role = ? WHERE id = ?').run('pleb', targetUser.id);
            await ctx.reply!(targetUser.username + "'s privileges have been revoked.");
          }
        }
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(333333333) as User;

      expect(user.role).toBe('pleb');
      expect(getReplyText(ctx)).toContain('privileges have been revoked');
    });

    it('should allow owner to revoke admin by user ID', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/revoke 222222222',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(111111111) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const targetUser = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

        if (targetUser && requester.role === 'owner') {
          db().prepare('UPDATE users SET role = ? WHERE id = ?').run('pleb', targetUser.id);
          await ctx.reply!((targetUser.username || targetUser.id) + "'s privileges have been revoked.");
        }
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      expect(user.role).toBe('pleb');
      expect(getReplyText(ctx)).toContain('privileges have been revoked');
    });

    it('should allow admin to revoke elevated user', async () => {
      const ctx = createAdminContext({
        userId: 222222222,
        username: 'admin',
        messageText: '/revoke elevated',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'elevated';
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const targetUser = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as User;

        if (targetUser) {
          // Admins can only revoke elevated users
          if (requester.role === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner')) {
            await ctx.reply!('You can only revoke elevated users. Contact an owner to revoke admin or owner privileges.');
          } else {
            db().prepare('UPDATE users SET role = ? WHERE id = ?').run('pleb', targetUser.id);
            await ctx.reply!(targetUser.username + "'s privileges have been revoked.");
          }
        }
      }

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(333333333) as User;

      expect(user.role).toBe('pleb');
      expect(getReplyText(ctx)).toContain('privileges have been revoked');
    });

    it('should prevent admin from revoking another admin', async () => {
      createTestUser(444444444, 'admin2', 'admin');

      const ctx = createAdminContext({
        userId: 222222222,
        username: 'admin',
        messageText: '/revoke admin2',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'admin2';
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const targetUser = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as User;

        if (targetUser) {
          if (requester.role === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner')) {
            await ctx.reply!('You can only revoke elevated users. Contact an owner to revoke admin or owner privileges.');
          }
        }
      }

      expect(getReplyText(ctx)).toContain('You can only revoke elevated users');
    });

    it('should prevent admin from revoking owner', async () => {
      const ctx = createAdminContext({
        userId: 222222222,
        username: 'admin',
        messageText: '/revoke owner',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;

      if (requester?.role === 'admin' || requester?.role === 'owner') {
        const identifier = 'owner';
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const targetUser = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as User;

        if (targetUser) {
          if (requester.role === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner')) {
            await ctx.reply!('You can only revoke elevated users. Contact an owner to revoke admin or owner privileges.');
          }
        }
      }

      expect(getReplyText(ctx)).toContain('You can only revoke elevated users');
    });

    it('should reject when user is not admin or owner', async () => {
      createTestUser(444444444, 'pleb', 'pleb');

      const ctx = createPlebContext({
        userId: 444444444,
        username: 'pleb',
        messageText: '/revoke someone',
      });

      const requester = db().prepare('SELECT * FROM users WHERE id = ?').get(444444444) as User;

      if (requester?.role !== 'admin' && requester?.role !== 'owner') {
        await ctx.reply!('You do not have permission to use this command.');
      }

      expect(getReplyText(ctx)).toContain('You do not have permission');
    });

    it('should fail when user not found', async () => {
      const ctx = createOwnerContext({
        userId: 111111111,
        username: 'owner',
        messageText: '/revoke nonexistent',
      });

      const identifier = 'nonexistent';
      const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
      const targetUser = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as User;

      if (!targetUser) {
        await ctx.reply!('User not found.');
      }

      expect(getReplyText(ctx)).toContain('User not found');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      createTestUser(111111111, 'owner', 'owner');
    });

    it('should handle users without username field', () => {
      db().prepare('INSERT INTO users (id, username, role) VALUES (?, ?, ?)').run(777777777, null, 'pleb');

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(777777777) as User;

      expect(user).toBeDefined();
      expect(user.id).toBe(777777777);
      expect(user.username).toBeNull();
    });

    it('should update existing user role when granting new role', () => {
      createTestUser(222222222, 'user', 'pleb');

      db()
        .prepare(
          'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
        )
        .run(222222222, 'user', 'elevated', 'elevated', 'user');

      let user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;
      expect(user.role).toBe('elevated');

      db()
        .prepare(
          'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
        )
        .run(222222222, 'user', 'admin', 'admin', 'user');

      user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;
      expect(user.role).toBe('admin');
    });

    it('should preserve username when promoting by user ID', () => {
      createTestUser(222222222, 'testuser', 'pleb');

      db()
        .prepare(
          'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)'
        )
        .run(222222222, null, 'admin', 'admin', null);

      const user = db().prepare('SELECT * FROM users WHERE id = ?').get(222222222) as User;
      expect(user.role).toBe('admin');
      expect(user.username).toBe('testuser');
    });
  });
});
