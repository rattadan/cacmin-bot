/**
 * Deposit Monitor Service
 * Monitors blockchain for incoming deposits
 *
 * @module services/depositMonitor
 */

import { config } from "../config";
import { execute, get } from "../database";
import { logger } from "../utils/logger";
import { LedgerService } from "./ledgerService";

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
	userId?: number;
	error?: string;
}

interface DepositInfo {
	txHash: string;
	userId: number | null;
	amount: number;
	fromAddress: string;
	memo: string;
	height: number;
	timestamp: number;
}

// System user IDs
const SYSTEM_USER_IDS = {
	UNCLAIMED: -3,
};

/**
 * Service for monitoring blockchain deposits
 */
export class DepositMonitor {
	private static isRunning = false;
	private static intervalId: NodeJS.Timeout | null = null;
	private static lastCheck: number | null = null;
	private static lastCheckedHeight = 0;
	private static walletAddress: string = "";
	private static rpcEndpoint: string = "";
	private static checkInterval = 60000; // 60 seconds

	/**
	 * Initialize the deposit monitor
	 */
	static initialize(): void {
		DepositMonitor.walletAddress = config.userFundsAddress || "";
		DepositMonitor.rpcEndpoint =
			config.junoRpcUrl || "https://rpc.juno.basementnodes.ca";

		// Load last checked height
		const lastProcessed = get<{ height: number }>(
			"SELECT MAX(height) as height FROM processed_deposits",
		);
		DepositMonitor.lastCheckedHeight = lastProcessed?.height || 0;

		logger.info("DepositMonitor initialized", {
			walletAddress: DepositMonitor.walletAddress,
			lastCheckedHeight: DepositMonitor.lastCheckedHeight,
		});
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

		// Start polling
		DepositMonitor.intervalId = setInterval(() => {
			DepositMonitor.checkForDeposits().catch((error) => {
				logger.error("Error checking for deposits", error);
			});
		}, DepositMonitor.checkInterval);

		// Initial check
		DepositMonitor.checkForDeposits().catch((error) => {
			logger.error("Initial deposit check failed", error);
		});

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
	static getStatus(): {
		isRunning: boolean;
		lastCheck: number | null;
		walletAddress: string;
		checkInterval: number;
	} {
		return {
			isRunning: DepositMonitor.isRunning,
			lastCheck: DepositMonitor.lastCheck,
			walletAddress: DepositMonitor.walletAddress,
			checkInterval: DepositMonitor.checkInterval,
		};
	}

	/**
	 * Check for new deposits via RPC polling
	 */
	static async checkForDeposits(): Promise<DepositCheckResult> {
		if (!DepositMonitor.walletAddress) {
			return {
				success: false,
				depositsFound: 0,
				error: "Wallet not configured",
			};
		}

		try {
			DepositMonitor.lastCheck = Math.floor(Date.now() / 1000);
			const deposits = await DepositMonitor.fetchRecentDeposits();
			let depositsFound = 0;

			for (const deposit of deposits) {
				const processed = await DepositMonitor.processDeposit(deposit);
				if (processed) {
					depositsFound++;
				}
			}

			return { success: true, depositsFound };
		} catch (error) {
			logger.error("Failed to check deposits", error);
			return {
				success: false,
				depositsFound: 0,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Check a specific transaction by hash
	 */
	static async checkSpecificTransaction(
		txHash: string,
	): Promise<TransactionCheckResult> {
		// Check if already processed
		const existing = get<{
			processed: number;
			user_id: number;
			amount: number;
		}>(
			"SELECT processed, user_id, amount FROM processed_deposits WHERE tx_hash = ?",
			[txHash],
		);

		if (existing) {
			if (existing.processed === 1) {
				return {
					found: true,
					processed: true,
					amount: existing.amount,
					userId: existing.user_id,
					error: "Transaction already processed",
				};
			}
			return {
				found: true,
				processed: false,
				amount: existing.amount,
				userId: existing.user_id,
			};
		}

		// Fetch from blockchain
		try {
			const response = await fetch(
				`${DepositMonitor.rpcEndpoint.replace("/rpc", "/api")}/cosmos/tx/v1beta1/txs/${txHash}`,
			);

			if (!response.ok) {
				if (response.status === 404) {
					return {
						found: false,
						processed: false,
						error: "Transaction not found on chain",
					};
				}
				return {
					found: false,
					processed: false,
					error: `API error: ${response.status}`,
				};
			}

			const data = (await response.json()) as any;
			const txResponse = data.tx_response;

			if (!txResponse) {
				return {
					found: false,
					processed: false,
					error: "Invalid transaction response",
				};
			}

			// code: 0 means success, undefined means we didn't get the code field
			if (txResponse.code !== undefined && txResponse.code !== 0) {
				return {
					found: true,
					processed: false,
					error: "Transaction failed on chain",
				};
			}

			// Extract transfer info
			const tx = txResponse.tx;
			const messages = tx?.body?.messages || [];
			const memo = tx?.body?.memo || "";

			let amount = 0;
			let fromAddress = "";
			let toCorrectAddress = false;

			for (const msg of messages) {
				if (msg["@type"] === "/cosmos.bank.v1beta1.MsgSend") {
					if (msg.to_address === DepositMonitor.walletAddress) {
						toCorrectAddress = true;
						fromAddress = msg.from_address;
						const junoAmount = msg.amount?.find(
							(a: any) => a.denom === "ujuno",
						);
						if (junoAmount) {
							amount = parseFloat(junoAmount.amount) / 1_000_000;
						}
					}
				}
			}

			if (!toCorrectAddress) {
				return {
					found: true,
					processed: false,
					error: "No valid transfer found to deposit address",
				};
			}

			// Parse user ID from memo
			const userId = DepositMonitor.parseUserId(memo);

			if (!userId) {
				return {
					found: true,
					processed: false,
					amount,
					sender: fromAddress,
					error: "Invalid or missing memo - cannot determine user ID",
				};
			}

			// Process the deposit
			const deposit: DepositInfo = {
				txHash,
				userId,
				amount,
				fromAddress,
				memo,
				height: parseInt(txResponse.height, 10),
				timestamp: Math.floor(Date.now() / 1000),
			};

			const processed = await DepositMonitor.processDeposit(deposit);

			return {
				found: true,
				processed,
				amount,
				sender: fromAddress,
				userId,
			};
		} catch (error) {
			logger.error("Failed to check specific transaction", { txHash, error });
			return {
				found: false,
				processed: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Fetch recent deposits from blockchain
	 */
	private static async fetchRecentDeposits(): Promise<DepositInfo[]> {
		try {
			const queryStr = `transfer.recipient='${DepositMonitor.walletAddress}'`;
			const url = `${DepositMonitor.rpcEndpoint}/tx_search?query="${encodeURIComponent(queryStr)}"&prove=false&per_page=20`;

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`RPC request failed: ${response.status}`);
			}

			const data = (await response.json()) as any;
			const deposits: DepositInfo[] = [];

			for (const tx of data.result?.txs || []) {
				const height = parseInt(tx.height, 10);

				// Skip already processed
				if (height <= DepositMonitor.lastCheckedHeight) {
					continue;
				}

				// Skip failed transactions
				if (tx.tx_result.code !== 0) {
					continue;
				}

				// Extract amount and sender from events
				let amount = 0;
				let fromAddress = "";

				for (const event of tx.tx_result.events) {
					if (event.type === "transfer") {
						const recipient = event.attributes.find(
							(a: any) => a.key === "recipient",
						)?.value;
						const amountStr = event.attributes.find(
							(a: any) => a.key === "amount",
						)?.value;
						const sender = event.attributes.find(
							(a: any) => a.key === "sender",
						)?.value;

						if (recipient === DepositMonitor.walletAddress && amountStr) {
							const match = amountStr.match(/^(\d+)ujuno$/);
							if (match) {
								amount = parseFloat(match[1]) / 1_000_000;
								fromAddress = sender || "";
							}
						}
					}
				}

				if (amount === 0) continue;

				// Extract memo
				const memo = DepositMonitor.parseMemo(tx.tx, amount);
				const userId = DepositMonitor.parseUserId(memo);

				deposits.push({
					txHash: tx.hash,
					userId,
					amount,
					fromAddress,
					memo,
					height,
					timestamp: Math.floor(Date.now() / 1000),
				});
			}

			return deposits;
		} catch (error) {
			logger.error("Failed to fetch deposits", error);
			return [];
		}
	}

	/**
	 * Process a deposit and credit user balance
	 */
	private static async processDeposit(deposit: DepositInfo): Promise<boolean> {
		// Check if already processed
		const existing = get<any>(
			"SELECT * FROM processed_deposits WHERE tx_hash = ?",
			[deposit.txHash],
		);

		if (existing) {
			return false;
		}

		// Determine target user
		let targetUserId = deposit.userId;
		if (!targetUserId) {
			targetUserId = SYSTEM_USER_IDS.UNCLAIMED;
			logger.info("Deposit without valid userId, sending to unclaimed", {
				txHash: deposit.txHash,
				memo: deposit.memo,
				amount: deposit.amount,
			});
		} else {
			// Ensure user exists
			const { createUser, userExists } = await import("./userService");
			if (!userExists(targetUserId)) {
				createUser(
					targetUserId,
					`user_${targetUserId}`,
					"pleb",
					"deposit_pre_funding",
				);
				await LedgerService.ensureUserBalance(targetUserId);
			}
		}

		// Record deposit as processing
		execute(
			`INSERT INTO processed_deposits (
				tx_hash, user_id, amount, from_address, memo, height, processed, created_at
			) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
			[
				deposit.txHash,
				targetUserId,
				deposit.amount,
				deposit.fromAddress,
				deposit.memo,
				deposit.height,
				deposit.timestamp,
			],
		);

		// Update last checked height
		if (deposit.height > DepositMonitor.lastCheckedHeight) {
			DepositMonitor.lastCheckedHeight = deposit.height;
		}

		// Process in ledger
		const result = await LedgerService.processDeposit(
			targetUserId,
			deposit.amount,
			deposit.txHash,
			deposit.fromAddress,
			`Deposit from ${deposit.fromAddress}${deposit.memo ? ` (memo: ${deposit.memo})` : ""}`,
		);

		if (result.success) {
			execute(
				"UPDATE processed_deposits SET processed = 1, processed_at = ? WHERE tx_hash = ?",
				[Math.floor(Date.now() / 1000), deposit.txHash],
			);

			logger.info("Deposit processed", {
				userId: targetUserId,
				amount: deposit.amount,
				txHash: deposit.txHash,
				newBalance: result.newBalance,
			});

			return true;
		}

		logger.error("Failed to process deposit", {
			userId: targetUserId,
			txHash: deposit.txHash,
			error: result.error,
		});

		return false;
	}

	/**
	 * Parse memo from protobuf tx
	 */
	private static parseMemo(base64Tx: string, amount: number): string {
		try {
			const buffer = Buffer.from(base64Tx, "base64");
			const amountInUjuno = (amount * 1_000_000).toString();

			const strings: { str: string; position: number }[] = [];

			// Scan for printable ASCII strings
			for (let i = 0; i < buffer.length; i++) {
				const strStart = i;
				let strLength = 0;

				while (i < buffer.length && buffer[i] >= 0x20 && buffer[i] <= 0x7e) {
					strLength++;
					i++;
				}

				if (strLength >= 1) {
					const str = buffer
						.slice(strStart, strStart + strLength)
						.toString("utf8");
					strings.push({ str, position: strStart });
				}
			}

			// Find position of amount
			const amountPos =
				strings.find((s) => s.str === amountInUjuno)?.position || -1;

			// Look for numeric memo after amount
			const numericMemo = strings.find((s) => {
				if (!/^\d{5,12}$/.test(s.str)) return false;
				if (s.str === amountInUjuno) return false;
				if (amountPos !== -1 && s.position < amountPos) return false;
				return true;
			});

			return numericMemo?.str || "";
		} catch (error) {
			logger.error("Failed to parse memo", error);
			return "";
		}
	}

	/**
	 * Parse user ID from memo
	 */
	private static parseUserId(memo: string): number | null {
		if (!memo) return null;

		const parsed = parseInt(memo.trim(), 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}

		const match = memo.match(/(?:user[Id]*[:\s]+)?(\d+)/i);
		if (match?.[1]) {
			const id = parseInt(match[1], 10);
			if (!Number.isNaN(id) && id > 0) {
				return id;
			}
		}

		return null;
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
