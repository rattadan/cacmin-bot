import { Telegraf, Context } from 'telegraf';
import { JunoService } from '../services/junoService';
import { getUnpaidViolations, markViolationPaid, getTotalFines } from '../services/violationService';
import { get } from '../database';
import { Violation } from '../types';
import { logger } from '../utils/logger';

export function registerPaymentCommands(bot: Telegraf<Context>): void {
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
      let message = `💰 *Your Unpaid Fines*\n\n`;

      violations.forEach(v => {
        message += `ID: ${v.id} \\- ${v.restriction} \\- ${v.bailAmount.toFixed(2)} JUNO\n`;
      });

      message += `\n*Total: ${totalFines.toFixed(2)} JUNO*\n\n`;
      message += `To pay a specific fine:\n/payfine \\<violationId\\>\n\n`;
      message += `Payment address:\n\`${JunoService.getPaymentAddress()}\`\n\n`;
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

    const message = `💰 *Payment Instructions*\n\n` +
      `Violation ID: ${violation.id}\n` +
      `Type: ${violation.restriction}\n` +
      `Amount: ${violation.bailAmount.toFixed(2)} JUNO\n\n` +
      `Send exactly ${violation.bailAmount.toFixed(2)} JUNO to:\n` +
      `\`${JunoService.getPaymentAddress()}\`\n\n` +
      `After payment, send:\n` +
      `/verifypayment ${violation.id} \\<transaction\\_hash\\>`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

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
    logger.info('Payment verified', { userId, violationId, txHash });
  });
}
