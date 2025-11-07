/**
 * User restriction management handlers for the CAC Admin Bot.
 * Provides commands for adding, removing, and listing user-specific restrictions
 * such as sticker limitations, URL blocking, and regex-based message filtering.
 *
 * @module handlers/restrictions
 */

import { Telegraf, Context } from 'telegraf';
import { hasRole, isImmuneToModeration } from '../utils/roles';
import { addUserRestriction, removeUserRestriction, getUserRestrictions } from '../services/userService';
import { logger, StructuredLogger } from '../utils/logger';
import { adminOrHigher, elevatedOrHigher } from '../middleware';
import { restrictionTypeKeyboard, durationKeyboard } from '../utils/keyboards';

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
   * Permission: Admin or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /addrestriction <userId> <restriction> [restrictedAction] [restrictedUntil]
   * Example: /addrestriction 123456 no_stickers stickerpack_name 1735689600
   */
  bot.command('addrestriction', adminOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;
    const [userId, restriction, restrictedAction, restrictedUntil] = ctx.message?.text.split(' ').slice(1) || [];

    // If no arguments, show interactive keyboard
    if (!userId || !restriction) {
      return ctx.reply(
        '🚫 *Add User Restriction*\n\n' +
        'Select a restriction type to apply:\n\n' +
        '**Restriction Types:**\n' +
        '• **No Stickers** - Block all stickers or specific packs\n' +
        '• **No URLs** - Block URL links or specific domains\n' +
        '• **No Media (All)** - Block photos, videos, documents, audio\n' +
        '• **No Photos** - Block only photo messages\n' +
        '• **No Videos** - Block only video messages\n' +
        '• **No Documents** - Block only document files\n' +
        '• **No GIFs** - Block GIF animations\n' +
        '• **No Voice** - Block voice messages and video notes\n' +
        '• **No Forwarding** - Block forwarded messages\n' +
        '• **Regex Block** - Block messages matching text patterns\n\n' +
        '_Or use command format:_\n' +
        '`/addrestriction <userId> <restriction> [action] [until]`\n\n' +
        '_Examples:_\n' +
        '`/addrestriction 123456 no_photos` - Block photos permanently\n' +
        '`/addrestriction 123456 no_urls google.com` - Block specific domain\n' +
        '`/addrestriction 123456 regex_block spam.*pattern` - Block text pattern',
        {
          parse_mode: 'Markdown',
          reply_markup: restrictionTypeKeyboard
        }
      );
    }

    try {
      const targetUserId = parseInt(userId, 10);

      // Check if target user is immune to moderation
      if (isImmuneToModeration(targetUserId)) {
        return ctx.reply(` Cannot restrict user ${targetUserId} - admins and owners are immune to moderation actions.`);
      }

      const untilTimestamp = restrictedUntil ? parseInt(restrictedUntil, 10) : undefined;
      const action = restrictedAction || undefined;
      const metadata: Record<string, any> | undefined = undefined;

      addUserRestriction(
        targetUserId,
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
   * Permission: Elevated or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /removerestriction <userId> <restriction>
   * Example: /removerestriction 123456 no_stickers
   */
  bot.command('removerestriction', elevatedOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;

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
   * Permission: Elevated or higher
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /listrestrictions <userId>
   * Example: /listrestrictions 123456
   */
  bot.command('listrestrictions', elevatedOrHigher, async (ctx) => {
    const adminId = ctx.from?.id;

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
