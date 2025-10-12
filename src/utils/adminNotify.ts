import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from './logger';

let botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf): void {
  botInstance = bot;
}

export async function notifyAdmin(message: string): Promise<void> {
  if (!botInstance) {
    logger.warn('Bot instance not set, cannot send admin notification');
    return;
  }

  if (!config.adminChatId) {
    logger.warn('Admin chat ID not configured, cannot send notification');
    return;
  }

  try {
    await botInstance.telegram.sendMessage(
      config.adminChatId,
      `⚠️ *Admin Alert*\n\n${message}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to send admin notification', { error, message });
  }
}
