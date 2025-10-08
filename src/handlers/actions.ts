import { Telegraf, Context } from 'telegraf';
import { query, execute } from '../database';
import { GlobalAction } from '../types';
import { logger } from '../utils/logger';

export const registerActionHandlers = (bot: Telegraf<Context>) => {
  bot.command('viewactions', async (ctx) => {
    try {
      const actions = query<GlobalAction>('SELECT * FROM global_restrictions');
      if (actions.length === 0) {
        return ctx.reply('No restricted actions found.');
      }

      const message = actions
        .map((action) => `Type: ${action.restriction}, Action: ${action.restrictedAction || 'N/A'}`)
        .join('\n');
      await ctx.reply(`Restricted Actions:\n${message}`);
    } catch (error) {
      logger.error('Error viewing actions', { userId: ctx.from?.id, error });
      await ctx.reply('An error occurred while fetching actions.');
    }
  });

  bot.command('addaction', async (ctx) => {
    const ownerId = ctx.from?.id;
    const [restriction, restrictedAction] = ctx.message?.text.split(' ').slice(1);

    if (!restriction) {
      return ctx.reply('Usage: /addaction <restriction> [restrictedAction]');
    }

    try {
      execute('INSERT INTO global_restrictions (restriction, restricted_action) VALUES (?, ?)', [restriction, restrictedAction || null]);
      logger.info('Global action added', { ownerId, restriction, restrictedAction });
      await ctx.reply(`Action '${restriction}' has been added.`);
    } catch (error) {
      logger.error('Error adding action', { ownerId, restriction, error });
      await ctx.reply('An error occurred while adding the action.');
    }
  });

  bot.command('removeaction', async (ctx) => {
    const ownerId = ctx.from?.id;
    const [restriction] = ctx.message?.text.split(' ').slice(1);

    if (!restriction) {
      return ctx.reply('Usage: /removeaction <restriction>');
    }

    try {
      execute('DELETE FROM global_restrictions WHERE restriction = ?', [restriction]);
      logger.info('Global action removed', { ownerId, restriction });
      await ctx.reply(`Action '${restriction}' has been removed.`);
    } catch (error) {
      logger.error('Error removing action', { ownerId, restriction, error });
      await ctx.reply('An error occurred while removing the action.');
    }
  });
};
