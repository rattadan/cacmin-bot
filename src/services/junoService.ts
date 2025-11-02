/**
 * JUNO blockchain integration service module.
 * Handles payment verification, balance queries, and blockchain interactions
 * for the JUNO network via REST API endpoints.
 *
 * @module services/junoService
 */

import { config } from '../config';
import { StructuredLogger } from '../utils/logger';
import { logger } from '../utils/logger';

/**
 * Service for interacting with the JUNO blockchain.
 * Provides payment verification and balance query functionality.
 */
export class JunoService {
  private static client: any = null;
  private static rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';

  /**
   * Initializes the JUNO service.
   * Checks configuration and sets up blockchain connectivity.
   */
  static async initialize(): Promise<void> {
    if (!config.botTreasuryAddress) {
      StructuredLogger.logUserAction('Treasury not configured', {
        operation: 'init_warning'
      });
      return;
    }

    try {
      // Initialize Cosmos client for JUNO
      // Note: Actual implementation would require proper cosmos-client setup
      // Example: this.client = await CosmWasmClient.connect(this.rpcEndpoint);
      StructuredLogger.logUserAction('JUNO service initialized', {
        operation: 'service_init'
      });
    } catch (error) {
      StructuredLogger.logError(error as Error, {
        operation: 'init_juno_service'
      });
    }
  }

  /**
   * Verifies a payment transaction on the JUNO blockchain.
   * Checks that the transaction succeeded, was sent to the treasury,
   * and contains the expected amount (with 0.01 JUNO tolerance).
   *
   * @param txHash - Blockchain transaction hash to verify
   * @param expectedAmount - Expected payment amount in JUNO
   * @returns True if payment is verified, false otherwise
   *
   * @example
   * ```typescript
   * const verified = await JunoService.verifyPayment('ABC123...', 10.5);
   * if (verified) {
   *   console.log('Payment confirmed!');
   * }
   * ```
   */
  static async verifyPayment(txHash: string, expectedAmount: number): Promise<boolean> {
    try {
      StructuredLogger.logTransaction('Verifying payment', {
        txHash,
        amount: expectedAmount.toString(),
        operation: 'verify_payment'
      });

      // Query using the REST API endpoint
      const apiEndpoint = config.junoApiUrl || 'https://api.juno.basementnodes.ca';
      const response = await fetch(`${apiEndpoint}/cosmos/tx/v1beta1/txs/${txHash}`);

      if (!response.ok) {
        logger.warn('Transaction not found on chain', { txHash });
        return false;
      }

      const data = await response.json() as any;
      const tx = data.tx_response;

      // Check if transaction was successful
      if (tx.code !== 0) {
        StructuredLogger.logTransaction('Transaction failed', {
          txHash,
          operation: 'verify_failed'
        });
        return false;
      }

      // Parse messages to find transfer to our treasury
      const messages = tx.tx.body.messages;
      const treasuryAddress = config.botTreasuryAddress;

      if (!treasuryAddress) {
        StructuredLogger.logError('Treasury not configured', {
          operation: 'verify_payment'
        });
        return false;
      }

      for (const message of messages) {
        if (message['@type'] === '/cosmos.bank.v1beta1.MsgSend') {
          // Check if recipient is our treasury
          if (message.to_address === treasuryAddress) {
            // Find JUNO amount
            const junoAmount = message.amount?.find((a: any) => a.denom === 'ujuno');

            if (junoAmount) {
              const amount = parseFloat(junoAmount.amount) / 1_000_000;

              // Allow small difference for rounding (0.01 JUNO tolerance)
              const difference = Math.abs(amount - expectedAmount);

              if (difference < 0.01) {
                StructuredLogger.logTransaction('Payment verified', {
                  txHash,
                  amount: amount.toString(),
                  operation: 'verify_success'
                });
                return true;
              } else {
                StructuredLogger.logTransaction('Amount mismatch', {
                  txHash,
                  amount: amount.toString(),
                  operation: 'verify_mismatch'
                });
              }
            }
          }
        }
      }

      StructuredLogger.logTransaction('No valid payment found', {
        txHash,
        operation: 'verify_not_found'
      });
      return false;
    } catch (error) {
      StructuredLogger.logError(error as Error, {
        txHash,
        operation: 'verify_payment'
      });
      return false;
    }
  }

  /**
   * Gets the configured payment address for the bot treasury.
   *
   * @returns Treasury address or 'not_configured'
   */
  static getPaymentAddress(): string {
    return config.botTreasuryAddress || 'not_configured';
  }

  /**
   * Queries the current balance of the bot treasury address.
   *
   * @returns Balance in JUNO tokens
   *
   * @example
   * ```typescript
   * const balance = await JunoService.getBalance();
   * console.log(`Treasury has ${balance} JUNO`);
   * ```
   */
  static async getBalance(): Promise<number> {
    if (!config.botTreasuryAddress) {
      return 0;
    }

    try {
      const response = await fetch(
        `${this.rpcEndpoint}/cosmos/bank/v1beta1/balances/${config.botTreasuryAddress}`
      );

      if (!response.ok) {
        StructuredLogger.logError('Failed to query balance', {
          operation: 'get_balance'
        });
        return 0;
      }

      const data = await response.json() as any;
      const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');

      return junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
    } catch (error) {
      StructuredLogger.logError(error as Error, {
        operation: 'get_balance'
      });
      return 0;
    }
  }
}
