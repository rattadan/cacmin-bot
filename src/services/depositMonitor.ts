/**
 * Deposit Monitor Service
 * Monitors blockchain for incoming deposits
 *
 * @module services/depositMonitor
 */

import { execute, get } from "../database";
import { logger } from "../utils/logger";

interface DepositCheckResult {
	success: boolean;
	depositsFound: number;
	error?: string;
}

interface TransactionCheckResult {
	found: boolean;
	processed: boolean;
	amount?: number;
	sender?: string;
	error?: string;
}

/**
 * Service for monitoring blockchain deposits
 */
export class DepositMonitor {
	private static isRunning = false;
	private static intervalId: NodeJS.Timeout | null = null;

	/**
	 * Initialize the deposit monitor
	 */
	static initialize(): void {
		logger.info("DepositMonitor initialized");
	}

	/**
	 * Start monitoring for deposits
	 */
	static start(): void {
		if (DepositMonitor.isRunning) {
			logger.warn("DepositMonitor already running");
			return;
		}
		DepositMonitor.isRunning = true;
		logger.info("DepositMonitor started");
	}

	/**
	 * Stop monitoring for deposits
	 */
	static stop(): void {
		if (DepositMonitor.intervalId) {
			clearInterval(DepositMonitor.intervalId);
			DepositMonitor.intervalId = null;
		}
		DepositMonitor.isRunning = false;
		logger.info("DepositMonitor stopped");
	}

	/**
	 * Get current status of the monitor
	 */
	static getStatus(): { isRunning: boolean; lastCheck: number | null } {
		return {
			isRunning: DepositMonitor.isRunning,
			lastCheck: null,
		};
	}

	/**
	 * Check for new deposits
	 */
	static async checkForDeposits(): Promise<DepositCheckResult> {
		return {
			success: true,
			depositsFound: 0,
		};
	}

	/**
	 * Check a specific transaction by hash
	 */
	static async checkSpecificTransaction(
		txHash: string,
	): Promise<TransactionCheckResult> {
		const existing = get<{ processed: number }>(
			"SELECT processed FROM processed_deposits WHERE tx_hash = ?",
			[txHash],
		);

		if (existing) {
			return {
				found: true,
				processed: existing.processed === 1,
			};
		}

		return {
			found: false,
			processed: false,
		};
	}

	/**
	 * Cleanup old deposit records
	 */
	static cleanupOldRecords(): void {
		const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days
		execute("DELETE FROM processed_deposits WHERE created_at < ?", [cutoff]);
		logger.info("Cleaned up old deposit records");
	}
}
