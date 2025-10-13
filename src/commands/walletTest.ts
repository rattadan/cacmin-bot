import { Telegraf, Context } from 'telegraf';
import { UnifiedWalletService, SYSTEM_USER_IDS } from '../services/unifiedWalletService';
import { LedgerService } from '../services/ledgerService';
import { logger } from '../utils/logger';
import { isOwner } from '../middleware';

/**
 * Register wallet test commands for comprehensive testing
 * These commands are owner-only for security
 */
export const registerWalletTestCommands = (bot: Telegraf<Context>) => {
  // Test balance checking
  bot.command('testbalance', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const balance = await UnifiedWalletService.getBalance(userId);
      const botBalance = await UnifiedWalletService.getBotBalance();

      await ctx.reply(
        `📊 *Balance Test*\n\n` +
        `Your balance: \`${balance.toFixed(6)} JUNO\`\n` +
        `Bot treasury: \`${botBalance.toFixed(6)} JUNO\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Balance test failed', { userId, error });
      await ctx.reply('❌ Balance test failed');
    }
  });

  // Test deposit instructions
  bot.command('testdeposit', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const instructions = UnifiedWalletService.getDepositInstructions(userId);

      await ctx.reply(
        `💰 *Deposit Test Instructions*\n\n` +
        `Address:\n\`${instructions.address}\`\n\n` +
        `Memo: \`${instructions.memo}\`\n\n` +
        `${instructions.instructions}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Deposit test failed', { userId, error });
      await ctx.reply('❌ Deposit test failed');
    }
  });

  // Test internal transfer
  bot.command('testtransfer', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (args.length < 2) {
      return ctx.reply('Usage: /testtransfer <toUserId> <amount>');
    }

    const toUserId = parseInt(args[0]);
    const amount = parseFloat(args[1]);

    if (isNaN(toUserId) || isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid parameters');
    }

    try {
      const result = await UnifiedWalletService.transferToUser(
        userId,
        toUserId,
        amount,
        'Test transfer'
      );

      if (result.success) {
        await ctx.reply(
          `✅ *Transfer Test Successful*\n\n` +
          `Sent \`${amount.toFixed(6)} JUNO\` to user ${toUserId}\n` +
          `Your new balance: \`${result.fromBalance?.toFixed(6)} JUNO\`\n` +
          `Recipient balance: \`${result.toBalance?.toFixed(6)} JUNO\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`❌ Transfer failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Transfer test failed', { userId, toUserId, amount, error });
      await ctx.reply('❌ Transfer test failed');
    }
  });

  // Test fine payment
  bot.command('testfine', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    const amount = parseFloat(args[0] || '1');

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Usage: /testfine [amount]');
    }

    try {
      const result = await UnifiedWalletService.payFine(
        userId,
        amount,
        'Test fine payment'
      );

      if (result.success) {
        const botBalance = await UnifiedWalletService.getBotBalance();

        await ctx.reply(
          `✅ *Fine Test Successful*\n\n` +
          `Paid \`${amount.toFixed(6)} JUNO\` fine\n` +
          `Your new balance: \`${result.newBalance?.toFixed(6)} JUNO\`\n` +
          `Bot treasury balance: \`${botBalance.toFixed(6)} JUNO\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`❌ Fine payment failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Fine test failed', { userId, amount, error });
      await ctx.reply('❌ Fine test failed');
    }
  });

  // Test withdrawal (dry run - doesn't actually send)
  bot.command('testwithdraw', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (args.length < 2) {
      return ctx.reply('Usage: /testwithdraw <address> <amount>');
    }

    const address = args[0];
    const amount = parseFloat(args[1]);

    if (!address.startsWith('juno1') || isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid parameters. Address must start with juno1');
    }

    try {
      // Just validate, don't actually withdraw
      const balance = await UnifiedWalletService.getBalance(userId);

      if (balance < amount) {
        await ctx.reply(
          `❌ *Withdrawal Test Failed*\n\n` +
          `Insufficient balance\n` +
          `Requested: \`${amount.toFixed(6)} JUNO\`\n` +
          `Available: \`${balance.toFixed(6)} JUNO\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `✅ *Withdrawal Test (DRY RUN)*\n\n` +
          `Would withdraw \`${amount.toFixed(6)} JUNO\`\n` +
          `To: \`${address}\`\n` +
          `Current balance: \`${balance.toFixed(6)} JUNO\`\n` +
          `Balance after: \`${(balance - amount).toFixed(6)} JUNO\`\n\n` +
          `⚠️ This was a dry run - no actual withdrawal`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Withdrawal test failed', { userId, address, amount, error });
      await ctx.reply('❌ Withdrawal test failed');
    }
  });

  // Test transaction verification
  bot.command('testverify', isOwner, async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1) || [];
    if (args.length < 1) {
      return ctx.reply('Usage: /testverify <txHash>');
    }

    const txHash = args[0];

    try {
      const result = await UnifiedWalletService.verifyTransaction(txHash);

      if (result.verified) {
        await ctx.reply(
          `✅ *Transaction Verified*\n\n` +
          `Hash: \`${txHash}\`\n` +
          `Amount: \`${result.amount?.toFixed(6)} JUNO\`\n` +
          `From: \`${result.from}\`\n` +
          `To: \`${result.to}\`\n` +
          `Memo: ${result.memo || 'None'}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`❌ Transaction not found or invalid`);
      }
    } catch (error) {
      logger.error('Verification test failed', { txHash, error });
      await ctx.reply('❌ Verification test failed');
    }
  });

  // Test wallet statistics
  bot.command('testwalletstats', isOwner, async (ctx) => {
    try {
      const stats = await UnifiedWalletService.getStats();

      await ctx.reply(
        `📊 *Wallet Statistics*\n\n` +
        `*System Wallet*\n` +
        `Address: \`${stats.walletAddress}\`\n` +
        `On-chain balance: \`${stats.onChainBalance.toFixed(6)} JUNO\`\n\n` +
        `*Internal Ledger*\n` +
        `Total user balances: \`${stats.internalTotal.toFixed(6)} JUNO\`\n` +
        `Bot treasury: \`${stats.botBalance.toFixed(6)} JUNO\`\n` +
        `Unclaimed deposits: \`${stats.unclaimedBalance.toFixed(6)} JUNO\`\n\n` +
        `*Status*\n` +
        `Active users: ${stats.activeUsers}\n` +
        `Pending deposits: ${stats.pendingDeposits}\n` +
        `Reconciled: ${stats.reconciled ? '✅ Yes' : '⚠️ No'}\n` +
        `${!stats.reconciled ? `Difference: ${Math.abs(stats.onChainBalance - stats.internalTotal).toFixed(6)} JUNO` : ''}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Wallet stats test failed', { error });
      await ctx.reply('❌ Wallet stats test failed');
    }
  });

  // Simulate a deposit (for testing)
  bot.command('testsimulatedeposit', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    const targetUserId = args[0] ? parseInt(args[0]) : userId;
    const amount = parseFloat(args[1] || '10');

    if (isNaN(targetUserId) || isNaN(amount) || amount <= 0) {
      return ctx.reply('Usage: /testsimulatedeposit [userId] [amount]');
    }

    try {
      // Simulate a deposit by directly crediting the user
      const result = await LedgerService.processDeposit(
        targetUserId,
        amount,
        `TEST_${Date.now()}`,
        'simulated_address',
        'Test deposit simulation'
      );

      if (result.success) {
        await ctx.reply(
          `✅ *Deposit Simulation Successful*\n\n` +
          `User ${targetUserId} credited with \`${amount.toFixed(6)} JUNO\`\n` +
          `New balance: \`${result.newBalance.toFixed(6)} JUNO\`\n\n` +
          `⚠️ This is a simulated deposit for testing`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`❌ Deposit simulation failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Deposit simulation failed', { targetUserId, amount, error });
      await ctx.reply('❌ Deposit simulation failed');
    }
  });

  // Test transaction history
  bot.command('testhistory', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const transactions = await LedgerService.getUserTransactions(userId, 5);

      if (transactions.length === 0) {
        return ctx.reply('No transaction history found');
      }

      let message = '*Recent Transactions*\n\n';

      for (const tx of transactions) {
        const type = tx.transactionType;
        const amount = tx.amount;
        const isCredit = tx.toUserId === userId;

        message += `${isCredit ? '➕' : '➖'} ${type.toUpperCase()}: \`${amount.toFixed(6)} JUNO\`\n`;

        if (tx.description) {
          message += `   ${tx.description}\n`;
        }

        if (tx.txHash) {
          message += `   Hash: \`${tx.txHash.substring(0, 10)}...\`\n`;
        }

        message += '\n';
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('History test failed', { userId, error });
      await ctx.reply('❌ History test failed');
    }
  });

  // Full system test
  bot.command('testfullflow', isOwner, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    await ctx.reply('🔄 Starting full wallet flow test...');

    try {
      // 1. Check initial balance
      const initialBalance = await UnifiedWalletService.getBalance(userId);
      await ctx.reply(`1️⃣ Initial balance: ${initialBalance.toFixed(6)} JUNO`);

      // 2. Simulate a deposit
      const depositAmount = 100;
      const depositResult = await LedgerService.processDeposit(
        userId,
        depositAmount,
        `FULLTEST_${Date.now()}`,
        'test_address',
        'Full flow test deposit'
      );

      if (!depositResult.success) {
        throw new Error(`Deposit failed: ${depositResult.error}`);
      }

      await ctx.reply(`2️⃣ Deposit: +${depositAmount} JUNO (balance: ${depositResult.newBalance.toFixed(6)})`);

      // 3. Pay a fine
      const fineAmount = 10;
      const fineResult = await UnifiedWalletService.payFine(userId, fineAmount, 'Test fine');

      if (!fineResult.success) {
        throw new Error(`Fine payment failed: ${fineResult.error}`);
      }

      await ctx.reply(`3️⃣ Fine paid: -${fineAmount} JUNO (balance: ${fineResult.newBalance?.toFixed(6)})`);

      // 4. Transfer to bot
      const transferAmount = 5;
      const transferResult = await UnifiedWalletService.transferToUser(
        userId,
        SYSTEM_USER_IDS.BOT_TREASURY,
        transferAmount,
        'Test transfer to bot'
      );

      if (!transferResult.success) {
        throw new Error(`Transfer failed: ${transferResult.error}`);
      }

      await ctx.reply(`4️⃣ Transfer to bot: -${transferAmount} JUNO (balance: ${transferResult.fromBalance?.toFixed(6)})`);

      // 5. Check final balances
      const finalUserBalance = await UnifiedWalletService.getBalance(userId);
      const botBalance = await UnifiedWalletService.getBotBalance();

      await ctx.reply(
        `✅ *Full Flow Test Complete*\n\n` +
        `Initial balance: \`${initialBalance.toFixed(6)} JUNO\`\n` +
        `Deposited: \`+${depositAmount} JUNO\`\n` +
        `Fine paid: \`-${fineAmount} JUNO\`\n` +
        `Transferred: \`-${transferAmount} JUNO\`\n\n` +
        `Expected: \`${(initialBalance + depositAmount - fineAmount - transferAmount).toFixed(6)} JUNO\`\n` +
        `Actual: \`${finalUserBalance.toFixed(6)} JUNO\`\n\n` +
        `Bot treasury: \`${botBalance.toFixed(6)} JUNO\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Full flow test failed', { userId, error });
      await ctx.reply(`❌ Full flow test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  logger.info('Wallet test commands registered');
};