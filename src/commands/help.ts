import { Telegraf, Context } from 'telegraf';
import { get } from '../database';
import { User } from '../types';

export function registerHelpCommand(bot: Telegraf<Context>): void {
  bot.command('help', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Only allow help command in DMs (private chats)
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('⚠️ The /help command is only available via direct message. Please DM me @' + ctx.botInfo.username);
    }

    const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
    const role = user?.role || 'pleb';

    let helpText = '📚 *CAC Admin Bot \\- Command Reference*\n\n';
    helpText += `Your Role: \`${role}\`\n\n`;

    // Universal commands
    helpText += '*💰 Wallet Commands:*\n';
    helpText += '/balance \\(or /bal\\) \\- Check your wallet balance\n';
    helpText += '/deposit \\- Get deposit instructions\n';
    helpText += '/withdraw \\[amount\\] \\- Withdraw funds to external address\n';
    helpText += '/send \\(or /transfer\\) \\[@user\\|userId\\] \\[amount\\] \\- Send funds to another user\n';
    helpText += '/transactions \\(or /history\\) \\- View your transaction history\n';
    helpText += '/checkdeposit \\- Check status of recent deposits\n';
    helpText += '/wallethelp \\- Detailed wallet usage information\n\n';

    helpText += '*👤 User Commands:*\n';
    helpText += '/mystatus \\- Check your jail status and fines\n';
    helpText += '/jails \\- View all active jails\n';
    helpText += '/violations \\- Check your violations\n\n';

    helpText += '*💳 Payment Commands:*\n';
    helpText += '/payfine \\[violationId\\] \\- Pay a specific fine\n';
    helpText += '/payfines \\- Pay multiple fines interactively\n';
    helpText += '/payallfines \\- Pay all outstanding fines\n';
    helpText += '/paybail \\- Pay your own bail to get out of jail\n';
    helpText += '/paybailfor \\[@username\\|userId\\] \\- Pay bail for another user\n';
    helpText += '/verifybail \\[txHash\\] \\- Verify your bail payment\n';
    helpText += '/verifybailfor \\[userId\\] \\[txHash\\] \\- Verify bail paid for someone\n';
    helpText += '/verifypayment \\[txHash\\] \\- Verify a payment transaction\n\n';

    // Elevated user commands
    if (role === 'elevated' || role === 'admin' || role === 'owner') {
      helpText += '*🔍 Elevated User Commands:*\n';
      helpText += '/viewactions \\- View global restrictions\n';
      helpText += '/viewwhitelist \\- View whitelisted users\n';
      helpText += '/viewblacklist \\- View blacklisted users\n';
      helpText += '/listrestrictions \\[userId\\] \\- View user restrictions\n';
      helpText += '/jailstats \\- View global jail statistics\n\n';
    }

    // Admin commands
    if (role === 'admin' || role === 'owner') {
      helpText += '*⚙️ Admin Commands \\- Role Management:*\n';
      helpText += '/elevate \\[username\\|userId\\] \\- Grant elevated privileges\n';
      helpText += '/revoke \\[username\\|userId\\] \\- Revoke privileges\n';
      helpText += '/listadmins \\- List all users with elevated roles\n\n';

      helpText += '*🚫 Admin Commands \\- Moderation:*\n';
      helpText += '/jail \\(or /silence\\) \\[@user\\|userId\\] \\[minutes\\] \\- Jail user\n';
      helpText += '/unjail \\(or /unsilence\\) \\[@user\\|userId\\] \\- Release user\n';
      helpText += '/warn \\[@user\\|userId\\] \\[reason\\] \\- Issue warning\n';
      helpText += '/clearviolations \\[userId\\] \\- Clear user violations\n';
      helpText += '/addrestriction \\[userId\\] \\[type\\] \\[action\\] \\[until\\] \\- Add restriction\n';
      helpText += '/removerestriction \\[userId\\] \\[type\\] \\- Remove restriction\n\n';

      helpText += '*📋 Admin Commands \\- Lists:*\n';
      helpText += '/addwhitelist \\[userId\\] \\- Whitelist user\n';
      helpText += '/removewhitelist \\[userId\\] \\- Remove from whitelist\n';
      helpText += '/addblacklist \\[@username\\|userId\\] \\- Blacklist user\n';
      helpText += '/removeblacklist \\[@username\\|userId\\] \\- Remove from blacklist\n';
      helpText += '/addaction \\[restriction\\] \\[action\\] \\- Add global restriction\n';
      helpText += '/removeaction \\[restriction\\] \\- Remove global restriction\n\n';

      helpText += '*💎 Admin Commands \\- Treasury:*\n';
      helpText += '/treasury \\- View treasury status\n';
      helpText += '/giveaway \\[@username\\|userId\\] \\[amount\\] \\- Send JUNO to user\n';
      helpText += '/walletstats \\- View wallet statistics\n';
      helpText += '/reconcile \\- Reconcile ledger balances\n';
      helpText += '/stats \\- View bot statistics\n\n';
    }

    // Owner commands
    if (role === 'owner') {
      helpText += '*👑 Owner Commands:*\n';
      helpText += '/setowner \\- Initialize yourself as master owner\n';
      helpText += '/grantowner \\[@username\\|userId\\] \\- Grant owner privileges\n';
      helpText += '/makeadmin \\[username\\] \\- Promote user to admin\n\n';
    }

    // Footer with restriction types
    helpText += '*📝 Restriction Types:*\n';
    helpText += '• `no_stickers` \\- Block stickers\n';
    helpText += '• `no_urls` \\- Block URLs\n';
    helpText += '• `regex_block` \\- Block text patterns\n';
    helpText += '• `no_media` \\- Block photos/videos\n';
    helpText += '• `no_gifs` \\- Block GIFs\n';
    helpText += '• `no_voice` \\- Block voice messages\n';
    helpText += '• `no_forwarding` \\- Block forwarded messages\n\n';

    helpText += '_💡 Tip: Most commands support reply\\-to\\-message for easier user targeting\\._\n';
    helpText += '_Commands can be used with @botname or just the command\\._';

    await ctx.reply(helpText, { parse_mode: 'MarkdownV2' });
  });
}
