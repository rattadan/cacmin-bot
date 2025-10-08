import { Telegraf, Context } from 'telegraf';
import { query, execute } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';

export const registerBlacklistHandlers = (bot: Telegraf<Context>) => {
  // View whitelist
  bot.command('viewwhitelist', async (ctx) => {
    try {
      const whitelist = query<User>('SELECT id, username FROM users WHERE whitelist = 1');
      if (whitelist.length === 0) {
        return ctx.reply('The whitelist is empty.');
      }

      const message = whitelist.map((user) => `ID: ${user.id}, Username: ${user.username}`).join('\n');
      await ctx.reply(`Whitelisted Users:\n${message}`);
    } catch (error) {
      logger.error('Error viewing whitelist', { userId: ctx.from?.id, error });
      await ctx.reply('An error occurred while fetching the whitelist.');
    }
  });

  // Add to whitelist
  bot.command('addwhitelist', async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId || isNaN(Number(userId))) {
      logger.warn('Addwhitelist command invoked with invalid user ID', { adminId });
      return ctx.reply('Usage: /addwhitelist <userId>');
    }

    try {
      execute('UPDATE users SET whitelist = 1 WHERE id = ?', [parseInt(userId, 10)]);
      logger.info('User added to whitelist', { adminId, userId });
      await ctx.reply(`User ${userId} has been whitelisted.`);
    } catch (error) {
      logger.error('Error whitelisting user', { adminId, userId, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Remove from whitelist
  bot.command('removewhitelist', async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId) {
      return ctx.reply('Usage: /removewhitelist <userId>');
    }

    try {
      execute('UPDATE users SET whitelist = 0 WHERE id = ?', [parseInt(userId, 10)]);
      logger.info('User removed from whitelist', { adminId, userId });
      await ctx.reply(`User ${userId} has been removed from the whitelist.`);
    } catch (error) {
      logger.error('Error removing user from whitelist', { adminId, userId, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // View blacklist
  bot.command('viewblacklist', async (ctx) => {
    try {
      const blacklist = query<User>('SELECT id, username FROM users WHERE blacklist = 1');
      if (blacklist.length === 0) {
        return ctx.reply('The blacklist is empty.');
      }

      const message = blacklist.map((user) => `ID: ${user.id}, Username: ${user.username}`).join('\n');
      await ctx.reply(`Blacklisted Users:\n${message}`);
    } catch (error) {
      logger.error('Error viewing blacklist', { userId: ctx.from?.id, error });
      await ctx.reply('An error occurred while fetching the blacklist.');
    }
  });

  bot.command('addblacklist', async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId || isNaN(Number(userId))) {
      logger.warn('Addblacklist command invoked with invalid user ID', { adminId });
      return ctx.reply('Usage: /addblacklist <userId>');
    }

    try {
      execute('UPDATE users SET blacklist = 1 WHERE id = ?', [parseInt(userId, 10)]);
      logger.info('User added to blacklist', { adminId, userId });
      await ctx.reply(`User ${userId} has been blacklisted.`);
    } catch (error) {
      logger.error('Error blacklisting user', { adminId, userId, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  bot.command('removeblacklist', async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);
    if (!userId) {
      return ctx.reply('Usage: /removeblacklist <userId>');
    }

    try {
      execute('UPDATE users SET blacklist = 0 WHERE id = ?', [parseInt(userId, 10)]);
      logger.info('User removed from blacklist', { adminId, userId });
      await ctx.reply(`User ${userId} has been removed from the blacklist.`);
    } catch (error) {
      logger.error('Error removing user from blacklist', { adminId, userId, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });
};
