/**
 * Transaction locking service module.
 * Prevents double-spending by implementing a locking mechanism for concurrent transactions.
 * Ensures only one transaction can be processed per user at a time.
 *
 * @module services/transactionLock
 */

import { get, execute } from '../database';
import { StructuredLogger } from '../utils/logger';

/**
 * Database record for transaction locks.
 */
interface TransactionLock {
  userId: number;
  lockType: string;
  metadata?: string;
  lockedAt: number;
}

/**
 * Service to prevent double-spending by locking user transactions.
 * Implements a simple time-based lock with automatic expiration.
 */
export class TransactionLockService {
  private static readonly LOCK_TIMEOUT_SECONDS = 60; // 1 minute timeout

  /**
   * Attempts to acquire a lock for a user transaction.
   * If a lock already exists and hasn't expired, the request is denied.
   *
   * @param userId - Telegram user ID
   * @param lockType - Type of transaction (e.g., 'withdrawal', 'transfer')
   * @param metadata - Optional metadata to store with the lock
   * @returns True if lock was acquired, false if user is already locked
   *
   * @example
   * ```typescript
   * const locked = await TransactionLockService.acquireLock(
   *   123456,
   *   'withdrawal',
   *   { amount: 10, address: 'juno1...' }
   * );
   *
   * if (!locked) {
   *   console.log('Another transaction is in progress');
   *   return;
   * }
   *
   * try {
   *   // Process transaction
   * } finally {
   *   await TransactionLockService.releaseLock(123456);
   * }
   * ```
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
        StructuredLogger.logUserAction('Transaction lock conflict', {
          userId,
          operation: 'lock_conflict',
          amount: age.toString()
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

      StructuredLogger.logUserAction('Transaction lock acquired', {
        userId,
        operation: lockType
      });
      return true;
    } catch (error) {
      StructuredLogger.logError(error as Error, {
        userId,
        operation: 'acquire_lock'
      });
      return false;
    }
  }

  /**
   * Releases a user's transaction lock.
   *
   * @param userId - Telegram user ID
   */
  static async releaseLock(userId: number): Promise<void> {
    execute('DELETE FROM transaction_locks WHERE user_id = ?', [userId]);
    StructuredLogger.logDebug('Transaction lock released', { userId });
  }

  /**
   * Cleans up expired locks automatically.
   * Called before acquiring new locks to prevent stale locks.
   */
  static async cleanExpiredLocks(): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - this.LOCK_TIMEOUT_SECONDS;

    const result = execute(
      'DELETE FROM transaction_locks WHERE locked_at < ?',
      [cutoff]
    );

    if (result.changes > 0) {
      StructuredLogger.logUserAction('Cleaned expired locks', {
        operation: 'clean_locks',
        amount: result.changes.toString()
      });
    }
  }

  /**
   * Gets a user's active lock details.
   *
   * @param userId - Telegram user ID
   * @returns Lock object if active, null otherwise
   */
  static async getLock(userId: number): Promise<TransactionLock | null> {
    await this.cleanExpiredLocks();

    const lock = get<TransactionLock>(
      'SELECT * FROM transaction_locks WHERE user_id = ?',
      [userId]
    );

    if (!lock) return null;

    const age = Math.floor(Date.now() / 1000) - lock.lockedAt;
    if (age >= this.LOCK_TIMEOUT_SECONDS) {
      return null;
    }

    return lock;
  }

  /**
   * Checks if a user has an active lock.
   *
   * @param userId - Telegram user ID
   * @returns True if user has an unexpired lock
   */
  static async hasLock(userId: number): Promise<boolean> {
    const lock = await this.getLock(userId);
    return lock !== null;
  }

  /**
   * Gets all active (non-expired) locks for monitoring purposes.
   *
   * @returns Array of active transaction locks
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
