/**
 * Giveaway command handlers for the CAC Admin Bot.
 * Provides admin commands for checking wallet balances, distributing giveaways,
 * and viewing treasury and ledger status.
 *
 * @module commands/giveaway
 */

import type { Context, Telegraf } from "telegraf";
import { config } from "../config";
import { ownerOnly } from "../middleware/index";
import { UnifiedWalletService } from "../services/unifiedWalletService";
import { logger, StructuredLogger } from "../utils/logger";

/**
 * Registers all giveaway-related commands with the bot.
 *
 * Commands registered:
 * - /balance - Check bot wallet balance (admin only)
 * - /giveaway - Send tokens to a user (admin only)
 * - /treasury - View treasury and ledger status (admin only)
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerGiveawayCommands } from './commands/giveaway';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerGiveawayCommands(bot);
 * ```
 */
export function registerGiveawayCommands(bot: Telegraf<Context>): void {
	/**
	 * Command: /botbalance
	 * Check the bot's on-chain wallet balance.
	 *
	 * Permission: Owner only
	 * Syntax: /botbalance
	 *
	 * @example
	 * User: /botbalance
	 * Bot: Bot Wallet Balance
	 *      Address: `juno1...`
	 *      Balance: *123.456789 JUNO*
	 */
	bot.command("botbalance", ownerOnly, async (ctx) => {
		try {
			const balance = await UnifiedWalletService.getBotBalance();

			if (!balance) {
				return ctx.reply(" Unable to fetch wallet balance.");
			}

			await ctx.reply(
				` *Bot Wallet Balance*\n\n` +
					`Address: \`${config.botTreasuryAddress}\`\n` +
					`Balance: *${balance.toFixed(6)} JUNO*`,
				{ parse_mode: "Markdown" },
			);
		} catch (error) {
			logger.error("Error fetching balance", error);
			await ctx.reply(" Error fetching wallet balance.");
		}
	});

	/**
	 * Command: /giveaway
	 * Distribute JUNO tokens to a user's internal balance.
	 *
	 * Permission: Admin or higher
	 * Syntax: /giveaway <@username|userId> <amount>
	 *
	 * Note: This credits the user's internal ledger balance. The bot treasury
	 * (on-chain balance) is separate and used for backing withdrawals.
	 *
	 * @example
	 * User: /giveaway @alice 10.5
	 * Bot: Giveaway Sent!
	 *      Recipient: @alice (123456)
	 *      Amount: 10.500000 JUNO
	 *      Tokens have been credited to the user's internal balance.
	 *
	 * @example
	 * User: /giveaway 123456789 5
	 * Bot: Giveaway Sent!
	 *      Recipient: 123456789 (123456789)
	 *      Amount: 5.000000 JUNO
	 */
	bot.command("giveaway", ownerOnly, async (ctx) => {
		const args = ctx.message?.text.split(" ").slice(1);

		if (!args || args.length < 2) {
			return ctx.reply(
				" *Giveaway Command*\n\n" +
					"Usage: `/giveaway <@username|userId> <amount>`\n\n" +
					"Example: `/giveaway @alice 10.5`\n" +
					"Example: `/giveaway 123456789 5`",
				{ parse_mode: "Markdown" },
			);
		}

		const identifier = args[0];
		const amount = parseFloat(args[1]);

		if (Number.isNaN(amount) || amount <= 0) {
			return ctx.reply(" Invalid amount. Must be a positive number.");
		}

		try {
			// Resolve userId from identifier
			let targetUserId: number;
			if (/^\d+$/.test(identifier)) {
				// Direct userId
				targetUserId = parseInt(identifier, 10);
			} else {
				// Username lookup
				const username = identifier.startsWith("@")
					? identifier.substring(1)
					: identifier;
				const { query } = await import("../database");
				type UserRecord = { id: number };
				const user = query<UserRecord>(
					"SELECT id FROM users WHERE username = ?",
					[username],
				)[0];

				if (!user) {
					return ctx.reply(
						` User ${identifier} not found. They must have interacted with the bot first.`,
					);
				}
				targetUserId = user.id;
			}

			// NOTE: This credits the user's internal balance in the ledger system.
			// The bot treasury (on-chain balance) is separate and used for backing withdrawals.
			// Future enhancement: Transfer from treasury to userFunds wallet to back these credits.

			// Distribute giveaway using internal ledger
			const result = await UnifiedWalletService.distributeGiveaway(
				[targetUserId],
				amount,
				`Giveaway from admin ${ctx.from?.username || ctx.from?.id}`,
			);

			if (result.succeeded.length > 0) {
				await ctx.reply(
					` *Giveaway Sent!*\n\n` +
						`Recipient: ${identifier} (${targetUserId})\n` +
						`Amount: ${amount.toFixed(6)} JUNO\n\n` +
						` Tokens have been credited to the user's internal balance.\n` +
						`They can check their balance with /mybalance`,
					{ parse_mode: "Markdown" },
				);

				StructuredLogger.logUserAction("Giveaway completed", {
					userId: ctx.from?.id,
					username: ctx.from?.username,
					operation: "giveaway",
					targetUserId: targetUserId,
					amount: amount.toString(),
					recipient: identifier,
				});
			} else {
				await ctx.reply(
					` *Giveaway Failed*\n\n` +
						`Unable to credit user ${identifier} (${targetUserId})\n\n` +
						`Please check logs or try again later.`,
					{ parse_mode: "Markdown" },
				);
			}
		} catch (error) {
			logger.error("Error processing giveaway", error);
			await ctx.reply(" Error processing giveaway.");
		}
	});

	/**
	 * Command: /treasury
	 * View comprehensive treasury and internal ledger status.
	 *
	 * Permission: Admin or higher
	 * Syntax: /treasury
	 *
	 * Displays:
	 * - On-chain treasury wallet address and balance
	 * - Internal ledger statistics (user balances, fines, bail collected)
	 * - Explanation of dual system (treasury vs ledger)
	 *
	 * @example
	 * User: /treasury
	 * Bot: Treasury & Ledger Status
	 *
	 *      On-Chain Treasury Wallet:
	 *      Address: `juno1...`
	 *      Balance: *1000.000000 JUNO*
	 *      Purpose: Receives bail/fine payments via on-chain transfers
	 *
	 *      Internal Ledger System:
	 *      Total User Balances: `500.000000 JUNO`
	 *      Fines Collected: `50.000000 JUNO`
	 *      Bail Collected: `100.000000 JUNO`
	 */
	bot.command("treasury", ownerOnly, async (ctx) => {
		try {
			// On-chain treasury balance
			const treasuryBalance = await UnifiedWalletService.getBotBalance();
			const treasuryAddress = config.botTreasuryAddress;

			// Internal ledger statistics
			const { query } = await import("../database");
			type CollectedTotal = { total: number | null };

			const finesResult = query<CollectedTotal>(
				"SELECT SUM(amount) as total FROM transactions WHERE transaction_type = ? AND status = ?",
				["fine", "completed"],
			);
			const totalFines = finesResult[0]?.total || 0;

			const bailResult = query<CollectedTotal>(
				"SELECT SUM(amount) as total FROM transactions WHERE transaction_type = ? AND status = ?",
				["bail", "completed"],
			);
			const totalBail = bailResult[0]?.total || 0;

			// Get internal ledger total (all user balances)
			const internalBalances = query<{ total: number | null }>(
				"SELECT SUM(balance) as total FROM user_balances",
			);
			const totalUserBalances = internalBalances[0]?.total || 0;

			await ctx.reply(
				`Treasury & Ledger Status\n\n` +
					`On-Chain Treasury Wallet:\n` +
					`Address: ${treasuryAddress}\n` +
					`Balance: ${treasuryBalance?.toFixed(6) || "0"} JUNO\n` +
					`Purpose: Receives bail/fine payments via on-chain transfers\n\n` +
					`Internal Ledger System:\n` +
					`Total User Balances: ${totalUserBalances.toFixed(6)} JUNO\n` +
					`Fines Collected: ${totalFines.toFixed(6)} JUNO - deducted from users\n` +
					`Bail Collected: ${totalBail.toFixed(6)} JUNO - deducted from users\n\n` +
					`Note: Treasury and ledger are separate systems.\n` +
					`• Treasury: On-chain wallet for direct payments\n` +
					`• Ledger: Internal accounting for user balances\n\n` +
					`Use /giveaway to distribute funds\n` +
					`Use /walletstats for detailed reconciliation`,
			);
		} catch (error) {
			logger.error("Error fetching treasury info", error);
			await ctx.reply(" Error fetching treasury information.");
		}
	});
}
