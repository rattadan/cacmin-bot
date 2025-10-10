import { Telegraf, Context } from 'telegraf';
import { JunoService } from '../services/junoService';
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

      // Check bot treasury balance first
      const balance = await JunoService.getBalance();
      if (!balance || balance < amount) {
        return ctx.reply(
          ` Insufficient funds in treasury.\n\n` +
          `Requested: ${amount.toFixed(6)} JUNO\n` +
          `Available: ${balance?.toFixed(6) || '0'} JUNO`
        );
      }

      // Import WalletService
      const { WalletService } = await import('../services/walletService');

      // Create user wallet if doesn't exist
      await WalletService.getOrCreateUserWallet(targetUserId);

      // Send tokens from treasury to user wallet
      const result = await WalletService.sendToUser(
        targetUserId,
        amount,
        `Giveaway from admin ${ctx.from?.username || ctx.from?.id}`
      );

      if (result.success) {
        await ctx.reply(
          ` *Giveaway Sent!*\n\n` +
          `Recipient: ${identifier} (${targetUserId})\n` +
          `Amount: ${amount.toFixed(6)} JUNO\n` +
          `TX: \`${result.txHash}\`\n\n` +
          ` Tokens have been sent to the user's wallet.`,
          { parse_mode: 'Markdown' }
        );

        logger.info('Giveaway completed', {
          adminId: ctx.from?.id,
          recipient: identifier,
          recipientUserId: targetUserId,
          amount,
          txHash: result.txHash
        });
      } else {
        await ctx.reply(
          ` *Giveaway Failed*\n\n` +
          `Error: ${result.error}\n\n` +
          `Please check logs or try again later.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error processing giveaway', error);
      await ctx.reply(' Error processing giveaway.');
    }
  });

  // View collected fines total
  bot.command('treasury', adminOrHigher, async (ctx) => {
    try {
      const balance = await JunoService.getBalance();

      // TODO: Query total collected from violations table
      // const totalCollected = query<{total: number}>(
      //   'SELECT SUM(bail_amount) as total FROM violations WHERE paid = 1',
      //   []
      // )[0]?.total || 0;

      await ctx.reply(
        ` *Treasury Status*\n\n` +
        `Current Balance: *${balance?.toFixed(6) || '0'} JUNO*\n` +
        `Wallet: \`${JunoService.getPaymentAddress()}\`\n\n` +
        `Use /giveaway to distribute funds`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error fetching treasury info', error);
      await ctx.reply(' Error fetching treasury information.');
    }
  });
}
