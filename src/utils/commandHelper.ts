/** Command parsing utilities for extracting user targets and arguments */

import type { Context } from "telegraf";

/**
 * Extract target user ID from command
 * Supports: reply-to-message, direct ID (/cmd 123456), username (/cmd @user)
 * Returns null for username strings (use getUserIdentifier instead)
 */
export function getTargetUserId(
	ctx: Context,
	argIndex: number = 0,
): number | null {
	// Check if this is a reply to another message
	if (
		ctx.message &&
		"reply_to_message" in ctx.message &&
		ctx.message.reply_to_message
	) {
		const repliedMessage = ctx.message.reply_to_message;
		if ("from" in repliedMessage && repliedMessage.from) {
			return repliedMessage.from.id;
		}
	}

	// Otherwise, try to extract from command arguments
	if (ctx.message && "text" in ctx.message) {
		const args = ctx.message.text.split(" ").slice(1);
		if (args.length > argIndex) {
			const userIdentifier = args[argIndex];

			// Try to parse as user ID
			const userId = parseInt(userIdentifier, 10);
			if (!Number.isNaN(userId)) {
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
 * Extract target username from command arguments
 * Returns null if reply-to-message (use getTargetUserId instead)
 * Strips @ prefix from @mentions
 */
export function getTargetUsername(
	ctx: Context,
	argIndex: number = 0,
): string | null {
	// If replying to message, username isn't needed (use userId from reply)
	if (
		ctx.message &&
		"reply_to_message" in ctx.message &&
		ctx.message.reply_to_message
	) {
		return null;
	}

	// Extract from command arguments
	if (ctx.message && "text" in ctx.message) {
		const args = ctx.message.text.split(" ").slice(1);
		if (args.length > argIndex) {
			const userIdentifier = args[argIndex];

			// Skip if it's a pure number (that's a user ID, not username)
			const userId = parseInt(userIdentifier, 10);
			if (Number.isNaN(userId)) {
				// Remove @ prefix if present
				return userIdentifier.startsWith("@")
					? userIdentifier.slice(1)
					: userIdentifier;
			}
		}
	}

	return null;
}

/**
 * Extract command arguments, optionally excluding user identifier
 * Useful for commands with parameters after user target (e.g. /jail @user 60 spam)
 */
export function getCommandArgs(
	ctx: Context,
	skipTargetUser: boolean = false,
): string[] {
	if (!ctx.message || !("text" in ctx.message)) {
		return [];
	}

	const args = ctx.message.text.split(" ").slice(1);

	// If replying to message or skipping first arg (user identifier), remove it
	if (skipTargetUser && args.length > 0) {
		// Check if first arg looks like a user identifier (number or @username)
		const firstArg = args[0];
		const isUserId = !Number.isNaN(parseInt(firstArg, 10));
		const isUsername =
			firstArg.startsWith("@") || (!isUserId && firstArg.length > 0);

		// If we're replying to message, don't skip any args
		const isReply =
			ctx.message &&
			"reply_to_message" in ctx.message &&
			ctx.message.reply_to_message;

		if (!isReply && (isUserId || isUsername)) {
			return args.slice(1);
		}
	}

	return args;
}

/**
 * Extract user identifier string suitable for resolveUserId()
 * Most flexible - handles reply-to-message, numeric IDs, @mentions
 * Always returns string representation (converts reply user IDs to string)
 */
export function getUserIdentifier(
	ctx: Context,
	argIndex: number = 0,
): string | null {
	// Check if this is a reply to another message
	if (
		ctx.message &&
		"reply_to_message" in ctx.message &&
		ctx.message.reply_to_message
	) {
		const repliedMessage = ctx.message.reply_to_message;
		if ("from" in repliedMessage && repliedMessage.from) {
			return repliedMessage.from.id.toString();
		}
	}

	// Otherwise, extract from command arguments
	if (ctx.message && "text" in ctx.message) {
		const args = ctx.message.text.split(" ").slice(1);
		if (args.length > argIndex) {
			return args[argIndex];
		}
	}

	return null;
}
