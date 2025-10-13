import { Telegraf } from 'telegraf';
import { validateConfig, config } from './config';
import { initDb } from './database';
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
import { registerWalletCommands } from './commands/wallet';
import { registerWalletTestCommands } from './commands/walletTest';
import { RestrictionService } from './services/restrictionService';
import { JailService } from './services/jailService';
import { UnifiedWalletService } from './services/unifiedWalletService';
import { LedgerService } from './services/ledgerService';
import { TransactionLockService } from './services/transactionLock';

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    initDb();

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
    registerWalletCommands(bot);
    registerWalletTestCommands(bot); // Owner-only test commands

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
