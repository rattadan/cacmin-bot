import { Telegraf, Context } from 'telegraf';
import { get } from '../database';
import { User } from '../types';

export function registerHelpCommand(bot: Telegraf<Context>): void {
  bot.command('help', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
    const role = user?.role || 'pleb';

    let helpText = ' *Available Commands*\n\n';

    // Universal commands
    helpText += '*General:*\n';
    helpText += '/help \\- Show this help message\n';
    helpText += '/wallet \\- View your wallet address and balance\n';
    helpText += '/mybalance \\- Check your wallet balance\n';
    helpText += '/deposit \\- Get deposit instructions\n';
    helpText += '/mystatus \\- Check your jail status and fines\n';
    helpText += '/jails \\- View all active jails\n';
    helpText += '/violations \\- Check your violations\n';
    helpText += '/payfine \\[violationId\\] \\- Pay a specific fine\n';
    helpText += '/paybail \\- Pay your own bail to get out of jail\n';
    helpText += '/paybailfor \\[@username\\|userId\\] \\- Pay bail for another user\n';
    helpText += '/verifybail \\[txHash\\] \\- Verify your bail payment\n';
    helpText += '/verifybailfor \\[userId\\] \\[txHash\\] \\- Verify bail paid for someone\n\n';

    // Elevated user commands
    if (role === 'elevated' || role === 'admin' || role === 'owner') {
      helpText += '*Elevated User Commands:*\n';
      helpText += '/viewactions \\- View global restrictions\n';
      helpText += '/viewwhitelist \\- View whitelisted users\n';
      helpText += '/viewblacklist \\- View blacklisted users\n';
      helpText += '/listrestrictions \\[userId\\] \\- View user restrictions\n\n';
    }

    // Admin commands
    if (role === 'admin' || role === 'owner') {
      helpText += '*Admin Commands:*\n';
      helpText += '/elevate \\[username\\|userId\\] \\- Grant elevated privileges\n';
      helpText += '/revoke \\[username\\|userId\\] \\- Revoke privileges\n';
      helpText += '/listadmins \\- List all users with elevated roles\n';
      helpText += '/addrestriction \\[userId\\] \\[type\\] \\[action\\] \\[until\\] \\- Add restriction\n';
      helpText += '/removerestriction \\[userId\\] \\[type\\] \\- Remove restriction\n';
      helpText += '/addwhitelist \\[userId\\] \\- Whitelist user\n';
      helpText += '/removewhitelist \\[userId\\] \\- Remove from whitelist\n';
      helpText += '/addblacklist \\[@username\\|userId\\] \\- Blacklist user\n';
      helpText += '/removeblacklist \\[@username\\|userId\\] \\- Remove from blacklist\n';
      helpText += '/jail \\[@username\\|userId\\] \\[minutes\\] \\- Jail user \\(also: /silence\\)\n';
      helpText += '/unjail \\[@username\\|userId\\] \\- Release user \\(also: /unsilence\\)\n';
      helpText += '/warn \\[@username\\|userId\\] \\[reason\\] \\- Issue warning\n\n';

      helpText += '*Treasury Commands:*\n';
      helpText += '/balance \\- Check bot wallet balance\n';
      helpText += '/treasury \\- View treasury status\n';
      helpText += '/giveaway \\[@username\\|userId\\] \\[amount\\] \\- Send JUNO to user\n\n';
    }

    // Owner commands
    if (role === 'owner') {
      helpText += '*Owner Commands:*\n';
      helpText += '/setowner \\- Initialize yourself as master owner\n';
      helpText += '/grantowner \\[@username\\|userId\\] \\- Grant owner privileges to another user\n';
      helpText += '/makeadmin \\[username\\] \\- Promote to admin\n';
      helpText += '/revoke \\[username\\] \\- Revoke privileges\n';
      helpText += '/clearviolations \\[userId\\] \\- Clear violations\n';
      helpText += '/stats \\- View bot statistics\n';
      helpText += '/addaction \\[restriction\\] \\[action\\] \\- Add global restriction\n';
      helpText += '/removeaction \\[restriction\\] \\- Remove global restriction\n\n';
    }

    helpText += '*Restriction Types:*\n';
    helpText += '• `no_stickers` \\- Block stickers\n';
    helpText += '• `no_urls` \\- Block URLs\n';
    helpText += '• `regex_block` \\- Block text patterns\n';
    helpText += '• `no_media` \\- Block photos/videos\n';
    helpText += '• `no_gifs` \\- Block GIFs\n';
    helpText += '• `no_voice` \\- Block voice messages\n';
    helpText += '• `no_forwarding` \\- Block forwarded messages\n';

    await ctx.reply(helpText, { parse_mode: 'MarkdownV2' });
  });
}
