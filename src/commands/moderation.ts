import { Telegraf, Context } from 'telegraf';
import { execute, get } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { resolveUserId, formatUserIdDisplay } from '../utils/userResolver';
import { JailService } from '../services/jailService';
import { getUserIdentifier, getCommandArgs } from '../utils/commandHelper';

export function registerModerationCommands(bot: Telegraf<Context>): void {
  // Jail command (replaces mute to avoid conflicts with Rose bot)
  const jailHandler = async (ctx: Context) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    const admin = get<User>('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
      return ctx.reply('⛔ You do not have permission to use this command.');
    }

    // Get user identifier (supports reply-to-message or explicit username/userId)
    const userIdentifier = getUserIdentifier(ctx);
    const isReply = ctx.message && 'reply_to_message' in ctx.message && ctx.message.reply_to_message;

    // Get command arguments (excluding user identifier if not a reply)
    const args = isReply
      ? (ctx.message && 'text' in ctx.message ? ctx.message.text.split(' ').slice(1) : [])
      : getCommandArgs(ctx, true);

    if (!userIdentifier) {
      return ctx.reply(
        '💡 *Usage:*\n' +
        '• Reply to a user: `/jail <minutes>`\n' +
        '• Direct: `/jail <@username|userId> <minutes>`\n' +
        '• Alias: `/silence`',
        { parse_mode: 'Markdown' }
      );
    }

    if (args.length < 1) {
      return ctx.reply('⚠️ Please specify duration in minutes.');
    }

    const minutesStr = args[0];
    const minutes = parseInt(minutesStr);

    // Resolve username or userId to numeric ID
    const userId = resolveUserId(userIdentifier);
    if (!userId) {
      return ctx.reply('❌ User not found. Please use a valid @username or userId.');
    }

    if (isNaN(minutes) || minutes < 1) {
      return ctx.reply(' Invalid duration. Minutes must be a positive number.');
    }

    // Check if bot has admin permissions in this chat
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      try {
        const botInfo = await ctx.telegram.getMe();
        const botMember = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);
        const canDelete = botMember.status === 'administrator' &&
                         ('can_delete_messages' in botMember) &&
                         botMember.can_delete_messages;

        if (!canDelete) {
          await ctx.reply(
            ' Warning: Bot is not an administrator or lacks "Delete Messages" permission.\n' +
            'User will be marked as jailed, but messages cannot be deleted automatically.\n' +
            'Please make the bot an admin with delete permissions.'
          );
        }
      } catch (error) {
        logger.error('Failed to check bot permissions', { chatId: ctx.chat.id, error });
      }
    }

    const mutedUntil = Math.floor(Date.now() / 1000) + (minutes * 60);
    const bailAmount = JailService.calculateBailAmount(minutes);

    // Update database
    execute(
      'UPDATE users SET muted_until = ?, updated_at = ? WHERE id = ?',
      [mutedUntil, Math.floor(Date.now() / 1000), userId]
    );

    // Log the jail event
    JailService.logJailEvent(userId, 'jailed', adminId, minutes, bailAmount);

    // Actually restrict the user in Telegram (if in a group)
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
          permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false,
            can_manage_topics: false,
          },
          until_date: mutedUntil,
        });
        logger.info('User restricted in Telegram', { adminId, userId, minutes, mutedUntil, bailAmount });
      } catch (error) {
        logger.error('Failed to restrict user in Telegram', { userId, chatId: ctx.chat.id, error });
        await ctx.reply(
          ` Database updated but failed to restrict user in Telegram.\n` +
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n` +
          `The bot may lack admin permissions or the user may have left.`
        );
      }
    }

    const userDisplay = formatUserIdDisplay(userId);
    await ctx.reply(
      ` User ${userDisplay} has been jailed for ${minutes} minutes.\n` +
      `Bail amount: ${bailAmount.toFixed(2)} JUNO\n\n` +
      `They can pay bail using /paybail or check their status with /mystatus`
    );
    logger.info('User jailed', { adminId, userId, minutes, bailAmount });
  };

  bot.command('jail', jailHandler);
  bot.command('silence', jailHandler); // Alias for jail

  // Unjail command (replaces unmute)
  const unjailHandler = async (ctx: Context) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    const admin = get<User>('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
      return ctx.reply(' You do not have permission to use this command.');
    }

    const userIdentifier = ctx.message && 'text' in ctx.message ? ctx.message.text.split(' ')[1] || '' : '';
    if (!userIdentifier) {
      return ctx.reply('Usage: /unjail <@username|userId> or /unsilence <@username|userId>');
    }

    // Resolve username or userId to numeric ID
    const userId = resolveUserId(userIdentifier);
    if (!userId) {
      return ctx.reply(' User not found. Please use a valid @username or userId.');
    }

    // Update database
    execute(
      'UPDATE users SET muted_until = NULL, updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), userId]
    );

    // Log the unjail event
    JailService.logJailEvent(userId, 'unjailed', adminId);

    // Restore user permissions in Telegram (if in a group)
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
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
        logger.info('User permissions restored in Telegram', { adminId, userId });
      } catch (error) {
        logger.error('Failed to restore user permissions in Telegram', { userId, chatId: ctx.chat.id, error });
        await ctx.reply(
          ` Database updated but failed to restore user permissions in Telegram.\n` +
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n` +
          `The bot may lack admin permissions or the user may have left.`
        );
      }
    }

    const userDisplay = formatUserIdDisplay(userId);
    await ctx.reply(` User ${userDisplay} has been released from jail.`);
    logger.info('User unjailed', { adminId, userId });
  };

  bot.command('unjail', unjailHandler);
  bot.command('unsilence', unjailHandler); // Alias for unjail

  // Warn command
  bot.command('warn', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    const admin = get<User>('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
      return ctx.reply(' You do not have permission to use this command.');
    }

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length < 2) {
      return ctx.reply('Usage: /warn <userId> <reason>');
    }

    const userId = parseInt(args[0]);
    const reason = args.slice(1).join(' ');

    if (isNaN(userId)) {
      return ctx.reply(' Invalid user ID');
    }

    // Create warning violation
    execute(
      'INSERT INTO violations (user_id, restriction, message, bail_amount) VALUES (?, ?, ?, ?)',
      [userId, 'warning', reason, 0]
    );

    execute(
      'UPDATE users SET warning_count = warning_count + 1, updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), userId]
    );

    await ctx.reply(` User ${userId} has been warned.\nReason: ${reason}`);

    // Try to notify the user
    try {
      await bot.telegram.sendMessage(
        userId,
        ` You have received a warning from an admin.\nReason: ${reason}\nPlease follow the group rules.`
      );
    } catch (error) {
      logger.debug('Could not send warning to user', { userId, error });
    }

    logger.info('User warned', { adminId, userId, reason });
  });

  // Clear violations (owner only)
  bot.command('clearviolations', async (ctx) => {
    const ownerId = ctx.from?.id;
    if (!ownerId || ownerId !== config.ownerId) {
      return ctx.reply(' Only the owner can use this command.');
    }

    const userId = parseInt(ctx.message?.text.split(' ')[1] || '');
    if (isNaN(userId)) {
      return ctx.reply('Usage: /clearviolations <userId>');
    }

    execute('DELETE FROM violations WHERE user_id = ?', [userId]);
    execute(
      'UPDATE users SET warning_count = 0, updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), userId]
    );

    await ctx.reply(` All violations cleared for user ${userId}.`);
    logger.info('Violations cleared', { ownerId, userId });
  });

  // Stats command (owner only)
  bot.command('stats', async (ctx) => {
    const ownerId = ctx.from?.id;
    if (!ownerId || ownerId !== config.ownerId) {
      return ctx.reply(' Only the owner can use this command.');
    }

    const now = Math.floor(Date.now() / 1000);

    const stats = {
      totalUsers: get<{count: number}>('SELECT COUNT(*) as count FROM users')?.count || 0,
      blacklisted: get<{count: number}>('SELECT COUNT(*) as count FROM users WHERE blacklist = 1')?.count || 0,
      whitelisted: get<{count: number}>('SELECT COUNT(*) as count FROM users WHERE whitelist = 1')?.count || 0,
      totalViolations: get<{count: number}>('SELECT COUNT(*) as count FROM violations')?.count || 0,
      unpaidFines: get<{total: number}>('SELECT SUM(bail_amount) as total FROM violations WHERE paid = 0')?.total || 0,
      paidFines: get<{total: number}>('SELECT SUM(bail_amount) as total FROM violations WHERE paid = 1')?.total || 0,
      activeRestrictions: get<{count: number}>('SELECT COUNT(*) as count FROM user_restrictions WHERE restricted_until IS NULL OR restricted_until > ?', [now])?.count || 0,
      activeJails: get<{count: number}>('SELECT COUNT(*) as count FROM users WHERE muted_until IS NOT NULL AND muted_until > ?', [now])?.count || 0,
      totalJailEvents: get<{count: number}>('SELECT COUNT(*) as count FROM jail_events')?.count || 0,
      totalBailsPaid: get<{count: number}>('SELECT COUNT(*) as count FROM jail_events WHERE event_type = ?', ['bail_paid'])?.count || 0,
      totalBailAmount: get<{total: number}>('SELECT SUM(bail_amount) as total FROM jail_events WHERE event_type = ?', ['bail_paid'])?.total || 0,
    };

    const message = ` *Bot Statistics*\n\n` +
      `*Users*\n` +
      `Total: ${stats.totalUsers}\n` +
      `Blacklisted: ${stats.blacklisted}\n` +
      `Whitelisted: ${stats.whitelisted}\n\n` +
      `*Violations*\n` +
      `Total: ${stats.totalViolations}\n` +
      `Unpaid Fines: ${stats.unpaidFines.toFixed(2)} JUNO\n` +
      `Paid Fines: ${stats.paidFines.toFixed(2)} JUNO\n\n` +
      `*Jails*\n` +
      `Currently Jailed: ${stats.activeJails}\n` +
      `Total Jail Events: ${stats.totalJailEvents}\n` +
      `Bails Paid: ${stats.totalBailsPaid}\n` +
      `Total Bail Revenue: ${stats.totalBailAmount.toFixed(2)} JUNO\n\n` +
      `Active Restrictions: ${stats.activeRestrictions}`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });
}
