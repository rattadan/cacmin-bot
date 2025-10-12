import { Telegraf, Context } from 'telegraf';
import { JunoService } from '../services/junoService';
import { WalletServiceV2 } from '../services/walletServiceV2';
import { adminOrHigher } from '../middleware/index';
import { logger } from '../utils/logger';

export function registerGiveawayCommands(bot: Telegraf<Context>): void {
  // Check wallet balance
  bot.command('balance', adminOrHigher, async (ctx) => {
    try {
      const balance = await JunoService.getBalance();

      if (!balance) {
        return ctx.reply(' Unable to fetch wallet balance.');
      }

      await ctx.reply(
        ` *Bot Wallet Balance*\n\n` +
        `Address: \`${JunoService.getPaymentAddress()}\`\n` +
        `Balance: *${balance.toFixed(6)} JUNO*`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error fetching balance', error);
      await ctx.reply(' Error fetching wallet balance.');
    }
  });

  // Send giveaway to a user
  bot.command('giveaway', adminOrHigher, async (ctx) => {
    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length < 2) {
      return ctx.reply(
        ' *Giveaway Command*\n\n' +
        'Usage: `/giveaway <@username|userId> <amount>`\n\n' +
        'Example: `/giveaway @alice 10.5`\n' +
        'Example: `/giveaway 123456789 5`',
        { parse_mode: 'Markdown' }
      );
    }

    const identifier = args[0];
    const amount = parseFloat(args[1]);

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply(' Invalid amount. Must be a positive number.');
    }

    try {
      // Resolve userId from identifier
      let targetUserId: number;
      if (/^\d+$/.test(identifier)) {
        // Direct userId
        targetUserId = parseInt(identifier);
      } else {
        // Username lookup
        const username = identifier.startsWith('@') ? identifier.substring(1) : identifier;
        const { query } = await import('../database');
        type UserRecord = { id: number };
        const user = query<UserRecord>('SELECT id FROM users WHERE username = ?', [username])[0];

        if (!user) {
          return ctx.reply(` User ${identifier} not found. They must have interacted with the bot first.`);
        }
        targetUserId = user.id;
      }

      // NOTE: This credits the user's internal balance in the ledger system.
      // The bot treasury (on-chain balance) is separate and used for backing withdrawals.
      // Future enhancement: Transfer from treasury to userFunds wallet to back these credits.

      // Distribute giveaway using internal ledger
      const result = await WalletServiceV2.distributeGiveaway(
        [targetUserId],
        amount,
        `Giveaway from admin ${ctx.from?.username || ctx.from?.id}`
      );

      if (result.succeeded.length > 0) {
        await ctx.reply(
          ` *Giveaway Sent!*\n\n` +
          `Recipient: ${identifier} (${targetUserId})\n` +
          `Amount: ${amount.toFixed(6)} JUNO\n\n` +
          ` Tokens have been credited to the user's internal balance.\n` +
          `They can check their balance with /mybalance`,
          { parse_mode: 'Markdown' }
        );

        logger.info('Giveaway completed', {
          adminId: ctx.from?.id,
          recipient: identifier,
          recipientUserId: targetUserId,
          amount,
          distributed: result.totalDistributed
        });
      } else {
        await ctx.reply(
          ` *Giveaway Failed*\n\n` +
          `Unable to credit user ${identifier} (${targetUserId})\n\n` +
          `Please check logs or try again later.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error processing giveaway', error);
      await ctx.reply(' Error processing giveaway.');
    }
  });

  // View treasury and internal ledger status
  bot.command('treasury', adminOrHigher, async (ctx) => {
    try {
      // On-chain treasury balance
      const treasuryBalance = await JunoService.getBalance();
      const treasuryAddress = JunoService.getPaymentAddress();

      // Internal ledger statistics
      const { query } = await import('../database');
      type CollectedTotal = { total: number | null };

      const finesResult = query<CollectedTotal>(
        'SELECT SUM(amount) as total FROM transactions WHERE transaction_type = ? AND status = ?',
        ['fine', 'completed']
      );
      const totalFines = finesResult[0]?.total || 0;

      const bailResult = query<CollectedTotal>(
        'SELECT SUM(amount) as total FROM transactions WHERE transaction_type = ? AND status = ?',
        ['bail', 'completed']
      );
      const totalBail = bailResult[0]?.total || 0;

      // Get internal ledger total (all user balances)
      const internalBalances = query<{ total: number | null }>(
        'SELECT SUM(balance) as total FROM user_balances'
      );
      const totalUserBalances = internalBalances[0]?.total || 0;

      await ctx.reply(
        ` *Treasury & Ledger Status*\n\n` +
        `*🏦 On-Chain Treasury Wallet:*\n` +
        `Address: \`${treasuryAddress}\`\n` +
        `Balance: *${treasuryBalance?.toFixed(6) || '0'} JUNO*\n` +
        `Purpose: Receives bail/fine payments via on-chain transfers\n\n` +
        `*📒 Internal Ledger System:*\n` +
        `Total User Balances: \`${totalUserBalances.toFixed(6)} JUNO\`\n` +
        `Fines Collected: \`${totalFines.toFixed(6)} JUNO\` (deducted from users)\n` +
        `Bail Collected: \`${totalBail.toFixed(6)} JUNO\` (deducted from users)\n\n` +
        `*Note:* Treasury and ledger are separate systems.\n` +
        `• Treasury: On-chain wallet for direct payments\n` +
        `• Ledger: Internal accounting for user balances\n\n` +
        `Use /giveaway to distribute funds\n` +
        `Use /walletstats for detailed reconciliation`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error fetching treasury info', error);
      await ctx.reply(' Error fetching treasury information.');
    }
  });
}
