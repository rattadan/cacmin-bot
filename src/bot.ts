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
import { RestrictionService } from './services/restrictionService';
import { JunoService } from './services/junoService';

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    initDb();

    // Initialize JUNO service
    await JunoService.initialize();

    // Create bot instance
    const bot = new Telegraf(config.botToken);

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

    // Error handling
    bot.catch((err, ctx) => {
      logger.error('Bot error', { error: err, update: ctx.update });
    });

    // Periodic cleanup of expired restrictions (every hour)
    setInterval(() => {
      RestrictionService.cleanExpiredRestrictions();
    }, 60 * 60 * 1000);

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    // Start the bot
    await bot.launch();
    logger.info('Bot started successfully');
    console.log('🤖 CAC Admin Bot is running...');

  } catch (error) {
    logger.error('Failed to start bot', error);
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();
