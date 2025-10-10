import { Telegraf, Context } from 'telegraf';
import { execute, get } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { JailService } from '../services/jailService';
import { JunoService } from '../services/junoService';
import { getUnpaidViolations, getTotalFines } from '../services/violationService';
import { formatUserIdDisplay, resolveUserId } from '../utils/userResolver';

/**
 * Format seconds into human-readable time
 */
function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function registerJailCommands(bot: Telegraf<Context>): void {
  // User command to check their own status
  bot.command('mystatus', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return ctx.reply(' User not found in database.');
    }

    const now = Math.floor(Date.now() / 1000);
    let message = ` *Your Status*\n\n`;
    message += `User: ${formatUserIdDisplay(userId)}\n`;
    message += `Role: ${user.role}\n`;
    message += `Warnings: ${user.warning_count}\n\n`;

    // Check if jailed
    if (user.muted_until && user.muted_until > now) {
      const timeRemaining = user.muted_until - now;
      const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

      message += ` *Currently Jailed*\n`;
      message += `Time remaining: ${formatTimeRemaining(timeRemaining)}\n`;
      message += `Bail amount: ${bailAmount.toFixed(2)} JUNO\n\n`;
      message += `To pay bail: /paybail\n\n`;
    } else {
      message += ` Not currently jailed\n\n`;
    }

    // Show unpaid violations
    const violations = getUnpaidViolations(userId);
    if (violations.length > 0) {
      const totalFines = getTotalFines(userId);
      message += ` *Unpaid Fines*\n`;
      message += `Count: ${violations.length}\n`;
      message += `Total: ${totalFines.toFixed(2)} JUNO\n\n`;
      message += `View details: /violations\n`;
      message += `Pay fines: /payfine\n`;
    } else {
      message += ` No unpaid fines\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // Public command to list all active jails
  bot.command('jails', async (ctx) => {
    const activeJails = JailService.getActiveJails();

    if (activeJails.length === 0) {
      return ctx.reply(' No users currently jailed.');
    }

    let message = ` *Active Jails* (${activeJails.length})\n\n`;

    activeJails.forEach((jail, index) => {
      const bailAmount = JailService.calculateBailAmount(Math.ceil(jail.timeRemaining / 60));
      const timeRemaining = formatTimeRemaining(jail.timeRemaining);
      const userDisplay = formatUserIdDisplay(jail.id);

      message += `${index + 1}\\. ${userDisplay}\n`;
      message += `   Time: ${timeRemaining}\n`;
      message += `   Bail: ${bailAmount.toFixed(2)} JUNO\n`;
      message += `   Pay: /paybailfor ${jail.id}\n\n`;
    });

    message += `Anyone can pay bail for any user using /paybailfor <userId>`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  // Command to pay bail for yourself
  bot.command('paybail', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return ctx.reply(' User not found in database.');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!user.muted_until || user.muted_until <= now) {
      return ctx.reply(' You are not currently jailed. No bail required!');
    }

    const timeRemaining = user.muted_until - now;
    const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

    const message = ` *Pay Your Bail*\n\n` +
      `Current jail time remaining: ${formatTimeRemaining(timeRemaining)}\n` +
      `Bail amount: ${bailAmount.toFixed(2)} JUNO\n\n` +
      `Send exactly ${bailAmount.toFixed(2)} JUNO to:\n` +
      `\`${JunoService.getPaymentAddress()}\`\n\n` +
      `After payment, send:\n` +
      `/verifybail \\<transaction\\_hash\\>\n\n` +
      `Payment will release you from jail immediately\\!`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  // Command to pay bail for another user
  bot.command('paybailfor', async (ctx) => {
    const payerId = ctx.from?.id;
    if (!payerId) return;

    const userIdentifier = ctx.message?.text.split(' ')[1];
    if (!userIdentifier) {
      return ctx.reply('Usage: /paybailfor <@username|userId>');
    }

    const targetUserId = resolveUserId(userIdentifier);
    if (!targetUserId) {
      return ctx.reply(' User not found. Please use a valid @username or userId.');
    }

    const user = get<User>('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      return ctx.reply(' User not found in database.');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!user.muted_until || user.muted_until <= now) {
      return ctx.reply(` ${formatUserIdDisplay(targetUserId)} is not currently jailed.`);
    }

    const timeRemaining = user.muted_until - now;
    const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

    const message = ` *Pay Bail For ${formatUserIdDisplay(targetUserId)}*\n\n` +
      `Current jail time remaining: ${formatTimeRemaining(timeRemaining)}\n` +
      `Bail amount: ${bailAmount.toFixed(2)} JUNO\n\n` +
      `Send exactly ${bailAmount.toFixed(2)} JUNO to:\n` +
      `\`${JunoService.getPaymentAddress()}\`\n\n` +
      `After payment, send:\n` +
      `/verifybailfor ${targetUserId} \\<transaction\\_hash\\>\n\n` +
      `Payment will release them from jail immediately\\!`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  // Verify bail payment for yourself
  bot.command('verifybail', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const txHash = ctx.message?.text.split(' ')[1];
    if (!txHash) {
      return ctx.reply('Usage: /verifybail <txHash>');
    }

    const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return ctx.reply(' User not found in database.');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!user.muted_until || user.muted_until <= now) {
      return ctx.reply(' You are not currently jailed. No bail payment needed.');
    }

    const timeRemaining = user.muted_until - now;
    const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

    // Verify payment on blockchain
    const verified = await JunoService.verifyPayment(txHash, bailAmount);

    if (!verified) {
      return ctx.reply(' Payment could not be verified. Please check the transaction hash and amount.');
    }

    // Release from jail
    execute(
      'UPDATE users SET muted_until = NULL, updated_at = ? WHERE id = ?',
      [now, userId]
    );

    // Log the bail payment event
    JailService.logJailEvent(userId, 'bail_paid', undefined, undefined, bailAmount, userId, txHash);

    // Restore permissions in group chat
    if (config.groupChatId) {
      try {
        await bot.telegram.restrictChatMember(config.groupChatId, userId, {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
            can_manage_topics: false,
          },
        });
        logger.info('User released via bail payment', { userId, bailAmount, txHash });
      } catch (error) {
        logger.error('Failed to restore permissions after bail payment', { userId, error });
      }
    }

    await ctx.reply(
      ` *Bail Payment Verified\\!*\n\n` +
      `You have been released from jail\\.\n` +
      `Transaction: \`${txHash}\``,
      { parse_mode: 'MarkdownV2' }
    );

    logger.info('Bail paid and verified', { userId, bailAmount, txHash });
  });

  // Verify bail payment for another user
  bot.command('verifybailfor', async (ctx) => {
    const payerId = ctx.from?.id;
    if (!payerId) return;

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length < 2) {
      return ctx.reply('Usage: /verifybailfor <userId> <txHash>');
    }

    const [userIdentifier, txHash] = args;
    const targetUserId = resolveUserId(userIdentifier);

    if (!targetUserId) {
      return ctx.reply(' User not found. Please use a valid @username or userId.');
    }

    const user = get<User>('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      return ctx.reply(' User not found in database.');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!user.muted_until || user.muted_until <= now) {
      return ctx.reply(` ${formatUserIdDisplay(targetUserId)} is not currently jailed.`);
    }

    const timeRemaining = user.muted_until - now;
    const bailAmount = JailService.calculateBailAmount(Math.ceil(timeRemaining / 60));

    // Verify payment on blockchain
    const verified = await JunoService.verifyPayment(txHash, bailAmount);

    if (!verified) {
      return ctx.reply(' Payment could not be verified. Please check the transaction hash and amount.');
    }

    // Release from jail
    execute(
      'UPDATE users SET muted_until = NULL, updated_at = ? WHERE id = ?',
      [now, targetUserId]
    );

    // Log the bail payment event (paid by someone else)
    JailService.logJailEvent(targetUserId, 'bail_paid', undefined, undefined, bailAmount, payerId, txHash);

    // Restore permissions in group chat
    if (config.groupChatId) {
      try {
        await bot.telegram.restrictChatMember(config.groupChatId, targetUserId, {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
            can_manage_topics: false,
          },
        });
        logger.info('User released via bail payment by another user', {
          targetUserId,
          payerId,
          bailAmount,
          txHash
        });
      } catch (error) {
        logger.error('Failed to restore permissions after bail payment', { targetUserId, error });
      }
    }

    // Notify the released user
    try {
      await bot.telegram.sendMessage(
        targetUserId,
        ` Good news! ${formatUserIdDisplay(payerId)} paid your bail of ${bailAmount.toFixed(2)} JUNO!\nYou have been released from jail.`
      );
    } catch (dmError) {
      logger.debug(`Could not notify user ${targetUserId} of bail payment`, dmError);
    }

    await ctx.reply(
      ` *Bail Payment Verified\\!*\n\n` +
      `${formatUserIdDisplay(targetUserId)} has been released from jail\\.\n` +
      `Paid by: ${formatUserIdDisplay(payerId)}\n` +
      `Transaction: \`${txHash}\``,
      { parse_mode: 'MarkdownV2' }
    );

    logger.info('Bail paid by another user and verified', {
      targetUserId,
      payerId,
      bailAmount,
      txHash
    });
  });
}
