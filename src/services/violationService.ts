/** Violation tracking and fine management service */

import { execute, query, get } from '../database';
import { Violation } from '../types';
import { config } from '../config';
import { StructuredLogger } from '../utils/logger';

/**
 * Create violation record for user
 * Calculates fine based on restriction type, increments warning count
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

/** Calculate fine amount based on restriction type using config */
function calculateFine(restriction: string): number {
  switch (restriction) {
    case 'no_stickers': return config.fineAmounts.sticker;
    case 'no_urls': return config.fineAmounts.url;
    case 'regex_block': return config.fineAmounts.regex;
    case 'blacklist': return config.fineAmounts.blacklist;
    default: return 1.0;
  }
}

/** Get all violations for user (most recent first) */
export function getUserViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? ORDER BY timestamp DESC',
    [userId]
  );
}

/** Get only unpaid violations for user (for calculating outstanding fines) */
export function getUnpaidViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
}

/**
 * Mark violation as paid with transaction details
 * Records tx hash, payer user ID (if bail paid by another), and timestamp
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

/** Calculate total amount owed in unpaid fines for user */
export function getTotalFines(userId: number): number {
  const result = get<{ total: number }>(
    'SELECT SUM(bail_amount) as total FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
  return result?.total || 0;
}
