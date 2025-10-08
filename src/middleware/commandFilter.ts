import { Context, MiddlewareFn } from 'telegraf';
import { logger } from '../utils/logger';

const BOT_USERNAME = 'banBabyBot';

/**
 * Middleware to ensure commands in group chats include @botusername
 * This prevents conflicts with other bots like Rose that use the same commands
 */
export const commandFilterMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  // Check if this is a command message
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : null;

  if (!messageText || !messageText.startsWith('/')) {
    return next();
  }

  // Extract command (e.g., "/mute" or "/mute@banBabyBot")
  const commandMatch = messageText.match(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?/);

  if (!commandMatch) {
    return next();
  }

  const [, commandName, botMention] = commandMatch;

  // Check if we're in a group/supergroup chat
  const chatType = ctx.chat?.type;
  const isGroupChat = chatType === 'group' || chatType === 'supergroup';

  // In group chats, only respond to commands with @banBabyBot suffix
  if (isGroupChat) {
    const isMentioned = botMention === `@${BOT_USERNAME}`;

    if (!isMentioned) {
      // Command is not for this bot, ignore it
      logger.debug('Ignoring command without bot mention in group', {
        command: commandName,
        chatId: ctx.chat?.id,
        chatType
      });
      return; // Don't call next(), stop processing
    }
  }

  // In private chats or if properly mentioned in groups, continue
  return next();
};
