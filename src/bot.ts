/**
 * Main entry point for the CAC Admin Bot.
 * Initializes the Telegram bot instance, database, wallet services, and all command handlers.
 * Manages periodic cleanup tasks and graceful shutdown.
 *
 * @module bot
 */

import { Telegraf } from 'telegraf';
import { validateConfig, config } from './config';
import { initDb, execute } from './database';
import { logger } from './utils/logger';
import { setBotInstance } from './utils/adminNotify';
import { messageFilterMiddleware } from './middleware/messageFilter';
import { registerRoleHandlers } from './handlers/roles';
import { registerViolationHandlers } from './handlers/violations';
import { registerRestrictionHandlers } from './handlers/restrictions';
import { registerActionHandlers } from './handlers/actions';
import { registerBlacklistHandlers } from './handlers/blacklist';
import { registerHelpCommand } from './commands/help';
import { registerModerationCommands } from './commands/moderation';
import { registerPaymentCommands } from './commands/payment';
import { registerJailCommands } from './commands/jail';
import { registerGiveawayCommands } from './commands/giveaway';
import { registerDepositCommands } from './commands/deposit';
import { registerWalletCommands } from './commands/wallet';
import { registerWalletTestCommands } from './commands/walletTest';
import { registerSharedAccountCommands } from './commands/sharedAccounts';
import { registerStickerCommands } from './commands/sticker';
import { registerCallbackHandlers } from './handlers/callbacks';
import { RestrictionService } from './services/restrictionService';
import { JailService } from './services/jailService';
import { UnifiedWalletService } from './services/unifiedWalletService';
import { LedgerService } from './services/ledgerService';
import { TransactionLockService } from './services/transactionLock';

/**
 * Main initialization and startup function for the CAC Admin Bot.
 *
 * Performs the following initialization sequence:
 * 1. Validates configuration from environment variables
 * 2. Initializes SQLite database and creates tables
 * 3. Initializes ledger system for internal accounting
 * 4. Initializes unified wallet system with deposit monitoring
 * 5. Cleans up stale transaction locks from previous session
 * 6. Creates Telegraf bot instance
 * 7. Registers all middleware and command handlers
 * 8. Sets up periodic cleanup tasks (restrictions, jails, locks, reconciliation)
 * 9. Configures graceful shutdown handlers
 * 10. Launches the bot
 *
 * @throws {Error} If configuration validation fails or bot cannot start
 *
 * @example
 * ```typescript
 * // Bot is started automatically when the module is loaded
 * // The main() function handles all initialization
 * ```
 */
async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    initDb();

    // Initialize configured owners and admins
    const { createUser, userExists } = await import('./services/userService');
    for (const ownerId of config.ownerIds) {
      if (!userExists(ownerId)) {
        createUser(ownerId, `owner_${ownerId}`, 'owner', 'config_initialization');
        logger.info(`Created owner from config: ${ownerId}`);
      } else {
        // Update existing user to owner role if not already
        execute('UPDATE users SET role = ? WHERE id = ?', ['owner', ownerId]);
        logger.info(`Updated existing user to owner role: ${ownerId}`);
      }
    }
    for (const adminId of config.adminIds) {
      if (!userExists(adminId)) {
        createUser(adminId, `admin_${adminId}`, 'admin', 'config_initialization');
        // Set elevated flag for admins
        execute('UPDATE users SET elevated = 1 WHERE id = ?', [adminId]);
        logger.info(`Created admin from config: ${adminId}`);
      } else {
        // Update existing user to admin role if not already
        execute('UPDATE users SET role = ?, elevated = 1 WHERE id = ?', ['admin', adminId]);
        logger.info(`Updated existing user to admin role: ${adminId}`);
      }
    }

    // Initialize ledger system
    LedgerService.initialize();

    // Initialize unified wallet system (includes deposit monitoring)
    await UnifiedWalletService.initialize();

    // Clean up any stale locks from previous session
    await TransactionLockService.cleanExpiredLocks();
    logger.info('Cleaned up stale transaction locks');

    // Create bot instance
    const bot = new Telegraf(config.botToken);

    // Set bot instance for admin notifications
    setBotInstance(bot);

    // Initialize jail service with bot instance
    JailService.initialize(bot);

    // Apply global middleware
    bot.use(messageFilterMiddleware);

    // Register command handlers
    registerHelpCommand(bot);
    registerRoleHandlers(bot);
    registerActionHandlers(bot);
    registerBlacklistHandlers(bot);
    registerViolationHandlers(bot);
    registerRestrictionHandlers(bot);
    registerModerationCommands(bot);
    registerPaymentCommands(bot);
    registerJailCommands(bot);
    registerGiveawayCommands(bot);
    registerDepositCommands(bot); // Deposit management commands
    registerWalletCommands(bot);
    registerWalletTestCommands(bot); // Owner-only test commands
    registerSharedAccountCommands(bot); // Shared account management
    registerStickerCommands(bot); // Sticker sending and management
    registerCallbackHandlers(bot); // Inline keyboard callback handlers

    // Error handling
    bot.catch((err, ctx) => {
      logger.error('Bot error', { error: err, update: ctx.update });
    });

    // Periodic cleanup of expired restrictions (every hour)
    setInterval(() => {
      RestrictionService.cleanExpiredRestrictions();
    }, 60 * 60 * 1000);

    // Periodic cleanup of expired jails (every 5 minutes)
    setInterval(() => {
      JailService.cleanExpiredJails();
    }, 5 * 60 * 1000);

    // Periodic cleanup of expired transaction locks (every minute)
    setInterval(async () => {
      await TransactionLockService.cleanExpiredLocks();
    }, 60 * 1000);

    // Periodic balance reconciliation check (every hour)
    setInterval(async () => {
      try {
        const result = await LedgerService.reconcileAndAlert();
        if (!result.matched) {
          logger.warn('Balance reconciliation mismatch detected', result);
        }
      } catch (error) {
        logger.error('Error during periodic reconciliation', { error });
      }
    }, 60 * 60 * 1000);

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    // Start the bot
    await bot.launch();
    logger.info('Bot started successfully');
    console.log(' CAC Admin Bot is running...');

  } catch (error) {
    logger.error('Failed to start bot', error);
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();
