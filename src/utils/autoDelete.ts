/**
 * Auto-delete utility for bot messages.
 * Schedules messages for deletion after a configurable timeout.
 *
 * @module utils/autoDelete
 */

import type { Context, Telegram } from "telegraf";
import type { Message } from "telegraf/types";
import { logger } from "./logger";

/**
 * Check if the context is a group chat (not a private/DM conversation).
 */
function isGroupChat(ctx: Context): boolean {
	const chatType = ctx.chat?.type;
	return chatType === "group" || chatType === "supergroup";
}

// Default timeout in milliseconds (30 seconds)
const DEFAULT_TIMEOUT_MS = 30 * 1000;

// Track scheduled deletions for potential cancellation
const scheduledDeletions = new Map<string, NodeJS.Timeout>();

/**
 * Schedule a message for deletion after a timeout.
 * @param telegram - Telegram instance for API calls
 * @param chatId - Chat containing the message
 * @param messageId - Message ID to delete
 * @param timeoutMs - Time until deletion (default 30s)
 * @returns Cancel function to abort the scheduled deletion
 */
export function scheduleDelete(
	telegram: Telegram,
	chatId: number,
	messageId: number,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): () => void {
	const key = `${chatId}_${messageId}`;

	// Clear any existing timeout for this message
	const existing = scheduledDeletions.get(key);
	if (existing) {
		clearTimeout(existing);
	}

	const timeout = setTimeout(async () => {
		scheduledDeletions.delete(key);
		try {
			await telegram.deleteMessage(chatId, messageId);
		} catch {
			// Silently fail - message may be too old, already deleted, or bot lacks perms
		}
	}, timeoutMs);

	scheduledDeletions.set(key, timeout);

	// Return cancel function
	return () => {
		clearTimeout(timeout);
		scheduledDeletions.delete(key);
	};
}

/**
 * Schedule deletion of both the user's command message and the bot's response.
 * @param ctx - Telegraf context
 * @param botMessageId - Bot response message ID
 * @param timeoutMs - Time until deletion (default 30s)
 * @param deleteUserMsg - Whether to also delete the user's command (default true)
 */
export function scheduleMessageCleanup(
	ctx: Context,
	botMessageId: number,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	deleteUserMsg: boolean = true,
): void {
	const chatId = ctx.chat?.id;
	const userMsgId = ctx.message?.message_id;

	if (!chatId) return;

	// Schedule bot message deletion
	scheduleDelete(ctx.telegram, chatId, botMessageId, timeoutMs);

	// Schedule user command deletion if requested and available
	if (deleteUserMsg && userMsgId) {
		scheduleDelete(ctx.telegram, chatId, userMsgId, timeoutMs);
	}
}

/**
 * Helper to send a reply and auto-schedule it for deletion.
 * Returns the sent message for further use if needed.
 * @param ctx - Telegraf context
 * @param content - Message content (string or FmtString)
 * @param options - Reply options (optional)
 * @param timeoutMs - Time until deletion (default 30s)
 * @param deleteUserMsg - Whether to also delete the user's command (default true)
 */
export async function replyAndDelete<T extends Message>(
	ctx: Context,
	content: Parameters<Context["reply"]>[0],
	options?: Parameters<Context["reply"]>[1],
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	deleteUserMsg: boolean = true,
): Promise<T> {
	const sentMessage = (await ctx.reply(content as string, options)) as T;
	scheduleMessageCleanup(ctx, sentMessage.message_id, timeoutMs, deleteUserMsg);
	return sentMessage;
}

/**
 * Schedule cleanup for group chats only - skips DMs.
 * Deletes both the user's command and the bot's response after timeout.
 * @param ctx - Telegraf context
 * @param botMessageId - Bot response message ID
 * @param timeoutMs - Time until deletion (default 30s)
 * @param deleteUserMsg - Whether to also delete the user's command (default true)
 */
export function autoDeleteInGroup(
	ctx: Context,
	botMessageId: number,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	deleteUserMsg: boolean = true,
): void {
	if (!isGroupChat(ctx)) return;
	scheduleMessageCleanup(ctx, botMessageId, timeoutMs, deleteUserMsg);
}

/**
 * Helper to send a reply and auto-schedule deletion in group chats only.
 * In DMs, the message is sent but not scheduled for deletion.
 * @param ctx - Telegraf context
 * @param content - Message content (string or FmtString)
 * @param options - Reply options (optional)
 * @param timeoutMs - Time until deletion (default 30s)
 * @param deleteUserMsg - Whether to also delete the user's command (default true)
 */
export async function replyWithAutoDelete<T extends Message>(
	ctx: Context,
	content: Parameters<Context["reply"]>[0],
	options?: Parameters<Context["reply"]>[1],
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	deleteUserMsg: boolean = true,
): Promise<T> {
	const sentMessage = (await ctx.reply(content as string, options)) as T;
	autoDeleteInGroup(ctx, sentMessage.message_id, timeoutMs, deleteUserMsg);
	return sentMessage;
}

/**
 * Cancel a scheduled deletion.
 * @param chatId - Chat containing the message
 * @param messageId - Message ID
 * @returns true if a deletion was cancelled, false if none was scheduled
 */
export function cancelDelete(chatId: number, messageId: number): boolean {
	const key = `${chatId}_${messageId}`;
	const timeout = scheduledDeletions.get(key);
	if (timeout) {
		clearTimeout(timeout);
		scheduledDeletions.delete(key);
		return true;
	}
	return false;
}

/**
 * Get the number of currently scheduled deletions (for debugging/stats).
 */
export function getScheduledDeleteCount(): number {
	return scheduledDeletions.size;
}

/**
 * Clean up all scheduled deletions (for shutdown).
 */
export function clearAllScheduledDeletes(): void {
	for (const timeout of scheduledDeletions.values()) {
		clearTimeout(timeout);
	}
	scheduledDeletions.clear();
	logger.info("Cleared all scheduled message deletions");
}
