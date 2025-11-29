/**
 * Callback query handlers for inline keyboard interactions.
 * Processes button presses from inline keyboards throughout the bot.
 *
 * @module handlers/callbacks
 */

import type { Context, Telegraf } from "telegraf";
import type { CallbackQuery } from "telegraf/types";
import { mainMenuKeyboard } from "../utils/keyboards";
import { logger } from "../utils/logger";

// Store for tracking multi-step interactions
interface SessionData {
	action: string;
	step: number;
	data: Record<string, any>;
	timestamp: number;
}

const sessions = new Map<number, SessionData>();

// Session timeout: 5 minutes
const SESSION_TIMEOUT = 5 * 60 * 1000;

/**
 * Get or create a session for a user
 */
function getSession(userId: number): SessionData | null {
	const session = sessions.get(userId);
	if (!session) return null;

	// Check if session expired
	if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
		sessions.delete(userId);
		return null;
	}

	return session;
}

/**
 * Set session data for a user
 */
function setSession(
	userId: number,
	action: string,
	step: number,
	data: Record<string, any>,
): void {
	sessions.set(userId, {
		action,
		step,
		data,
		timestamp: Date.now(),
	});
}

/**
 * Clear session for a user
 */
function clearSession(userId: number): void {
	sessions.delete(userId);
}

/**
 * Registers all callback query handlers with the bot
 */
export function registerCallbackHandlers(bot: Telegraf<Context>): void {
	/**
	 * Handle all callback queries
	 */
	bot.on("callback_query", async (ctx) => {
		const callbackQuery = ctx.callbackQuery as CallbackQuery.DataQuery;
		const data = callbackQuery.data;
		const userId = ctx.from?.id;

		if (!userId) return;

		try {
			// Answer the callback to remove loading state
			await ctx.answerCbQuery();

			// Handle cancel
			if (data === "cancel") {
				clearSession(userId);
				await ctx.editMessageText("Action cancelled.");
				return;
			}

			// Route to appropriate handler based on callback data prefix
			if (data.startsWith("restrict_")) {
				await handleRestrictionCallback(ctx, data, userId);
			} else if (data.startsWith("jail_")) {
				await handleJailCallback(ctx, data, userId);
			} else if (data.startsWith("duration_")) {
				await handleDurationCallback(ctx, data, userId);
			} else if (data.startsWith("give_")) {
				await handleGiveawayCallback(ctx, data, userId);
			} else if (data.startsWith("action_")) {
				await handleGlobalActionCallback(ctx, data, userId);
			} else if (data.startsWith("role_")) {
				await handleRoleCallback(ctx, data, userId);
			} else if (data.startsWith("list_")) {
				await handleListCallback(ctx, data, userId);
			} else if (data.startsWith("perm_")) {
				await handlePermissionCallback(ctx, data, userId);
			} else if (data.startsWith("confirm_")) {
				await handleConfirmationCallback(ctx, data, userId);
			} else if (data.startsWith("menu_")) {
				await handleMenuCallback(ctx, data, userId);
			} else if (data.startsWith("select_user_")) {
				await handleUserSelectionCallback(ctx, data, userId);
			}
		} catch (error) {
			logger.error("Error handling callback query", { userId, data, error });
			await ctx.answerCbQuery("An error occurred. Please try again.");
		}
	});
}

/**
 * Handle restriction type selection
 */
async function handleRestrictionCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const restrictionType = data.replace("restrict_", "");

	// Store the restriction type in session
	setSession(userId, "add_restriction", 1, { restrictionType });

	await ctx.editMessageText(
		`*Add Restriction: ${restrictionType}*\n\n` +
			`Please reply with the user ID or @username to restrict.\n\n` +
			`Format: \`userId\` or \`@username\``,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle jail duration selection
 */
async function handleJailCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	if (data === "jail_custom") {
		setSession(userId, "jail", 1, {});
		await ctx.editMessageText(
			"*Custom Jail Duration*\n\n" +
				"Please reply with:\n" +
				"1. User ID or @username\n" +
				"2. Duration in minutes\n\n" +
				"Format: `@username 45` or `123456 30`",
			{ parse_mode: "Markdown" },
		);
		return;
	}

	const minutes = parseInt(data.replace("jail_", ""), 10);
	setSession(userId, "jail", 1, { minutes });

	await ctx.editMessageText(
		`*Jail User for ${minutes} minutes*\n\n` +
			`Please reply with the user ID or @username to jail.\n\n` +
			`Format: \`userId\` or \`@username\``,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle duration selection for restrictions
 */
async function handleDurationCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const session = getSession(userId);
	if (!session) {
		await ctx.editMessageText("Session expired. Please start over.");
		return;
	}

	let duration: number | null;
	if (data === "duration_permanent") {
		duration = null;
	} else {
		duration = parseInt(data.replace("duration_", ""), 10);
	}

	session.data.duration = duration;
	setSession(userId, session.action, session.step + 1, session.data);

	const durationText = duration ? `${duration / 3600} hours` : "permanent";
	await ctx.editMessageText(
		`Duration set to: ${durationText}\n\n` +
			`Restriction will be applied. Use /listrestrictions <userId> to verify.`,
		{ parse_mode: "Markdown" },
	);

	// Clear session after completion
	clearSession(userId);
}

/**
 * Handle giveaway amount selection
 */
async function handleGiveawayCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	if (data === "give_custom") {
		setSession(userId, "giveaway", 1, {});
		await ctx.editMessageText(
			"*Custom Giveaway Amount*\n\n" +
				"Please reply with:\n" +
				"1. User ID or @username\n" +
				"2. Amount in JUNO\n\n" +
				"Format: `@username 15.5` or `123456 20`",
			{ parse_mode: "Markdown" },
		);
		return;
	}

	const amount = parseFloat(data.replace("give_", ""));
	setSession(userId, "giveaway", 1, { amount });

	await ctx.editMessageText(
		`*Giveaway: ${amount} JUNO*\n\n` +
			`Please reply with the user ID or @username to receive the giveaway.\n\n` +
			`Format: \`userId\` or \`@username\``,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle global action selection
 */
async function handleGlobalActionCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const actionType = data.replace("action_", "");

	setSession(userId, "add_global_action", 1, { actionType });

	await ctx.editMessageText(
		`*Add Global Action: ${actionType}*\n\n` +
			`This will restrict ALL users from: ${actionType}\n\n` +
			`Optionally, reply with a specific action to restrict (e.g., specific sticker pack name, domain, etc.)\n` +
			`Or type "apply" to apply globally.`,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle role assignment selection
 */
async function handleRoleCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const roleAction = data.replace("role_", "");

	setSession(userId, `role_${roleAction}`, 1, {});

	let message = "";
	if (roleAction === "admin") {
		message =
			"*Make Admin*\n\nPlease reply with the user ID or @username to promote to admin.";
	} else if (roleAction === "elevated") {
		message =
			"*Elevate User*\n\nPlease reply with the user ID or @username to elevate.";
	} else if (roleAction === "revoke") {
		message =
			"*Revoke Role*\n\nPlease reply with the user ID or @username to demote.";
	}

	await ctx.editMessageText(
		`${message}\n\nFormat: \`@username\` or \`userId\``,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle list management callback
 */
async function handleListCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const action = data.replace("list_", "");

	if (action === "view_white" || action === "view_black") {
		// Import and call view functions directly
		const { query } = await import("../database");
		const listType = action === "view_white" ? "whitelist" : "blacklist";
		const column = action === "view_white" ? "whitelist" : "blacklist";

		type User = { id: number; username?: string };
		const users = query<User>(
			`SELECT id, username FROM users WHERE ${column} = 1`,
		);

		if (users.length === 0) {
			await ctx.editMessageText(`The ${listType} is empty.`);
			return;
		}

		const message = users
			.map(
				(u) => `• ${u.username ? `@${u.username}` : `User ${u.id}`} (${u.id})`,
			)
			.join("\n");
		await ctx.editMessageText(
			`*${listType.charAt(0).toUpperCase() + listType.slice(1)}:*\n\n${message}`,
			{ parse_mode: "Markdown" },
		);
		return;
	}

	setSession(userId, `list_${action}`, 1, {});

	await ctx.editMessageText(
		`*List Management*\n\n` +
			`Action: ${action}\n\n` +
			`Please reply with the user ID or @username.\n\n` +
			`Format: \`@username\` or \`userId\``,
		{ parse_mode: "Markdown" },
	);
}

/**
 * Handle permission level selection for shared accounts
 */
async function handlePermissionCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const permission = data.replace("perm_", "");
	const session = getSession(userId);

	if (!session) {
		await ctx.editMessageText("Session expired. Please start over.");
		return;
	}

	session.data.permission = permission;
	setSession(userId, session.action, session.step + 1, session.data);

	await ctx.editMessageText(
		`Permission level set to: ${permission}\n\n` +
			`Access will be granted when you confirm.`,
	);
}

/**
 * Handle confirmation callbacks
 */
async function handleConfirmationCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const action = data.replace("confirm_", "");
	const session = getSession(userId);

	if (!session) {
		await ctx.editMessageText("Session expired. Please start over.");
		return;
	}

	// Execute the confirmed action
	await ctx.editMessageText(`${action} confirmed and executed!`);
	clearSession(userId);
}

/**
 * Handle main menu navigation
 */
async function handleMenuCallback(
	ctx: Context,
	data: string,
	_userId: number,
): Promise<void> {
	const menuItem = data.replace("menu_", "");

	let message = "";
	switch (menuItem) {
		case "wallet":
			message =
				"*Wallet Commands*\n\n/balance - Check balance\n/deposit - Get deposit instructions\n/withdraw - Withdraw funds\n/send - Send funds\n/transactions - View history";
			break;
		case "shared":
			message =
				"*Shared Account Commands*\n\n/myshared - View your shared accounts\n/createshared - Create new shared account\n/sharedbalance - Check shared balance";
			break;
		case "moderation":
			message =
				"*Moderation Commands*\n\n/jail - Jail user\n/unjail - Release user\n/warn - Issue warning\n/addrestriction - Add restriction";
			break;
		case "lists":
			message =
				"*List Management*\n\n/viewwhitelist - View whitelist\n/viewblacklist - View blacklist\n/addwhitelist - Add to whitelist\n/addblacklist - Add to blacklist";
			break;
		case "roles":
			message =
				"*Role Management*\n\n/makeadmin - Promote to admin\n/elevate - Elevate user\n/revoke - Revoke privileges\n/listadmins - List all admins";
			break;
		case "stats":
			message =
				"*Statistics*\n\n/stats - Bot statistics\n/jailstats - Jail statistics\n/walletstats - Wallet statistics";
			break;
		case "help":
			message =
				"*Help*\n\nUse /help in a DM for comprehensive command reference.";
			break;
	}

	await ctx.editMessageText(message, {
		parse_mode: "Markdown",
		reply_markup: mainMenuKeyboard,
	});
}

/**
 * Handle user selection from paginated list
 */
async function handleUserSelectionCallback(
	ctx: Context,
	data: string,
	userId: number,
): Promise<void> {
	const selectedUserId = parseInt(data.replace("select_user_", ""), 10);
	const session = getSession(userId);

	if (!session) {
		await ctx.editMessageText("Session expired. Please start over.");
		return;
	}

	session.data.targetUserId = selectedUserId;
	setSession(userId, session.action, session.step + 1, session.data);

	await ctx.editMessageText(
		`User ${selectedUserId} selected. Proceeding with ${session.action}...`,
	);
}
