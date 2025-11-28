/**
 * Sticker command handlers for the CAC Admin Bot.
 * Provides commands for sending stickers from specified packs.
 *
 * @module commands/sticker
 */

import { Telegraf, Context } from 'telegraf';
import { logger } from '../utils/logger';
import { escapeMarkdownV2 } from '../utils/markdown';

/**
 * Sticker file IDs from CACGifs pack
 * Note: These need to be obtained by having the bot receive stickers from the pack
 * To get file_id: Send a sticker to the bot and it will be logged
 */
const STICKER_PACK = {
  // CACGifs pack stickers
  cacgifs: {
    first: 'CAACAgIAAxkBAAICIGkIxVYID2ee6Z3t3fzMKGyrzCLlAAJmNgACfvIoSL_cdmEGklS0NgQ' // 🛰 satellite sticker
  }
};

/**
 * Registers sticker-related commands with the bot
 */
export function registerStickerCommands(bot: Telegraf<Context>): void {

  /**
   * Command: /sendsticker
   * Send a specific sticker from the CACGifs pack
   *
   * Permission: Any user (can be restricted to elevated/admin if needed)
   * Syntax: /sendsticker [name]
   */
  bot.command('sendsticker', async (ctx) => {
    try {
      const args = ctx.message?.text.split(' ').slice(1);
      const stickerName = args?.[0] || 'first';

      // Check if the requested sticker exists
      if (stickerName !== 'first') {
        return ctx.reply(
          '⚠️ *Available stickers:*\n' +
          '• `first` - 🛰 Satellite sticker\n\n' +
          'Usage: `/sendsticker first`\n\n' +
          'Pack: https://t.me/addstickers/CACGifs',
          { parse_mode: 'MarkdownV2' }
        );
      }

      // Check if we have the file_id configured
      const fileId = STICKER_PACK.cacgifs[stickerName];
      if (!fileId) {
        return ctx.reply(
          '⚠️ *Sticker not configured*\n\n' +
          'The sticker file_id needs to be set up.\n' +
          'Use `/getsticker` (reply to a sticker) to get file_ids.\n\n' +
          'Pack: https://t.me/addstickers/CACGifs',
          { parse_mode: 'MarkdownV2' }
        );
      }

      // Send the sticker
      await ctx.replyWithSticker(fileId);

      logger.info('Sticker sent', {
        stickerName,
        fileId,
        userId: ctx.from?.id,
        username: ctx.from?.username
      });

    } catch (error) {
      logger.error('Error sending sticker', { error });
      await ctx.reply(
        '❌ *Failed to send sticker*\n\n' +
        'The sticker file_id may be invalid or expired.\n' +
        'Use `/getsticker` to get a fresh file_id from the pack:\n' +
        'https://t.me/addstickers/CACGifs',
        { parse_mode: 'MarkdownV2' }
      );
    }
  });

  /**
   * Command: /getsticker
   * Get file_id from a sticker (send this command as a reply to a sticker)
   *
   * Permission: Any user
   * Usage: Reply to a sticker with /getsticker
   */
  bot.command('getsticker', async (ctx) => {
    try {
      const replyMessage = ctx.message.reply_to_message;

      if (!replyMessage || !('sticker' in replyMessage)) {
        return ctx.reply(
          '❌ Please reply to a sticker with /getsticker to get its file_id'
        );
      }

      const sticker = replyMessage.sticker;
      const fileId = sticker.file_id;
      const fileUniqueId = sticker.file_unique_id;
      const stickerSetName = sticker.set_name;
      const emoji = sticker.emoji;

      await ctx.reply(
        `📋 *Sticker Information*\n\n` +
        `File ID: \`${escapeMarkdownV2(fileId)}\`\n` +
        `Unique ID: \`${escapeMarkdownV2(fileUniqueId)}\`\n` +
        `Set Name: ${escapeMarkdownV2(stickerSetName || 'N/A')}\n` +
        `Emoji: ${escapeMarkdownV2(emoji || 'N/A')}\n\n` +
        `Use this file\\_id to send this sticker programmatically\\.`,
        { parse_mode: 'MarkdownV2' }
      );

      logger.info('Sticker file_id retrieved', {
        fileId,
        fileUniqueId,
        stickerSetName,
        emoji,
        userId: ctx.from?.id
      });

    } catch (error) {
      logger.error('Error getting sticker info', { error });
      await ctx.reply('❌ Failed to get sticker information.');
    }
  });

  /**
   * Listen for stickers sent to the bot to log their file_ids
   */
  bot.on('sticker', async (ctx) => {
    try {
      const sticker = ctx.message.sticker;
      const fileId = sticker.file_id;
      const stickerSetName = sticker.set_name;
      const emoji = sticker.emoji;

      // Log sticker info for CACGifs pack specifically
      if (stickerSetName === 'CACGifs') {
        logger.info('CACGifs sticker received', {
          fileId,
          emoji,
          userId: ctx.from?.id,
          username: ctx.from?.username
        });

        // Optionally notify in DM
        if (ctx.chat.type === 'private') {
          await ctx.reply(
            `✅ CACGifs sticker logged\\!\n\n` +
            `File ID: \`${escapeMarkdownV2(fileId)}\`\n` +
            `Emoji: ${escapeMarkdownV2(emoji || 'N/A')}`,
            { parse_mode: 'MarkdownV2' }
          );
        }
      }

    } catch (error) {
      logger.error('Error processing sticker', { error });
    }
  });

  /**
   * Command: /cac
   * Send the first sticker from CACGifs pack (once file_id is set)
   *
   * Permission: Any user
   * Syntax: /cac
   */
  bot.command('cac', async (ctx) => {
    try {
      // Check if we have the file_id
      const fileId = STICKER_PACK.cacgifs.first;
      if (!fileId) {
        return ctx.reply(
          '⚠️ *Sticker not configured*\n\n' +
          'The CAC sticker file_id needs to be set up.\n' +
          'Use `/getsticker` (reply to a sticker) to get the file_id.\n\n' +
          'Pack: https://t.me/addstickers/CACGifs',
          { parse_mode: 'MarkdownV2' }
        );
      }

      // Send the sticker
      await ctx.replyWithSticker(fileId);

      logger.info('CAC sticker sent', {
        fileId,
        userId: ctx.from?.id,
        username: ctx.from?.username
      });

    } catch (error) {
      logger.error('Error sending CAC sticker', { error });
      await ctx.reply(
        '❌ *Failed to send sticker*\n\n' +
        'The sticker file_id may be invalid or expired.\n' +
        'Use `/getsticker` to get a fresh file_id from the pack:\n' +
        'https://t.me/addstickers/CACGifs',
        { parse_mode: 'MarkdownV2' }
      );
    }
  });
}

/**
 * Update sticker file_id (for use in bot initialization or admin command)
 * This function can be called to update the stored file_id
 */
export function setStickerFileId(pack: 'cacgifs', sticker: 'first', fileId: string): void {
  if (pack === 'cacgifs') {
    STICKER_PACK.cacgifs[sticker] = fileId;
    logger.info('Sticker file_id updated', { pack, sticker, fileId });
  }
}
