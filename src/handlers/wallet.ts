/**
 * Wallet and ledger management handlers for the CAC Admin Bot.
 * Provides a complete internal ledger system with JUNO token management,
 * including deposits, withdrawals, internal transfers, and administrative functions.
 *
 * Features:
 * - Internal ledger tracking with user balances
 * - Deposit monitoring with unique memos
 * - Withdrawals to external Juno addresses
 * - Internal transfers between users
 * - Transaction history tracking
 * - Admin giveaway functionality
 * - Balance reconciliation and system statistics
 *
 * @module handlers/wallet
 */

import type { Context } from "telegraf";
import { config } from "../config";
import { UnifiedWalletService } from "../services/unifiedWalletService";
import { logger, StructuredLogger } from "../utils/logger";
import { checkIsElevated } from "../utils/roles";

/**
 * Handles the /balance command.
 * Displays the user's current internal ledger balance in JUNO tokens.
 *
 * Permission: All users (can only view their own balance)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /balance
 */
export async function handleBalance(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;
		if (!userId) return;

		const balance = await UnifiedWalletService.getBalance(userId);
		const username = ctx.from.username
			? `@${ctx.from.username}`
			: `User ${userId}`;

		await ctx.reply(
			` *Balance for ${username}*\n\n` +
				`Current balance: \`${balance.toFixed(6)} JUNO\``,
			{ parse_mode: "Markdown" },
		);

		StructuredLogger.logUserAction("Balance queried", {
			userId,
			username: ctx.from.username,
			operation: "check_balance",
			amount: balance.toFixed(6),
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "check_balance",
		});
		await ctx.reply("Failed to fetch balance");
	}
}

/**
 * Handles the /deposit command.
 * Displays deposit instructions with a unique address and memo for the user.
 * Deposits are automatically credited when the transaction is confirmed on-chain.
 *
 * Permission: All users
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /deposit
 */
export async function handleDeposit(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;
		if (!userId) return;

		const depositInfo = UnifiedWalletService.getDepositInstructions(userId);

		// Send warning sticker first
		const CACGIFS_SATELLITE_STICKER =
			"CAACAgIAAxkBAAICIGkIxVYID2ee6Z3t3fzMKGyrzCLlAAJmNgACfvIoSL_cdmEGklS0NgQ";
		try {
			await ctx.replyWithSticker(CACGIFS_SATELLITE_STICKER);
		} catch (stickerError) {
			logger.warn("Failed to send warning sticker", {
				userId,
				error: stickerError,
			});
			// Continue even if sticker fails
		}

		// Send experimental warning
		await ctx.reply(
			`⚠️ *EXPERIMENTAL SOFTWARE WARNING* ⚠️\n\n` +
				`This bot is **highly experimental** and under active development.\n\n` +
				`**DO NOT deposit funds you are not prepared to immediately lose.**\n\n` +
				`By depositing, you acknowledge:\n` +
				`• This software may contain bugs\n` +
				`• Funds may be irretrievably lost\n` +
				`• No guarantees or warranties are provided\n` +
				`• You use this service entirely at your own risk\n\n` +
				`If you understand and accept these risks, proceed with deposit instructions below.`,
			{ parse_mode: "Markdown" },
		);

		await ctx.reply(
			` *Deposit Instructions*\n\n` +
				`To deposit JUNO to your account:\n\n` +
				`1⃣ Send JUNO to this address:\n` +
				`\`${depositInfo.address}\`\n\n` +
				`2⃣ **IMPORTANT**: Include this memo:\n` +
				`\`${depositInfo.memo}\`\n\n` +
				` *Your memo is unique to you and will never change*\n` +
				` *Deposits without the correct memo cannot be credited*\n\n` +
				`Your deposit will be credited automatically once confirmed on-chain.`,
			{ parse_mode: "Markdown" },
		);

		StructuredLogger.logUserAction("Deposit instructions requested", {
			userId,
			username: ctx.from.username,
			operation: "request_deposit",
			depositAddress: depositInfo.address,
			depositMemo: depositInfo.memo,
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "request_deposit",
		});
		await ctx.reply("Failed to generate deposit info");
	}
}

/**
 * Handles the /withdraw command.
 * Processes a withdrawal from the user's internal balance to an external Juno address.
 * Validates balance sufficiency and address format before processing.
 *
 * Permission: All users (can only withdraw from their own balance)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /withdraw <amount> <juno_address>
 * Example: /withdraw 10 juno1abc123xyz...
 */
export async function handleWithdraw(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;
		if (!userId) return;

		const text = (ctx.message as any)?.text || "";
		const args = text.split(" ").slice(1);

		if (args.length < 2) {
			await ctx.reply(
				" *Invalid format*\n\n" +
					"Usage: `/withdraw <amount> <juno_address>`\n" +
					"Example: `/withdraw 10 juno1xxxxx...`",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		const amount = parseFloat(args[0]);
		const address = args[1];

		if (Number.isNaN(amount) || amount <= 0) {
			await ctx.reply(" Invalid amount. Please enter a positive number.");
			return;
		}

		if (!address.startsWith("juno1")) {
			await ctx.reply(
				' Invalid Juno address. Address must start with "juno1".',
			);
			return;
		}

		// Check balance first
		const balance = await UnifiedWalletService.getBalance(userId);
		if (balance < amount) {
			await ctx.reply(
				` *Insufficient balance*\n\n` +
					`Requested: \`${amount} JUNO\`\n` +
					`Available: \`${balance.toFixed(6)} JUNO\``,
				{ parse_mode: "Markdown" },
			);
			return;
		}

		// Process withdrawal
		await ctx.reply(" Processing withdrawal...");

		const result = await UnifiedWalletService.processWithdrawal(
			userId,
			address,
			amount,
		);

		if (result.success) {
			StructuredLogger.logTransaction("Withdrawal successful", {
				userId,
				username: ctx.from.username,
				operation: "withdrawal",
				amount: amount.toString(),
				txHash: result.txHash,
				toAddress: address,
			});

			await ctx.reply(
				` *Withdrawal Successful*\n\n` +
					`Amount: \`${amount} JUNO\`\n` +
					`To: \`${address}\`\n` +
					`New Balance: \`${result.newBalance?.toFixed(6)} JUNO\`\n` +
					(result.txHash ? `\nTransaction: \`${result.txHash}\`` : ""),
				{ parse_mode: "Markdown" },
			);
		} else {
			StructuredLogger.logError(`Withdrawal failed: ${result.error}`, {
				userId,
				operation: "withdrawal",
				amount: amount.toString(),
				toAddress: address,
			});

			await ctx.reply(
				` *Withdrawal Failed*\n\n` +
					`Error: ${result.error}\n` +
					`Balance: \`${result.newBalance?.toFixed(6)} JUNO\``,
				{ parse_mode: "Markdown" },
			);
		}
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "withdrawal",
			amount: undefined,
		});
		await ctx.reply("Withdrawal failed");
	}
}

/**
 * Handles the /send command.
 * Sends JUNO tokens to another user (internal transfer) or to an external address.
 * Supports three recipient formats: @username, user ID, or juno1... address.
 *
 * Permission: All users (can only send from their own balance)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /send <amount> <recipient>
 * Example: /send 5 @alice (internal transfer)
 * Example: /send 10 123456789 (internal transfer by ID)
 * Example: /send 2.5 juno1abc... (external transfer)
 */
export async function handleSend(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;
		if (!userId) return;

		const text = (ctx.message as any)?.text || "";
		const args = text.split(" ").slice(1);

		if (args.length < 2) {
			await ctx.reply(
				" *Invalid format*\n\n" +
					"Usage: `/send <amount> <recipient>`\n" +
					"Recipient can be:\n" +
					"• @username (internal transfer)\n" +
					"• User ID (internal transfer)\n" +
					"• juno1xxx... (external transfer)\n\n" +
					"Examples:\n" +
					"`/send 5 @alice`\n" +
					"`/send 10 123456789`\n" +
					"`/send 2.5 juno1xxxxx...`",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		const amount = parseFloat(args[0]);
		const recipient = args[1];

		if (Number.isNaN(amount) || amount <= 0) {
			await ctx.reply(" Invalid amount. Please enter a positive number.");
			return;
		}

		// Check sender's balance
		const balance = await UnifiedWalletService.getBalance(userId);
		if (balance < amount) {
			await ctx.reply(
				` *Insufficient balance*\n\n` +
					`Requested: \`${amount} JUNO\`\n` +
					`Available: \`${balance.toFixed(6)} JUNO\``,
				{ parse_mode: "Markdown" },
			);
			return;
		}

		// Determine recipient type and process
		if (recipient.startsWith("juno1")) {
			// External transfer
			await ctx.reply(" Processing external transfer...");

			const result = await UnifiedWalletService.processWithdrawal(
				userId,
				recipient,
				amount,
			);

			if (result.success) {
				StructuredLogger.logTransaction("External transfer successful", {
					userId,
					username: ctx.from.username,
					operation: "external_transfer",
					amount: amount.toString(),
					txHash: result.txHash,
					toAddress: recipient,
				});

				await ctx.reply(
					` *External Transfer Successful*\n\n` +
						`Amount: \`${amount} JUNO\`\n` +
						`To: \`${recipient}\`\n` +
						`New Balance: \`${result.newBalance?.toFixed(6)} JUNO\`\n` +
						(result.txHash ? `\nTransaction: \`${result.txHash}\`` : ""),
					{ parse_mode: "Markdown" },
				);
			} else {
				StructuredLogger.logError(`External transfer failed: ${result.error}`, {
					userId,
					operation: "external_transfer",
					amount: amount.toString(),
					recipient,
				});

				await ctx.reply(` *Transfer Failed*\n\n` + `Error: ${result.error}`, {
					parse_mode: "Markdown",
				});
			}
		} else if (recipient.startsWith("@")) {
			// Internal transfer by username
			await ctx.reply(" Processing internal transfer...");

			const result = await UnifiedWalletService.sendToUsername(
				userId,
				recipient,
				amount,
				undefined,
				ctx, // Pass context for username resolution
			);

			if (result.success) {
				StructuredLogger.logTransaction(
					"Internal transfer by username successful",
					{
						userId,
						username: ctx.from.username,
						operation: "internal_transfer",
						amount: amount.toString(),
						recipient: result.recipient,
					},
				);

				await ctx.reply(
					` *Transfer Successful*\n\n` +
						`Amount: \`${amount} JUNO\`\n` +
						`To: @${result.recipient}\n` +
						`Your New Balance: \`${result.fromBalance?.toFixed(6)} JUNO\``,
					{ parse_mode: "Markdown" },
				);
			} else {
				StructuredLogger.logError(`Internal transfer failed: ${result.error}`, {
					userId,
					operation: "internal_transfer",
					amount: amount.toString(),
					recipient,
				});

				await ctx.reply(` *Transfer Failed*\n\n` + `Error: ${result.error}`, {
					parse_mode: "Markdown",
				});
			}
		} else if (/^\d+$/.test(recipient)) {
			// Internal transfer by userId
			const recipientId = parseInt(recipient, 10);

			if (recipientId === userId) {
				await ctx.reply(" You cannot send tokens to yourself.");
				return;
			}

			await ctx.reply(" Processing internal transfer...");

			const result = await UnifiedWalletService.transferToUser(
				userId,
				recipientId,
				amount,
			);

			if (result.success) {
				StructuredLogger.logTransaction(
					"Internal transfer by user ID successful",
					{
						userId,
						username: ctx.from.username,
						operation: "internal_transfer",
						amount: amount.toString(),
						recipientId: recipientId.toString(),
					},
				);

				await ctx.reply(
					` *Transfer Successful*\n\n` +
						`Amount: \`${amount} JUNO\`\n` +
						`To: User ${recipientId}\n` +
						`Your New Balance: \`${result.fromBalance?.toFixed(6)} JUNO\``,
					{ parse_mode: "Markdown" },
				);
			} else {
				StructuredLogger.logError(`Internal transfer failed: ${result.error}`, {
					userId,
					operation: "internal_transfer",
					amount: amount.toString(),
					recipientId: recipientId.toString(),
				});

				await ctx.reply(` *Transfer Failed*\n\n` + `Error: ${result.error}`, {
					parse_mode: "Markdown",
				});
			}
		} else {
			await ctx.reply(
				" Invalid recipient format. Use @username, user ID, or juno1xxx... address.",
			);
		}
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "send_tokens",
		});
		await ctx.reply("Transfer failed");
	}
}

/**
 * Handles the /transactions command.
 * Displays the user's recent transaction history (last 10 transactions).
 * Shows deposits, withdrawals, transfers, fines, and giveaways.
 *
 * Permission: All users (can view their own transactions)
 *             Owners only (can view any user's transactions by specifying userId)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /transactions (view your own transactions)
 * Usage: /transactions <userId> (owners only - view specific user's transactions)
 */
export async function handleTransactions(ctx: Context): Promise<void> {
	try {
		const requesterId = ctx.from?.id;
		if (!requesterId) return;

		// Parse arguments
		const text = (ctx.message as any)?.text || "";
		const args = text.split(" ").slice(1);

		// Check if requester is owner
		const isOwner = config.ownerIds.includes(requesterId);

		// Determine which user's transactions to fetch
		let targetUserId = requesterId;
		if (args.length > 0) {
			const specifiedUserId = parseInt(args[0], 10);

			if (!isOwner) {
				await ctx.reply(
					"Only owners can view other users' transaction history.",
				);
				return;
			}

			if (Number.isNaN(specifiedUserId)) {
				await ctx.reply("Invalid user ID. Please provide a numeric user ID.");
				return;
			}

			targetUserId = specifiedUserId;
		}

		const transactions = await UnifiedWalletService.getTxHistory(
			targetUserId,
			10,
		);

		if (transactions.length === 0) {
			const userDisplay =
				targetUserId === requesterId ? "You have" : `User ${targetUserId} has`;
			await ctx.reply(`${userDisplay} no transaction history yet.`);
			return;
		}

		let message =
			targetUserId === requesterId
				? "*Recent Transactions*\n\n"
				: `*Transaction History for User ${targetUserId}*\n\n`;

		for (const tx of transactions) {
			const date = new Date((tx.created_at || 0) * 1000).toLocaleString();
			const type = tx.transaction_type.toUpperCase();
			const amount = tx.amount.toFixed(6);

			let description = "";
			switch (tx.transaction_type) {
				case "deposit":
					description = `+${amount} JUNO (Deposit)`;
					break;
				case "withdrawal":
					description = `-${amount} JUNO (Withdrawal)`;
					break;
				case "transfer":
					if (tx.from_user_id === targetUserId) {
						description = `-${amount} JUNO (Sent)`;
					} else {
						description = `+${amount} JUNO (Received)`;
					}
					break;
				case "fine":
					description = `-${amount} JUNO (Fine)`;
					break;
				case "bail":
					description = `-${amount} JUNO (Bail)`;
					break;
				case "giveaway":
					description = `+${amount} JUNO (Giveaway)`;
					break;
				default:
					description = `${amount} JUNO (${type})`;
			}

			message += `[${date}]\n`;
			message += `Type: ${type}\n`;
			message += `Amount: ${description}\n`;

			if (tx.status && tx.status !== "completed") {
				message += `Status: ${tx.status.toUpperCase()}\n`;
			}

			if (tx.tx_hash) {
				message += `TX Hash: \`${tx.tx_hash}\`\n`;
			}

			if (tx.external_address) {
				message += `Address: \`${tx.external_address}\`\n`;
			}

			if (tx.description) {
				message += `Note: ${tx.description}\n`;
			}

			message += "\n";
		}

		await ctx.reply(message, { parse_mode: "Markdown" });

		StructuredLogger.logUserAction("Transaction history queried", {
			userId: requesterId,
			username: ctx.from.username,
			operation: "view_transactions",
			targetUserId: targetUserId,
			transactionCount: transactions.length.toString(),
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "view_transactions",
		});
		await ctx.reply("Failed to fetch history");
	}
}

/**
 * Handles the /walletstats command.
 * Displays comprehensive system wallet statistics including balances,
 * ledger statistics, and reconciliation status.
 *
 * Permission: Elevated users only (admin/owner)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /walletstats
 */
export async function handleWalletStats(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;

		// Check if user is elevated
		if (!userId || !checkIsElevated(userId)) {
			await ctx.reply(" This command requires elevated permissions.");
			return;
		}

		await ctx.reply(" Fetching wallet statistics...");

		const systemBalances = await UnifiedWalletService.getSystemBalances();
		const ledgerStats = await UnifiedWalletService.getLedgerStats();
		const reconciliation = await UnifiedWalletService.reconcileBalances();

		let message = " *Wallet System Statistics*\n\n";

		message += "*System Wallets:*\n";
		message += `Treasury: \`${systemBalances.treasury.toFixed(6)} JUNO\`\n`;
		message += `Reserve: \`${systemBalances.reserve.toFixed(6)} JUNO\`\n`;
		message += `Unclaimed: \`${systemBalances.unclaimed.toFixed(6)} JUNO\`\n\n`;

		message += "*Ledger Statistics:*\n";
		message += `Total Users: ${ledgerStats.totalUsers}\n`;
		message += `Active Users: ${ledgerStats.activeUsers}\n`;
		message += `Total Balance (Internal): \`${ledgerStats.totalBalance.toFixed(6)} JUNO\`\n`;
		message += `24h Deposits: ${ledgerStats.recentDeposits}\n`;
		message += `24h Withdrawals: ${ledgerStats.recentWithdrawals}\n\n`;

		message += "*Reconciliation:*\n";
		message += `Internal Total: \`${reconciliation.internalTotal.toFixed(6)} JUNO\`\n`;
		message += `On-chain Total: \`${reconciliation.onChainTotal.toFixed(6)} JUNO\`\n`;
		message += `Difference: \`${reconciliation.difference.toFixed(6)} JUNO\`\n`;
		message += `Status: ${reconciliation.matched ? " Balanced" : " Mismatch"}\n`;

		await ctx.reply(message, { parse_mode: "Markdown" });

		StructuredLogger.logUserAction("Wallet statistics viewed", {
			userId,
			operation: "view_wallet_stats",
			treasuryBalance: systemBalances.treasury.toFixed(6),
			reserveBalance: systemBalances.reserve.toFixed(6),
			unclaimedBalance: systemBalances.unclaimed.toFixed(6),
			internalTotal: ledgerStats.totalBalance.toFixed(6),
			reconciled: reconciliation.matched.toString(),
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "view_wallet_stats",
		});
		await ctx.reply("Failed to fetch stats");
	}
}

/**
 * Handles the /giveaway command.
 * Distributes a specified amount of JUNO to multiple users from the treasury.
 * Only elevated users can perform giveaways.
 *
 * Permission: Elevated users only (admin/owner)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /giveaway <amount> <@user1> <@user2> ...
 * Example: /giveaway 5 @alice @bob @charlie
 */
export async function handleGiveaway(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;

		// Check if user is elevated
		if (!userId || !checkIsElevated(userId)) {
			await ctx.reply(" This command requires elevated permissions.");
			return;
		}

		const text = (ctx.message as any)?.text || "";
		const args = text.split(" ").slice(1);

		if (args.length < 2) {
			await ctx.reply(
				" *Invalid format*\n\n" +
					"Usage: `/giveaway <amount> <@user1> <@user2> ...`\n" +
					"Example: `/giveaway 5 @alice @bob @charlie`",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		const amount = parseFloat(args[0]);
		if (Number.isNaN(amount) || amount <= 0) {
			await ctx.reply(" Invalid amount. Please enter a positive number.");
			return;
		}

		const recipients = args.slice(1);
		const userIds: number[] = [];

		// Resolve usernames to userIds
		for (const recipient of recipients) {
			if (recipient.startsWith("@")) {
				const user = await UnifiedWalletService.findUserByUsername(recipient);
				if (user) {
					userIds.push(user.id);
				} else {
					await ctx.reply(` User ${recipient} not found, skipping...`);
				}
			} else if (/^\d+$/.test(recipient)) {
				userIds.push(parseInt(recipient, 10));
			}
		}

		if (userIds.length === 0) {
			await ctx.reply(" No valid recipients found.");
			return;
		}

		await ctx.reply(
			` Distributing ${amount} JUNO to ${userIds.length} users...`,
		);

		const result = await UnifiedWalletService.distributeGiveaway(
			userIds,
			amount,
			`Giveaway from admin`,
		);

		await ctx.reply(
			` *Giveaway Complete*\n\n` +
				`Amount per user: \`${amount} JUNO\`\n` +
				`Successful: ${result.succeeded.length}\n` +
				`Failed: ${result.failed.length}\n` +
				`Total distributed: \`${result.totalDistributed.toFixed(6)} JUNO\``,
			{ parse_mode: "Markdown" },
		);

		StructuredLogger.logTransaction("Giveaway distributed", {
			userId,
			username: ctx.from.username,
			operation: "giveaway",
			amount: amount.toString(),
			recipients: userIds.length.toString(),
			totalDistributed: result.totalDistributed.toFixed(6),
			succeeded: result.succeeded.length.toString(),
			failed: result.failed.length.toString(),
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "giveaway",
		});
		await ctx.reply("Giveaway failed");
	}
}

/**
 * Handles the /checkdeposit command.
 * Manually checks and credits a specific deposit transaction by hash.
 * Useful for troubleshooting missed deposits or verifying transactions.
 *
 * Permission: All users (can check any transaction)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /checkdeposit <tx_hash>
 * Example: /checkdeposit ABCD1234567890...
 */
export async function handleCheckDeposit(ctx: Context): Promise<void> {
	try {
		const userId = ctx.from?.id;
		if (!userId) return;

		const text = (ctx.message as any)?.text || "";
		const args = text.split(" ").slice(1);

		if (args.length < 1) {
			await ctx.reply(
				" *Invalid format*\n\n" +
					"Usage: `/checkdeposit <tx_hash>`\n" +
					"Example: `/checkdeposit ABCD1234...`",
				{ parse_mode: "Markdown" },
			);
			return;
		}

		const txHash = args[0];

		await ctx.reply(" Checking transaction...");

		// Use UnifiedWalletService to verify transaction
		const result = await UnifiedWalletService.verifyTransaction(txHash);

		if (!result.verified) {
			await ctx.reply(" Transaction not found on-chain or invalid.");
			return;
		}

		// Check if transaction was already processed
		const { get } = await import("../database");
		const processedDeposit = get<any>(
			"SELECT * FROM processed_deposits WHERE tx_hash = ?",
			[txHash],
		);

		const recipientUserId = result.memo ? parseInt(result.memo, 10) : null;

		if (processedDeposit) {
			await ctx.reply(
				` *Transaction Already Processed*\n\n` +
					`From: \`${result.from}\`\n` +
					`Amount: \`${result.amount} JUNO\`\n` +
					(recipientUserId ? `User ID: ${recipientUserId}\n` : "") +
					(result.memo ? `Memo: ${result.memo}\n` : "") +
					`Processed: `,
				{ parse_mode: "Markdown" },
			);
		} else {
			await ctx.reply(
				` *Transaction Found*\n\n` +
					`From: \`${result.from}\`\n` +
					`Amount: \`${result.amount} JUNO\`\n` +
					(recipientUserId
						? `Recipient User ID: ${recipientUserId}\n`
						: "No valid user ID in memo\n") +
					(result.memo ? `Memo: ${result.memo}\n` : "No memo\n") +
					`Status: Pending processing`,
				{ parse_mode: "Markdown" },
			);
		}

		StructuredLogger.logTransaction("Manual deposit check", {
			userId,
			txHash,
			operation: "check_deposit",
			amount: result.amount?.toString(),
			processed: !!processedDeposit,
		});
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "check_deposit",
			txHash: undefined,
		});
		await ctx.reply("Failed to check deposit");
	}
}

/**
 * Handles the /reconcile command.
 * Manually triggers a balance reconciliation check between the internal ledger
 * and on-chain wallet balances. Alerts if there's a mismatch.
 *
 * Permission: Elevated users only (admin/owner)
 *
 * @param ctx - Telegraf context
 *
 * @example
 * Usage: /reconcile
 */
export async function handleReconcile(ctx: Context): Promise<void> {
	try {
		await ctx.reply(" Running balance reconciliation...");

		// Import LedgerService here to avoid circular dependencies
		const { LedgerService } = await import("../services/ledgerService");
		const result = await LedgerService.reconcileAndAlert();

		await ctx.reply(
			` *Balance Reconciliation Results*\n\n` +
				`Internal Ledger Total: \`${result.internalTotal.toFixed(6)} JUNO\`\n` +
				`User Funds On-Chain: \`${result.onChainTotal.toFixed(6)} JUNO\`\n` +
				`Difference: \`${result.difference.toFixed(6)} JUNO\`\n\n` +
				`Status: ${result.matched ? " Balanced" : " MISMATCH"}`,
			{ parse_mode: "Markdown" },
		);

		StructuredLogger.logUserAction("Balance reconciliation triggered", {
			userId: ctx.from?.id,
			operation: "reconcile_balances",
			internalTotal: result.internalTotal.toFixed(6),
			onChainTotal: result.onChainTotal.toFixed(6),
			difference: result.difference.toFixed(6),
			matched: result.matched.toString(),
		});

		if (!result.matched) {
			StructuredLogger.logSecurityEvent("Balance mismatch detected", {
				userId: ctx.from?.id,
				operation: "reconcile_balances",
				internalTotal: result.internalTotal.toFixed(6),
				onChainTotal: result.onChainTotal.toFixed(6),
				difference: result.difference.toFixed(6),
			});
		}
	} catch (error) {
		StructuredLogger.logError(error as Error, {
			userId: ctx.from?.id,
			operation: "reconcile_balances",
		});
		await ctx.reply(" Failed to run reconciliation.");
	}
}
