/**
 * Violation tracking and fine management service module.
 * Handles creation, retrieval, and payment processing for user violations.
 * Violations incur fines based on restriction type, tracked in the database.
 *
 * @module services/violationService
 */

import { execute, query, get } from '../database';
import { Violation } from '../types';
import { config } from '../config';
import { StructuredLogger } from '../utils/logger';

/**
 * Creates a new violation record for a user.
 * Automatically calculates the fine amount based on violation type,
 * increments the user's warning count, and logs the violation.
 *
 * @param userId - Telegram user ID of the violator
 * @param restriction - Type of restriction violated (e.g., 'no_stickers', 'no_urls')
 * @param message - Optional message content that triggered the violation
 * @returns The ID of the newly created violation record
 *
 * @example
 * ```typescript
 * const violationId = await createViolation(
 *   123456,
 *   'no_stickers',
 *   'User sent prohibited sticker'
 * );
 * console.log(`Violation ${violationId} created`);
 * ```
 */
export async function createViolation(
  userId: number,
  restriction: string,
  message?: string
): Promise<number> {
  // Calculate fine based on restriction type
  const fineAmount = calculateFine(restriction);

  const result = execute(
    `INSERT INTO violations (user_id, restriction, message, bail_amount)
     VALUES (?, ?, ?, ?)`,
    [userId, restriction, message, fineAmount]
  );

  // Update user warning count
  execute(
    'UPDATE users SET warning_count = warning_count + 1, updated_at = ? WHERE id = ?',
    [Math.floor(Date.now() / 1000), userId]
  );

  StructuredLogger.logSecurityEvent('Violation created', {
    userId,
    operation: 'violation_created',
    amount: fineAmount.toString()
  });

  return result.lastInsertRowid as number;
}

/**
 * Calculates the fine amount for a specific restriction violation.
 * Uses configured fine amounts from the config module.
 *
 * @param restriction - Type of restriction violated
 * @returns Fine amount in JUNO tokens
 *
 * @example
 * ```typescript
 * const fine = calculateFine('no_stickers'); // Returns configured sticker fine
 * const urlFine = calculateFine('no_urls'); // Returns configured URL fine
 * ```
 */
function calculateFine(restriction: string): number {
  switch (restriction) {
    case 'no_stickers': return config.fineAmounts.sticker;
    case 'no_urls': return config.fineAmounts.url;
    case 'regex_block': return config.fineAmounts.regex;
    case 'blacklist': return config.fineAmounts.blacklist;
    default: return 1.0;
  }
}

/**
 * Retrieves all violations for a specific user, ordered by most recent first.
 *
 * @param userId - Telegram user ID
 * @returns Array of violation records
 *
 * @example
 * ```typescript
 * const violations = getUserViolations(123456);
 * console.log(`User has ${violations.length} total violations`);
 * ```
 */
export function getUserViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? ORDER BY timestamp DESC',
    [userId]
  );
}

/**
 * Retrieves only unpaid violations for a specific user.
 * Used to calculate total outstanding fines.
 *
 * @param userId - Telegram user ID
 * @returns Array of unpaid violation records
 *
 * @example
 * ```typescript
 * const unpaid = getUnpaidViolations(123456);
 * const totalOwed = unpaid.reduce((sum, v) => sum + v.bail_amount, 0);
 * ```
 */
export function getUnpaidViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
}

/**
 * Marks a violation as paid with transaction details.
 * Records the transaction hash, payer user ID (if bail paid by another user),
 * and payment timestamp.
 *
 * @param violationId - ID of the violation to mark as paid
 * @param txHash - Blockchain transaction hash of the payment
 * @param paidByUserId - Optional user ID if someone else paid the bail
 *
 * @example
 * ```typescript
 * // User pays own fine
 * markViolationPaid(42, 'ABC123...');
 *
 * // Another user pays bail
 * markViolationPaid(42, 'ABC123...', 789012);
 * ```
 */
export function markViolationPaid(violationId: number, txHash: string, paidByUserId?: number): void {
  const now = Math.floor(Date.now() / 1000);
  execute(
    'UPDATE violations SET paid = 1, payment_tx = ?, paid_by_user_id = ?, paid_at = ? WHERE id = ?',
    [txHash, paidByUserId || null, now, violationId]
  );

  StructuredLogger.logTransaction('Violation payment recorded', {
    txHash,
    operation: 'violation_paid',
    userId: paidByUserId
  });
}

/**
 * Calculates the total amount owed in unpaid fines for a user.
 *
 * @param userId - Telegram user ID
 * @returns Total fine amount in JUNO tokens
 *
 * @example
 * ```typescript
 * const owed = getTotalFines(123456);
 * console.log(`User owes ${owed.toFixed(6)} JUNO in fines`);
 * ```
 */
export function getTotalFines(userId: number): number {
  const result = get<{ total: number }>(
    'SELECT SUM(bail_amount) as total FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
  return result?.total || 0;
}
