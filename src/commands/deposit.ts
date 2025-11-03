/**
 * Deposit command handlers for the CAC Admin Bot.
 * Provides commands for deposit instructions, verification, and unclaimed deposit management.
 *
 * @module commands/deposit
 */

import { Telegraf, Context } from 'telegraf';
import { UnifiedWalletService, SYSTEM_USER_IDS } from '../services/unifiedWalletService';
import { RPCTransactionVerification } from '../services/rpcTransactionVerification';
import { DepositInstructionService } from '../services/depositInstructions';
import { LedgerService } from '../services/ledgerService';
import { AmountPrecision } from '../utils/precision';
import { logger, StructuredLogger } from '../utils/logger';
import { get, query, execute } from '../database';
import { config } from '../config';

/**
 * Registers all deposit-related commands with the bot.
 *
 * Commands registered:
 * - /deposit - Get deposit instructions with memo
 * - /verifydeposit - Verify a deposit by transaction hash
 * - /unclaimeddeposits - View unclaimed deposits (missing or invalid memo)
 * - /claimdeposit - Assign an unclaimed deposit to a user (admin only)
 * - /processdeposit - Manually process a pending deposit (admin only)
 *
 * @param bot - Telegraf bot instance
 *
 * @example
 * ```typescript
 * import { Telegraf } from 'telegraf';
 * import { registerDepositCommands } from './commands/deposit';
 *
 * const bot = new Telegraf(process.env.BOT_TOKEN);
 * registerDepositCommands(bot);
 * ```
 */
export const registerDepositCommands = (bot: Telegraf<Context>) => {

  /**
   * Command: /deposit
   * Get deposit instructions with unique user memo.
   *
   * Permission: Any user
   * Syntax: /deposit
   *
   * @example
   * User: /deposit
   * Bot: Deposit Instructions
   *
   *      Send JUNO to:
   *      `juno1...`
   *
   *      IMPORTANT: Include this memo:
   *      `123456`
   *
   *      Without the correct memo, your deposit cannot be automatically credited.
   */
  bot.command('deposit', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const instructions = UnifiedWalletService.getDepositInstructions(userId);

      await ctx.reply(instructions.markdown, {
        parse_mode: 'Markdown'
      });

      // Send experimental warning
      await ctx.reply(
        '⚠️ **IMPORTANT WARNING** ⚠️\n\n' +
        'This bot is **highly experimental and permanently in early stage development**.\n\n' +
        '**DO NOT deposit any funds you are not prepared to immediately lose.**\n\n' +
        'By depositing, you acknowledge and accept all risks associated with using experimental software.',
        { parse_mode: 'Markdown' }
      );

      // Send a follow-up reminder
      await ctx.reply(
        DepositInstructionService.getMemoReminder(userId),
        { parse_mode: 'Markdown' }
      );

      // Send CAC sticker (first sticker from CACGifs pack)
      // File ID for the first sticker in https://t.me/addstickers/CACGifs
      // Note: This file_id may need to be updated if the sticker pack changes
      try {
        await ctx.replyWithSticker('CAACAgQAAxkBAAIBBGddYxMAAcCKiKpJV-uT_7hxGNqOsAACCgADDbbSGmTjWpYn0t-rNgQ');
      } catch (stickerError) {
        // Silently fail if sticker can't be sent
        logger.debug('Failed to send deposit sticker', { userId, error: stickerError });
      }
    } catch (error) {
      logger.error('Failed to generate deposit instructions', { userId, error });
      await ctx.reply(' Failed to generate deposit instructions');
    }
  });

  /**
   * Command: /verifydeposit
   * Verify and credit a deposit by providing the transaction hash.
   *
   * Permission: Any user
   * Syntax: /verifydeposit <transaction_hash>
   *
   * @example
   * User: /verifydeposit ABC123DEF456...
   * Bot: Deposit Confirmed!
   *
   *      Amount: 100.000000 JUNO
   *      From: juno1abc...
   *      Transaction: ABC123DEF456...
   *
   *      New balance: 100.000000 JUNO
   */
  bot.command('verifydeposit', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(' ').slice(1) || [];

    if (args.length < 1) {
      return ctx.reply(
        ' **Usage**: /verifydeposit <transaction_hash>\n\n' +
        'Provide the transaction hash of your deposit to verify and credit it.',
        { parse_mode: 'Markdown' }
      );
    }

    const txHash = args[0].trim();

    await ctx.reply(' Verifying transaction...');

    try {
      // Get wallet address
      const walletAddress = UnifiedWalletService.getDepositInstructions(userId).address;

      // Verify the deposit
      const verification = await RPCTransactionVerification.verifyDeposit(
        txHash,
        walletAddress,
        userId
      );

      if (!verification.valid) {
        return ctx.reply(
          ` **Deposit Verification Failed**\n\n` +
          `${verification.error}\n\n` +
          (verification.memo !== undefined ?
            `Memo found: \`${verification.memo || 'none'}\`\n` +
            `Expected: \`${userId}\`\n\n` : '') +
          `Please ensure:\n` +
          `• Transaction is confirmed on-chain\n` +
          `• Funds were sent to: \`${walletAddress}\`\n` +
          `• Memo was exactly: \`${userId}\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Check if already processed
      const existing = get<any>(
        'SELECT * FROM processed_deposits WHERE tx_hash = ?',
        [txHash]
      );

      if (existing && existing.processed) {
        return ctx.reply(
          ` **Already Processed**\n\n` +
          `This deposit has already been credited.\n` +
          `Amount: \`${AmountPrecision.format(verification.amount!)} JUNO\`\n` +
          `From: \`${verification.sender}\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Process the deposit
      const result = await LedgerService.processDeposit(
        userId,
        verification.amount!,
        txHash,
        verification.sender!,
        `Manual deposit verification from ${verification.sender}`
      );

      if (result.success) {
        // Mark deposit as processed in database
        if (!existing) {
          // Insert new record if it doesn't exist
          execute(
            `INSERT INTO processed_deposits (
              tx_hash, user_id, amount, from_address, memo, height, processed, processed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              txHash,
              userId,
              verification.amount!,
              verification.sender!,
              verification.memo || null,
              0, // height unknown for manual verification
              Math.floor(Date.now() / 1000),
              Math.floor(Date.now() / 1000)
            ]
          );
        } else {
          // Update existing record
          execute(
            'UPDATE processed_deposits SET processed = 1, processed_at = ?, user_id = ?, error = NULL WHERE tx_hash = ?',
            [Math.floor(Date.now() / 1000), userId, txHash]
          );
        }

        StructuredLogger.logTransaction('Deposit verified and credited', {
          userId,
          txHash,
          amount: verification.amount!.toString(),
          operation: 'deposit_verification'
        });

        await ctx.reply(
          DepositInstructionService.formatDepositConfirmation(
            userId,
            verification.amount!,
            txHash,
            result.newBalance
          ),
          { parse_mode: 'Markdown' }
        );
      } else {
        // Mark deposit as failed in database
        if (!existing) {
          execute(
            `INSERT INTO processed_deposits (
              tx_hash, user_id, amount, from_address, memo, height, processed, error, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              txHash,
              userId,
              verification.amount!,
              verification.sender!,
              verification.memo || null,
              0,
              result.error || 'Unknown error',
              Math.floor(Date.now() / 1000)
            ]
          );
        } else {
          execute(
            'UPDATE processed_deposits SET error = ? WHERE tx_hash = ?',
            [result.error || 'Unknown error', txHash]
          );
        }

        await ctx.reply(
          ` **Failed to credit deposit**\n\n` +
          `${result.error}\n\n` +
          `Please contact an admin for assistance.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Deposit verification failed', { userId, txHash, error });
      await ctx.reply(
        ' Failed to verify deposit. Please try again or contact an admin.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  /**
   * Command: /unclaimeddeposits
   * View deposits that could not be automatically credited due to missing or invalid memos.
   *
   * Permission: Any user
   * Syntax: /unclaimeddeposits
   *
   * @example
   * User: /unclaimeddeposits
   * Bot: Unclaimed Deposits
   *
   *      Total: `50.000000 JUNO`
   *
   *      Recent deposits without valid memo:
   *      • `ABC123...`
   *        Amount: 25.000000 JUNO
   *        Memo: "wrong_id"
   */
  bot.command('unclaimeddeposits', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      // Get unclaimed balance
      const unclaimedBalance = await LedgerService.getUserBalance(SYSTEM_USER_IDS.UNCLAIMED);

      if (unclaimedBalance === 0) {
        return ctx.reply(' No unclaimed deposits');
      }

      // Get recent unclaimed deposits
      const unclaimed = query<any>(
        `SELECT * FROM processed_deposits
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [SYSTEM_USER_IDS.UNCLAIMED]
      );

      let message = ` **Unclaimed Deposits**\n\n`;
      message += `Total: \`${AmountPrecision.format(unclaimedBalance)} JUNO\`\n\n`;

      if (unclaimed.length > 0) {
        message += `**Recent deposits without valid memo:**\n`;
        for (const deposit of unclaimed) {
          message += `• \`${deposit.tx_hash.substring(0, 10)}...\`\n`;
          message += `  Amount: ${AmountPrecision.format(deposit.amount)} JUNO\n`;
          message += `  Memo: "${deposit.memo || 'none'}"\n\n`;
        }
      }

      message += DepositInstructionService.getUnclaimedInstructions();

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to get unclaimed deposits', { userId, error });
      await ctx.reply(' Failed to retrieve unclaimed deposits');
    }
  });

  /**
   * Command: /claimdeposit
   * Manually assign an unclaimed deposit to a user (admin only).
   *
   * Permission: Admin or owner
   * Syntax: /claimdeposit <transaction_hash> <user_id>
   *
   * @example
   * User: /claimdeposit ABC123... 123456
   * Bot: Deposit Claimed
   *
   *      Amount: `25.000000 JUNO`
   *      Assigned to user: `123456`
   *      Transaction: `ABC123...`
   */
  bot.command('claimdeposit', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    // Check if owner (from config) or admin (from database)
    const isOwner = config.ownerIds.includes(adminId);
    const admin = get<any>('SELECT role FROM users WHERE id = ?', [adminId]);

    if (!isOwner && (!admin || (admin.role !== 'owner' && admin.role !== 'admin'))) {
      return ctx.reply(' This command requires admin permissions');
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];

    if (args.length < 2) {
      return ctx.reply(
        ' **Usage**: /claimdeposit <transaction_hash> <user_id>\n\n' +
        'Assign an unclaimed deposit to a user.',
        { parse_mode: 'Markdown' }
      );
    }

    const txHash = args[0].trim();
    const targetUserId = parseInt(args[1]);

    if (isNaN(targetUserId)) {
      return ctx.reply(' Invalid user ID');
    }

    try {
      const result = await UnifiedWalletService.claimUnclaimedDeposit(txHash, targetUserId);

      if (result.success) {
        StructuredLogger.logUserAction('Unclaimed deposit assigned by admin', {
          userId: adminId,
          operation: 'claim_deposit',
          targetUserId: targetUserId,
          txHash,
          amount: result.amount!.toString()
        });

        await ctx.reply(
          ` **Deposit Claimed**\n\n` +
          `Amount: \`${AmountPrecision.format(result.amount!)} JUNO\`\n` +
          `Assigned to user: \`${targetUserId}\`\n` +
          `Transaction: \`${txHash.substring(0, 10)}...\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          ` **Failed to claim deposit**\n\n${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Failed to claim deposit', { adminId, txHash, targetUserId, error });
      await ctx.reply(' Failed to claim deposit');
    }
  });

  /**
   * Command: /processdeposit
   * Manually process a pending deposit transaction (admin only).
   *
   * Permission: Admin or owner
   * Syntax: /processdeposit <transaction_hash>
   *
   * @example
   * User: /processdeposit ABC123...
   * Bot: Processing deposit...
   *      Deposit Processed
   *      Amount: 1.000000 JUNO
   *      Credited to user: 1705203106
   */
  bot.command('processdeposit', async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId) return;

    // Check if owner (from config) or admin (from database)
    const isOwner = config.ownerIds.includes(adminId);
    const admin = get<any>('SELECT role FROM users WHERE id = ?', [adminId]);

    if (!isOwner && (!admin || (admin.role !== 'owner' && admin.role !== 'admin'))) {
      return ctx.reply('This command requires admin permissions');
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];

    if (args.length < 1) {
      return ctx.reply(
        'Usage: /processdeposit <transaction_hash>\n\n' +
        'Manually process a pending deposit. The deposit must have a valid user ID in the memo.',
        { parse_mode: 'Markdown' }
      );
    }

    const txHash = args[0].trim().toUpperCase();

    await ctx.reply('Processing deposit...');

    try {
      // Fetch transaction from RPC
      const txResult = await RPCTransactionVerification.fetchTransaction(txHash);

      if (!txResult.success || !txResult.data) {
        return ctx.reply(
          `Failed to fetch transaction\n\n${txResult.error || 'Transaction not found'}`,
          { parse_mode: 'Markdown' }
        );
      }

      const tx = txResult.data;

      // Check transaction status
      if (tx.status !== 0) {
        return ctx.reply(
          `Transaction failed on-chain\n\nStatus code: ${tx.status}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Extract deposit information from transfers
      if (!tx.transfers || tx.transfers.length === 0) {
        return ctx.reply(
          `No transfers found in transaction`,
          { parse_mode: 'Markdown' }
        );
      }

      // Find transfer to bot treasury
      const deposit = tx.transfers.find(t => t.recipient === config.botTreasuryAddress);

      if (!deposit) {
        return ctx.reply(
          `No transfer to bot treasury found\n\nExpected recipient: ${config.botTreasuryAddress}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Extract user ID from memo
      const userId = tx.memo ? parseInt(tx.memo) : null;

      if (!userId || isNaN(userId)) {
        return ctx.reply(
          `No valid user ID found in memo\n\n` +
          `Memo: ${tx.memo || 'none'}\n\n` +
          `Use /claimdeposit to manually assign this deposit to a user.`,
          { parse_mode: 'Markdown' }
        );
      }

      // Check if already processed
      const existing = get<any>(
        'SELECT * FROM processed_deposits WHERE tx_hash = ?',
        [txHash]
      );

      if (existing && existing.processed) {
        return ctx.reply(
          `Deposit Already Processed\n\n` +
          `Amount: ${AmountPrecision.format(deposit.amount)} JUNO\n` +
          `User: ${userId}\n` +
          `This deposit has already been credited.`,
          { parse_mode: 'Markdown' }
        );
      }

      // Process the deposit
      const result = await LedgerService.processDeposit(
        userId,
        deposit.amount,
        txHash,
        deposit.sender,
        `Manual deposit processing by admin ${adminId}`
      );

      if (result.success) {
        // Mark deposit as processed in database
        if (!existing) {
          // Insert new record if it doesn't exist
          execute(
            `INSERT INTO processed_deposits (
              tx_hash, user_id, amount, from_address, memo, height, processed, processed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              txHash,
              userId,
              deposit.amount,
              deposit.sender,
              tx.memo || null,
              tx.height || 0,
              Math.floor(Date.now() / 1000),
              Math.floor(Date.now() / 1000)
            ]
          );
        } else {
          // Update existing record
          execute(
            'UPDATE processed_deposits SET processed = 1, processed_at = ?, user_id = ?, error = NULL WHERE tx_hash = ?',
            [Math.floor(Date.now() / 1000), userId, txHash]
          );
        }

        StructuredLogger.logUserAction('Deposit manually processed by admin', {
          userId: adminId,
          operation: 'process_deposit',
          targetUserId: userId,
          txHash,
          amount: deposit.amount.toString()
        });

        await ctx.reply(
          `Deposit Processed\n\n` +
          `Amount: ${AmountPrecision.format(deposit.amount)} JUNO\n` +
          `From: ${deposit.sender}\n` +
          `Credited to user: ${userId}\n` +
          `New balance: ${AmountPrecision.format(result.newBalance)} JUNO\n` +
          `Transaction: ${txHash.substring(0, 16)}...`,
          { parse_mode: 'Markdown' }
        );
      } else {
        // Mark deposit as failed in database
        if (!existing) {
          execute(
            `INSERT INTO processed_deposits (
              tx_hash, user_id, amount, from_address, memo, height, processed, error, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              txHash,
              userId,
              deposit.amount,
              deposit.sender,
              tx.memo || null,
              tx.height || 0,
              result.error || 'Unknown error',
              Math.floor(Date.now() / 1000)
            ]
          );
        } else {
          execute(
            'UPDATE processed_deposits SET error = ? WHERE tx_hash = ?',
            [result.error || 'Unknown error', txHash]
          );
        }

        await ctx.reply(
          `Failed to process deposit\n\n${result.error}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Failed to process deposit', { adminId, txHash, error });
      await ctx.reply('Failed to process deposit. Please check logs for details.');
    }
  });

  logger.info('Deposit commands registered');
};