import { get, execute } from '../database';
import { logger } from '../utils/logger';

interface TransactionLock {
  userId: number;
  lockType: string;
  metadata?: string;
  lockedAt: number;
}

/**
 * Service to prevent double-spending by locking user transactions
 */
export class TransactionLockService {
  private static readonly LOCK_TIMEOUT_SECONDS = 60; // 1 minute timeout

  /**
   * Attempt to acquire a lock for a user transaction
   */
  static async acquireLock(
    userId: number,
    lockType: string,
    metadata?: any
  ): Promise<boolean> {
    // Clean up expired locks first
    await this.cleanExpiredLocks();

    // Check if user is already locked
    const existingLock = get<TransactionLock>(
      'SELECT * FROM transaction_locks WHERE user_id = ?',
      [userId]
    );

    if (existingLock) {
      const age = Math.floor(Date.now() / 1000) - existingLock.lockedAt;

      if (age < this.LOCK_TIMEOUT_SECONDS) {
        logger.warn('User transaction already locked', {
          userId,
          existingLockType: existingLock.lockType,
          age
        });
        return false;
      }

      // Lock expired, remove it
      await this.releaseLock(userId);
    }

    // Acquire new lock
    try {
      execute(
        'INSERT INTO transaction_locks (user_id, lock_type, metadata, locked_at) VALUES (?, ?, ?, ?)',
        [
          userId,
          lockType,
          metadata ? JSON.stringify(metadata) : null,
          Math.floor(Date.now() / 1000)
        ]
      );

      logger.info('Transaction lock acquired', { userId, lockType });
      return true;
    } catch (error) {
      logger.error('Failed to acquire transaction lock', { userId, lockType, error });
      return false;
    }
  }

  /**
   * Release a user's transaction lock
   */
  static async releaseLock(userId: number): Promise<void> {
    execute('DELETE FROM transaction_locks WHERE user_id = ?', [userId]);
    logger.debug('Transaction lock released', { userId });
  }

  /**
   * Clean up expired locks
   */
  static async cleanExpiredLocks(): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - this.LOCK_TIMEOUT_SECONDS;

    const result = execute(
      'DELETE FROM transaction_locks WHERE locked_at < ?',
      [cutoff]
    );

    if (result.changes > 0) {
      logger.info('Cleaned expired transaction locks', { count: result.changes });
    }
  }

  /**
   * Check if a user has an active lock
   */
  static async hasLock(userId: number): Promise<boolean> {
    await this.cleanExpiredLocks();

    const lock = get<TransactionLock>(
      'SELECT * FROM transaction_locks WHERE user_id = ?',
      [userId]
    );

    if (!lock) return false;

    const age = Math.floor(Date.now() / 1000) - lock.lockedAt;
    return age < this.LOCK_TIMEOUT_SECONDS;
  }

  /**
   * Get all active locks (for monitoring)
   */
  static async getActiveLocks(): Promise<TransactionLock[]> {
    await this.cleanExpiredLocks();

    const cutoff = Math.floor(Date.now() / 1000) - this.LOCK_TIMEOUT_SECONDS;

    return get<TransactionLock[]>(
      'SELECT * FROM transaction_locks WHERE locked_at >= ?',
      [cutoff]
    ) || [];
  }
}