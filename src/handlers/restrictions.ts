// src/handlers/restrictions.ts
import { Telegraf, Context } from 'telegraf';
import { hasRole } from '../utils/roles';
import { addUserRestriction, removeUserRestriction, getUserRestrictions } from '../services/userService';
import { logger } from '../utils/logger';

export const registerRestrictionHandlers = (bot: Telegraf<Context>) => {
  // Command to add a restriction
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

      logger.info('Restriction added', { adminId, userId, restriction, action, untilTimestamp });
      await ctx.reply(`Restriction '${restriction}' added for user ${userId}.`);
    } catch (error) {
      logger.error('Error adding restriction', { adminId, userId, restriction, error });
      await ctx.reply('An error occurred while adding the restriction.');
    }
  });

  // Command to remove a restriction
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
      logger.info('Restriction removed', { adminId, userId, restriction });
      await ctx.reply(`Restriction '${restriction}' removed for user ${userId}.`);
    } catch (error) {
      logger.error('Error removing restriction', { adminId, userId, restriction, error });
      await ctx.reply('An error occurred while removing the restriction.');
    }
  });

  // Command to list restrictions
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
    } catch (error) {
      logger.error('Error listing restrictions', { adminId, userId, error });
      await ctx.reply('An error occurred while fetching restrictions.');
    }
  });
};
