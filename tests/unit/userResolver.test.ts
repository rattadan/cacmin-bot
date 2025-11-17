/**
 * Unit Tests for User Resolver Utilities
 *
 * Tests cover:
 * - src/utils/userResolver.ts - User resolution functions
 *   - resolveUserId() - Basic user ID resolution
 *   - resolveUser() - Full user object resolution
 *   - resolveUserFromContext() - Context-based resolution with error handling
 *   - formatUserDisplay() - User display formatting
 *   - formatUserIdDisplay() - User ID display formatting
 */

import { Context } from 'telegraf';
import {
  resolveUserId,
  resolveUser,
  resolveUserFromContext,
  formatUserDisplay,
  formatUserIdDisplay,
} from '../../src/utils/userResolver';
import {
  createMockContext,
  getReplyText,
  wasTextReplied,
} from '../helpers/mockContext';
import {
  initTestDatabase,
  cleanTestDatabase,
  closeTestDatabase,
  createTestUser,
} from '../helpers/testDatabase';
import { User } from '../../src/types';

describe('User Resolver Utilities', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('resolveUserId', () => {
    it('should resolve numeric user ID', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser' });
      const result = resolveUserId('123456');
      expect(result).toBe(123456);
    });

    it('should resolve @username to user ID', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser' });
      const result = resolveUserId('@testuser');
      expect(result).toBe(123456);
    });

    it('should resolve username without @ to user ID', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser' });
      const result = resolveUserId('testuser');
      expect(result).toBe(123456);
    });

    it('should be case-insensitive for usernames', () => {
      const userId = createTestUser({ id: 123456, username: 'TestUser' });
      const result = resolveUserId('testuser');
      expect(result).toBe(123456);
    });

    it('should return null for non-existent user', () => {
      const result = resolveUserId('@nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for non-existent numeric ID', () => {
      const result = resolveUserId('999999');
      expect(result).toBeNull();
    });
  });

  describe('resolveUser', () => {
    it('should resolve numeric ID to full User object', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser', role: 'pleb' });
      const result = resolveUser('123456');
      expect(result).toBeDefined();
      expect(result?.id).toBe(123456);
      expect(result?.username).toBe('testuser');
      expect(result?.role).toBe('pleb');
    });

    it('should resolve @username to full User object', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser', role: 'admin' });
      const result = resolveUser('@testuser');
      expect(result).toBeDefined();
      expect(result?.id).toBe(123456);
      expect(result?.role).toBe('admin');
    });

    it('should return null for non-existent user', () => {
      const result = resolveUser('@ghost');
      expect(result).toBeNull();
    });
  });

  describe('resolveUserFromContext', () => {
    it('should resolve user from command argument (@username)', async () => {
      const userId = createTestUser({ id: 123456, username: 'target' });
      const ctx = createMockContext({
        text: '/ban @target',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeDefined();
      expect(result?.userId).toBe(123456);
      expect(result?.username).toBe('target');
      expect(result?.user).toBeDefined();
    });

    it('should resolve user from numeric ID argument', async () => {
      const userId = createTestUser({ id: 123456, username: 'target' });
      const ctx = createMockContext({
        text: '/ban 123456',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeDefined();
      expect(result?.userId).toBe(123456);
      expect(result?.username).toBe('target');
    });

    it('should resolve user from reply-to-message', async () => {
      const userId = createTestUser({ id: 123456, username: 'target' });
      const ctx = createMockContext({
        text: '/ban',
        userId: 999,
        replyToUserId: 123456,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeDefined();
      expect(result?.userId).toBe(123456);
    });

    it('should return null and send error for missing user identifier', async () => {
      const ctx = createMockContext({
        text: '/ban',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeNull();
      expect(wasTextReplied(ctx)).toBe(true);
      const replyText = getReplyText(ctx);
      expect(replyText).toContain('No user specified');
    });

    it('should return null and send error for non-existent username', async () => {
      const ctx = createMockContext({
        text: '/ban @ghost',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeNull();
      expect(wasTextReplied(ctx)).toBe(true);
      const replyText = getReplyText(ctx);
      expect(replyText).toContain('not found in database');
    });

    it('should return null and send error for non-existent numeric ID', async () => {
      const ctx = createMockContext({
        text: '/ban 999999',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx);
      expect(result).toBeNull();
      expect(wasTextReplied(ctx)).toBe(true);
      const replyText = getReplyText(ctx);
      expect(replyText).toContain('not found in database');
    });

    it('should support custom argIndex parameter', async () => {
      const userId = createTestUser({ id: 123456, username: 'target' });
      const ctx = createMockContext({
        text: '/sharedsend myaccount @target 50',
        userId: 999,
      });

      // argIndex 1 because arg 0 is account name, arg 1 is username
      const result = await resolveUserFromContext(ctx, 1);
      expect(result).toBeDefined();
      expect(result?.userId).toBe(123456);
    });

    it('should not send error message when sendError is false', async () => {
      const ctx = createMockContext({
        text: '/ban @ghost',
        userId: 999,
      });

      const result = await resolveUserFromContext(ctx, 0, false);
      expect(result).toBeNull();
      expect(wasTextReplied(ctx)).toBe(false);
    });
  });

  describe('formatUserDisplay', () => {
    it('should format user with username', () => {
      const user: User = {
        id: 123456,
        username: 'testuser',
        role: 'pleb',
        balance: 0,
        muted_until: null,
        blacklisted: 0,
        warning_count: 0,
        created_at: 0,
        updated_at: 0,
      };

      const result = formatUserDisplay(user);
      expect(result).toBe('@testuser (123456)');
    });
  });

  describe('formatUserIdDisplay', () => {
    it('should format user ID with username lookup', () => {
      const userId = createTestUser({ id: 123456, username: 'testuser' });
      const result = formatUserIdDisplay(123456);
      expect(result).toBe('@testuser (123456)');
    });

    it('should format user ID without username if not found', () => {
      const result = formatUserIdDisplay(999999);
      expect(result).toBe('(999999)');
    });
  });
});
