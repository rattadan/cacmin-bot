/**
 * Help command handler for the CAC Admin Bot.
 * Provides comprehensive, role-based command reference accessible via DM.
 *
 * Displays commands organized by category:
 * - Wallet commands (deposits, withdrawals, transfers, transactions)
 * - Shared account commands (create, manage, use shared wallets)
 * - User commands (status, jails, violations)
 * - Payment commands (fines, bail)
 * - Elevated commands (view lists, restrictions, create shared accounts)
 * - Admin commands (moderation, treasury, role management)
 * - Owner commands (advanced role management, test suite, full access)
 *
 * @module commands/help
 */

import type { Context, Telegraf } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { get } from "../database";
import { ensureUserExists } from "../services/userService";
import type { User } from "../types";
import { logger } from "../utils/logger";
import { escapeMarkdownV2 } from "../utils/markdown";

/**
 * Registers the help command with the bot.
 *
 * The help command displays a comprehensive list of available commands
 * based on the user's role (pleb, elevated, admin, owner).
 *
 * Command:
 * - /help - Display role-based command reference (DM only)
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerHelpCommand } from './commands/help';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerHelpCommand(bot);
 * ```
 */
export function registerHelpCommand(bot: Telegraf<Context>): void {
	/**
	 * Command: /help
	 * Display comprehensive, role-based command reference.
	 *
	 * Permission: Any user
	 * Syntax: /help
	 * Location: Direct message only
	 *
	 * Displays different command sets based on user role:
	 * - Universal: Wallet, shared accounts, user status, payment commands
	 * - Elevated: View restrictions, lists, jail statistics, create shared accounts
	 * - Admin: Role management, moderation, treasury, deposits, statistics
	 * - Owner: Owner-specific commands, test suite, view any user's data
	 *
	 * @example
	 * User: /help
	 * Bot: CAC Admin Bot - Command Reference
	 *
	 *      Your Role: `pleb`
	 *
	 *      Wallet Commands:
	 *      /balance - Check your wallet balance
	 *      /deposit - Get deposit instructions
	 *      [... full command list based on role ...]
	 */
	bot.command("help", async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;

		// Only allow help command in DMs (private chats)
		if (ctx.chat?.type !== "private") {
			const botInfo = await ctx.telegram.getMe();
			return ctx.reply(
				` The /help command is only available via direct message. Please DM me @${botInfo.username}`,
			);
		}

		try {
			// Ensure user exists in database
			ensureUserExists(userId, ctx.from?.username || "unknown");

			const user = get<User>("SELECT * FROM users WHERE id = ?", [userId]);
			const role = user?.role || "pleb";

			// Create help menu with inline keyboard
			const keyboard: InlineKeyboardMarkup = buildHelpMenu(role);

			await ctx.reply(
				`*CAC Admin Bot*\n\nRole: \`${escapeMarkdownV2(role)}\`\n\nSelect a category to view commands:`,
				{
					parse_mode: "MarkdownV2",
					reply_markup: keyboard,
				},
			);
		} catch (error) {
			logger.error("Error in help command", { userId, error });
			await ctx.reply("Error loading help");
		}
	});

	// Handle back to menu - Register BEFORE regex to prevent matching
	bot.action("help_menu", async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;

		try {
			const user = get<User>("SELECT * FROM users WHERE id = ?", [userId]);
			const role = user?.role || "pleb";

			const keyboard: InlineKeyboardMarkup = buildHelpMenu(role);

			await ctx.editMessageText(
				`*CAC Admin Bot*\n\nRole: \`${escapeMarkdownV2(role)}\`\n\nSelect a category to view commands:`,
				{
					parse_mode: "MarkdownV2",
					reply_markup: keyboard,
				},
			);
			await ctx.answerCbQuery();
		} catch (error) {
			logger.error("Error returning to help menu", { userId, error });
			await ctx.answerCbQuery("Error loading menu");
		}
	});

	// Handle help category callbacks - specific categories only, exclude 'menu'
	bot.action(
		/^help_(wallet|shared|user|payments|elevated|admin|owner)$/,
		async (ctx) => {
			const category = ctx.match[1];
			const userId = ctx.from?.id;
			if (!userId) return;

			try {
				const user = get<User>("SELECT * FROM users WHERE id = ?", [userId]);
				const role = user?.role || "pleb";

				const helpText = getHelpTextForCategory(category, role);
				if (!helpText) {
					await ctx.answerCbQuery("Category not available for your role");
					return;
				}

				const backKeyboard: InlineKeyboardMarkup = {
					inline_keyboard: [
						[{ text: "← Back to Menu", callback_data: "help_menu" }],
					],
				};

				await ctx.editMessageText(helpText, {
					parse_mode: "MarkdownV2",
					reply_markup: backKeyboard,
				});
				await ctx.answerCbQuery();
			} catch (error) {
				logger.error("Error in help callback", { userId, category, error });
				await ctx.answerCbQuery("Error loading help category");
			}
		},
	);
}

/**
 * Build the help menu keyboard based on user role
 */
function buildHelpMenu(role: string): InlineKeyboardMarkup {
	const buttons = [
		[
			{ text: "💰 Wallet", callback_data: "help_wallet" },
			{ text: "👥 Shared Accounts", callback_data: "help_shared" },
		],
		[
			{ text: "👤 User", callback_data: "help_user" },
			{ text: "💳 Payments", callback_data: "help_payments" },
		],
	];

	// Add elevated, admin, owner buttons based on role
	if (role === "elevated" || role === "admin" || role === "owner") {
		buttons.push([{ text: "⭐ Elevated", callback_data: "help_elevated" }]);
	}

	if (role === "admin" || role === "owner") {
		buttons.push([{ text: "🔨 Admin", callback_data: "help_admin" }]);
	}

	if (role === "owner") {
		buttons.push([{ text: "👑 Owner", callback_data: "help_owner" }]);
	}

	return { inline_keyboard: buttons };
}

/**
 * Get help text for a specific category
 */
function getHelpTextForCategory(category: string, role: string): string | null {
	switch (category) {
		case "wallet":
			return (
				`*Wallet Commands*\n\n` +
				`/balance\n` +
				`  View your current JUNO balance in the internal wallet\\. This shows funds available for transfers and withdrawals\\.\n\n` +
				`/deposit\n` +
				`  Get your unique deposit address and memo\\. Send JUNO from any wallet to this address with your memo to credit your account\\.\n\n` +
				`/withdraw \\<amount\\> \\<address\\>\n` +
				`  Send JUNO from your internal balance to any external Juno address\\. Requires sufficient balance plus network fees\\.\n\n` +
				`/send \\<amount\\> \\<user\\>\n` +
				`  Transfer JUNO to another bot user instantly with no fees\\. Use @username or user ID\\.\n\n` +
				`/transactions \\[limit\\]\n` +
				`  View your transaction history including deposits, withdrawals, transfers, and fines\\. Optional limit parameter \\(default: 10\\)\\.`
			);

		case "shared":
			return (
				`*Shared Account Commands*\n\n` +
				`/myshared\n` +
				`  List all shared accounts you have access to and your permission level \\(view, spend, admin\\) for each\\.\n\n` +
				`/sharedbalance \\<name\\>\n` +
				`  Check the current balance of a shared account\\. You must have at least view permissions\\.\n\n` +
				`/sharedsend \\<name\\> \\<amount\\> \\<user\\>\n` +
				`  Send JUNO from a shared account to another user\\. Requires spend or admin permissions and respects spending limits\\.\n\n` +
				`/grantaccess \\<name\\> \\<user\\> \\<level\\>\n` +
				`  Grant another user access to a shared account\\. Requires admin permissions\\. Levels: view, spend, admin\\.`
			);

		case "user":
			return (
				`*User Commands*\n\n` +
				`/mystatus\n` +
				`  View your complete user profile including role, whitelist/blacklist status, warnings, active jails, and current restrictions\\.\n\n` +
				`/jails\n` +
				`  View all currently jailed users, their jail duration, remaining time, and bail amounts\\.\n\n` +
				`/violations\n` +
				`  View your violation history including fines, payment status, and violation reasons\\.`
			);

		case "payments":
			return (
				`*Payment Commands*\n\n` +
				`/payfine \\<id\\>\n` +
				`  Pay a specific fine by its violation ID\\. Deducts the fine amount from your wallet balance\\.\n\n` +
				`/payallfines\n` +
				`  Pay all your outstanding unpaid fines at once\\. Shows total amount before confirmation\\.\n\n` +
				`/paybail\n` +
				`  Pay your bail amount to immediately get unjailed\\. Requires sufficient wallet balance\\.`
			);

		case "elevated":
			if (role !== "elevated" && role !== "admin" && role !== "owner") {
				return null;
			}
			return (
				`*Elevated Commands*\n\n` +
				`/viewactions\n` +
				`  View all currently active global restrictions \\(no stickers, no URLs, etc\\) applied to the chat\\.\n\n` +
				`/viewwhitelist\n` +
				`  Display all users on the whitelist who are exempt from certain automated restrictions\\.\n\n` +
				`/viewblacklist\n` +
				`  Display all blacklisted users and their blacklist reasons\\.\n\n` +
				`/jailstats\n` +
				`  View comprehensive jail statistics including total jails, active jails, average duration, and bail revenue\\.\n\n` +
				`/createshared \\<name\\>\n` +
				`  Create a new shared account that multiple users can access\\. You become the initial admin with full permissions\\.\n\n` +
				`/listshared\n` +
				`  View all shared accounts in the system, their balances, and admin information\\.`
			);

		case "admin":
			if (role !== "admin" && role !== "owner") {
				return null;
			}
			return (
				`*Admin Commands*\n\n` +
				`/jail \\<user\\> \\<minutes\\>\n` +
				`  Jail a user by removing chat permissions for the specified duration\\. User can pay bail to unjail early\\. Creates violation record\\.\n\n` +
				`/unjail \\<user\\>\n` +
				`  Immediately release a jailed user and restore their chat permissions\\. Does not refund bail if already paid\\.\n\n` +
				`/warn \\<user\\> \\<reason\\>\n` +
				`  Issue a formal warning to a user\\. Increments warning count and creates a violation record\\.\n\n` +
				`/elevate \\<user\\>\n` +
				`  Promote a user from 'pleb' to 'elevated' role, granting access to view commands and shared account creation\\.\n\n` +
				`/revoke \\<user\\>\n` +
				`  Demote an elevated user back to 'pleb' role, removing their elevated permissions\\.\n\n` +
				`/addrestriction \\<user\\> \\<type\\> \\[severity\\]\n` +
				`  Add a content restriction to a specific user\\. Types: no\\_stickers, no\\_urls, no\\_media, no\\_photos, no\\_videos, no\\_documents, no\\_gifs, no\\_voice, no\\_forwarding, regex\\_block\\. Severity levels: delete \\(default, just delete message\\), mute \\(30\\-min mute\\), jail \\(1\\-hour jail with fine\\)\\. Auto\\-escalation: After threshold violations \\(default 5\\), user gets auto\\-jailed for 2 days with 10 JUNO fine\\.\n\n` +
				`/regexhelp\n` +
				`  Display comprehensive examples for regex pattern restrictions\\. Shows common use cases like blocking spam, phone numbers, crypto addresses, and more\\.\n\n` +
				`/listrestrictions \\<user\\>\n` +
				`  View all active restrictions for a user including severity levels, violation thresholds, and auto\\-jail settings\\.\n\n` +
				`/removerestriction \\<user\\> \\<type\\>\n` +
				`  Remove a specific content restriction from a user, restoring their ability to post that content type\\.\n\n` +
				`/addblacklist \\<user\\>\n` +
				`  Add a user to the blacklist, applying stricter automated moderation and restrictions\\.\n\n` +
				`/removeblacklist \\<user\\>\n` +
				`  Remove a user from the blacklist, restoring normal moderation rules\\.`
			);

		case "owner":
			if (role !== "owner") {
				return null;
			}
			return (
				`*Owner Commands*\n\n` +
				`/makeadmin \\<user\\>\n` +
				`  Promote a user to admin role, granting full moderation powers including jailing, restrictions, and role management\\.\n\n` +
				`/grantowner \\<user\\>\n` +
				`  Grant owner role to another user\\. This gives complete system access including treasury, statistics, and user management\\.\n\n` +
				`/treasury\n` +
				`  View the bot treasury balance\\. This is the central fund for system operations and collected fees\\.\n\n` +
				`/giveaway\n` +
				`  View the giveaway pool balance\\. This account holds funds for community giveaways and rewards\\.\n\n` +
				`/reconcile\n` +
				`  Manually trigger balance reconciliation between internal ledger and on\\-chain wallet\\. Identifies and reports discrepancies\\.\n\n` +
				`/stats\n` +
				`  View comprehensive bot statistics including user counts, transaction volumes, jail metrics, and system health\\.\n\n` +
				`/walletstats\n` +
				`  View detailed wallet statistics including total balances, user distribution, system account balances, and transaction counts\\.\n\n` +
				`/unclaimeddeposits\n` +
				`  List all deposits that arrived without a valid user memo\\. These funds are held in the UNCLAIMED account\\.\n\n` +
				`/processdeposit \\<txhash\\> \\<userid\\>\n` +
				`  Manually process an unclaimed deposit by assigning it to a specific user ID\\. Moves funds from UNCLAIMED to user account\\.`
			);

		default:
			return null;
	}
}
