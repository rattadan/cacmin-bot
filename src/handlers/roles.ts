/**
 * Role management handlers for the CAC Admin Bot.
 * Implements a four-tier role hierarchy: owner > admin > elevated > pleb.
 * Provides commands for promoting, demoting, and managing user privileges.
 *
 * Role Hierarchy:
 * - owner: Full control, can promote admins and elevated users
 * - admin: Can elevate users and manage restrictions
 * - elevated: Can manage bot functions but cannot assign roles
 * - pleb: Default role for all users
 *
 * @module handlers/roles
 */

import { Telegraf, Context } from 'telegraf';
import { User } from '../types';
import { query, execute } from '../database';
import { ownerOnly, elevatedAdminOnly, adminOrHigher } from '../middleware/index';
import { logger, StructuredLogger } from '../utils/logger';
import { config } from '../config';

/**
 * Registers all role management command handlers with the bot.
 * Provides commands for managing the user role hierarchy and permissions.
 *
 * Commands registered:
 * - /setowner - Initialize the master owner from config
 * - /grantowner - Grant owner privileges to another user
 * - /elevate - Elevate a user to elevated role
 * - /makeadmin - Promote a user to admin role
 * - /revoke - Revoke elevated/admin roles
 * - /listadmins - List all users with elevated privileges
 *
 * @param bot - The Telegraf bot instance
 *
 * @example
 * ```typescript
 * const bot = new Telegraf(token);
 * registerRoleHandlers(bot);
 * ```
 */
export const registerRoleHandlers = (bot: Telegraf<Context>) => {
  /**
   * Command handler for /setowner.
   * Initializes the master owner from the environment configuration.
   * Can only be run once or by the configured master owner.
   *
   * Permission: Master owner from config.ownerId only
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /setowner
   */
  bot.command('setowner', async (ctx) => {
    const userId = ctx.from?.id;

    // Only allow if user is a configured owner from .env
    if (!config.ownerIds.includes(userId!)) {
      return ctx.reply('Only configured owners (from .env OWNER_ID) can use this command.');
    }

    execute('INSERT OR REPLACE INTO users (id, username, role) VALUES (?, ?, ?)', [
      userId,
      ctx.from.username || 'unknown',
      'owner',
    ]);

    StructuredLogger.logSecurityEvent('Master owner initialized', {
      userId,
      username: ctx.from.username,
      operation: 'set_owner'
    });
    ctx.reply('Master owner initialized successfully.');
  });

  /**
   * Command handler for /grantowner.
   * Grants owner privileges to another user by username or user ID.
   * Only existing owner can grant ownership to others.
   *
   * Permission: Owner only (enforced by ownerOnly middleware)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /grantowner <username> or /grantowner <userId>
   * Example: /grantowner @alice
   * Example: /grantowner 123456789
   */
  bot.command('grantowner', ownerOnly, async (ctx) => {
    const ownerId = ctx.from?.id;
    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length === 0) {
      return ctx.reply('Usage: /grantowner <username> or /grantowner <userId>');
    }

    const identifier = args[0];

    try {
      let targetUserId: number;
      let targetUsername: string | undefined;

      // Check if it's a numeric user ID or username
      if (/^\d+$/.test(identifier)) {
        targetUserId = parseInt(identifier);
        // Try to find existing user
        const existingUser = query<User>('SELECT username FROM users WHERE id = ?', [targetUserId])[0];
        targetUsername = existingUser?.username;
      } else {
        // Remove @ if present
        targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        // Try to find existing user
        const existingUser = query<User>('SELECT id FROM users WHERE username = ?', [targetUsername])[0];

        if (!existingUser) {
          return ctx.reply(
            ` User @${targetUsername} not found in database yet.\n\n` +
            `To grant by username, they must have interacted with the bot first.\n` +
            `Use /grantowner <userId> if you know their Telegram user ID.`
          );
        }
        targetUserId = existingUser.id;
      }

      // Insert or update user with owner role
      execute(
        'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)',
        [targetUserId, targetUsername, 'owner', 'owner', targetUsername]
      );

      StructuredLogger.logSecurityEvent('Owner privileges granted', {
        grantedBy: ownerId,
        targetUsername,
        targetUserId,
        operation: 'grant_owner'
      });

      await ctx.reply(
        ` Owner privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}\n\n` +
        `The role will be applied when they next interact with the bot.`
      );
    } catch (error) {
      StructuredLogger.logError(error as Error, { ownerId, identifier, operation: 'grant_owner' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /elevate.
   * Elevates a user to the elevated role.
   * Both admins and owners can elevate users.
   *
   * Permission: Admin or owner role required (enforced by adminOrHigher middleware)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /elevate <username> or /elevate <userId>
   * Example: /elevate @bob
   * Example: /elevate 987654321
   */
  bot.command('elevate', adminOrHigher, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length === 0) {
      logger.warn('Elevate command used with missing identifier', { userId });
      return ctx.reply('Usage: /elevate <username> or /elevate <userId>');
    }

    const identifier = args[0];

    try {
      let targetUserId: number;
      let targetUsername: string | undefined;

      // Check if it's a numeric user ID or username
      if (/^\d+$/.test(identifier)) {
        targetUserId = parseInt(identifier);
        const existingUser = query<User>('SELECT username FROM users WHERE id = ?', [targetUserId])[0];
        targetUsername = existingUser?.username;
      } else {
        targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const existingUser = query<User>('SELECT id FROM users WHERE username = ?', [targetUsername])[0];

        if (!existingUser) {
          return ctx.reply(
            ` User @${targetUsername} not found in database yet.\n\n` +
            `To grant by username, they must have interacted with the bot first.\n` +
            `Use /elevate <userId> if you know their Telegram user ID.`
          );
        }
        targetUserId = existingUser.id;
      }

      // Insert or update user with elevated role
      execute(
        'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)',
        [targetUserId, targetUsername, 'elevated', 'elevated', targetUsername]
      );

      StructuredLogger.logSecurityEvent('User elevated', {
        adminId: userId,
        targetUsername,
        targetUserId,
        operation: 'elevate_user'
      });
      await ctx.reply(
        ` Elevated privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}`
      );
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId, identifier, operation: 'elevate_user' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /makeadmin.
   * Promotes a user to admin role.
   * Only owners can create admins.
   *
   * Permission: Owner only (enforced by ownerOnly middleware)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /makeadmin <username> or /makeadmin <userId>
   * Example: /makeadmin @charlie
   * Example: /makeadmin 555444333
   */
  bot.command('makeadmin', ownerOnly, async (ctx) => {
    const ownerId = ctx.from?.id;
    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length === 0) {
      logger.warn('Makeadmin command invoked without identifier', { ownerId });
      return ctx.reply('Usage: /makeadmin <username> or /makeadmin <userId>');
    }

    const identifier = args[0];

    try {
      let targetUserId: number;
      let targetUsername: string | undefined;

      // Check if it's a numeric user ID or username
      if (/^\d+$/.test(identifier)) {
        targetUserId = parseInt(identifier);
        const existingUser = query<User>('SELECT username FROM users WHERE id = ?', [targetUserId])[0];
        targetUsername = existingUser?.username;
      } else {
        targetUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const existingUser = query<User>('SELECT id FROM users WHERE username = ?', [targetUsername])[0];

        if (!existingUser) {
          return ctx.reply(
            ` User @${targetUsername} not found in database yet.\n\n` +
            `To grant by username, they must have interacted with the bot first.\n` +
            `Use /makeadmin <userId> if you know their Telegram user ID.`
          );
        }
        targetUserId = existingUser.id;
      }

      // Insert or update user with admin role
      execute(
        'INSERT INTO users (id, username, role) VALUES (?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET role = ?, username = COALESCE(?, username)',
        [targetUserId, targetUsername, 'admin', 'admin', targetUsername]
      );

      StructuredLogger.logSecurityEvent('User promoted to admin', {
        ownerId,
        targetUsername,
        targetUserId,
        operation: 'make_admin'
      });
      await ctx.reply(
        ` Admin privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}`
      );
    } catch (error) {
      StructuredLogger.logError(error as Error, { ownerId, identifier, operation: 'make_admin' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /revoke.
   * Revokes elevated or admin privileges from a user, demoting them to pleb.
   * Admins can only revoke elevated users. Owners can revoke any role except other owners.
   *
   * Permission: Admin or owner role required (enforced by adminOrHigher middleware)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /revoke <username> or /revoke <userId>
   * Example: /revoke @bob
   * Example: /revoke 987654321
   */
  bot.command('revoke', adminOrHigher, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Get requester role for additional permission check
    const requester = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];

    const args = ctx.message?.text.split(' ').slice(1);
    if (!args || args.length === 0) {
      logger.warn('Revoke command invoked without identifier', { userId });
      return ctx.reply('Usage: /revoke <username> or /revoke <userId>');
    }

    const identifier = args[0];

    try {
      let targetUser: User | undefined;

      // Check if it's a numeric user ID or username
      if (/^\d+$/.test(identifier)) {
        targetUser = query<User>('SELECT * FROM users WHERE id = ?', [parseInt(identifier)])[0];
      } else {
        // Remove @ if present
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        targetUser = query<User>('SELECT * FROM users WHERE username = ?', [username])[0];
      }

      if (!targetUser) {
        logger.warn('Revoke command failed: User not found', { userId, identifier });
        return ctx.reply('User not found.');
      }

      // Admins can only revoke elevated users, not other admins or owners
      if (requester.role === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner')) {
        return ctx.reply('You can only revoke elevated users. Contact an owner to revoke admin or owner privileges.');
      }

      execute('UPDATE users SET role = ? WHERE id = ?', ['pleb', targetUser.id]);
      StructuredLogger.logSecurityEvent('User privileges revoked', {
        revokerId: userId,
        targetUsername: targetUser.username,
        targetId: targetUser.id,
        operation: 'revoke_privileges'
      });
      await ctx.reply(`${targetUser.username || targetUser.id}'s privileges have been revoked.`);
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId, identifier, operation: 'revoke_privileges' });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  /**
   * Command handler for /listadmins.
   * Lists all users with elevated privileges (owner, admin, elevated).
   * Organized by role hierarchy.
   *
   * Permission: Elevated admin or owner (enforced by elevatedAdminOnly middleware)
   *
   * @param ctx - Telegraf context
   *
   * @example
   * Usage: /listadmins
   */
  bot.command('listadmins', elevatedAdminOnly, async (ctx) => {
    try {
      const privilegedUsers = query<User>(
        "SELECT id, username, role FROM users WHERE role IN ('owner', 'admin', 'elevated') ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'elevated' THEN 3 END",
        []
      );

      if (privilegedUsers.length === 0) {
        return ctx.reply('No users with elevated privileges found.');
      }

      let message = ' Users with elevated privileges:\n\n';

      const owners = privilegedUsers.filter(u => u.role === 'owner');
      const admins = privilegedUsers.filter(u => u.role === 'admin');
      const elevated = privilegedUsers.filter(u => u.role === 'elevated');

      if (owners.length > 0) {
        message += ' Owners:\n';
        owners.forEach(u => message += `  • @${u.username || u.id} (${u.id})\n`);
        message += '\n';
      }

      if (admins.length > 0) {
        message += ' Admins:\n';
        admins.forEach(u => message += `  • @${u.username || u.id} (${u.id})\n`);
        message += '\n';
      }

      if (elevated.length > 0) {
        message += ' Elevated:\n';
        elevated.forEach(u => message += `  • @${u.username || u.id} (${u.id})\n`);
      }

      await ctx.reply(message);

      StructuredLogger.logUserAction('Admin list queried', {
        userId: ctx.from?.id,
        operation: 'list_admins',
        count: privilegedUsers.length.toString()
      });
    } catch (error) {
      StructuredLogger.logError(error as Error, { userId: ctx.from?.id, operation: 'list_admins' });
      await ctx.reply('An error occurred while fetching admin list.');
    }
  });
};
