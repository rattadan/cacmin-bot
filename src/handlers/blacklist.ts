/**
 * Whitelist and blacklist management handlers for the CAC Admin Bot.
 * Provides commands for managing user whitelist and blacklist status,
 * controlling user access and permissions within the chat.
 *
 * @module handlers/blacklist
 */

import { Telegraf, Context } from 'telegraf';
import { query, execute } from '../database';
import { User } from '../types';
import { logger, StructuredLogger } from '../utils/logger';
import { adminOrHigher } from '../middleware';

/**
 * Registers all whitelist and blacklist command handlers with the bot.
 * Provides commands for admins to manage user access control lists.
 *
 * Commands registered:
 * - /viewwhitelist - View all whitelisted users
 * - /addwhitelist - Add a user to the whitelist
 * - /removewhitelist - Remove a user from the whitelist
 * - /viewblacklist - View all blacklisted users
 * - /addblacklist - Add a user to the blacklist
 * - /removeblacklist - Remove a user from the blacklist
 *
 * @param bot - The Telegraf bot instance
 *
 * @example
 * ```typescript
 * const bot = new Telegraf(token);
 * registerBlacklistHandlers(bot);
 * ```
 */
export const registerBlacklistHandlers = (bot: Telegraf<Context>) => {
  /**
   * Command handler for /viewwhitelist.
   * Displays all users currently on the whitelist.
   *
   * Permission: All users can view
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /viewwhitelist
   */
  bot.command('viewwhitelist', async (ctx) => {
    try {
      const whitelist = query<User>('SELECT id, username FROM users WHERE whitelist = 1');
      if (whitelist.length === 0) {
        return ctx.reply('The whitelist is empty.');
      }

      const message = whitelist.map((user) => `ID: ${user.id}, Username: ${user.username}`).join('\n');
      await ctx.reply(`Whitelisted Users:\n${message}`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId: ctx.from?.id, operation: 'view_whitelist' });
      await ctx.reply('An error occurred while fetching the whitelist.');
    }
  });

  /**
   * Command handler for /addwhitelist.
   * Adds a user to the whitelist, granting them special permissions or exemptions.
   *
   * Permission: Admin or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /addwhitelist <userId>
   * Example: /addwhitelist 123456789
   */
  bot.command('addwhitelist', adminOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId || isNaN(Number(userId))) {
      StructuredLogger.logSecurityEvent('Invalid whitelist add attempt', {
        userId: adminId,
        operation: 'add_whitelist',
        targetUser: userId || 'undefined'
      });
      return ctx.reply('Usage: /addwhitelist <userId>');
    }

    try {
      execute('UPDATE users SET whitelist = 1 WHERE id = ?', [parseInt(userId, 10)]);
      StructuredLogger.logSecurityEvent('User added to whitelist', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'add_whitelist'
      });
      await ctx.reply(`User ${userId} has been whitelisted.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'add_whitelist' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /removewhitelist.
   * Removes a user from the whitelist.
   *
   * Permission: Admin or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /removewhitelist <userId>
   * Example: /removewhitelist 123456789
   */
  bot.command('removewhitelist', adminOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId) {
      return ctx.reply('Usage: /removewhitelist <userId>');
    }

    try {
      execute('UPDATE users SET whitelist = 0 WHERE id = ?', [parseInt(userId, 10)]);
      StructuredLogger.logSecurityEvent('User removed from whitelist', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'remove_whitelist'
      });
      await ctx.reply(`User ${userId} has been removed from the whitelist.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'remove_whitelist' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /viewblacklist.
   * Displays all users currently on the blacklist.
   *
   * Permission: All users can view
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /viewblacklist
   */
  bot.command('viewblacklist', async (ctx) => {
    try {
      const blacklist = query<User>('SELECT id, username FROM users WHERE blacklist = 1');
      if (blacklist.length === 0) {
        return ctx.reply('The blacklist is empty.');
      }

      const message = blacklist.map((user) => `ID: ${user.id}, Username: ${user.username}`).join('\n');
      await ctx.reply(`Blacklisted Users:\n${message}`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId: ctx.from?.id, operation: 'view_blacklist' });
      await ctx.reply('An error occurred while fetching the blacklist.');
    }
  });

  /**
   * Command handler for /addblacklist.
   * Adds a user to the blacklist, restricting their access and privileges.
   *
   * Permission: Admin or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /addblacklist <userId>
   * Example: /addblacklist 123456789
   */
  bot.command('addblacklist', adminOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);

    if (!userId || isNaN(Number(userId))) {
      StructuredLogger.logSecurityEvent('Invalid blacklist add attempt', {
        userId: adminId,
        operation: 'add_blacklist',
        targetUser: userId || 'undefined'
      });
      return ctx.reply('Usage: /addblacklist <userId>');
    }

    try {
      execute('UPDATE users SET blacklist = 1 WHERE id = ?', [parseInt(userId, 10)]);
      StructuredLogger.logSecurityEvent('User added to blacklist', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'add_blacklist'
      });
      await ctx.reply(`User ${userId} has been blacklisted.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'add_blacklist' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /removeblacklist.
   * Removes a user from the blacklist.
   *
   * Permission: Admin or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /removeblacklist <userId>
   * Example: /removeblacklist 123456789
   */
  bot.command('removeblacklist', adminOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId] = ctx.message?.text.split(' ').slice(1);
    if (!userId) {
      return ctx.reply('Usage: /removeblacklist <userId>');
    }

    try {
      execute('UPDATE users SET blacklist = 0 WHERE id = ?', [parseInt(userId, 10)]);
      StructuredLogger.logSecurityEvent('User removed from blacklist', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'remove_blacklist'
      });
      await ctx.reply(`User ${userId} has been removed from the blacklist.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'remove_blacklist' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });
};
