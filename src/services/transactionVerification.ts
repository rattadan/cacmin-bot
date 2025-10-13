import { config } from '../config';
import { logger } from '../utils/logger';
import { AmountPrecision } from '../utils/precision';

interface TransactionDetails {
  txHash: string;
  status: number;  // 0 = success, non-zero = failed
  height: number;
  timestamp: string;
  memo?: string;
  messages: TransactionMessage[];
  gasUsed?: string;
  gasWanted?: string;
  fee?: {
    amount: string;
    denom: string;
  };
  rawLog?: string;
}

interface TransactionMessage {
  type: string;
  fromAddress: string;
  toAddress: string;
  amount: number;  // In JUNO (not micro)
  denom: string;
}

/**
 * Service for verifying transactions on the Juno blockchain
 * Handles both deposit and withdrawal verification
 */
export class TransactionVerificationService {
  private static readonly API_ENDPOINT = config.junoApiUrl || 'https://api.juno.basementnodes.ca';

  /**
   * Verify a transaction by hash and extract all details
   */
  static async verifyTransaction(txHash: string): Promise<{
    success: boolean;
    details?: TransactionDetails;
    error?: string;
  }> {
    try {
      // Fetch transaction from blockchain
      const response = await fetch(
        `${this.API_ENDPOINT}/cosmos/tx/v1beta1/txs/${txHash}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'Transaction not found'
          };
        }
        return {
          success: false,
          error: `Failed to fetch transaction: ${response.status}`
        };
      }

      const data = await response.json() as any;

      // The transaction response is wrapped in tx_response
      const txResponse = data.tx_response || data;

      // Parse the transaction
      const details = this.parseTransactionResponse(txResponse);

      logger.info('Transaction verified', {
        txHash,
        status: details.status,
        height: details.height,
        messageCount: details.messages.length
      });

      return {
        success: true,
        details
      };
    } catch (error) {
      logger.error('Transaction verification failed', {
        txHash,
        error
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Parse the transaction response from the API
   */
  private static parseTransactionResponse(txResponse: any): TransactionDetails {
    const details: TransactionDetails = {
      txHash: txResponse.txhash,
      status: parseInt(txResponse.code || '0'),
      height: parseInt(txResponse.height),
      timestamp: txResponse.timestamp,
      messages: [],
      gasUsed: txResponse.gas_used,
      gasWanted: txResponse.gas_wanted,
      rawLog: txResponse.raw_log
    };

    // Extract memo if present
    if (txResponse.tx?.body?.memo) {
      details.memo = txResponse.tx.body.memo;
    }

    // Extract fee if present
    if (txResponse.tx?.auth_info?.fee?.amount?.[0]) {
      const feeAmount = txResponse.tx.auth_info.fee.amount[0];
      details.fee = {
        amount: feeAmount.amount,
        denom: feeAmount.denom
      };
    }

    // Parse messages
    const messages = txResponse.tx?.body?.messages || [];
    for (const msg of messages) {
      const parsedMsg = this.parseMessage(msg);
      if (parsedMsg) {
        details.messages.push(parsedMsg);
      }
    }

    return details;
  }

  /**
   * Parse a single message from the transaction
   */
  private static parseMessage(msg: any): TransactionMessage | null {
    // Handle bank send messages (most common for transfers)
    if (msg['@type'] === '/cosmos.bank.v1beta1.MsgSend') {
      const junoAmounts = msg.amount?.filter((a: any) => a.denom === 'ujuno') || [];

      let totalJuno = 0;
      for (const amount of junoAmounts) {
        totalJuno += parseFloat(amount.amount) / 1_000_000;
      }

      return {
        type: 'bank_send',
        fromAddress: msg.from_address,
        toAddress: msg.to_address,
        amount: AmountPrecision.toExact6Decimals(totalJuno),
        denom: 'ujuno'
      };
    }

    // Handle IBC transfers
    if (msg['@type'] === '/ibc.applications.transfer.v1.MsgTransfer') {
      const token = msg.token;
      if (token && token.denom === 'ujuno') {
        return {
          type: 'ibc_transfer',
          fromAddress: msg.sender,
          toAddress: msg.receiver,
          amount: AmountPrecision.toExact6Decimals(parseFloat(token.amount) / 1_000_000),
          denom: 'ujuno'
        };
      }
    }

    // Add more message types as needed
    return null;
  }

  /**
   * Verify a deposit transaction
   * Checks: status = 0, correct recipient, memo matches userId, amount
   */
  static async verifyDeposit(
    txHash: string,
    expectedUserId: number,
    expectedAddress: string
  ): Promise<{
    valid: boolean;
    amount?: number;
    memo?: string;
    fromAddress?: string;
    error?: string;
  }> {
    // Verify the transaction
    const verification = await this.verifyTransaction(txHash);

    if (!verification.success || !verification.details) {
      return {
        valid: false,
        error: verification.error || 'Transaction verification failed'
      };
    }

    const details = verification.details;

    // Check status (must be 0 for success)
    if (details.status !== 0) {
      return {
        valid: false,
        error: `Transaction failed with code ${details.status}: ${details.rawLog}`
      };
    }

    // Check memo matches expected userId
    const expectedMemo = expectedUserId.toString();
    if (details.memo !== expectedMemo) {
      logger.warn('Deposit memo mismatch', {
        expected: expectedMemo,
        actual: details.memo,
        txHash
      });

      // Check if memo at least contains the userId
      if (!details.memo || !details.memo.includes(expectedMemo)) {
        return {
          valid: false,
          memo: details.memo,
          error: `Memo mismatch. Expected: ${expectedMemo}, Got: ${details.memo || 'none'}`
        };
      }
    }

    // Find transfers to our address
    let totalDeposit = 0;
    let fromAddress = '';

    for (const msg of details.messages) {
      if (msg.toAddress === expectedAddress) {
        totalDeposit = AmountPrecision.add(totalDeposit, msg.amount);
        fromAddress = msg.fromAddress;
      }
    }

    if (totalDeposit === 0) {
      return {
        valid: false,
        error: `No transfer found to address ${expectedAddress}`
      };
    }

    return {
      valid: true,
      amount: totalDeposit,
      memo: details.memo,
      fromAddress
    };
  }

  /**
   * Verify a withdrawal transaction
   * Checks: status = 0, correct sender and recipient, amount
   */
  static async verifyWithdrawal(
    txHash: string,
    fromAddress: string,
    toAddress: string,
    expectedAmount: number
  ): Promise<{
    valid: boolean;
    actualAmount?: number;
    error?: string;
  }> {
    // Verify the transaction
    const verification = await this.verifyTransaction(txHash);

    if (!verification.success || !verification.details) {
      return {
        valid: false,
        error: verification.error || 'Transaction verification failed'
      };
    }

    const details = verification.details;

    // Check status (must be 0 for success)
    if (details.status !== 0) {
      return {
        valid: false,
        error: `Transaction failed with code ${details.status}`
      };
    }

    // Find the withdrawal message
    let withdrawalAmount = 0;
    let found = false;

    for (const msg of details.messages) {
      if (msg.fromAddress === fromAddress && msg.toAddress === toAddress) {
        withdrawalAmount = msg.amount;
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        valid: false,
        error: `No transfer found from ${fromAddress} to ${toAddress}`
      };
    }

    // Verify amount matches (within precision tolerance)
    if (!AmountPrecision.equals(withdrawalAmount, expectedAmount)) {
      logger.warn('Withdrawal amount mismatch', {
        expected: expectedAmount,
        actual: withdrawalAmount,
        txHash
      });

      return {
        valid: false,
        actualAmount: withdrawalAmount,
        error: `Amount mismatch. Expected: ${AmountPrecision.format(expectedAmount)}, Got: ${AmountPrecision.format(withdrawalAmount)}`
      };
    }

    return {
      valid: true,
      actualAmount: withdrawalAmount
    };
  }

  /**
   * Get transaction status only (lightweight check)
   */
  static async getTransactionStatus(txHash: string): Promise<{
    found: boolean;
    status?: number;
    height?: number;
  }> {
    try {
      const response = await fetch(
        `${this.API_ENDPOINT}/cosmos/tx/v1beta1/txs/${txHash}`
      );

      if (!response.ok) {
        return { found: false };
      }

      const data = await response.json() as any;
      const txResponse = data.tx_response || data;

      return {
        found: true,
        status: parseInt(txResponse.code || '0'),
        height: parseInt(txResponse.height)
      };
    } catch (error) {
      logger.error('Failed to get transaction status', { txHash, error });
      return { found: false };
    }
  }
}