/**
 * @module utils/commandHelper
 * @description Command parsing utilities for extracting user targets and arguments from Telegram messages.
 * Provides flexible command parsing that supports multiple input methods:
 * reply-to-message, direct user ID, @username, and plain username. Used throughout
 * command handlers to parse user-targeting commands.
 */

import { Context } from 'telegraf';

/**
 * Extracts the target user ID from a command message.
 * Supports multiple input methods with reply-to-message taking precedence.
 *
 * Supported formats:
 * - Reply to message (extracts from replied message user)
 * - Direct user ID in command text: `/command 123456`
 * - Username in command text: `/command @username` or `/command username`
 *
 * @param ctx - Telegraf context object containing message information
 * @param argIndex - Index of the argument containing user identifier (default: 0)
 * @returns The numeric user ID if found, null if not found or is a username string
 *
 * @example
 * // Reply to a message
 * // User replies to Alice's message: /mute
 * const userId = getTargetUserId(ctx);  // Returns Alice's user ID
 *
 * @example
 * // Direct user ID
 * // User sends: /mute 123456
 * const userId = getTargetUserId(ctx);  // Returns 123456
 *
 * @example
 * // Username (returns null, use getUserIdentifier instead)
 * // User sends: /mute @alice
 * const userId = getTargetUserId(ctx);  // Returns null
 */
export function getTargetUserId(ctx: Context, argIndex: number = 0): number | null {
  // Check if this is a reply to another message
  if (ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message) {
    const repliedMessage = ctx.message.reply_to_message;
    if ('from' in repliedMessage && repliedMessage.from) {
      return repliedMessage.from.id;
    }
  }

  // Otherwise, try to extract from command arguments
  if (ctx.message && 'text' in ctx.message) {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length > argIndex) {
      const userIdentifier = args[argIndex];

      // Try to parse as user ID
      const userId = parseInt(userIdentifier);
      if (!isNaN(userId)) {
        return userId;
      }

      // If it's a username, we'll need to resolve it via the userResolver
      // Return null here and let the caller use resolveUserId
      return null;
    }
  }

  return null;
}

/**
 * Extracts the target username from a command message.
 * Returns null if command uses reply-to-message (use getTargetUserId instead).
 * Only returns usernames from command arguments, not numeric IDs.
 *
 * @param ctx - Telegraf context object containing message information
 * @param argIndex - Index of the argument containing username (default: 0)
 * @returns The username string (without @ prefix) if provided, null otherwise
 *
 * @example
 * // User sends: /mute @alice
 * const username = getTargetUsername(ctx);  // Returns 'alice'
 *
 * @example
 * // User sends: /mute alice
 * const username = getTargetUsername(ctx);  // Returns 'alice'
 *
 * @example
 * // User sends: /mute 123456
 * const username = getTargetUsername(ctx);  // Returns null (numeric ID)
 *
 * @example
 * // User replies to Alice's message: /mute
 * const username = getTargetUsername(ctx);  // Returns null (use reply user ID)
 */
export function getTargetUsername(ctx: Context, argIndex: number = 0): string | null {
  // If replying to message, username isn't needed (use userId from reply)
  if (ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message) {
    return null;
  }

  // Extract from command arguments
  if (ctx.message && 'text' in ctx.message) {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length > argIndex) {
      const userIdentifier = args[argIndex];

      // Skip if it's a pure number (that's a user ID, not username)
      const userId = parseInt(userIdentifier);
      if (isNaN(userId)) {
        // Remove @ prefix if present
        return userIdentifier.startsWith('@') ? userIdentifier.slice(1) : userIdentifier;
      }
    }
  }

  return null;
}

/**
 * Extracts command arguments, optionally excluding the target user identifier.
 * Useful for commands with additional parameters after the user target.
 *
 * @param ctx - Telegraf context object containing message information
 * @param skipTargetUser - If true, skips the first argument if it looks like a user identifier (default: false)
 * @returns Array of command arguments as strings
 *
 * @example
 * // User sends: /jail @alice 60 spam
 * const args = getCommandArgs(ctx, true);   // Returns ['60', 'spam']
 * const args2 = getCommandArgs(ctx, false); // Returns ['@alice', '60', 'spam']
 *
 * @example
 * // User replies to Alice's message: /jail 60 spam
 * const args = getCommandArgs(ctx, true);  // Returns ['60', 'spam']
 *
 * @example
 * // User sends: /help
 * const args = getCommandArgs(ctx);  // Returns []
 */
export function getCommandArgs(ctx: Context, skipTargetUser: boolean = false): string[] {
  if (!ctx.message || !('text' in ctx.message)) {
    return [];
  }

  const args = ctx.message.text.split(' ').slice(1);

  // If replying to message or skipping first arg (user identifier), remove it
  if (skipTargetUser && args.length > 0) {
    // Check if first arg looks like a user identifier (number or @username)
    const firstArg = args[0];
    const isUserId = !isNaN(parseInt(firstArg));
    const isUsername = firstArg.startsWith('@') || (!isUserId && firstArg.length > 0);

    // If we're replying to message, don't skip any args
    const isReply = ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message;

    if (!isReply && (isUserId || isUsername)) {
      return args.slice(1);
    }
  }

  return args;
}

/**
 * Extracts the user identifier string suitable for use with resolveUserId.
 * Most flexible function - handles all input formats and returns a string that
 * can be passed to user resolution utilities.
 *
 * @param ctx - Telegraf context object containing message information
 * @param argIndex - Index of the argument containing user identifier (default: 0)
 * @returns The user identifier string (numeric ID, @username, or username), null if not found
 *
 * @example
 * // User replies to Alice's message (ID: 123456): /mute
 * const identifier = getUserIdentifier(ctx);  // Returns '123456'
 * const userId = resolveUserId(identifier);   // Resolves to 123456
 *
 * @example
 * // User sends: /mute @alice
 * const identifier = getUserIdentifier(ctx);  // Returns '@alice'
 * const userId = resolveUserId(identifier);   // Resolves to Alice's ID
 *
 * @example
 * // User sends: /mute 987654
 * const identifier = getUserIdentifier(ctx);  // Returns '987654'
 * const userId = resolveUserId(identifier);   // Resolves to 987654
 */
export function getUserIdentifier(ctx: Context, argIndex: number = 0): string | null {
  // Check if this is a reply to another message
  if (ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message) {
    const repliedMessage = ctx.message.reply_to_message;
    if ('from' in repliedMessage && repliedMessage.from) {
      return repliedMessage.from.id.toString();
    }
  }

  // Otherwise, extract from command arguments
  if (ctx.message && 'text' in ctx.message) {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length > argIndex) {
      return args[argIndex];
    }
  }

  return null;
}
