import { Telegraf, Context } from 'telegraf';
import { adminOrHigher } from '../middleware/index';
import { financialLockCheck } from '../middleware/lockCheck';
import {
  handleBalance,
  handleDeposit,
  handleWithdraw,
  handleSend,
  handleTransactions,
  handleWalletStats,
  handleGiveaway,
  handleCheckDeposit,
  handleReconcile
} from '../handlers/wallet';

export function registerWalletCommands(bot: Telegraf<Context>): void {
  // Balance command - shows user's internal ledger balance
  bot.command('balance', handleBalance);
  bot.command('bal', handleBalance); // Alias

  // Deposit command - shows deposit instructions
  bot.command('deposit', handleDeposit);

  // Withdraw command - withdraws to external wallet (with locking)
  bot.command('withdraw', financialLockCheck, handleWithdraw);

  // Send command - sends to another user or external wallet (with locking for external)
  bot.command('send', financialLockCheck, handleSend);
  bot.command('transfer', financialLockCheck, handleSend); // Alias

  // Transaction history command
  bot.command('transactions', handleTransactions);
  bot.command('history', handleTransactions); // Alias

  // Admin commands
  bot.command('walletstats', adminOrHigher, handleWalletStats);
  bot.command('giveaway', adminOrHigher, handleGiveaway);
  bot.command('reconcile', adminOrHigher, handleReconcile);

  // Check specific deposit by transaction hash
  bot.command('checkdeposit', handleCheckDeposit);

  // Help command for wallet features
  bot.command('wallethelp', async (ctx) => {
    await ctx.reply(
      ` *Wallet Commands*\n\n` +
      `*Basic Commands:*\n` +
      `/balance - Check your balance\n` +
      `/deposit - Get deposit instructions\n` +
      `/withdraw <amount> <address> - Withdraw to external wallet\n` +
      `/send <amount> <recipient> - Send to user or wallet\n` +
      `/transactions - View transaction history\n` +
      `/checkdeposit <tx_hash> - Check a specific deposit\n\n` +
      `*Send Recipients:*\n` +
      `• @username - Send to another user\n` +
      `• User ID - Send to user by ID\n` +
      `• juno1... - Send to external wallet\n\n` +
      `*Admin Commands:*\n` +
      `/walletstats - System statistics\n` +
      `/giveaway <amount> <@user1> <@user2> - Distribute tokens\n` +
      `/reconcile - Check internal ledger vs on-chain balance\n\n` +
      ` *Important:*\n` +
      `• Always include your user ID (${ctx.from?.id}) as memo when depositing\n` +
      `• Withdrawals are locked to prevent double-spending\n` +
      `• Internal transfers are instant and free\n` +
      `• External transfers incur network fees`,
      { parse_mode: 'Markdown' }
    );
  });
}