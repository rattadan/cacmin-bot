import { config } from '../config';
import { logger } from '../utils/logger';

export class JunoService {
  private static client: any = null;
  private static rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';

  static async initialize(): Promise<void> {
    if (!config.botTreasuryAddress) {
      logger.warn('Bot treasury address not configured, some payment features disabled');
      return;
    }

    try {
      // Initialize Cosmos client for JUNO
      // Note: Actual implementation would require proper cosmos-client setup
      // Example: this.client = await CosmWasmClient.connect(this.rpcEndpoint);
      logger.info('JUNO service initialized');
    } catch (error) {
      logger.error('Failed to initialize JUNO service', error);
    }
  }

  static async verifyPayment(txHash: string, expectedAmount: number): Promise<boolean> {
    try {
      logger.info('Verifying JUNO payment', { txHash, expectedAmount });

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
        logger.warn('Transaction failed on chain', { txHash, code: tx.code });
        return false;
      }

      // Parse messages to find transfer to our treasury
      const messages = tx.tx.body.messages;
      const treasuryAddress = config.botTreasuryAddress;

      if (!treasuryAddress) {
        logger.error('Treasury address not configured');
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
                logger.info('Payment verified successfully', {
                  txHash,
                  expectedAmount,
                  actualAmount: amount,
                  difference
                });
                return true;
              } else {
                logger.warn('Payment amount mismatch', {
                  txHash,
                  expectedAmount,
                  actualAmount: amount,
                  difference
                });
              }
            }
          }
        }
      }

      logger.warn('No valid payment found to treasury in transaction', { txHash });
      return false;
    } catch (error) {
      logger.error('Payment verification failed', { txHash, error });
      return false;
    }
  }

  static getPaymentAddress(): string {
    return config.botTreasuryAddress || 'not_configured';
  }

  /**
   * Query account balance
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
        logger.error('Failed to query balance');
        return 0;
      }

      const data = await response.json() as any;
      const junoBalance = data.balances?.find((b: any) => b.denom === 'ujuno');

      return junoBalance ? parseFloat(junoBalance.amount) / 1_000_000 : 0;
    } catch (error) {
      logger.error('Error querying balance', error);
      return 0;
    }
  }
}
