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

    let helpText = '*CAC Admin Bot \\- Command Reference*\n\n';
    helpText += `Your Role: \`${role}\`\n\n`;

    // Universal commands
    helpText += '*Wallet Commands:*\n';
    helpText += '/balance \\(or /bal\\) \\- Check your wallet balance\n';
    helpText += '/deposit \\- Get deposit instructions with unique memo\n';
    helpText += '/withdraw \\<amount\\> \\<address\\> \\- Withdraw funds to external Juno address\n';
    helpText += '/send \\<amount\\> \\<@user\\|userId\\|address\\> \\- Send funds internally or externally\n';
    helpText += '/transfer \\- Alias for /send\n';
    helpText += '/transactions \\(or /history\\) \\- View your transaction history\n';
    helpText += '/checkdeposit \\(or /checktx\\) \\<tx\\_hash\\> \\- Check status of a deposit\n';
    helpText += '/verifydeposit \\<tx\\_hash\\> \\- Verify and credit a deposit transaction\n';
    helpText += '/wallethelp \\- Detailed wallet usage information\n\n';

    helpText += '*Shared Accounts:*\n';
    helpText += '/myshared \\- View your shared accounts\n';
    helpText += '/sharedbalance \\<account\\_name\\> \\- Check shared account balance\n';
    helpText += '/sharedsend \\<account\\_name\\> \\<amount\\> \\<recipient\\> \\- Send from shared account\n';
    helpText += '/shareddeposit \\<account\\_name\\> \\- Get deposit instructions for shared account\n';
    helpText += '/sharedinfo \\<account\\_name\\> \\- View shared account info and permissions\n';
    helpText += '/sharedhistory \\<account\\_name\\> \\- View shared account transaction history\n';
    helpText += '/grantaccess \\<account\\_name\\> \\<@user\\|userId\\> \\<view\\|spend\\|admin\\> \\- Grant access\n';
    helpText += '/revokeaccess \\<account\\_name\\> \\<@user\\|userId\\> \\- Revoke access\n';
    helpText += '/updateaccess \\<account\\_name\\> \\<@user\\|userId\\> \\<level\\> \\- Update permissions\n';
    helpText += '/deleteshared \\<account\\_name\\> \\- Delete shared account \\(admin only\\)\n\n';

    helpText += '*User Commands:*\n';
    helpText += '/mystatus \\- Check your jail status and fines\n';
    helpText += '/jails \\- View all active jails\n';
    helpText += '/violations \\- Check your violations\n\n';

    helpText += '*Payment Commands:*\n';
    helpText += '/payfine \\<violationId\\> \\- Pay a specific fine\n';
    helpText += '/payfines \\- Pay multiple fines interactively\n';
    helpText += '/payallfines \\- Pay all outstanding fines\n';
    helpText += '/paybail \\- Pay your own bail to get out of jail\n';
    helpText += '/paybailfor \\<@username\\|userId\\> \\- Pay bail for another user\n';
    helpText += '/verifybail \\<txHash\\> \\- Verify your bail payment\n';
    helpText += '/verifybailfor \\<userId\\> \\<txHash\\> \\- Verify bail paid for someone\n';
    helpText += '/verifypayment \\<txHash\\> \\- Verify a payment transaction\n\n';

    // Elevated user commands
    if (role === 'elevated' || role === 'admin' || role === 'owner') {
      helpText += '*Elevated User Commands:*\n';
      helpText += '/viewactions \\- View global restrictions\n';
      helpText += '/viewwhitelist \\- View whitelisted users\n';
      helpText += '/viewblacklist \\- View blacklisted users\n';
      helpText += '/listrestrictions \\<userId\\> \\- View user restrictions\n';
      helpText += '/jailstats \\- View global jail statistics\n';
      helpText += '/createshared \\<name\\> \\<display\\_name\\> \\[description\\] \\- Create shared account\n';
      helpText += '/listshared \\- List all shared accounts\n\n';
    }

    // Admin commands
    if (role === 'admin' || role === 'owner') {
      helpText += '*Admin Commands \\- Role Management:*\n';
      helpText += '/elevate \\<username\\|userId\\> \\- Grant elevated privileges\n';
      helpText += '/revoke \\<username\\|userId\\> \\- Revoke privileges\n';
      helpText += '/listadmins \\- List all users with elevated roles\n\n';

      helpText += '*Admin Commands \\- Moderation:*\n';
      helpText += '/jail \\<@user\\|userId\\> \\<minutes\\> \\- Jail user \\(reply to message supported\\)\n';
      helpText += '/unjail \\<@user\\|userId\\> \\- Release user from jail\n';
      helpText += '/silence \\- Alias for /jail\n';
      helpText += '/unsilence \\- Alias for /unjail\n';
      helpText += '/warn \\<userId\\> \\<reason\\> \\- Issue warning to user\n';
      helpText += '/addrestriction \\<userId\\> \\<type\\> \\<action\\> \\<until\\> \\- Add user restriction\n';
      helpText += '/removerestriction \\<userId\\> \\<type\\> \\- Remove user restriction\n\n';

      helpText += '*Admin Commands \\- Lists:*\n';
      helpText += '/addwhitelist \\<userId\\> \\- Add user to whitelist\n';
      helpText += '/removewhitelist \\<userId\\> \\- Remove from whitelist\n';
      helpText += '/addblacklist \\<@username\\|userId\\> \\- Add user to blacklist\n';
      helpText += '/removeblacklist \\<@username\\|userId\\> \\- Remove from blacklist\n';
      helpText += '/addaction \\<restriction\\> \\<action\\> \\- Add global restriction\n';
      helpText += '/removeaction \\<restriction\\> \\- Remove global restriction\n\n';
    }

    // Owner commands
    if (role === 'owner') {
      helpText += '*Owner Commands \\- Role Management:*\n';
      helpText += '/setowner \\- Initialize yourself as master owner\n';
      helpText += '/grantowner \\<@username\\|userId\\> \\- Grant owner privileges to another user\n';
      helpText += '/makeadmin \\<@username\\|userId\\> \\- Promote user to admin role\n';
      helpText += '/clearviolations \\<userId\\> \\- Clear all violations for a user\n\n';

      helpText += '*Owner Commands \\- Treasury \\& Wallet Management:*\n';
      helpText += '/botbalance \\- Check bot on\\-chain wallet balance\n';
      helpText += '/treasury \\- View comprehensive treasury \\& ledger status\n';
      helpText += '/giveaway \\<@username\\|userId\\> \\<amount\\> \\- Credit JUNO to user balance\n';
      helpText += '/walletstats \\- View detailed wallet statistics\n';
      helpText += '/reconcile \\- Reconcile ledger balances\n';
      helpText += '/stats \\- View comprehensive bot statistics\n\n';

      helpText += '*Owner Commands \\- Data Access:*\n';
      helpText += '/transactions \\<userId\\> \\- View any user transaction history\n';
      helpText += '/unclaimeddeposits \\- View all unclaimed deposits\n';
      helpText += '/processdeposit \\<tx\\_hash\\> \\- Manually process pending deposit\n';
      helpText += '/claimdeposit \\<tx\\_hash\\> \\<userId\\> \\- Manually assign unclaimed deposit\n\n';

      helpText += '*Owner Commands \\- Testing:*\n';
      helpText += '/testbalance \\- Test balance checking functionality\n';
      helpText += '/testdeposit \\- Test deposit instructions\n';
      helpText += '/testtransfer \\- Test internal transfer\n';
      helpText += '/testfine \\- Test fine payment\n';
      helpText += '/testwithdraw \\- Test withdrawal \\(dry run\\)\n';
      helpText += '/testverify \\- Test transaction verification\n';
      helpText += '/testwalletstats \\- Test wallet statistics\n';
      helpText += '/testsimulatedeposit \\- Simulate a deposit for testing\n';
      helpText += '/testhistory \\- Test transaction history display\n';
      helpText += '/testfullflow \\- Run comprehensive system flow test\n\n';
    }

    // Footer with restriction types
    helpText += '*Restriction Types:*\n';
    helpText += '• `no_stickers` \\- Block stickers\n';
    helpText += '• `no_urls` \\- Block URLs\n';
    helpText += '• `regex_block` \\- Block text patterns\n';
    helpText += '• `no_media` \\- Block photos/videos\n';
    helpText += '• `no_gifs` \\- Block GIFs\n';
    helpText += '• `no_voice` \\- Block voice messages\n';
    helpText += '• `no_forwarding` \\- Block forwarded messages\n\n';

    helpText += '_ Tip: Most commands support reply\\-to\\-message for easier user targeting\\._\n';
    helpText += '_Commands can be used with @botname or just the command\\._';

      await ctx.reply(helpText, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      logger.error('Error in help command', { userId, error });
      await ctx.reply('An error occurred while generating the help text. Please try again or contact support.');
    }
  });
}
