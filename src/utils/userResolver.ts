/**
 * User resolution utilities for converting usernames/IDs to User objects.
 * Provides comprehensive functions for resolving user identifiers from various sources
 * including direct arguments, @mentions, numeric IDs, and reply-to-message contexts.
 *
 * @module utils/userResolver
 */

import { Context } from 'telegraf';
import { get } from '../database';
import { User } from '../types';
import { getUserIdentifier } from './commandHelper';
import { escapeMarkdownV2 } from './markdown';

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
 * Format user ID for display by looking up username.
 * Falls back to (123456) if username not found.
 *
 * @param userId - Numeric Telegram user ID
 * @returns Formatted string like "@username (123456)" or "(123456)"
 */
export function formatUserIdDisplay(userId: number): string {
  const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
  return user ? formatUserDisplay(user) : `(${userId})`;
}

/**
 * Result object returned by resolveUserFromContext.
 */
export interface ResolvedUser {
  /** Numeric Telegram user ID */
  userId: number;
  /** Username without @ prefix, or undefined if not available */
  username?: string;
  /** Full User object from database if available */
  user?: User;
}

/**
 * Resolve user from Telegram context with comprehensive error handling.
 * Handles reply-to-message, numeric IDs, and @username mentions.
 * Returns null with error message if user cannot be resolved.
 *
 * This is the recommended function for all commands that need to target a user.
 *
 * @param ctx - Telegraf context from command handler
 * @param argIndex - Index of the user identifier in command arguments (default: 0)
 * @param sendError - Whether to send error message to user (default: true)
 * @returns ResolvedUser object with userId, username, and user, or null if resolution fails
 *
 * @example
 * ```typescript
 * // In a command handler
 * bot.command('ban', async (ctx) => {
 *   const target = await resolveUserFromContext(ctx);
 *   if (!target) return; // Error message already sent
 *
 *   // Use target.userId, target.username, target.user
 *   await banUser(target.userId);
 *   await ctx.reply(`Banned ${target.username ? '@' + target.username : target.userId}`);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Usage patterns that are automatically handled:
 * // /ban @alice          <- @username mention
 * // /ban 123456          <- Numeric user ID
 * // /ban alice           <- Username without @
 * // Reply to message + /ban  <- Reply-to-message (no args needed)
 * ```
 */
export async function resolveUserFromContext(
  ctx: Context,
  argIndex: number = 0,
  sendError: boolean = true
): Promise<ResolvedUser | null> {
  // Get user identifier from context (handles reply-to-message and args)
  const identifier = getUserIdentifier(ctx, argIndex);

  if (!identifier) {
    if (sendError) {
      await ctx.reply(
        '❌ *No user specified*\n\n' +
        'Usage: Reply to a user\'s message, or provide @username or user ID\n\n' +
        'Examples:\n' +
        '• Reply to message \\+ command\n' +
        '• `/command @username`\n' +
        '• `/command 123456`',
        { parse_mode: 'MarkdownV2' }
      );
    }
    return null;
  }

  // Remove @ prefix if present
  const cleanIdentifier = identifier.startsWith('@')
    ? identifier.substring(1)
    : identifier;

  // Try to parse as numeric ID
  const numericId = parseInt(cleanIdentifier);
  if (!isNaN(numericId)) {
    // It's a numeric ID - verify user exists and get username
    const user = get<User>('SELECT * FROM users WHERE id = ?', [numericId]);

    if (!user) {
      if (sendError) {
        await ctx.reply(
          `⚠️ User ID ${escapeMarkdownV2(numericId)} not found in database\\.\n\n` +
          `They may not have interacted with the bot yet\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      return null;
    }

    return {
      userId: numericId,
      username: user.username,
      user
    };
  }

  // It's a username - look it up (case-insensitive)
  const user = get<User>(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanIdentifier]
  );

  if (!user) {
    if (sendError) {
      await ctx.reply(
        `❌ User @${escapeMarkdownV2(cleanIdentifier)} not found in database\\.\n\n` +
        `They must have interacted with the bot before you can target them\\.\n` +
        `Alternatively, use their numeric user ID if you know it\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }
    return null;
  }

  return {
    userId: user.id,
    username: user.username,
    user
  };
}
