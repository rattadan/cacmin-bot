import { Context, MiddlewareFn } from 'telegraf';
import { RestrictionService } from '../services/restrictionService';
import { ensureUserExists } from '../services/userService';
import { get } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';

export const messageFilterMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  // Skip if no message or user
  if (!ctx.message || !ctx.from) {
    return next();
  }

  try {
    // Ensure user exists
    await ensureUserExists(ctx.from.id, ctx.from.username || 'unknown');

    // Get user from database
    const user = get<User>('SELECT * FROM users WHERE id = ?', [ctx.from.id]);

    // Skip filtering for whitelisted users and elevated roles
    if (user?.whitelist || user?.role === 'owner' || user?.role === 'admin') {
      return next();
    }

    // Check if user is muted - ONLY apply in group chats, not DMs
    const isGroupChat = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    if (isGroupChat && user?.muted_until && user.muted_until > Date.now() / 1000) {
      try {
        await ctx.deleteMessage();
        logger.info('Deleted message from jailed user', { userId: ctx.from.id, mutedUntil: user.muted_until });
      } catch (error) {
        logger.error('Failed to delete message - bot may lack admin permissions', {
          userId: ctx.from.id,
          chatId: ctx.chat?.id,
          error
        });
      }
      return; // Don't continue regardless of deletion success
    }

    // Check message against restrictions (only in group chats)
    if (isGroupChat) {
      const violated = await RestrictionService.checkMessage(ctx, ctx.message);

      if (violated) {
        // Message was deleted and violation recorded
        return; // Don't continue to next middleware
      }
    }

    return next();
  } catch (error) {
    logger.error('Error in message filter middleware', error);
    return next(); // Continue on error to avoid blocking
  }
};
