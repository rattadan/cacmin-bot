/**
 * @module utils/roles
 * @description Role checking and authorization utilities for the bot's permission system.
 * Implements a four-tier role hierarchy (owner > admin > elevated > pleb/default) with
 * database-backed role lookups. Used by middleware and command handlers to verify permissions.
 */

import { User } from '../types';
import { query } from '../database';

/**
 * Checks if a user ID matches the group owner ID.
 * Simple equality check for owner verification.
 *
 * @param userId - The user ID to check
 * @param ownerId - The group owner's user ID
 * @returns True if the user is the owner, false otherwise
 *
 * @example
 * const isOwner = isGroupOwner(ctx.from.id, 123456);
 * if (isOwner) {
 *   // Allow owner-only operation
 * }
 */
export const isGroupOwner = (userId: number, ownerId: number): boolean => userId === ownerId;

/**
 * Checks if a user has a specific role in the database.
 * Performs exact role matching - does not check role hierarchy.
 * For hierarchy-aware checks, use checkIsElevated or middleware functions.
 *
 * @param userId - The user ID to check
 * @param role - The specific role to check for ('owner', 'admin', 'elevated', or 'default')
 * @returns True if user has exactly the specified role, false otherwise
 *
 * @example
 * if (hasRole(userId, 'admin')) {
 *   // User is specifically an admin
 * }
 *
 * @example
 * if (hasRole(userId, 'elevated')) {
 *   // User has elevated role
 * }
 */
export const hasRole = (userId: number, role: 'owner' | 'admin' | 'elevated' | 'default'): boolean => {
  const user = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
  return user?.role === role;
};

/**
 * Checks if a user has elevated permissions using role hierarchy.
 * Returns true if user is owner, admin, or elevated role. This is a hierarchy-aware
 * check suitable for determining if a user has moderator-level or higher permissions.
 *
 * Role hierarchy (high to low):
 * 1. owner - Full control
 * 2. admin - Administrative powers
 * 3. elevated - Moderator/viewing permissions
 * 4. pleb/default - Regular user
 *
 * @param userId - The user ID to check
 * @returns True if user has elevated role or higher, false otherwise
 *
 * @example
 * if (checkIsElevated(ctx.from.id)) {
 *   // User is owner, admin, or elevated - allow moderator actions
 *   await ctx.reply('You have elevated permissions');
 * }
 *
 * @example
 * // Use in command handlers to check permissions
 * const canViewStats = checkIsElevated(userId);
 * if (canViewStats) {
 *   // Show admin statistics
 * }
 */
export const checkIsElevated = (userId: number): boolean => {
  const user = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
  return user?.role === 'owner' || user?.role === 'admin' || user?.role === 'elevated';
};
