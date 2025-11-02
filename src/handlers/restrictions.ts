/**
 * User restriction management handlers for the CAC Admin Bot.
 * Provides commands for adding, removing, and listing user-specific restrictions
 * such as sticker limitations, URL blocking, and regex-based message filtering.
 *
 * @module handlers/restrictions
 */

import { Telegraf, Context } from 'telegraf';
import { hasRole } from '../utils/roles';
import { addUserRestriction, removeUserRestriction, getUserRestrictions } from '../services/userService';
import { logger, StructuredLogger } from '../utils/logger';

/**
 * Registers all restriction management command handlers with the bot.
 * Provides commands for admins and elevated users to manage user-specific restrictions.
 *
 * Commands registered:
 * - /addrestriction - Add a restriction to a user
 * - /removerestriction - Remove a restriction from a user
 * - /listrestrictions - List all restrictions for a user
 *
 * @param bot - The Telegraf bot instance
 *
 * @example
 * ```typescript
 * const bot = new Telegraf(token);
 * registerRestrictionHandlers(bot);
 * ```
 */
export const registerRestrictionHandlers = (bot: Telegraf<Context>) => {
  /**
   * Command handler for /addrestriction.
   * Adds a specific restriction to a user with optional expiration.
   *
   * Permission: No explicit check (should be added)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /addrestriction <userId> <restriction> [restrictedAction] [restrictedUntil]
   * Example: /addrestriction 123456 no_stickers stickerpack_name 1735689600
   */
  bot.command('addrestriction', async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId, restriction, restrictedAction, restrictedUntil] = ctx.message?.text.split(' ').slice(1) || [];

    if (!userId || !restriction) {
      return ctx.reply('Usage: /addrestriction <userId> <restriction> [restrictedAction] [restrictedUntil]');
    }

    try {
      const untilTimestamp = restrictedUntil ? parseInt(restrictedUntil, 10) : undefined;
      const action = restrictedAction || undefined;
      const metadata: Record<string, any> | undefined = undefined;

      addUserRestriction(
        parseInt(userId, 10),
        restriction,
        action,
        metadata,
        untilTimestamp
      );

      StructuredLogger.logSecurityEvent('Restriction added to user', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'add_restriction',
        restriction,
        restrictedAction: action,
        restrictedUntil: untilTimestamp
      });
      await ctx.reply(`Restriction '${restriction}' added for user ${userId}.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'add_restriction', restriction });
      await ctx.reply('An error occurred while adding the restriction.');
    }
  });

  /**
   * Command handler for /removerestriction.
   * Removes a specific restriction from a user.
   *
   * Permission: Admin or elevated role required
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /removerestriction <userId> <restriction>
   * Example: /removerestriction 123456 no_stickers
   */
  bot.command('removerestriction', async (ctx) => {
    const adminId = ctx.from?.id;

    if (!hasRole(ctx.from?.id!, 'admin') && !hasRole(ctx.from?.id!, 'elevated')) {
      return ctx.reply('You do not have permission to manage restrictions.');
    }

    const [userId, restriction] = ctx.message?.text.split(' ').slice(1) || [];
    if (!userId || !restriction) {
      return ctx.reply('Usage: /removerestriction <userId> <restriction>');
    }

    try {
      removeUserRestriction(parseInt(userId, 10), restriction);
      StructuredLogger.logSecurityEvent('Restriction removed from user', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'remove_restriction',
        restriction
      });
      await ctx.reply(`Restriction '${restriction}' removed for user ${userId}.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'remove_restriction', restriction });
      await ctx.reply('An error occurred while removing the restriction.');
    }
  });

  /**
   * Command handler for /listrestrictions.
   * Lists all active restrictions for a specific user.
   *
   * Permission: Admin or elevated role required
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /listrestrictions <userId>
   * Example: /listrestrictions 123456
   */
  bot.command('listrestrictions', async (ctx) => {
    const adminId = ctx.from?.id;

    if (!hasRole(ctx.from?.id!, 'admin') && !hasRole(ctx.from?.id!, 'elevated')) {
      return ctx.reply('You do not have permission to view restrictions.');
    }

    const [userId] = ctx.message?.text.split(' ').slice(1) || [];
    if (!userId) {
      return ctx.reply('Usage: /listrestrictions <userId>');
    }

    try {
      const restrictions = getUserRestrictions(parseInt(userId, 10));
      if (restrictions.length === 0) {
        return ctx.reply(`No restrictions found for user ${userId}.`);
      }

      const message = restrictions
        .map((r) => `Type: ${r.restriction}, Action: ${r.restrictedAction || 'N/A'}, Until: ${r.restrictedUntil || 'Permanent'}`)
        .join('\n');
      await ctx.reply(`Restrictions for user ${userId}:\n${message}`);

      StructuredLogger.logUserAction('Restrictions queried', {
        adminId,
        userId: parseInt(userId, 10),
        operation: 'list_restrictions',
        count: restrictions.length.toString()
      });
    } catch (error) {
      StructuredLogger.logError(error as Error, { adminId, userId: parseInt(userId, 10), operation: 'list_restrictions' });
      await ctx.reply('An error occurred while fetching restrictions.');
    }
  });
};
