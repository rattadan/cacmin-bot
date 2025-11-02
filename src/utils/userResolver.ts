/**
 * @module utils/userResolver
 * @description User resolution utilities for converting between usernames, user IDs, and User objects.
 * Provides flexible user lookup supporting multiple identifier formats (numeric ID, @username, username).
 * Used throughout the bot to resolve user references in commands and display formatted user information.
 */

import { get } from '../database';
import { User } from '../types';

/**
 * Resolves a username or userId string to a numeric userId.
 * Supports multiple input formats: numeric ID, @username, or username.
 * Case-insensitive for username lookups.
 *
 * @param userIdentifier - Can be a numeric userId or a username (with or without @ prefix)
 * @returns The numeric userId if found in database, null if not found
 *
 * @example
 * resolveUserId('123456')      // Returns: 123456
 * resolveUserId('@username')   // Returns: user ID for username
 * resolveUserId('username')    // Returns: user ID for username
 * resolveUserId('@notfound')   // Returns: null
 */
export function resolveUserId(userIdentifier: string): number | null {
  // Remove @ prefix if present
  const cleanIdentifier = userIdentifier.startsWith('@')
    ? userIdentifier.substring(1)
    : userIdentifier;

  // Check if it's a numeric ID
  const numericId = parseInt(cleanIdentifier);
  if (!isNaN(numericId)) {
    // Verify the user exists
    const user = get<User>('SELECT id FROM users WHERE id = ?', [numericId]);
    return user ? numericId : null;
  }

  // Try to find by username (case-insensitive)
  const user = get<User>(
    'SELECT id FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanIdentifier]
  );

  return user ? user.id : null;
}

/**
 * Resolves a username or userId to a complete User object.
 * Similar to resolveUserId but returns the full user record with role, restrictions, etc.
 * Case-insensitive for username lookups.
 *
 * @param userIdentifier - Can be a numeric userId or a username (with or without @ prefix)
 * @returns The User object if found in database, null if not found
 *
 * @example
 * const user = resolveUser('123456');
 * if (user) {
 *   console.log(user.role);       // 'admin'
 *   console.log(user.whitelist);  // true
 * }
 *
 * @example
 * const user = resolveUser('@moderator');
 * if (user) {
 *   console.log(`${user.username} has role ${user.role}`);
 * }
 */
export function resolveUser(userIdentifier: string): User | null {
  // Remove @ prefix if present
  const cleanIdentifier = userIdentifier.startsWith('@')
    ? userIdentifier.substring(1)
    : userIdentifier;

  // Check if it's a numeric ID
  const numericId = parseInt(cleanIdentifier);
  if (!isNaN(numericId)) {
    const user = get<User>('SELECT * FROM users WHERE id = ?', [numericId]);
    return user || null;
  }

  // Try to find by username (case-insensitive)
  const user = get<User>(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanIdentifier]
  );

  return user || null;
}

/**
 * Formats a User object for display in messages and logs.
 * Creates a human-readable string showing both username and numeric ID.
 *
 * @param user - The user object to format
 * @returns Formatted string like "@username (123456)"
 *
 * @example
 * const user = resolveUser('alice');
 * const display = formatUserDisplay(user);
 * ctx.reply(`Elevated ${display}`);  // "Elevated @alice (123456)"
 */
export function formatUserDisplay(user: User): string {
  return `@${user.username} (${user.id})`;
}

/**
 * Formats a user ID for display by looking up the username in the database.
 * Convenience wrapper that fetches the User object and formats it for display.
 * Falls back to showing just the ID if user is not found in database.
 *
 * @param userId - The numeric user ID to format
 * @returns Formatted string like "@username (123456)" or just "(123456)" if username not found
 *
 * @example
 * const display = formatUserIdDisplay(123456);
 * ctx.reply(`Banned ${display}`);  // "Banned @alice (123456)" or "Banned (123456)"
 */
export function formatUserIdDisplay(userId: number): string {
  const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
  return user ? formatUserDisplay(user) : `(${userId})`;
}
