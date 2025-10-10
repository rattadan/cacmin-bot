import { Telegraf, Context } from 'telegraf';
import { query, execute, get } from '../database';
import { User, JailEvent } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export class JailService {
  private static bot: Telegraf<Context>;

  static initialize(bot: Telegraf<Context>): void {
    this.bot = bot;
  }

  /**
   * Log a jail event to the database
   */
  static logJailEvent(
    userId: number,
    eventType: 'jailed' | 'unjailed' | 'auto_unjailed' | 'bail_paid',
    adminId?: number,
    durationMinutes?: number,
    bailAmount: number = 0,
    paidByUserId?: number,
    paymentTx?: string,
    metadata?: Record<string, any>
  ): void {
    execute(
      `INSERT INTO jail_events (user_id, event_type, admin_id, duration_minutes, bail_amount, paid_by_user_id, payment_tx, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        eventType,
        adminId || null,
        durationMinutes || null,
        bailAmount,
        paidByUserId || null,
        paymentTx || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  }

  /**
   * Get all active jails (users currently jailed)
   */
  static getActiveJails(): Array<User & { timeRemaining: number }> {
    const now = Math.floor(Date.now() / 1000);
    const jailedUsers = query<User>(
      'SELECT * FROM users WHERE muted_until IS NOT NULL AND muted_until > ?',
      [now]
    );

    return jailedUsers.map(user => ({
      ...user,
      timeRemaining: user.muted_until! - now
    }));
  }

  /**
   * Get jail events for a user
   */
  static getUserJailEvents(userId: number, limit: number = 10): JailEvent[] {
    return query<JailEvent>(
      'SELECT * FROM jail_events WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
      [userId, limit]
    );
  }

  /**
   * Get all jail events (for statistics)
   */
  static getAllJailEvents(limit: number = 100): JailEvent[] {
    return query<JailEvent>(
      'SELECT * FROM jail_events ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
  }

  /**
   * Calculate bail amount for a jail duration
   */
  static calculateBailAmount(durationMinutes: number): number {
    // Base rate: 0.1 JUNO per minute
    const baseRate = 0.1;
    return Math.max(1.0, durationMinutes * baseRate);
  }

  /**
   * Clean up expired jails by restoring user permissions
   * Should be called periodically
   */
  static async cleanExpiredJails(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);

      // Find users whose jail time has expired
      const expiredJails = query<User>(
        'SELECT * FROM users WHERE muted_until IS NOT NULL AND muted_until <= ?',
        [now]
      );

      if (expiredJails.length === 0) {
        return;
      }

      logger.info(`Found ${expiredJails.length} expired jails to clean up`);

      for (const user of expiredJails) {
        try {
          // Clear the muted_until field
          execute(
            'UPDATE users SET muted_until = NULL, updated_at = ? WHERE id = ?',
            [now, user.id]
          );

          // Try to restore permissions in the configured group chat
          if (config.groupChatId) {
            try {
              await this.bot.telegram.restrictChatMember(config.groupChatId, user.id, {
                permissions: {
                  can_send_messages: true,
                  can_send_audios: true,
                  can_send_documents: true,
                  can_send_photos: true,
                  can_send_videos: true,
                  can_send_video_notes: true,
                  can_send_voice_notes: true,
                  can_send_polls: true,
                  can_send_other_messages: true,
                  can_add_web_page_previews: true,
                  can_change_info: false,
                  can_invite_users: true,
                  can_pin_messages: false,
                  can_manage_topics: false,
                },
              });
              logger.info(`Auto-restored permissions for user ${user.id} after jail expiry`);

              // Log the auto-unjail event
              this.logJailEvent(user.id, 'auto_unjailed');

              // Notify the user their jail time is up
              try {
                await this.bot.telegram.sendMessage(
                  user.id,
                  ' Your jail time has expired. You can now send messages in the group again.'
                );
              } catch (dmError) {
                // User might have blocked the bot, that's okay
                logger.debug(`Could not notify user ${user.id} of jail expiry`, dmError);
              }
            } catch (error) {
              logger.error(`Failed to restore permissions for user ${user.id}`, error);
              // Continue with other users even if one fails
            }
          }
        } catch (error) {
          logger.error(`Failed to process expired jail for user ${user.id}`, error);
        }
      }
    } catch (error) {
      logger.error('Error in cleanExpiredJails', error);
    }
  }
}
