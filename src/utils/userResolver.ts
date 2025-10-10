import { get } from '../database';
import { User } from '../types';

/**
 * Resolves a username or userId string to a numeric userId
 * @param userIdentifier - Can be a numeric userId or a username (with or without @)
 * @returns The numeric userId if found, null otherwise
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
 * Resolves a username or userId to a User object
 * @param userIdentifier - Can be a numeric userId or a username (with or without @)
 * @returns The User object if found, null otherwise
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
 * Formats a user for display (shows both username and ID)
 * @param user - The user object
 * @returns Formatted string like "@username (123456)"
 */
export function formatUserDisplay(user: User): string {
  return `@${user.username} (${user.id})`;
}

/**
 * Formats a user ID for display by looking up username
 * @param userId - The numeric user ID
 * @returns Formatted string like "@username (123456)" or just "(123456)" if username not found
 */
export function formatUserIdDisplay(userId: number): string {
  const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
  return user ? formatUserDisplay(user) : `(${userId})`;
}
