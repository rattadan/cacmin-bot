/** User resolution utilities for converting usernames/IDs to User objects */

import { get } from '../database';
import { User } from '../types';

/**
 * Resolve username or ID string to numeric userId
 * Supports: numeric ID, @username, username (case-insensitive)
 * Returns null if not found in database
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
 * Resolve username or ID to complete User object
 * Returns full user record with role, restrictions, etc.
 * Case-insensitive for username lookups
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

/** Format User object for display: @username (123456) */
export function formatUserDisplay(user: User): string {
  return `@${user.username} (${user.id})`;
}

/**
 * Format user ID for display by looking up username
 * Falls back to (123456) if username not found
 */
export function formatUserIdDisplay(userId: number): string {
  const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
  return user ? formatUserDisplay(user) : `(${userId})`;
}
