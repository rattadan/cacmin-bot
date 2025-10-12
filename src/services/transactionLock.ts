import { logger } from '../utils/logger';
import { execute, get, query } from '../database';

interface UserLock {
  user_id: number;
  lock_type: string;
  locked_at: number;
  expires_at: number;
  metadata?: string;
}

/**
 * TransactionLockService
 *
 * Manages user locking during critical financial operations to prevent
 * double-spending and ensure transaction atomicity.
 */
export class TransactionLockService {
  private static readonly LOCK_DURATION = 120; // 120 seconds lock timeout
  private static readonly LOCK_TYPES = {
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer'
  };

  /**
   * Initialize the transaction lock table
   */
  static initialize(): void {
    execute(`
      CREATE TABLE IF NOT EXISTS user_locks (
        user_id INTEGER PRIMARY KEY,
        lock_type TEXT NOT NULL,
        locked_at INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create index for expiration checks
    execute(`
      CREATE INDEX IF NOT EXISTS idx_user_locks_expires
      ON user_locks(expires_at)
    `);

    logger.info('Transaction lock service initialized');
  }

  /**
   * Acquire a lock for a user
   * Returns true if lock acquired, false if user is already locked
   */
  static async acquireLock(
    userId: number,
    lockType: string,
    metadata?: any
  ): Promise<boolean> {
    try {
      // Clean expired locks first
      await this.cleanExpiredLocks();

      // Check if user is already locked
      const existingLock = get<UserLock>(
        'SELECT * FROM user_locks WHERE user_id = ?',
        [userId]
      );

      if (existingLock) {
        const now = Math.floor(Date.now() / 1000);
        if (existingLock.expires_at > now) {
          logger.warn('User already locked', {
            userId,
            existingLockType: existingLock.lock_type,
            requestedLockType: lockType
          });
          return false;
        }
      }

      // Acquire new lock
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + this.LOCK_DURATION;

      execute(
        `INSERT OR REPLACE INTO user_locks
         (user_id, lock_type, locked_at, expires_at, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          lockType,
          now,
          expiresAt,
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      logger.info('Lock acquired', {
        userId,
        lockType,
        expiresAt
      });

      return true;
    } catch (error) {
      logger.error('Failed to acquire lock', { userId, lockType, error });
      return false;
    }
  }

  /**
   * Release a lock for a user
   */
  static async releaseLock(userId: number): Promise<void> {
    try {
      const result = execute(
        'DELETE FROM user_locks WHERE user_id = ?',
        [userId]
      );

      if (result.changes > 0) {
        logger.info('Lock released', { userId });
      }
    } catch (error) {
      logger.error('Failed to release lock', { userId, error });
    }
  }

  /**
   * Check if a user is locked
   */
  static async isUserLocked(userId: number): Promise<boolean> {
    const lock = get<UserLock>(
      'SELECT * FROM user_locks WHERE user_id = ?',
      [userId]
    );

    if (!lock) return false;

    const now = Math.floor(Date.now() / 1000);
    return lock.expires_at > now;
  }

  /**
   * Get lock details for a user
   */
  static async getUserLock(userId: number): Promise<UserLock | null> {
    const lock = get<UserLock>(
      'SELECT * FROM user_locks WHERE user_id = ?',
      [userId]
    );

    if (!lock) return null;

    const now = Math.floor(Date.now() / 1000);
    if (lock.expires_at <= now) {
      // Lock expired, clean it up
      await this.releaseLock(userId);
      return null;
    }

    return lock;
  }

  /**
   * Clean up expired locks
   */
  static async cleanExpiredLocks(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const result = execute(
      'DELETE FROM user_locks WHERE expires_at <= ?',
      [now]
    );

    if (result.changes > 0) {
      logger.info('Cleaned expired locks', { count: result.changes });
    }
  }

  /**
   * Emergency release all locks (admin function)
   */
  static async releaseAllLocks(): Promise<number> {
    const result = execute('DELETE FROM user_locks');
    logger.warn('All locks released', { count: result.changes });
    return result.changes as number;
  }

  /**
   * Get all active locks (for monitoring)
   */
  static async getActiveLocks(): Promise<UserLock[]> {
    const now = Math.floor(Date.now() / 1000);
    return query<UserLock>(
      'SELECT * FROM user_locks WHERE expires_at > ?',
      [now]
    );
  }
}