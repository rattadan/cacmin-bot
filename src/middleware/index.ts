/**
 * @module middleware/index
 * @description Core middleware functions for user management and permission control.
 * Provides middleware for user database synchronization, role-based access control,
 * and restriction loading. These middleware functions run before command handlers
 * to ensure proper authorization and context setup.
 */

import { Context, MiddlewareFn } from 'telegraf';
import { ensureUserExists, getUserRestrictions } from '../services/userService';
import { isGroupOwner, hasRole } from '../utils/roles';
import { query } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';
import { LedgerService } from '../services/ledgerService';

/**
 * Middleware that ensures users exist in the database, initializes their wallet balance,
 * and preloads their restrictions. This middleware runs early in the pipeline to:
 * 1. Synchronize Telegram users with the bot's database
 * 2. Create a ledger balance entry for new users (starts at 0 JUNO)
 * 3. Load all active restrictions into the context state for later use
 *
 * This ensures every user is automatically "registered" when they first interact with the bot.
 *
 * @param ctx - Telegraf context object containing user information
 * @param next - Next middleware function in the chain
 * @returns Promise that resolves when user is loaded, balance created, and restrictions preloaded
 *
 * @example
 * ```typescript
 * // User restrictions and balance are available in handlers after this middleware
 * bot.use(userManagementMiddleware);
 * bot.command('balance', (ctx) => {
 *   const restrictions = ctx.state.restrictions; // Available here
 *   // User balance entry guaranteed to exist in ledger
 * });
 * ```
 */
export const userManagementMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  if (!ctx.from || !ctx.from.id) {
    logger.warn('Request received without user information');
    return next(); // Skip if no user information is available
  }

  const userId = ctx.from.id;
  const username = ctx.from.username || 'unknown';

  try {
    // Ensure the user is in the database
    ensureUserExists(userId, username);

    // Ensure user has a balance entry in the ledger
    await LedgerService.ensureUserBalance(userId);

    // Fetch and preload user restrictions
    const restrictions = getUserRestrictions(userId);
    ctx.state.restrictions = restrictions;

    logger.debug('User initialized', { userId, username, restrictionCount: restrictions.length });
  } catch (error) {
    logger.error('Error loading user', { userId, username, error });
    ctx.reply('An error occurred while processing your request. Please try again later.');
  }

  return next(); // Proceed with the next middleware or handler
};

/**
 * Middleware that restricts command access to the group owner only.
 * Checks the user's role in the database and only allows execution if role is 'owner'.
 *
 * @param ctx - Telegraf context object containing user information
 * @param next - Next middleware function to call if user is owner
 * @returns Promise that resolves with error message if not owner, or continues to next middleware
 *
 * @example
 * // Apply to owner-only commands
 * bot.command('setowner', ownerOnly, (ctx) => {
 *   // Only owners can reach this handler
 * });
 */
export const ownerOnly: MiddlewareFn<Context> = (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return ctx.reply('User ID not found.');
  }

  const user = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
  if (user?.role === 'owner') {
    return next();
  }

  return ctx.reply('Only owners can use this command.');
};

/**
 * Middleware that restricts command access to admins or higher roles (admin, owner).
 * Checks the user's role hierarchy and allows execution for admin and owner roles.
 *
 * @param ctx - Telegraf context object containing user information
 * @param next - Next middleware function to call if user has sufficient permissions
 * @returns Promise that resolves with error message if unauthorized, or continues to next middleware
 *
 * @example
 * // Apply to admin-level commands
 * bot.command('ban', adminOrHigher, (ctx) => {
 *   // Only admins and owners can reach this handler
 * });
 */
export const adminOrHigher: MiddlewareFn<Context> = (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return ctx.reply('User ID not found.');
  }

  const user = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
  if (user?.role === 'owner' || user?.role === 'admin') {
    return next();
  }

  return ctx.reply('You do not have permission to use this command.');
};

/**
 * Middleware that restricts command access to elevated or higher roles (elevated, admin, owner).
 * The elevated role provides read-access and limited modification capabilities, suitable for
 * moderators who need visibility but not full administrative control.
 *
 * @param ctx - Telegraf context object containing user information
 * @param next - Next middleware function to call if user has sufficient permissions
 * @returns Promise that resolves with error message if unauthorized, or continues to next middleware
 *
 * @example
 * // Apply to moderator-level commands
 * bot.command('viewstats', elevatedOrHigher, (ctx) => {
 *   // Elevated users, admins, and owners can reach this handler
 * });
 */
export const elevatedOrHigher: MiddlewareFn<Context> = (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return ctx.reply('User ID not found.');
  }

  const user = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
  if (user?.role === 'owner' || user?.role === 'admin' || user?.role === 'elevated') {
    return next();
  }

  return ctx.reply('You do not have permission to use this command.');
};

/**
 * Legacy alias for elevatedOrHigher middleware.
 * @deprecated Use elevatedOrHigher instead
 */
export const isElevated = elevatedOrHigher;

/**
 * Legacy alias for elevatedOrHigher middleware.
 * @deprecated Use elevatedOrHigher instead
 */
export const elevatedUserOnly = elevatedOrHigher;

/**
 * Legacy alias for adminOrHigher middleware.
 * @deprecated Use adminOrHigher instead
 */
export const elevatedAdminOnly = adminOrHigher;
