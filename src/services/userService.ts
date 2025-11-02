/**
 * User management service module.
 * Provides functions for managing user records and user-specific restrictions.
 *
 * @module services/userService
 */

// src/services/userService.ts
import { query, execute } from '../database';
import { User, UserRestriction } from '../types';
import { StructuredLogger } from '../utils/logger';

/**
 * Standardized user creation function.
 * Creates a new user with all required fields. Used internally to ensure
 * consistent user records across the system.
 *
 * @param userId - Telegram user ID (immutable)
 * @param username - Telegram username (can change)
 * @param role - User role (defaults to 'pleb')
 * @param source - Source of user creation (for logging)
 * @returns The created user or null if already exists
 *
 * @example
 * ```typescript
 * createUser(123456, 'alice', 'pleb', 'direct_interaction');
 * ```
 */
export const createUser = (
  userId: number,
  username: string,
  role: string = 'pleb',
  source: string = 'unknown'
): User | null => {
  const existing = query<User>('SELECT id FROM users WHERE id = ?', [userId])[0];

  if (existing) {
    return null; // User already exists
  }

  const now = Math.floor(Date.now() / 1000);
  execute(
    'INSERT INTO users (id, username, role, whitelist, blacklist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, username, role, 0, 0, now, now]
  );

  StructuredLogger.logUserAction('User created', {
    userId,
    username,
    role,
    operation: 'user_created',
    source
  });

  return query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
};

/**
 * Ensures a user exists in the database, adding them if they don't exist.
 * This is the primary function used by middleware and handlers.
 *
 * **Synchronous by design** - Uses better-sqlite3 synchronous API for immediate
 * user availability in subsequent operations.
 *
 * Behavior:
 * - If user doesn't exist: Creates new user with default role 'pleb'
 * - If user exists: Updates username (usernames can change in Telegram)
 *
 * @param userId - Telegram user ID (immutable, primary identifier)
 * @param username - Current Telegram username (mutable, for display)
 *
 * @example
 * ```typescript
 * // Middleware usage - ensures user before checking balance
 * ensureUserExists(ctx.from.id, ctx.from.username || 'unknown');
 * await LedgerService.ensureUserBalance(ctx.from.id);
 * ```
 */
export const ensureUserExists = (userId: number, username: string): void => {
  const userExists = query<User>('SELECT id FROM users WHERE id = ?', [userId])[0];

  if (!userExists) {
    createUser(userId, username, 'pleb', 'ensure_exists');
  } else {
    // Update username if it changed (Telegram allows username changes)
    execute(
      'UPDATE users SET username = ?, updated_at = ? WHERE id = ?',
      [username, Math.floor(Date.now() / 1000), userId]
    );
  }
};

/**
 * Gets userId by username.
 * Only returns a match if the username is currently mapped to a userId in the database.
 * Does NOT create users or query Telegram API - only checks database.
 *
 * @param username - Telegram username (with or without @)
 * @returns userId if found, null otherwise
 *
 * @example
 * ```typescript
 * const userId = getUserIdByUsername('alice');
 * if (userId) {
 *   // Username is mapped to a userId
 * } else {
 *   // User must interact with bot first, or use userId directly
 * }
 * ```
 */
export const getUserIdByUsername = (username: string): number | null => {
  const cleanUsername = username.replace(/^@/, '');

  const user = query<User>('SELECT id FROM users WHERE username = ?', [cleanUsername])[0];

  return user?.id || null;
};

/**
 * Gets user by userId.
 * Primary lookup method - userId is immutable and reliable.
 *
 * @param userId - Telegram user ID
 * @returns User object if found, null otherwise
 *
 * @example
 * ```typescript
 * const user = getUserById(123456);
 * if (user) {
 *   console.log(`User: @${user.username}`);
 * }
 * ```
 */
export const getUserById = (userId: number): User | null => {
  return query<User>('SELECT * FROM users WHERE id = ?', [userId])[0] || null;
};

/**
 * Checks if a user exists in the database.
 * Lightweight check before operations that require existing users.
 *
 * @param userId - Telegram user ID
 * @returns true if user exists, false otherwise
 */
export const userExists = (userId: number): boolean => {
  return !!query<User>('SELECT id FROM users WHERE id = ?', [userId])[0];
};

/**
 * Adds a restriction for a specific user.
 * Restrictions can be time-limited or permanent, with optional metadata.
 *
 * @param userId - Telegram user ID to restrict
 * @param restriction - Type of restriction (e.g., 'no_stickers', 'no_urls', 'regex_block')
 * @param restrictedAction - Optional specific action to restrict (e.g., specific sticker pack ID)
 * @param metadata - Optional metadata as key-value pairs for extensibility
 * @param restrictedUntil - Optional Unix timestamp when restriction expires (null for permanent)
 *
 * @example
 * ```typescript
 * // Permanent ban on all stickers
 * addUserRestriction(123456, 'no_stickers');
 *
 * // Temporary URL ban (expires in 1 hour)
 * const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
 * addUserRestriction(123456, 'no_urls', undefined, undefined, oneHourFromNow);
 *
 * // Ban specific sticker pack with metadata
 * addUserRestriction(123456, 'no_stickers', 'pack_id_123', { reason: 'spam' });
 * ```
 */
export const addUserRestriction = (
  userId: number,
  restriction: string,
  restrictedAction?: string,
  metadata?: Record<string, any>,
  restrictedUntil?: number
): void => {
  execute(
    'INSERT INTO user_restrictions (user_id, restriction, restricted_action, metadata, restricted_until) VALUES (?, ?, ?, ?, ?)',
    [
      userId,
      restriction,
      restrictedAction || null, // Handle undefined by converting to null for database
      metadata ? JSON.stringify(metadata) : null, // Store metadata as JSON or null
      restrictedUntil || null // Convert undefined expiration to null
    ]
  );

  StructuredLogger.logSecurityEvent('User restriction added', {
    userId,
    operation: 'add_restriction',
    restrictedAction: restriction
  });
};

/**
 * Removes a restriction for a specific user.
 * This completely removes the restriction record from the database.
 *
 * @param userId - Telegram user ID
 * @param restriction - Type of restriction to remove (e.g., 'no_stickers', 'no_urls')
 *
 * @example
 * ```typescript
 * removeUserRestriction(123456, 'no_stickers');
 * ```
 */
export const removeUserRestriction = (userId: number, restriction: string): void => {
  execute(
    'DELETE FROM user_restrictions WHERE user_id = ? AND restriction = ?',
    [userId, restriction]
  );

  StructuredLogger.logSecurityEvent('User restriction removed', {
    userId,
    operation: 'remove_restriction',
    restrictedAction: restriction
  });
};

/**
 * Retrieves all active restrictions for a specific user.
 * Returns all restrictions regardless of expiration status.
 * Callers should check the restrictedUntil field to filter expired restrictions.
 *
 * @param userId - Telegram user ID
 * @returns Array of user restrictions
 *
 * @example
 * ```typescript
 * const restrictions = getUserRestrictions(123456);
 * const now = Math.floor(Date.now() / 1000);
 * const activeRestrictions = restrictions.filter(r =>
 *   !r.restrictedUntil || r.restrictedUntil > now
 * );
 * ```
 */
export const getUserRestrictions = (userId: number): UserRestriction[] => {
  return query<UserRestriction>(
    'SELECT * FROM user_restrictions WHERE user_id = ?',
    [userId]
  );
};
