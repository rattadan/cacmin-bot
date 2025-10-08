import { Telegraf, Context } from 'telegraf';
import { execute, get } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export function registerModerationCommands(bot: Telegraf<Context>): void {
  // Jail command (replaces mute to avoid conflicts with Rose bot)
  const jailHandler = async (ctx: Context) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    const admin = get<User>('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }

    const args = ctx.message && 'text' in ctx.message ? ctx.message.text.split(' ').slice(1) : [];
    if (!args || args.length < 2) {
      return ctx.reply('Usage: /jail <userId> <minutes> or /silence <userId> <minutes>');
    }

    const [userIdStr, minutesStr] = args;
    const userId = parseInt(userIdStr);
    const minutes = parseInt(minutesStr);

    if (isNaN(userId) || isNaN(minutes) || minutes < 1) {
      return ctx.reply('❌ Invalid parameters. Use: /jail <userId> <minutes>');
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
            '⚠️ Warning: Bot is not an administrator or lacks "Delete Messages" permission.\n' +
            'User will be marked as jailed, but messages cannot be deleted automatically.\n' +
            'Please make the bot an admin with delete permissions.'
          );
        }
      } catch (error) {
        logger.error('Failed to check bot permissions', { chatId: ctx.chat.id, error });
      }
    }

    const mutedUntil = Math.floor(Date.now() / 1000) + (minutes * 60);

    execute(
      'UPDATE users SET muted_until = ?, updated_at = ? WHERE id = ?',
      [mutedUntil, Math.floor(Date.now() / 1000), userId]
    );

    await ctx.reply(`🔒 User ${userId} has been jailed for ${minutes} minutes.`);
    logger.info('User jailed', { adminId, userId, minutes });
  };

  bot.command('jail', jailHandler);
  bot.command('silence', jailHandler); // Alias for jail

  // Unjail command (replaces unmute)
  const unjailHandler = async (ctx: Context) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    const admin = get<User>('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
      return ctx.reply('❌ You do not have permission to use this command.');
    }

    const userId = parseInt(ctx.message && 'text' in ctx.message ? ctx.message.text.split(' ')[1] || '' : '');
    if (isNaN(userId)) {
      return ctx.reply('Usage: /unjail <userId> or /unsilence <userId>');
    }

    execute(
      'UPDATE users SET muted_until = NULL, updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), userId]
    );

    await ctx.reply(`✅ User ${userId} has been released from jail.`);
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
      return ctx.reply('❌ You do not have permission to use this command.');
    }

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length < 2) {
      return ctx.reply('Usage: /warn <userId> <reason>');
    }

    const userId = parseInt(args[0]);
    const reason = args.slice(1).join(' ');

    if (isNaN(userId)) {
      return ctx.reply('❌ Invalid user ID');
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

    await ctx.reply(`⚠️ User ${userId} has been warned.\nReason: ${reason}`);

    // Try to notify the user
    try {
      await bot.telegram.sendMessage(
        userId,
        `⚠️ You have received a warning from an admin.\nReason: ${reason}\nPlease follow the group rules.`
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
      return ctx.reply('❌ Only the owner can use this command.');
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

    await ctx.reply(`✅ All violations cleared for user ${userId}.`);
    logger.info('Violations cleared', { ownerId, userId });
  });

  // Stats command (owner only)
  bot.command('stats', async (ctx) => {
    const ownerId = ctx.from?.id;
    if (!ownerId || ownerId !== config.ownerId) {
      return ctx.reply('❌ Only the owner can use this command.');
    }

    const stats = {
      totalUsers: get<{count: number}>('SELECT COUNT(*) as count FROM users')?.count || 0,
      blacklisted: get<{count: number}>('SELECT COUNT(*) as count FROM users WHERE blacklist = 1')?.count || 0,
      whitelisted: get<{count: number}>('SELECT COUNT(*) as count FROM users WHERE whitelist = 1')?.count || 0,
      totalViolations: get<{count: number}>('SELECT COUNT(*) as count FROM violations')?.count || 0,
      unpaidFines: get<{total: number}>('SELECT SUM(bail_amount) as total FROM violations WHERE paid = 0')?.total || 0,
      activeRestrictions: get<{count: number}>('SELECT COUNT(*) as count FROM user_restrictions WHERE restricted_until IS NULL OR restricted_until > ?', [Date.now() / 1000])?.count || 0,
    };

    const message = `📊 *Bot Statistics*\n\n` +
      `👥 Total Users: ${stats.totalUsers}\n` +
      `🚫 Blacklisted: ${stats.blacklisted}\n` +
      `✅ Whitelisted: ${stats.whitelisted}\n` +
      `⚠️ Total Violations: ${stats.totalViolations}\n` +
      `💰 Unpaid Fines: ${stats.unpaidFines.toFixed(2)} JUNO\n` +
      `🔒 Active Restrictions: ${stats.activeRestrictions}`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });
}
