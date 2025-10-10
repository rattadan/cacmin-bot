import { Telegraf } from 'telegraf';
import { validateConfig, config } from './config';
import { initDb } from './database';
import { logger } from './utils/logger';
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
import { RestrictionService } from './services/restrictionService';
import { JunoService } from './services/junoService';
import { JailService } from './services/jailService';
import { WalletService } from './services/walletService';
import { WalletServiceV2 } from './services/walletServiceV2';
import { LedgerService } from './services/ledgerService';
import { DepositMonitor } from './services/depositMonitor';
import { TransactionLockService } from './services/transactionLock';
import { financialLockCheck } from './middleware/lockCheck';

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    initDb();

    // Initialize JUNO service
    await JunoService.initialize();

    // Initialize new ledger-based wallet system
    LedgerService.initialize();
    await WalletServiceV2.initialize();
    DepositMonitor.initialize();
    TransactionLockService.initialize();

    // Start deposit monitoring
    DepositMonitor.start();

    // Keep old wallet service for backward compatibility
    WalletService.initialize();

    // Create bot instance
    const bot = new Telegraf(config.botToken);

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

    // Periodic cleanup of old deposit records (daily)
    setInterval(() => {
      DepositMonitor.cleanupOldRecords();
    }, 24 * 60 * 60 * 1000);

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
