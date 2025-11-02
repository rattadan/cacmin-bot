/**
 * Deposit command handlers for the CAC Admin Bot.
 * Provides commands for deposit instructions, verification, and unclaimed deposit management.
 *
 * @module commands/deposit
 */

import { Telegraf, Context } from 'telegraf';
import { UnifiedWalletService, SYSTEM_USER_IDS } from '../services/unifiedWalletService';
import { RPCTransactionVerification } from '../services/rpcTransactionVerification';
import { DepositInstructionService } from '../services/depositInstructions';
import { LedgerService } from '../services/ledgerService';
import { AmountPrecision } from '../utils/precision';
import { logger, StructuredLogger } from '../utils/logger';
import { get, query } from '../database';

/**
 * Registers all deposit-related commands with the bot.
 *
 * Commands registered:
 * - /deposit - Get deposit instructions with memo
 * - /verifydeposit - Verify a deposit by transaction hash
 * - /unclaimeddeposits - View unclaimed deposits (missing or invalid memo)
 * - /claimdeposit - Assign an unclaimed deposit to a user (admin only)
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerDepositCommands } from './commands/deposit';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerDepositCommands(bot);
 * ```
 */
export const registerDepositCommands = (bot: Telegraf<Context>) => {

  /**
   * Command: /deposit
   * Get deposit instructions with unique user memo.
   *
   * Permission: Any user
   * Syntax: /deposit
   *
   * @example
   * User: /deposit
   * Bot: Deposit Instructions
   *
   *      Send JUNO to:
   *      `juno1...`
   *
   *      IMPORTANT: Include this memo:
   *      `123456`
   *
   *      Without the correct memo, your deposit cannot be automatically credited.
   */
  bot.command('deposit', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const instructions = UnifiedWalletService.getDepositInstructions(userId);

      await ctx.reply(instructions.markdown, {
        parse_mode: 'Markdown'
      });

      // Send a follow-up reminder
      await ctx.reply(
        DepositInstructionService.getMemoReminder(userId),
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to generate deposit instructions', { userId, error });
      await ctx.reply('❌ Failed to generate deposit instructions');
    }
  });

  /**
   * Command: /verifydeposit
   * Verify and credit a deposit by providing the transaction hash.
   *
   * Permission: Any user
   * Syntax: /verifydeposit <transaction_hash>
   *
   * @example
   * User: /verifydeposit ABC123DEF456...
   * Bot: Deposit Confirmed!
   *
   *      Amount: 100.000000 JUNO
   *      From: juno1abc...
   *      Transaction: ABC123DEF456...
   *
   *      New balance: 100.000000 JUNO
   */
  bot.command('verifydeposit', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];

    if (args.length < 1) {
      return ctx.reply(
        '📝 **Usage**: /verifydeposit <transaction_hash>\n\n' +
        'Provide the transaction hash of your deposit to verify and credit it.',
        { parse_mode: 'Markdown' }
      );
    }

    const txHash = args[0].trim();

    await ctx.reply('🔍 Verifying transaction...');

    try {
      // Get wallet address
      const walletAddress = UnifiedWalletService.getDepositInstructions(userId).address;

      // Verify the deposit
      const verification = await RPCTransactionVerification.verifyDeposit(
        txHash,
        walletAddress,
        userId
      );

      if (!verification.valid) {
        return ctx.reply(
          `❌ **Deposit Verification Failed**\n\n` +
          `${verification.error}\n\n` +
          (verification.memo !== undefined ?
            `Memo found: \`${verification.memo || 'none'}\`\n` +
            `Expected: \`${userId}\`\n\n` : '') +
          `Please ensure:\n` +
          `• Transaction is confirmed on-chain\n` +
          `• Funds were sent to: \`${walletAddress}\`\n` +
          `• Memo was exactly: \`${userId}\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Check if already processed
      const existing = get<any>(
        'SELECT * FROM processed_deposits WHERE tx_hash = ?',
        [txHash]
      );

      if (existing && existing.processed) {
        return ctx.reply(
          `ℹ️ **Already Processed**\n\n` +
          `This deposit has already been credited.\n` +
          `Amount: \`${AmountPrecision.format(verification.amount!)} JUNO\`\n` +
          `From: \`${verification.sender}\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Process the deposit
      const result = await LedgerService.processDeposit(
        userId,
        verification.amount!,
        txHash,
        verification.sender!,
        `Manual deposit verification from ${verification.sender}`
      );

      if (result.success) {
        StructuredLogger.logTransaction('Deposit verified and credited', {
          userId,
          txHash,
          amount: verification.amount!.toString(),
          operation: 'deposit_verification'
        });

        await ctx.reply(
          DepositInstructionService.formatDepositConfirmation(
            userId,
            verification.amount!,
            txHash,
            result.newBalance
          ),
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ **Failed to credit deposit**\n\n` +
          `${result.error}\n\n` +
          `Please contact an admin for assistance.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Deposit verification failed', { userId, txHash, error });
      await ctx.reply(
        '❌ Failed to verify deposit. Please try again or contact an admin.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  /**
   * Command: /unclaimeddeposits
   * View deposits that could not be automatically credited due to missing or invalid memos.
   *
   * Permission: Any user
   * Syntax: /unclaimeddeposits
   *
   * @example
   * User: /unclaimeddeposits
   * Bot: Unclaimed Deposits
   *
   *      Total: `50.000000 JUNO`
   *
   *      Recent deposits without valid memo:
   *      • `ABC123...`
   *        Amount: 25.000000 JUNO
   *        Memo: "wrong_id"
   */
  bot.command('unclaimeddeposits', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      // Get unclaimed balance
      const unclaimedBalance = await LedgerService.getUserBalance(SYSTEM_USER_IDS.UNCLAIMED);

      if (unclaimedBalance === 0) {
        return ctx.reply('✅ No unclaimed deposits');
      }

      // Get recent unclaimed deposits
      const unclaimed = query<any>(
        `SELECT * FROM processed_deposits
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [SYSTEM_USER_IDS.UNCLAIMED]
      );

      let message = `💰 **Unclaimed Deposits**\n\n`;
      message += `Total: \`${AmountPrecision.format(unclaimedBalance)} JUNO\`\n\n`;

      if (unclaimed.length > 0) {
        message += `**Recent deposits without valid memo:**\n`;
        for (const deposit of unclaimed) {
          message += `• \`${deposit.tx_hash.substring(0, 10)}...\`\n`;
          message += `  Amount: ${AmountPrecision.format(deposit.amount)} JUNO\n`;
          message += `  Memo: "${deposit.memo || 'none'}"\n\n`;
        }
      }

      message += DepositInstructionService.getUnclaimedInstructions();

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to get unclaimed deposits', { userId, error });
      await ctx.reply('❌ Failed to retrieve unclaimed deposits');
    }
  });

  /**
   * Command: /claimdeposit
   * Manually assign an unclaimed deposit to a user (admin only).
   *
   * Permission: Admin or owner
   * Syntax: /claimdeposit <transaction_hash> <user_id>
   *
   * @example
   * User: /claimdeposit ABC123... 123456
   * Bot: Deposit Claimed
   *
   *      Amount: `25.000000 JUNO`
   *      Assigned to user: `123456`
   *      Transaction: `ABC123...`
   */
  bot.command('claimdeposit', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    // Check if admin
    const admin = get<any>('SELECT role FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'owner' && admin.role !== 'admin')) {
      return ctx.reply('❌ This command requires admin permissions');
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];

    if (args.length < 2) {
      return ctx.reply(
        '📝 **Usage**: /claimdeposit <transaction_hash> <user_id>\n\n' +
        'Assign an unclaimed deposit to a user.',
        { parse_mode: 'Markdown' }
      );
    }

    const txHash = args[0].trim();
    const targetUserId = parseInt(args[1]);

    if (isNaN(targetUserId)) {
      return ctx.reply('❌ Invalid user ID');
    }

    try {
      const result = await UnifiedWalletService.claimUnclaimedDeposit(txHash, targetUserId);

      if (result.success) {
        StructuredLogger.logUserAction('Unclaimed deposit assigned by admin', {
          userId: adminId,
          operation: 'claim_deposit',
          targetUserId: targetUserId,
          txHash,
          amount: result.amount!.toString()
        });

        await ctx.reply(
          `✅ **Deposit Claimed**\n\n` +
          `Amount: \`${AmountPrecision.format(result.amount!)} JUNO\`\n` +
          `Assigned to user: \`${targetUserId}\`\n` +
          `Transaction: \`${txHash.substring(0, 10)}...\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ **Failed to claim deposit**\n\n${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Failed to claim deposit', { adminId, txHash, targetUserId, error });
      await ctx.reply('❌ Failed to claim deposit');
    }
  });

  logger.info('Deposit commands registered');
};