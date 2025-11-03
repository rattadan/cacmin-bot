/**
 * Payment command handlers for the CAC Admin Bot.
 * Provides commands for viewing and paying fines through internal wallet
 * or on-chain verification.
 *
 * @module commands/payment
 */

import { Telegraf, Context } from 'telegraf';
import { UnifiedWalletService } from '../services/unifiedWalletService';
import { JunoService } from '../services/junoService';
import { config } from '../config';
import { JailService } from '../services/jailService';
import { getUnpaidViolations, markViolationPaid, getTotalFines } from '../services/violationService';
import { get, query, execute } from '../database';
import { Violation, User } from '../types';
import { logger, StructuredLogger } from '../utils/logger';

/**
 * Registers all payment-related commands with the bot.
 *
 * Commands registered:
 * - /payfines - View unpaid fines (DM only)
 * - /payallfines - Pay all fines from internal wallet (DM only)
 * - /payfine - Pay a specific fine or view all fines
 * - /verifypayment - Verify an on-chain payment for a fine
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerPaymentCommands } from './commands/payment';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerPaymentCommands(bot);
 * ```
 */
export function registerPaymentCommands(bot: Telegraf<Context>): void {
  /**
   * Command: /payfines
   * View all unpaid fines and wallet balance (DM only).
   *
   * Permission: Any user
   * Syntax: /payfines
   * Location: Direct message only
   *
   * @example
   * User: /payfines
   * Bot: Your Unpaid Fines
   *
   *      • ID 1: spam - 2.50 JUNO
   *      • ID 2: urls - 1.50 JUNO
   *
   *      Total: 4.00 JUNO
   *      Your wallet balance: 10.000000 JUNO
   *
   *      You have sufficient funds.
   *      Use /payallfines to pay all fines at once.
   */
  bot.command('payfines', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Only allow in DM
    if (ctx.chat?.type !== 'private') {
      return ctx.reply(' Fine payment can only be done in direct messages with the bot.');
    }

    try {
      const violations = getUnpaidViolations(userId);

      if (violations.length === 0) {
        return ctx.reply(' You have no unpaid fines!');
      }

      const totalFines = getTotalFines(userId);
      const balance = await UnifiedWalletService.getBalance(userId);

      let message = `*Your Unpaid Fines*\n\n`;
      violations.forEach(v => {
        message += `• ID ${v.id}: ${v.restriction} - ${v.bailAmount.toFixed(2)} JUNO\n`;
      });

      message += `\n*Total: ${totalFines.toFixed(2)} JUNO*\n`;
      message += `Your wallet balance: ${balance.toFixed(6)} JUNO\n\n`;

      if (balance >= totalFines) {
        message += ` You have sufficient funds.\n\nUse /payallfines to pay all fines at once.`;
      } else {
        message += ` Insufficient funds. Please deposit more JUNO.\n\n`;
        message += `Use /deposit to get your wallet address.`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error showing fines', { userId, error });
      await ctx.reply(' Error fetching fines.');
    }
  });

  /**
   * Command: /payallfines
   * Pay all outstanding fines from internal wallet balance (DM only).
   *
   * Permission: Any user
   * Syntax: /payallfines
   * Location: Direct message only
   *
   * @example
   * User: /payallfines
   * Bot: All Fines Paid!
   *
   *      Violations cleared: 2
   *      Amount paid: 4.00 JUNO
   *      New balance: 6.000000 JUNO
   *
   *      You have been released from jail (if applicable).
   */
  bot.command('payallfines', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (ctx.chat?.type !== 'private') {
      return ctx.reply(' Fine payment can only be done in direct messages with the bot.');
    }

    try {
      const violations = getUnpaidViolations(userId);

      if (violations.length === 0) {
        return ctx.reply(' You have no unpaid fines!');
      }

      const totalFines = getTotalFines(userId);
      const balance = await UnifiedWalletService.getBalance(userId);

      if (balance < totalFines) {
        return ctx.reply(
          ` Insufficient balance.\n\n` +
          `Total fines: ${totalFines.toFixed(2)} JUNO\n` +
          `Your balance: ${balance.toFixed(6)} JUNO\n\n` +
          `Please deposit more JUNO using /deposit`
        );
      }

      // Use internal ledger to process fine payment
      const result = await UnifiedWalletService.payFine(
        userId,
        totalFines,
        `Payment for ${violations.length} violations`
      );

      if (result.success) {
        // Mark all violations as paid (internal ledger transaction)
        violations.forEach(v => {
          markViolationPaid(v.id, 'internal_ledger', userId);
        });

        // Release from jail if jailed
        const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
        if (user?.muted_until && user.muted_until > Date.now() / 1000) {
          execute('UPDATE users SET muted_until = NULL WHERE id = ?', [userId]);
        }

        await ctx.reply(
          `*All Fines Paid!*\n\n` +
          `Violations cleared: ${violations.length}\n` +
          `Amount paid: ${totalFines.toFixed(2)} JUNO\n` +
          `New balance: ${result.newBalance?.toFixed(6) || 'N/A'} JUNO\n\n` +
          `You have been released from jail (if applicable).`,
          { parse_mode: 'Markdown' }
        );

        StructuredLogger.logTransaction('User paid all fines from internal balance', {
          userId,
          operation: 'pay_all_fines',
          amount: totalFines.toString(),
          violationsCleared: violations.length
        });
      } else {
        await ctx.reply(
          `*Payment Failed*\n\n` +
          `Error: ${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error paying fines', { userId, error });
      await ctx.reply(' Error processing payment.');
    }
  });

  /**
   * Command: /payfine
   * View all unpaid fines or get payment instructions for a specific fine.
   *
   * Permission: Any user
   * Syntax: /payfine (list all)
   * Syntax: /payfine <violationId> (specific fine)
   *
   * @example
   * User: /payfine
   * Bot: Your Unpaid Fines
   *
   *      ID: 1 - spam - 2.50 JUNO
   *      ID: 2 - urls - 1.50 JUNO
   *
   *      Total: 4.00 JUNO
   *
   *      To pay a specific fine:
   *      /payfine <violationId>
   *
   * @example
   * User: /payfine 1
   * Bot: Payment Instructions
   *
   *      Violation ID: 1
   *      Type: spam
   *      Amount: 2.50 JUNO
   *
   *      Send exactly 2.50 JUNO to:
   *      `juno1...`
   *
   *      After payment, send:
   *      /verifypayment 1 <transaction_hash>
   */
  bot.command('payfine', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const violationId = parseInt(ctx.message?.text.split(' ')[1] || '');

    if (isNaN(violationId)) {
      // Show all unpaid violations
      const violations = getUnpaidViolations(userId);
      if (violations.length === 0) {
        return ctx.reply(' You have no unpaid fines!');
      }

      const totalFines = getTotalFines(userId);
      let message = `*Your Unpaid Fines*\n\n`;

      violations.forEach(v => {
        message += `ID: ${v.id} \\- ${v.restriction} \\- ${v.bailAmount.toFixed(2)} JUNO\n`;
      });

      message += `\n*Total: ${totalFines.toFixed(2)} JUNO*\n\n`;
      message += `To pay a specific fine:\n/payfine \\<violationId\\>\n\n`;
      message += `Payment address:\n\`${config.botTreasuryAddress}\`\n\n`;
      message += `After payment, send:\n/verifypayment \\<violationId\\> \\<txHash\\>`;

      return ctx.reply(message, { parse_mode: 'MarkdownV2' });
    }

    // Get specific violation
    const violation = get<Violation>(
      'SELECT * FROM violations WHERE id = ? AND user_id = ?',
      [violationId, userId]
    );

    if (!violation) {
      return ctx.reply(' Violation not found or doesn\'t belong to you.');
    }

    if (violation.paid) {
      return ctx.reply(' This fine has already been paid.');
    }

    const message = `*Payment Instructions*\n\n` +
      `Violation ID: ${violation.id}\n` +
      `Type: ${violation.restriction}\n` +
      `Amount: ${violation.bailAmount.toFixed(2)} JUNO\n\n` +
      `Send exactly ${violation.bailAmount.toFixed(2)} JUNO to:\n` +
      `\`${config.botTreasuryAddress}\`\n\n` +
      `After payment, send:\n` +
      `/verifypayment ${violation.id} \\<transaction\\_hash\\>`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  /**
   * Command: /verifypayment
   * Verify an on-chain payment for a specific violation.
   *
   * Permission: Any user
   * Syntax: /verifypayment <violationId> <txHash>
   *
   * @example
   * User: /verifypayment 1 ABC123DEF456...
   * Bot: Payment verified! Your fine has been marked as paid.
   */
  bot.command('verifypayment', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length < 2) {
      return ctx.reply('Usage: /verifypayment <violationId> <txHash>');
    }

    const [violationIdStr, txHash] = args;
    const violationId = parseInt(violationIdStr);

    if (isNaN(violationId)) {
      return ctx.reply(' Invalid violation ID');
    }

    // Get violation
    const violation = get<Violation>(
      'SELECT * FROM violations WHERE id = ? AND user_id = ?',
      [violationId, userId]
    );

    if (!violation) {
      return ctx.reply(' Violation not found or doesn\'t belong to you.');
    }

    if (violation.paid) {
      return ctx.reply(' This fine has already been paid.');
    }

    // Verify payment on blockchain
    const verified = await JunoService.verifyPayment(txHash, violation.bailAmount);

    if (!verified) {
      return ctx.reply(' Payment could not be verified. Please check the transaction hash.');
    }

    // Mark as paid (paid by the user themselves)
    markViolationPaid(violationId, txHash, userId);

    await ctx.reply(' Payment verified! Your fine has been marked as paid.');
    StructuredLogger.logTransaction('Payment verified', {
      userId,
      txHash,
      operation: 'verify_fine_payment',
      violationId: violationId
    });
  });
}
