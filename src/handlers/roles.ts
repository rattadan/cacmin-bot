// src/handlers/roles.ts
import { Telegraf, Context } from 'telegraf';
import { User } from '../types';
import { query, execute } from '../database';
import { ownerOnly, elevatedAdminOnly } from '../middleware/index';
import { logger } from '../utils/logger';
import { config } from '../config';

export const registerRoleHandlers = (bot: Telegraf<Context>) => {
  // Command to set the group owner (initializes master owner from .env)
  bot.command('setowner', async (ctx) => {
    const userId = ctx.from?.id;

    // Only allow if user is the master owner from config or no owner exists yet
    const existingOwner = query<User>('SELECT * FROM users WHERE role = ?', ['owner'])[0];

    if (existingOwner && userId !== config.ownerId) {
      return ctx.reply('Owner already set. Only the master owner can modify ownership.');
    }

    if (userId !== config.ownerId) {
      return ctx.reply('Only the master owner (from .env) can initialize ownership.');
    }

    execute('INSERT OR REPLACE INTO users (id, username, role) VALUES (?, ?, ?)', [
      userId,
      ctx.from.username || 'unknown',
      'owner',
    ]);

    logger.info('Master owner initialized', { userId, username: ctx.from.username });
    ctx.reply('Master owner initialized successfully.');
  });

  // Command to grant owner privileges to another user
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

      logger.info('Owner privileges granted', {
        grantedBy: ownerId,
        targetUsername,
        targetUserId
      });

      await ctx.reply(
        ` Owner privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}\n\n` +
        `The role will be applied when they next interact with the bot.`
      );
    } catch (error) {
      logger.error('Error granting owner privileges', { ownerId, identifier, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to elevate a user (admins and owners can use this)
  bot.command('elevate', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is admin or owner
    const requester = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
    if (requester?.role !== 'admin' && requester?.role !== 'owner') {
      return ctx.reply('You do not have permission to use this command.');
    }

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

      logger.info('User elevated', { adminId: userId, targetUsername, targetUserId });
      await ctx.reply(
        ` Elevated privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}`
      );
    } catch (error) {
      logger.error('Error processing elevate command', { userId, identifier, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to assign admin role
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

      logger.info('User promoted to admin', { ownerId, targetUsername, targetUserId });
      await ctx.reply(
        ` Admin privileges granted!\n\n` +
        `User ID: ${targetUserId}\n` +
        `Username: ${targetUsername ? '@' + targetUsername : 'unknown'}`
      );
    } catch (error) {
      logger.error('Error promoting user to admin', { ownerId, identifier, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to revoke elevated/admin roles (admins can revoke elevated, owners can revoke any)
  bot.command('revoke', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is admin or owner
    const requester = query<User>('SELECT * FROM users WHERE id = ?', [userId])[0];
    if (requester?.role !== 'admin' && requester?.role !== 'owner') {
      return ctx.reply('You do not have permission to use this command.');
    }

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
      logger.info('User privileges revoked', { revokerId: userId, targetUser: targetUser.username, targetId: targetUser.id });
      await ctx.reply(`${targetUser.username || targetUser.id}'s privileges have been revoked.`);
    } catch (error) {
      logger.error('Error revoking user privileges', { userId, identifier, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to list all users with elevated roles
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
    } catch (error) {
      logger.error('Error listing admins', { error });
      await ctx.reply('An error occurred while fetching admin list.');
    }
  });
};
