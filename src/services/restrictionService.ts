import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { UserRestriction, GlobalAction, User } from '../types';
import { query, execute } from '../database';
import { logger } from '../utils/logger';
import { createViolation } from './violationService';
import { createPatternObject, testPatternSafely } from '../utils/safeRegex';

export class RestrictionService {
  /**
   * Check if a message violates any restrictions
   */
  static async checkMessage(ctx: Context, message: Message, user?: User): Promise<boolean> {
    if (!ctx.from) return false;

    const userId = ctx.from.id;
    const now = Math.floor(Date.now() / 1000);

    // Get user restrictions - ALWAYS apply these
    const userRestrictions = query<UserRestriction>(
      'SELECT * FROM user_restrictions WHERE user_id = ? AND (restricted_until IS NULL OR restricted_until > ?)',
      [userId, now]
    );

    // Get global restrictions - only apply if user is NOT elevated
    let globalRestrictions: GlobalAction[] = [];
    const isElevated = user?.role === 'elevated';

    if (!isElevated) {
      globalRestrictions = query<GlobalAction>(
        'SELECT * FROM global_restrictions WHERE restricted_until IS NULL OR restricted_until > ?',
        [now]
      );
    }

    // Check each restriction type
    for (const restriction of [...userRestrictions, ...globalRestrictions]) {
      const violated = await this.checkRestriction(ctx, message, restriction);
      if (violated) {
        await this.handleViolation(ctx, restriction);
        return true;
      }
    }

    return false;
  }

  /**
   * Check specific restriction
   */
  private static async checkRestriction(
    _ctx: Context,
    message: any,
    restriction: UserRestriction | GlobalAction
  ): Promise<boolean> {
    switch (restriction.restriction) {
      case 'no_stickers':
        return this.checkStickers(message, restriction.restrictedAction);

      case 'no_urls':
        return this.checkUrls(message, restriction.restrictedAction);

      case 'regex_block':
        return await this.checkRegex(message, restriction.restrictedAction);

      case 'no_media':
        return this.checkMedia(message);

      case 'no_photos':
        return this.checkPhotos(message);

      case 'no_videos':
        return this.checkVideos(message);

      case 'no_documents':
        return this.checkDocuments(message);

      case 'no_gifs':
        return this.checkGifs(message);

      case 'no_voice':
        return this.checkVoice(message);

      case 'no_forwarding':
        return this.checkForwarding(message);

      case 'muted':
        return true; // All messages blocked if muted

      default:
        return false;
    }
  }

  private static checkStickers(message: any, restrictedPackId?: string): boolean {
    if (!message.sticker) return false;

    if (!restrictedPackId) return true; // Block all stickers

    return message.sticker.set_name === restrictedPackId;
  }

  private static checkUrls(message: any, restrictedDomain?: string): boolean {
    if (!message.text && !message.caption) return false;

    const text = message.text || message.caption || '';
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const urls = text.match(urlRegex);

    if (!urls) return false;
    if (!restrictedDomain) return true; // Block all URLs

    return urls.some((url: string) => url.includes(restrictedDomain));
  }

  /**
   * Check if message text matches a regex pattern restriction.
   * Uses safe regex implementation with timeout protection to prevent ReDoS attacks.
   * Supports simple text, wildcard patterns, and full regex syntax.
   *
   * @param message - Telegram message object
   * @param pattern - Pattern to match (simple text, wildcard, or /regex/flags format)
   * @returns True if message violates the regex restriction
   *
   * @example
   * checkRegex(message, 'spam.*word') // Matches "spam word", "spam123word", etc.
   * checkRegex(message, '/buy.*now/gi') // Case-insensitive regex
   * checkRegex(message, 'test*pattern') // Wildcard pattern
   */
  private static async checkRegex(message: any, pattern?: string): Promise<boolean> {
    if (!pattern || (!message.text && !message.caption)) return false;

    const text = message.text || message.caption || '';

    // Use safe regex with timeout protection
    const compiledPattern = createPatternObject(pattern);
    if (!compiledPattern) {
      logger.error('Failed to compile regex pattern', { pattern });
      return false;
    }

    try {
      // Use timeout-protected matching to prevent ReDoS attacks
      return await testPatternSafely(compiledPattern.regex, text, 100);
    } catch (error) {
      logger.error('Regex matching error', { pattern, error });
      return false;
    }
  }

  private static checkMedia(message: any): boolean {
    return !!(message.photo || message.video || message.document || message.audio);
  }

  /**
   * Check if message contains photo attachments.
   * More granular than checkMedia(), allows restricting photos specifically.
   *
   * @param message - Telegram message object
   * @returns True if message contains photos
   */
  private static checkPhotos(message: any): boolean {
    return !!message.photo;
  }

  /**
   * Check if message contains video attachments.
   * More granular than checkMedia(), allows restricting videos specifically.
   *
   * @param message - Telegram message object
   * @returns True if message contains videos
   */
  private static checkVideos(message: any): boolean {
    return !!message.video;
  }

  /**
   * Check if message contains document attachments.
   * More granular than checkMedia(), allows restricting documents specifically.
   *
   * @param message - Telegram message object
   * @returns True if message contains documents
   */
  private static checkDocuments(message: any): boolean {
    return !!message.document;
  }

  private static checkGifs(message: any): boolean {
    return !!(message.animation);
  }

  private static checkVoice(message: any): boolean {
    return !!(message.voice || message.video_note);
  }

  private static checkForwarding(message: any): boolean {
    return !!(message.forward_from || message.forward_from_chat);
  }

  /**
   * Handle restriction violation
   */
  private static async handleViolation(ctx: Context, restriction: UserRestriction | GlobalAction): Promise<void> {
    if (!ctx.from) return;

    try {
      // Delete the message
      await ctx.deleteMessage();

      // Create violation record
      const msg = ctx.message as any;
      await createViolation(
        ctx.from.id,
        restriction.restriction,
        msg?.text || '[non-text message]'
      );

      // Send warning to user
      await ctx.reply(
        ` Your message was deleted for violating restriction: ${restriction.restriction}\n` +
        `A violation has been recorded. Use /violations to check your status.`
      );

      logger.info('Restriction violation handled', {
        userId: ctx.from.id,
        restriction: restriction.restriction
      });
    } catch (error) {
      logger.error('Failed to handle violation', error);
    }
  }

  /**
   * Clean expired restrictions
   */
  static cleanExpiredRestrictions(): void {
    const now = Math.floor(Date.now() / 1000);

    const userResult = execute(
      'DELETE FROM user_restrictions WHERE restricted_until IS NOT NULL AND restricted_until < ?',
      [now]
    );

    const globalResult = execute(
      'DELETE FROM global_restrictions WHERE restricted_until IS NOT NULL AND restricted_until < ?',
      [now]
    );

    logger.info('Cleaned expired restrictions', {
      userRestrictions: userResult.changes,
      globalRestrictions: globalResult.changes
    });
  }
}
