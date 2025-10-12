import { Context } from 'telegraf';
import { WalletServiceV2 } from '../services/walletServiceV2';
import { logger } from '../utils/logger';
import { checkIsElevated } from '../utils/roles';

/**
 * Handle /balance command
 * Shows user's internal ledger balance
 */
export async function handleBalance(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const balance = await WalletServiceV2.getUserBalance(userId);
    const username = ctx.from.username ? `@${ctx.from.username}` : `User ${userId}`;

    await ctx.reply(
      `💰 *Balance for ${username}*\n\n` +
      `Current balance: \`${balance.toFixed(6)} JUNO\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in balance command', { error });
    await ctx.reply('❌ Failed to fetch balance. Please try again later.');
  }
}

/**
 * Handle /deposit command
 * Shows deposit instructions for the user
 */
export async function handleDeposit(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const depositInfo = WalletServiceV2.getDepositInfo(userId);

    await ctx.reply(
      `📥 *Deposit Instructions*\n\n` +
      `To deposit JUNO to your account:\n\n` +
      `1️⃣ Send JUNO to this address:\n` +
      `\`${depositInfo.address}\`\n\n` +
      `2️⃣ **IMPORTANT**: Include this memo:\n` +
      `\`${depositInfo.memo}\`\n\n` +
      `⚠️ *Your memo is unique to you and will never change*\n` +
      `⚠️ *Deposits without the correct memo cannot be credited*\n\n` +
      `Your deposit will be credited automatically once confirmed on-chain.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in deposit command', { error });
    await ctx.reply('❌ Failed to generate deposit information. Please try again later.');
  }
}

/**
 * Handle /withdraw command
 * Format: /withdraw <amount> <juno_address>
 */
export async function handleWithdraw(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);

    if (args.length < 2) {
      await ctx.reply(
        '❌ *Invalid format*\n\n' +
        'Usage: `/withdraw <amount> <juno_address>`\n' +
        'Example: `/withdraw 10 juno1xxxxx...`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amount = parseFloat(args[0]);
    const address = args[1];

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    if (!address.startsWith('juno1')) {
      await ctx.reply('❌ Invalid Juno address. Address must start with "juno1".');
      return;
    }

    // Check balance first
    const balance = await WalletServiceV2.getUserBalance(userId);
    if (balance < amount) {
      await ctx.reply(
        `❌ *Insufficient balance*\n\n` +
        `Requested: \`${amount} JUNO\`\n` +
        `Available: \`${balance.toFixed(6)} JUNO\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Process withdrawal
    await ctx.reply('⏳ Processing withdrawal...');

    const result = await WalletServiceV2.sendToExternalWallet(
      userId,
      address,
      amount,
      `Withdrawal from Telegram bot`
    );

    if (result.success) {
      await ctx.reply(
        `✅ *Withdrawal Successful*\n\n` +
        `Amount: \`${amount} JUNO\`\n` +
        `To: \`${address}\`\n` +
        `New Balance: \`${result.newBalance?.toFixed(6)} JUNO\`\n` +
        (result.txHash ? `\nTransaction: \`${result.txHash}\`` : ''),
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `❌ *Withdrawal Failed*\n\n` +
        `Error: ${result.error}\n` +
        `Balance: \`${result.newBalance?.toFixed(6)} JUNO\``,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error('Error in withdraw command', { error });
    await ctx.reply('❌ Failed to process withdrawal. Please try again later.');
  }
}

/**
 * Handle /send command
 * Format: /send <amount> <@username or userId or juno_address>
 */
export async function handleSend(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);

    if (args.length < 2) {
      await ctx.reply(
        '❌ *Invalid format*\n\n' +
        'Usage: `/send <amount> <recipient>`\n' +
        'Recipient can be:\n' +
        '• @username (internal transfer)\n' +
        '• User ID (internal transfer)\n' +
        '• juno1xxx... (external transfer)\n\n' +
        'Examples:\n' +
        '`/send 5 @alice`\n' +
        '`/send 10 123456789`\n' +
        '`/send 2.5 juno1xxxxx...`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amount = parseFloat(args[0]);
    const recipient = args[1];

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    // Check sender's balance
    const balance = await WalletServiceV2.getUserBalance(userId);
    if (balance < amount) {
      await ctx.reply(
        `❌ *Insufficient balance*\n\n` +
        `Requested: \`${amount} JUNO\`\n` +
        `Available: \`${balance.toFixed(6)} JUNO\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Determine recipient type and process
    if (recipient.startsWith('juno1')) {
      // External transfer
      await ctx.reply('⏳ Processing external transfer...');

      const result = await WalletServiceV2.sendToExternalWallet(
        userId,
        recipient,
        amount,
        `Transfer from @${ctx.from.username || userId}`
      );

      if (result.success) {
        await ctx.reply(
          `✅ *External Transfer Successful*\n\n` +
          `Amount: \`${amount} JUNO\`\n` +
          `To: \`${recipient}\`\n` +
          `New Balance: \`${result.newBalance?.toFixed(6)} JUNO\`\n` +
          (result.txHash ? `\nTransaction: \`${result.txHash}\`` : ''),
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ *Transfer Failed*\n\n` +
          `Error: ${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } else if (recipient.startsWith('@')) {
      // Internal transfer by username
      await ctx.reply('⏳ Processing internal transfer...');

      const result = await WalletServiceV2.sendToUsername(
        userId,
        recipient,
        amount
      );

      if (result.success) {
        await ctx.reply(
          `✅ *Transfer Successful*\n\n` +
          `Amount: \`${amount} JUNO\`\n` +
          `To: @${result.recipient}\n` +
          `Your New Balance: \`${result.newBalance?.toFixed(6)} JUNO\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ *Transfer Failed*\n\n` +
          `Error: ${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } else if (/^\d+$/.test(recipient)) {
      // Internal transfer by userId
      const recipientId = parseInt(recipient, 10);

      if (recipientId === userId) {
        await ctx.reply('❌ You cannot send tokens to yourself.');
        return;
      }

      await ctx.reply('⏳ Processing internal transfer...');

      const result = await WalletServiceV2.sendToUser(
        userId,
        recipientId,
        amount
      );

      if (result.success) {
        await ctx.reply(
          `✅ *Transfer Successful*\n\n` +
          `Amount: \`${amount} JUNO\`\n` +
          `To: User ${recipientId}\n` +
          `Your New Balance: \`${result.fromBalance?.toFixed(6)} JUNO\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ *Transfer Failed*\n\n` +
          `Error: ${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await ctx.reply(
        '❌ Invalid recipient format. Use @username, user ID, or juno1xxx... address.'
      );
    }
  } catch (error) {
    logger.error('Error in send command', { error });
    await ctx.reply('❌ Failed to process transfer. Please try again later.');
  }
}

/**
 * Handle /transactions command
 * Shows user's recent transaction history
 */
export async function handleTransactions(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const transactions = await WalletServiceV2.getUserTransactionHistory(userId, 10);

    if (transactions.length === 0) {
      await ctx.reply(' You have no transaction history yet.');
      return;
    }

    let message = ' *Recent Transactions*\n\n';

    for (const tx of transactions) {
      const date = new Date((tx.created_at || 0) * 1000).toLocaleString();
      const type = tx.transaction_type.toUpperCase();
      const amount = tx.amount.toFixed(6);

      let description = '';
      switch (tx.transaction_type) {
        case 'deposit':
          description = `+${amount} JUNO (Deposit)`;
          break;
        case 'withdrawal':
          description = `-${amount} JUNO (Withdrawal)`;
          break;
        case 'transfer':
          if (tx.from_user_id === userId) {
            description = `-${amount} JUNO (Sent)`;
          } else {
            description = `+${amount} JUNO (Received)`;
          }
          break;
        case 'fine':
          description = `-${amount} JUNO (Fine)`;
          break;
        case 'bail':
          description = `-${amount} JUNO (Bail)`;
          break;
        case 'giveaway':
          description = `+${amount} JUNO (Giveaway)`;
          break;
        default:
          description = `${amount} JUNO (${type})`;
      }

      message += `• ${date}\n  ${description}\n`;
      if (tx.description) {
        message += `  _${tx.description}_\n`;
      }
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Error in transactions command', { error });
    await ctx.reply('❌ Failed to fetch transaction history. Please try again later.');
  }
}

/**
 * Handle /walletstats command (admin only)
 * Shows system wallet statistics
 */
export async function handleWalletStats(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;

    // Check if user is elevated
    if (!userId || !checkIsElevated(userId)) {
      await ctx.reply('❌ This command requires elevated permissions.');
      return;
    }

    await ctx.reply(' Fetching wallet statistics...');

    const systemBalances = await WalletServiceV2.getSystemBalances();
    const ledgerStats = await WalletServiceV2.getLedgerStats();
    const reconciliation = await WalletServiceV2.reconcileBalances();

    let message = ' *Wallet System Statistics*\n\n';

    message += '*System Wallets:*\n';
    message += `Treasury: \`${systemBalances.treasury.onChain.toFixed(6)} JUNO\`\n`;
    message += `User Funds: \`${systemBalances.userFunds.onChain.toFixed(6)} JUNO\`\n\n`;

    message += '*Ledger Statistics:*\n';
    message += `Total Users: ${ledgerStats.totalUsers}\n`;
    message += `Active Users: ${ledgerStats.activeUsers}\n`;
    message += `Total Balance (Internal): \`${ledgerStats.totalBalance.toFixed(6)} JUNO\`\n`;
    message += `24h Deposits: ${ledgerStats.recentDeposits}\n`;
    message += `24h Withdrawals: ${ledgerStats.recentWithdrawals}\n\n`;

    message += '*Reconciliation:*\n';
    message += `Internal Total: \`${reconciliation.internalTotal.toFixed(6)} JUNO\`\n`;
    message += `On-chain Total: \`${reconciliation.onChainTotal.toFixed(6)} JUNO\`\n`;
    message += `Difference: \`${reconciliation.difference.toFixed(6)} JUNO\`\n`;
    message += `Status: ${reconciliation.matched ? ' Balanced' : ' Mismatch'}\n`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Error in walletstats command', { error });
    await ctx.reply('❌ Failed to fetch wallet statistics. Please try again later.');
  }
}

/**
 * Handle /giveaway command (admin only)
 * Format: /giveaway <amount> <@user1> <@user2> ...
 */
export async function handleGiveaway(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;

    // Check if user is elevated
    if (!userId || !checkIsElevated(userId)) {
      await ctx.reply('❌ This command requires elevated permissions.');
      return;
    }

    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);

    if (args.length < 2) {
      await ctx.reply(
        '❌ *Invalid format*\n\n' +
        'Usage: `/giveaway <amount> <@user1> <@user2> ...`\n' +
        'Example: `/giveaway 5 @alice @bob @charlie`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    const recipients = args.slice(1);
    const userIds: number[] = [];

    // Resolve usernames to userIds
    for (const recipient of recipients) {
      if (recipient.startsWith('@')) {
        const user = await WalletServiceV2.findUserByUsername(recipient);
        if (user) {
          userIds.push(user.id);
        } else {
          await ctx.reply(` User ${recipient} not found, skipping...`);
        }
      } else if (/^\d+$/.test(recipient)) {
        userIds.push(parseInt(recipient, 10));
      }
    }

    if (userIds.length === 0) {
      await ctx.reply('❌ No valid recipients found.');
      return;
    }

    await ctx.reply(` Distributing ${amount} JUNO to ${userIds.length} users...`);

    const result = await WalletServiceV2.distributeGiveaway(
      userIds,
      amount,
      `Giveaway from admin`
    );

    await ctx.reply(
      ` *Giveaway Complete*\n\n` +
      `Amount per user: \`${amount} JUNO\`\n` +
      `Successful: ${result.succeeded.length}\n` +
      `Failed: ${result.failed.length}\n` +
      `Total distributed: \`${result.totalDistributed.toFixed(6)} JUNO\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in giveaway command', { error });
    await ctx.reply('❌ Failed to process giveaway. Please try again later.');
  }
}

/**
 * Handle /checkdeposit command
 * Format: /checkdeposit <tx_hash>
 * Manually check and credit a specific deposit
 */
export async function handleCheckDeposit(ctx: Context): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);

    if (args.length < 1) {
      await ctx.reply(
        '❌ *Invalid format*\n\n' +
        'Usage: `/checkdeposit <tx_hash>`\n' +
        'Example: `/checkdeposit ABCD1234...`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const txHash = args[0];

    await ctx.reply(' Checking transaction...');

    // Import DepositMonitor here to avoid circular dependencies
    const { DepositMonitor } = await import('../services/depositMonitor');
    const result = await DepositMonitor.checkSpecificTransaction(txHash);

    if (!result.found) {
      await ctx.reply('❌ Transaction not found on-chain.');
    } else if (result.processed) {
      await ctx.reply(
        ` This transaction has already been processed.\n` +
        (result.userId ? `User ID: ${result.userId}\n` : '') +
        (result.amount ? `Amount: ${result.amount} JUNO` : '')
      );
    } else if (result.error) {
      await ctx.reply(`❌ Error: ${result.error}`);
    } else {
      await ctx.reply(
        `✅ *Deposit Processed*\n\n` +
        `User ID: ${result.userId}\n` +
        `Amount: \`${result.amount} JUNO\``,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error('Error in checkdeposit command', { error });
    await ctx.reply('❌ Failed to check deposit. Please try again later.');
  }
}

/**
 * Handle /reconcile command
 * Manually triggers balance reconciliation check (admin only)
 */
export async function handleReconcile(ctx: Context): Promise<void> {
  try {
    await ctx.reply('⏳ Running balance reconciliation...');

    // Import LedgerService here to avoid circular dependencies
    const { LedgerService } = await import('../services/ledgerService');
    const result = await LedgerService.reconcileAndAlert();

    await ctx.reply(
      ` *Balance Reconciliation Results*\n\n` +
      `Internal Ledger Total: \`${result.internalTotal.toFixed(6)} JUNO\`\n` +
      `User Funds On-Chain: \`${result.onChainTotal.toFixed(6)} JUNO\`\n` +
      `Difference: \`${result.difference.toFixed(6)} JUNO\`\n\n` +
      `Status: ${result.matched ? '✅ Balanced' : '⚠️ MISMATCH'}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in reconcile command', { error });
    await ctx.reply('❌ Failed to run reconciliation.');
  }
}