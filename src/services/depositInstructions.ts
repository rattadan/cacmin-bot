import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Service for generating clear deposit instructions with prominent memo warnings
 */
export class DepositInstructionService {
  /**
   * Generate deposit instructions with clear memo warning
   */
  static generateInstructions(userId: number): {
    text: string;
    markdown: string;
    walletAddress: string;
    memo: string;
  } {
    const walletAddress = config.userFundsAddress || 'NOT_CONFIGURED';
    const memo = userId.toString();

    // Plain text version
    const text = `
DEPOSIT INSTRUCTIONS
====================

Send JUNO to this address:
${walletAddress}

⚠️ CRITICAL - MEMO REQUIRED ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
➤ MEMO: ${memo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ WARNING: Deposits WITHOUT the correct memo CANNOT be credited to your account!
⚠️ The memo MUST be EXACTLY: ${memo}
⚠️ This is YOUR user ID - do not use any other number!

DOUBLE CHECK:
✓ Address: ${walletAddress}
✓ Memo: ${memo}
✓ Do NOT include any extra text in the memo

Deposits without the correct memo will go to an unclaimed pool and require manual processing.
`;

    // Markdown formatted version for Telegram
    const markdown = `
💰 **DEPOSIT INSTRUCTIONS**
═══════════════════════════

📍 **Send JUNO to:**
\`${walletAddress}\`

⚠️ **CRITICAL - MEMO REQUIRED** ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**➤➤➤ MEMO: \`${memo}\` ⬅️⬅️⬅️**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 **WARNING** 🚨
• Deposits **WITHOUT** the memo **CANNOT** be credited!
• The memo **MUST** be **EXACTLY**: \`${memo}\`
• This is **YOUR** user ID - do not change it!

📋 **Before sending, verify:**
✅ Address: \`${walletAddress}\`
✅ Memo: \`${memo}\`
✅ NO extra text in memo field

⚠️ _Deposits without correct memo go to unclaimed pool_
⚠️ _Manual processing may take days_
`;

    return {
      text,
      markdown,
      walletAddress,
      memo
    };
  }

  /**
   * Generate a short reminder about memo requirement
   */
  static getMemoReminder(userId: number): string {
    return `⚠️ **REMEMBER**: Your memo MUST be \`${userId}\` or funds won't be credited!`;
  }

  /**
   * Generate instructions for claiming unclaimed deposits
   */
  static getUnclaimedInstructions(): string {
    return `
📌 **Unclaimed Deposit?**

If you sent JUNO without a memo or with the wrong memo:

1. Find your transaction hash
2. Contact an admin with:
   • Transaction hash
   • Your user ID
   • Amount sent

Unclaimed deposits are processed manually and may take time.
Always use your user ID as memo to avoid this!
`;
  }

  /**
   * Validate if a memo matches expected format
   */
  static validateMemo(memo: string, expectedUserId: number): {
    valid: boolean;
    error?: string;
  } {
    if (!memo || memo.trim() === '') {
      return {
        valid: false,
        error: 'No memo provided'
      };
    }

    const trimmedMemo = memo.trim();

    // Check if memo is exactly the user ID
    if (trimmedMemo === expectedUserId.toString()) {
      return { valid: true };
    }

    // Check if memo contains the user ID with extra text (warn but accept)
    if (trimmedMemo.includes(expectedUserId.toString())) {
      logger.warn('Memo contains user ID but has extra text', {
        memo: trimmedMemo,
        expectedUserId
      });

      return {
        valid: true,
        error: 'Memo contains extra text - please use only your user ID next time'
      };
    }

    // Check if it's a number but wrong user ID
    const memoAsNumber = parseInt(trimmedMemo);
    if (!isNaN(memoAsNumber)) {
      return {
        valid: false,
        error: `Wrong user ID in memo. Expected ${expectedUserId}, got ${memoAsNumber}`
      };
    }

    return {
      valid: false,
      error: 'Invalid memo format - must be your user ID'
    };
  }

  /**
   * Format a deposit confirmation message
   */
  static formatDepositConfirmation(
    userId: number,
    amount: number,
    txHash: string,
    newBalance: number
  ): string {
    return `
✅ **Deposit Confirmed!**

• Amount: \`${amount.toFixed(6)} JUNO\`
• From User: \`${userId}\`
• New Balance: \`${newBalance.toFixed(6)} JUNO\`
• Transaction: \`${txHash.substring(0, 10)}...\`

Your funds are now available for use!
`;
  }

  /**
   * Format a deposit error message
   */
  static formatDepositError(
    issue: 'no_memo' | 'wrong_memo' | 'wrong_user' | 'not_found',
    details?: any
  ): string {
    switch (issue) {
      case 'no_memo':
        return `
❌ **Deposit Failed - No Memo**

Your deposit was received but **cannot be credited** because no memo was provided.

Your funds are in the unclaimed pool. Contact an admin with your transaction hash to claim them.

**Always include your user ID as memo!**
`;

      case 'wrong_memo':
        return `
❌ **Deposit Failed - Wrong Memo**

Your deposit was received but the memo \`${details?.memo}\` doesn't match your user ID \`${details?.userId}\`.

Your funds are in the unclaimed pool. Contact an admin to claim them.
`;

      case 'wrong_user':
        return `
❌ **Deposit Failed - User Not Found**

A deposit was received with memo \`${details?.memo}\` but this user ID doesn't exist.

The funds are in the unclaimed pool.
`;

      case 'not_found':
        return `
❌ **Transaction Not Found**

The transaction hash \`${details?.txHash}\` was not found on the blockchain.

Please verify the transaction hash and try again.
`;

      default:
        return '❌ **Deposit Error** - Please contact an admin for assistance.';
    }
  }
}