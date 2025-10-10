import { Telegraf, Context } from 'telegraf';
import { JunoService } from '../services/junoService';
import { WalletService } from '../services/walletService';
import { JailService } from '../services/jailService';
import { getUnpaidViolations, markViolationPaid, getTotalFines } from '../services/violationService';
import { get, query, execute } from '../database';
import { Violation, User } from '../types';
import { logger } from '../utils/logger';

export function registerPaymentCommands(bot: Telegraf<Context>): void {
  // Pay fines from user wallet (DM only)
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
      const balance = await WalletService.getUserBalance(userId);

      let message = ` *Your Unpaid Fines*\n\n`;
      violations.forEach(v => {
        message += `• ID ${v.id}: ${v.restriction} - ${v.bailAmount.toFixed(2)} JUNO\n`;
      });

      message += `\n*Total: ${totalFines.toFixed(2)} JUNO*\n`;
      message += `Your wallet balance: ${balance.toFixed(6)} JUNO\n\n`;

      if (balance >= totalFines) {
        message += ` You have sufficient funds.\n\nUse /payallfi nes to pay all fines at once.`;
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

  // Pay all fines at once from wallet
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
      const balance = await WalletService.getUserBalance(userId);

      if (balance < totalFines) {
        return ctx.reply(
          ` Insufficient balance.\n\n` +
          `Total fines: ${totalFines.toFixed(2)} JUNO\n` +
          `Your balance: ${balance.toFixed(6)} JUNO\n\n` +
          `Please deposit more JUNO using /deposit`
        );
      }

      // Collect payment from user wallet to treasury
      const result = await WalletService.collectFromUser(
        userId,
        totalFines,
        `Payment for ${violations.length} violations`
      );

      if (result.success) {
        // Mark all violations as paid
        violations.forEach(v => {
          markViolationPaid(v.id, result.txHash || '', userId);
        });

        // Release from jail if jailed
        const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
        if (user?.muted_until && user.muted_until > Date.now() / 1000) {
          execute('UPDATE users SET muted_until = NULL WHERE id = ?', [userId]);
        }

        const newBalance = await WalletService.getUserBalance(userId);

        await ctx.reply(
          ` *All Fines Paid!*\n\n` +
          `Violations cleared: ${violations.length}\n` +
          `Amount paid: ${totalFines.toFixed(2)} JUNO\n` +
          `TX: \`${result.txHash}\`\n\n` +
          `New balance: ${newBalance.toFixed(6)} JUNO\n\n` +
          `You have been released from jail (if applicable).`,
          { parse_mode: 'Markdown' }
        );

        logger.info('User paid all fines from wallet', {
          userId,
          violations: violations.length,
          amount: totalFines,
          txHash: result.txHash
        });
      } else {
        await ctx.reply(
          ` *Payment Failed*\n\n` +
          `Error: ${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error paying fines', { userId, error });
      await ctx.reply(' Error processing payment.');
    }
  });

  // Original payfine command (kept for backwards compatibility)
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
      let message = ` *Your Unpaid Fines*\n\n`;

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

    const message = ` *Payment Instructions*\n\n` +
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
