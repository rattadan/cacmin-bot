// src/handlers/roles.ts
import { Telegraf, Context } from 'telegraf';
import { User } from '../types';
import { query, execute } from '../database';
import { ownerOnly, elevatedAdminOnly } from '../middleware/index';
import { logger } from '../utils/logger';

export const registerRoleHandlers = (bot: Telegraf<Context>) => {
  // Command to set the group owner
  bot.command('setowner', async (ctx) => {
    const admins = await ctx.getChatAdministrators();
    const owner = admins.find((admin) => admin.status === 'creator');
    
    if (!owner) {
      return ctx.reply('Could not determine the group owner.');
    }
  
    execute('INSERT OR REPLACE INTO users (id, username, role) VALUES (?, ?, ?)', [
      owner.user.id,
      owner.user.username,
      'owner',
    ]);
    ctx.reply(`Group owner set to @${owner.user.username}.`);
  });

  // Command to elevate a user
  bot.command('elevate', elevatedAdminOnly, async (ctx) => {
    const userId = ctx.from?.id;
    const [username] = ctx.message?.text.split(' ').slice(1);

    if (!username) {
      logger.warn('Elevate command used with missing username', { userId });
      return ctx.reply('Usage: /elevate <username>');
    }

    try {
      const user = query<User>('SELECT * FROM users WHERE username = ?', [username])[0];
      if (!user) {
        logger.warn('Elevate command failed: User not found', { userId, username });
        return ctx.reply('User not found.');
      }

      execute('UPDATE users SET role = ? WHERE id = ?', ['elevated', user.id]);
      logger.info('User elevated', { adminId: userId, targetUser: username, targetId: user.id });
      await ctx.reply(`${username} has been granted elevated privileges.`);
    } catch (error) {
      logger.error('Error processing elevate command', { userId, username, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to assign admin role
  bot.command('makeadmin', ownerOnly, async (ctx) => {
    const ownerId = ctx.from?.id;
    const [username] = ctx.message?.text.split(' ').slice(1);

    if (!username) {
      logger.warn('Makeadmin command invoked without a username', { ownerId });
      return ctx.reply('Usage: /makeadmin <username>');
    }

    try {
      const user = query<User>('SELECT * FROM users WHERE username = ?', [username])[0];
      if (!user) {
        logger.warn('Makeadmin command failed: User not found', { ownerId, username });
        return ctx.reply('User not found.');
      }

      execute('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
      logger.info('User promoted to admin', { ownerId, targetUser: username, targetId: user.id });
      await ctx.reply(`${username} has been made an admin.`);
    } catch (error) {
      logger.error('Error promoting user to admin', { ownerId, username, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });

  // Command to revoke elevated/admin roles
  bot.command('revoke', ownerOnly, async (ctx) => {
    const ownerId = ctx.from?.id;
    const [username] = ctx.message?.text.split(' ').slice(1);

    if (!username) {
      logger.warn('Revoke command invoked without a username', { ownerId });
      return ctx.reply('Usage: /revoke <username>');
    }

    try {
      const user = query<User>('SELECT * FROM users WHERE username = ?', [username])[0];
      if (!user) {
        logger.warn('Revoke command failed: User not found', { ownerId, username });
        return ctx.reply('User not found.');
      }

      execute('UPDATE users SET role = ? WHERE id = ?', ['pleb', user.id]);
      logger.info('User privileges revoked', { ownerId, targetUser: username, targetId: user.id });
      await ctx.reply(`${username}'s privileges have been revoked.`);
    } catch (error) {
      logger.error('Error revoking user privileges', { ownerId, username, error });
      await ctx.reply('An error occurred while processing the request.');
    }
  });
};
