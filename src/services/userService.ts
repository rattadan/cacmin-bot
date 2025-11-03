/** User management service - user records and restrictions */

import { query, execute } from '../database';
import { User, UserRestriction } from '../types';
import { StructuredLogger } from '../utils/logger';

/**
 * Create new user with all required fields
 * Used internally for consistent user record creation
 * Returns null if user already exists
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
 * Ensure user exists in database, create if missing
 * Primary function used by middleware/handlers (synchronous by design)
 *
 * Behavior:
 * - User doesn't exist: Creates with default role 'pleb'
 * - User exists: Updates username (Telegram usernames are mutable)
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
 * Get userId by username (database lookup only)
 * Does NOT create users or query Telegram API
 * Returns null if username not found
 */
export const getUserIdByUsername = (username: string): number | null => {
  const cleanUsername = username.replace(/^@/, '');

  const user = query<User>('SELECT id FROM users WHERE username = ?', [cleanUsername])[0];

  return user?.id || null;
};

/** Get user by userId (primary lookup method - userId is immutable) */
export const getUserById = (userId: number): User | null => {
  return query<User>('SELECT * FROM users WHERE id = ?', [userId])[0] || null;
};

/** Check if user exists (lightweight check before operations) */
export const userExists = (userId: number): boolean => {
  return !!query<User>('SELECT id FROM users WHERE id = ?', [userId])[0];
};

/**
 * Add restriction for user
 * Can be time-limited or permanent with optional metadata
 * restrictedUntil: Unix timestamp (null for permanent)
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

/** Remove restriction for user (completely removes from database) */
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
 * Get all restrictions for user (regardless of expiration)
 * Callers should check restrictedUntil field to filter expired
 */
export const getUserRestrictions = (userId: number): UserRestriction[] => {
  return query<UserRestriction>(
    'SELECT * FROM user_restrictions WHERE user_id = ?',
    [userId]
  );
};
