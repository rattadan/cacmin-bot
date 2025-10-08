// src/handlers/violations.ts
import { Telegraf, Context } from 'telegraf';
import { query } from '../database';
import { Violation } from '../types';

/**
 * Registers handlers for managing user violations.
 */
export const registerViolationHandlers = (bot: Telegraf<Context>) => {
  // Command to fetch user violations
  bot.command('violations', async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId) {
      return ctx.reply('Could not determine your user ID.');
    }

    const violations = query<Violation>('SELECT * FROM violations WHERE user_id = ?', [userId]);

    if (violations.length === 0) {
      return ctx.reply('✅ You have no violations\\!', { parse_mode: 'MarkdownV2' });
    }

    let message = '⚠️ *Your Violations*\n\n';
    violations.forEach((v) => {
      const paidStatus = v.paid ? '✅ Paid' : `❌ Unpaid \\(${v.bailAmount.toFixed(2)} JUNO\\)`;
      message += `\\#${v.id} \\- ${v.restriction}\n`;
      message += `Status: ${paidStatus}\n`;
      if (v.message) {
        message += `Message: \`${v.message.substring(0, 50)}\`\n`;
      }
      message += '\n';
    });

    message += 'Use /payfine to see payment instructions\\.';
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });
};
