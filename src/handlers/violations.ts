/**
 * Violation tracking and management handlers for the CAC Admin Bot.
 * Tracks user violations, displays violation history, and manages bail payments.
 * Violations can be tracked with associated bail amounts payable in JUNO tokens.
 *
 * @module handlers/violations
 */

import { Telegraf, Context } from 'telegraf';
import { query } from '../database';
import { Violation } from '../types';
import { StructuredLogger } from '../utils/logger';

/**
 * Registers all violation management command handlers with the bot.
 * Provides commands for users to view their violations and payment status.
 *
 * Commands registered:
 * - /violations - View user's violation history and payment status
 *
 * @param bot - The Telegraf bot instance
 *
 * @example
 * ```typescript
 * const bot = new Telegraf(token);
 * registerViolationHandlers(bot);
 * ```
 */
export const registerViolationHandlers = (bot: Telegraf<Context>) => {
  /**
   * Command handler for /violations.
   * Displays the user's violation history with bail amounts and payment status.
   * Users can see their own violations and any outstanding fines.
   *
   * Permission: All users (can only view their own violations)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /violations
   */
  bot.command('violations', async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
      return ctx.reply('Could not determine your user ID.');
    }

    try {
      const violations = query<Violation>('SELECT * FROM violations WHERE user_id = ?', [userId]);

      if (violations.length === 0) {
        return ctx.reply('✅ You have no violations\\!', { parse_mode: 'MarkdownV2' });
      }

      let message = '*Your Violations*\n\n';
      let totalUnpaid = 0;
      let unpaidCount = 0;

      violations.forEach((v) => {
        const paidStatus = v.paid ? '✅ Paid' : `❌ Unpaid \\(${v.bailAmount.toFixed(2)} JUNO\\)`;
        message += `\\#${v.id} \\- ${v.restriction}\n`;
        message += `Status: ${paidStatus}\n`;
        if (v.message) {
          // Escape special MarkdownV2 characters in user-provided message
          const escapedMsg = v.message.substring(0, 50).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
          message += `Message: \`${escapedMsg}\`\n`;
        }
        message += '\n';

        if (!v.paid) {
          totalUnpaid += v.bailAmount;
          unpaidCount++;
        }
      });

      message += 'Use /payfine to see payment instructions\\.';
      await ctx.reply(message, { parse_mode: 'MarkdownV2' });

      StructuredLogger.logUserAction('Violations queried', {
        userId,
        operation: 'view_violations',
        totalViolations: violations.length.toString(),
        unpaidCount: unpaidCount.toString(),
        totalUnpaid: totalUnpaid.toFixed(2)
      });
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId, operation: 'view_violations' });
      await ctx.reply('An error occurred while fetching your violations.');
    }
  });
};
