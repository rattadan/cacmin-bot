/**
 * Help command handler for the CAC Admin Bot.
 * Provides comprehensive, role-based command reference accessible via DM.
 *
 * Displays commands organized by category:
 * - Wallet commands (deposits, withdrawals, transfers, transactions)
 * - Shared account commands (create, manage, use shared wallets)
 * - User commands (status, jails, violations)
 * - Payment commands (fines, bail)
 * - Elevated commands (view lists, restrictions, create shared accounts)
 * - Admin commands (moderation, treasury, role management)
 * - Owner commands (advanced role management, test suite, full access)
 *
 * @module commands/help
 */

import { Telegraf, Context } from 'telegraf';
import { get } from '../database';
import { User } from '../types';
import { ensureUserExists } from '../services/userService';
import { logger } from '../utils/logger';

/**
 * Registers the help command with the bot.
 *
 * The help command displays a comprehensive list of available commands
 * based on the user's role (pleb, elevated, admin, owner).
 *
 * Command:
 * - /help - Display role-based command reference (DM only)
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerHelpCommand } from './commands/help';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerHelpCommand(bot);
 * ```
 */
export function registerHelpCommand(bot: Telegraf<Context>): void {
  /**
   * Command: /help
   * Display comprehensive, role-based command reference.
   *
   * Permission: Any user
   * Syntax: /help
   * Location: Direct message only
   *
   * Displays different command sets based on user role:
   * - Universal: Wallet, shared accounts, user status, payment commands
   * - Elevated: View restrictions, lists, jail statistics, create shared accounts
   * - Admin: Role management, moderation, treasury, deposits, statistics
   * - Owner: Owner-specific commands, test suite, view any user's data
   *
   * @example
   * User: /help
   * Bot: CAC Admin Bot - Command Reference
   *
   *      Your Role: `pleb`
   *
   *      Wallet Commands:
   *      /balance - Check your wallet balance
   *      /deposit - Get deposit instructions
   *      [... full command list based on role ...]
   */
  bot.command('help', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Only allow help command in DMs (private chats)
    if (ctx.chat?.type !== 'private') {
      const botInfo = await ctx.telegram.getMe();
      return ctx.reply(` The /help command is only available via direct message. Please DM me @${botInfo.username}`);
    }

    try {
      // Ensure user exists in database
      ensureUserExists(userId, ctx.from?.username || 'unknown');

      const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
      const role = user?.role || 'pleb';

    let helpText = '*CAC Admin Bot*\n\n';
    helpText += `Role: \`${role}\`\n\n`;

    // Universal commands
    helpText += '*Wallet:*\n';
    helpText += '/balance \\- Check balance\n';
    helpText += '/deposit \\- Get deposit instructions\n';
    helpText += '/withdraw \\<amt\\> \\<addr\\> \\- Withdraw\n';
    helpText += '/send \\<amt\\> \\<user\\> \\- Send funds\n';
    helpText += '/transactions \\- History\n\n';

    helpText += '*Shared Accounts:*\n';
    helpText += '/myshared \\- Your accounts\n';
    helpText += '/sharedbalance \\<name\\>\n';
    helpText += '/sharedsend \\<name\\> \\<amt\\> \\<user\\>\n';
    helpText += '/grantaccess \\<name\\> \\<user\\> \\<level\\>\n\n';

    helpText += '*User:*\n';
    helpText += '/mystatus \\- Your status\n';
    helpText += '/jails \\- Active jails\n';
    helpText += '/violations \\- Your violations\n\n';

    helpText += '*Payments:*\n';
    helpText += '/payfine \\<id\\> \\- Pay fine\n';
    helpText += '/payallfines \\- Pay all\n';
    helpText += '/paybail \\- Pay your bail\n\n';

    // Send base commands
    await ctx.reply(helpText, { parse_mode: 'MarkdownV2' });

    // Elevated user commands
    if (role === 'elevated' || role === 'admin' || role === 'owner') {
      let elevatedText = '*Elevated:*\n';
      elevatedText += '/viewactions, /viewwhitelist, /viewblacklist\n';
      elevatedText += '/jailstats, /createshared, /listshared\n';
      await ctx.reply(elevatedText, { parse_mode: 'MarkdownV2' });
    }

    // Admin commands
    if (role === 'admin' || role === 'owner') {
      let adminText = '*Admin:*\n';
      adminText += '/jail \\<user\\> \\<mins\\>, /unjail \\<user\\>\n';
      adminText += '/warn, /elevate, /revoke\n';
      adminText += '/addrestriction, /removerestriction\n';
      adminText += '/addblacklist, /removeblacklist\n';
      await ctx.reply(adminText, { parse_mode: 'MarkdownV2' });
    }

    // Owner commands
    if (role === 'owner') {
      let ownerText = '*Owner:*\n';
      ownerText += '/makeadmin, /grantowner\n';
      ownerText += '/treasury, /giveaway, /reconcile\n';
      ownerText += '/stats, /walletstats\n';
      ownerText += '/unclaimeddeposits, /processdeposit\n';
      await ctx.reply(ownerText, { parse_mode: 'MarkdownV2' });
    }
    } catch (error) {
      logger.error('Error in help command', { userId, error });
      await ctx.reply('An error occurred while generating the help text. Please try again or contact support.');
    }
  });
}
