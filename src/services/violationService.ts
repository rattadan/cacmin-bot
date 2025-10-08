import { execute, query, get } from '../database';
import { Violation } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

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

  logger.info('Violation created', { userId, restriction, violationId: result.lastInsertRowid });

  return result.lastInsertRowid as number;
}

function calculateFine(restriction: string): number {
  switch (restriction) {
    case 'no_stickers': return config.fineAmounts.sticker;
    case 'no_urls': return config.fineAmounts.url;
    case 'regex_block': return config.fineAmounts.regex;
    case 'blacklist': return config.fineAmounts.blacklist;
    default: return 1.0;
  }
}

export function getUserViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? ORDER BY timestamp DESC',
    [userId]
  );
}

export function getUnpaidViolations(userId: number): Violation[] {
  return query<Violation>(
    'SELECT * FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
}

export function markViolationPaid(violationId: number, txHash: string): void {
  execute(
    'UPDATE violations SET paid = 1, payment_tx = ? WHERE id = ?',
    [txHash, violationId]
  );
  logger.info('Violation marked as paid', { violationId, txHash });
}

export function getTotalFines(userId: number): number {
  const result = get<{ total: number }>(
    'SELECT SUM(bail_amount) as total FROM violations WHERE user_id = ? AND paid = 0',
    [userId]
  );
  return result?.total || 0;
}
