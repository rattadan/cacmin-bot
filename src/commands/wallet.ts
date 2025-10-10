import { Telegraf, Context } from 'telegraf';
import { WalletService } from '../services/walletService';
import { adminOrHigher } from '../middleware/index';
import { logger } from '../utils/logger';

export function registerWalletCommands(bot: Telegraf<Context>): void {
  // Helper to check if in DM
  const isDM = (ctx: Context): boolean => {
    return ctx.chat?.type === 'private';
  };

  // Get or create user wallet
  bot.command('wallet', async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    if (!userId) return;

    // Only allow in DM
    if (!isDM(ctx)) {
      return ctx.reply('⚠️ Wallet commands can only be used in direct messages with the bot.');
    }

    try {
      const wallet = await WalletService.getOrCreateUserWallet(userId, username);
      const balance = await WalletService.getUserBalance(userId);

      await ctx.reply(
        `💼 *Your Wallet*\n\n` +
        `Address: \`${wallet.address}\`\n` +
        `Balance: *${balance.toFixed(6)} JUNO*\n\n` +
        `HD Path: \`${wallet.hdPath}\`\n\n` +
        `_You can deposit JUNO to this address to pay fines or receive giveaways._\n\n` +
        `Commands:\n` +
        `/mybalance - Check your balance\n` +
        `/deposit - Get deposit instructions\n` +
        `/send <address> <amount> - Send JUNO to an address`,
        { parse_mode: 'Markdown' }
      );

      logger.info('User wallet accessed', { userId, username, address: wallet.address });
    } catch (error) {
      logger.error('Error accessing wallet', { userId, error });
      await ctx.reply('❌ Error accessing wallet. Please try again later.');
    }
  });

  // Check balance
  bot.command('mybalance', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!isDM(ctx)) {
      return ctx.reply('⚠️ Wallet commands can only be used in direct messages with the bot for security reasons.');
    }

    try {
      // Create wallet if doesn't exist
      await WalletService.getOrCreateUserWallet(userId, ctx.from?.username);
      const balance = await WalletService.getUserBalance(userId);

      await ctx.reply(
        `💰 *Your Balance*\n\n` +
        `${balance.toFixed(6)} JUNO\n\n` +
        `Use /wallet to see your full wallet details`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error fetching balance', { userId, error });
      await ctx.reply('❌ Error fetching balance. Please try again later.');
    }
  });

  // Deposit instructions
  bot.command('deposit', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!isDM(ctx)) {
      return ctx.reply('⚠️ Wallet commands can only be used in direct messages with the bot.');
    }

    try {
      const wallet = await WalletService.getOrCreateUserWallet(userId, ctx.from?.username);

      await ctx.reply(
        `📥 *Deposit JUNO*\n\n` +
        `Send JUNO to this address:\n\n` +
        `\`${wallet.address}\`\n\n` +
        `⚠️ *Important:*\n` +
        `• Only send JUNO tokens\n` +
        `• This wallet is managed by the bot\n` +
        `• Your funds are secured by the master mnemonic\n` +
        `• In case of database loss, wallets can be restored using your Telegram user ID\n\n` +
        `Use /mybalance to check your balance after depositing`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error showing deposit info', { userId, error });
      await ctx.reply('❌ Error getting deposit information.');
    }
  });

  // Send tokens to another address
  bot.command('send', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!isDM(ctx)) {
      return ctx.reply('⚠️ Wallet commands can only be used in direct messages with the bot.');
    }

    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length < 2) {
      return ctx.reply(
        '📤 *Send JUNO*\n\n' +
        'Usage: `/send <address> <amount>`\n\n' +
        'Example: `/send juno1abc...xyz 5.5`\n\n' +
        '⚠️ Note: Transaction fees will be deducted from your balance.',
        { parse_mode: 'Markdown' }
      );
    }

    const recipientAddress = args[0];
    const amount = parseFloat(args[1]);

    // Validate address format (basic check)
    if (!recipientAddress.startsWith('juno1') || recipientAddress.length < 39) {
      return ctx.reply('❌ Invalid Juno address format. Address must start with "juno1".');
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Must be a positive number.');
    }

    try {
      // Check user balance
      const balance = await WalletService.getUserBalance(userId);

      // Reserve 0.1 JUNO for transaction fees
      const feeReserve = 0.1;
      const maxSendable = Math.max(0, balance - feeReserve);

      if (amount > maxSendable) {
        return ctx.reply(
          `❌ Insufficient balance.\n\n` +
          `Your balance: ${balance.toFixed(6)} JUNO\n` +
          `Requested: ${amount.toFixed(6)} JUNO\n` +
          `Max sendable: ${maxSendable.toFixed(6)} JUNO\n\n` +
          `_${feeReserve.toFixed(2)} JUNO is reserved for transaction fees_`,
          { parse_mode: 'Markdown' }
        );
      }

      // Send tokens using user's wallet
      const result = await WalletService.sendFromUser(
        userId,
        recipientAddress,
        amount
      );

      if (result.success) {
        const newBalance = await WalletService.getUserBalance(userId);
        await ctx.reply(
          `✅ *Transfer Successful!*\n\n` +
          `Recipient: \`${recipientAddress}\`\n` +
          `Amount: ${amount.toFixed(6)} JUNO\n` +
          `TX: \`${result.txHash}\`\n\n` +
          `New balance: ${newBalance.toFixed(6)} JUNO`,
          { parse_mode: 'Markdown' }
        );

        logger.info('User sent tokens', {
          userId,
          recipient: recipientAddress,
          amount,
          txHash: result.txHash
        });
      } else {
        await ctx.reply(
          `❌ *Transfer Failed*\n\n` +
          `Error: ${result.error}\n\n` +
          `Please check the address and try again.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error sending tokens', { userId, error });
      await ctx.reply('❌ Error processing transfer. Please try again later.');
    }
  });

  // Verify wallet derivation (admin only, for testing)
  bot.command('verifywallet', adminOrHigher, async (ctx) => {
    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length === 0) {
      return ctx.reply('Usage: /verifywallet <userId>');
    }

    const targetUserId = parseInt(args[0]);
    if (isNaN(targetUserId)) {
      return ctx.reply('❌ Invalid user ID');
    }

    try {
      const isValid = await WalletService.verifyWalletDerivation(targetUserId);

      if (isValid) {
        await ctx.reply(
          `✅ Wallet derivation verified for user ${targetUserId}\n\n` +
          `The stored address matches the derived address from HD path.`
        );
      } else {
        await ctx.reply(
          `❌ Wallet verification failed for user ${targetUserId}\n\n` +
          `Either wallet doesn't exist or derivation mismatch detected.`
        );
      }
    } catch (error) {
      logger.error('Error verifying wallet', { targetUserId, error });
      await ctx.reply('❌ Error verifying wallet.');
    }
  });

  // Restore wallet from userId (admin only, for recovery)
  bot.command('restorewallet', adminOrHigher, async (ctx) => {
    const args = ctx.message?.text.split(' ').slice(1);

    if (!args || args.length === 0) {
      return ctx.reply(
        '🔄 *Wallet Recovery*\n\n' +
        'Usage: `/restorewallet <userId>`\n\n' +
        'This command shows what address would be derived for a given userId, ' +
        'useful for recovery purposes if the database is lost.',
        { parse_mode: 'Markdown' }
      );
    }

    const targetUserId = parseInt(args[0]);
    if (isNaN(targetUserId)) {
      return ctx.reply('❌ Invalid user ID');
    }

    try {
      const restored = await WalletService.restoreWallet(targetUserId);

      await ctx.reply(
        `🔄 *Restored Wallet Info*\n\n` +
        `User ID: ${targetUserId}\n` +
        `Address: \`${restored.address}\`\n` +
        `HD Path: \`${restored.hdPath}\`\n\n` +
        `_This wallet can always be recovered from the master mnemonic using this HD path_`,
        { parse_mode: 'Markdown' }
      );

      logger.info('Wallet restoration info provided', {
        adminId: ctx.from?.id,
        targetUserId,
        address: restored.address
      });
    } catch (error) {
      logger.error('Error restoring wallet', { targetUserId, error });
      await ctx.reply('❌ Error restoring wallet information.');
    }
  });
}
