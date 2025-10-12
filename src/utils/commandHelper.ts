/**
 * Command helper utilities
 */

import { Context } from 'telegraf';

/**
 * Gets the target user ID from a command
 * Supports:
 * - Direct user ID in command text (/command 123456)
 * - Username in command text (/command @username or /command username)
 * - Reply to message (no arguments needed, extracts from replied message)
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
 * Gets the target username from a command
 * Returns the username if provided, or null if replying to a message (use getUserId instead)
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
 * Gets command arguments, excluding the target user (if provided via reply or first arg)
 * Useful for commands like /jail @user 30 where we want to extract "30" after handling the user
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
 * Gets the user identifier string (for use with resolveUserId)
 * This handles both reply-to-message and explicit username/userId in command
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
