import { Context } from 'telegraf';
import { TransactionLockService } from '../services/transactionLock';
import { logger } from '../utils/logger';

/**
 * Middleware to check if a user is locked during a transaction
 * Prevents users from executing commands while a withdrawal is in progress
 */
export async function lockCheckMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
  try {
    const userId = ctx.from?.id;

    if (!userId) {
      return next();
    }

    // Check if user is locked
    const lock = await TransactionLockService.getUserLock(userId);

    if (lock) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = lock.expiresAt - now;

      await ctx.reply(
        ` *Transaction in Progress*\n\n` +
        `You have a ${lock.lockType} transaction in progress.\n` +
        `Please wait ${remainingSeconds} seconds for it to complete.\n\n` +
        `If this persists, contact an admin.`,
        { parse_mode: 'Markdown' }
      );

      logger.info('User command blocked due to active lock', {
        userId,
        lockType: lock.lockType,
        remainingSeconds
      });

      // Don't continue to next middleware
      return;
    }

    // User not locked, continue
    return next();
  } catch (error) {
    logger.error('Error in lock check middleware', { error });
    // On error, allow command to proceed rather than blocking
    return next();
  }
}

/**
 * Middleware for financial commands only
 * More lenient - only blocks other financial operations
 */
export async function financialLockCheck(ctx: Context, next: () => Promise<void>): Promise<void> {
  try {
    const userId = ctx.from?.id;

    if (!userId) {
      return next();
    }

    const command = (ctx.message as any)?.text?.split(' ')[0];
    const financialCommands = [
      '/withdraw',
      '/send',
      '/transfer',
      '/pay',
      '/bail',
      '/paybail'
    ];

    // Only check lock for financial commands
    if (command && financialCommands.includes(command)) {
      const isLocked = await TransactionLockService.isUserLocked(userId);

      if (isLocked) {
        await ctx.reply(
          ` You have another transaction in progress. Please wait for it to complete before initiating a new one.`
        );
        return;
      }
    }

    return next();
  } catch (error) {
    logger.error('Error in financial lock check', { error });
    return next();
  }
}