// src/middleware/index.ts
import { Context, MiddlewareFn } from 'telegraf';
import { ensureUserExists, getUserRestrictions } from '../services/userService';
import { isGroupOwner, hasRole } from '../utils/roles';
import { query } from '../database';
import { User } from '../types';

/**
 * Middleware to ensure users exist in the database and preload restrictions.
 */
export const userManagementMiddleware: MiddlewareFn<Context> = (ctx, next) => {
  if (!ctx.from || !ctx.from.id) {
    console.warn('Request received without user information.');
    return next(); // Skip if no user information is available
  }

  const userId = ctx.from.id;
  const username = ctx.from.username || 'unknown';

  try {
    // Ensure the user is in the database
    ensureUserExists(userId, username);

    // Fetch and preload user restrictions
    const restrictions = getUserRestrictions(userId);
    ctx.state.restrictions = restrictions;

    console.log(`User ${username} (${userId}) restrictions loaded successfully.`);
  } catch (error) {
    console.error(`Error loading user ${username} (${userId}):`, error);
    ctx.reply('An error occurred while processing your request. Please try again later.');
  }

  return next(); // Proceed with the next middleware or handler
};

/**
 * Middleware to restrict access to owners only.
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
 * Middleware to restrict access to admins or higher (admin, owner).
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
 * Middleware to restrict access to elevated or higher (elevated, admin, owner).
 * Elevated users can view information but have limited modification powers.
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

// Legacy aliases for backward compatibility
export const isElevated = elevatedOrHigher;
export const elevatedUserOnly = elevatedOrHigher;
export const elevatedAdminOnly = adminOrHigher;
