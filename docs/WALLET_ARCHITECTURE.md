# Wallet Architecture - Internal Ledger System

## Overview

The CAC Admin Bot uses a **two-wallet internal ledger system** to minimize on-chain transaction costs while maintaining accurate user balances. This architecture separates treasury operations (fines/bail) from user deposits, providing clear accounting and efficient fund management.

## Architecture Components

### 1. Bot Treasury Wallet (On-Chain)
**Address**: Configured via `BOT_TREASURY_ADDRESS` environment variable

**Purpose**:
- Receives direct on-chain payments for bail and fines
- Holds funds collected from users who pay via blockchain transactions
- Separate from user deposits for clear accounting
- Used for operational purposes and enforcement

**Transactions**:
- Users send JUNO directly to this address when paying bail (`/verifybail`)
- Users send JUNO directly to this address when paying specific fines (`/verifypayment`)
- Funds remain in this wallet and are not tracked in the internal ledger

**Balance Checking**: `/treasury` command shows this wallet's on-chain balance

---

### 2. User Funds Wallet (On-Chain)
**Address**: Configured via `USER_FUNDS_ADDRESS` environment variable
**Mnemonic**: Configured via `USER_FUNDS_MNEMONIC` (for signing withdrawals)

**Purpose**:
- Collective deposit address for all users
- Backs all internal user balances 1:1
- Single source of funds for processing withdrawals
- Enables pooled liquidity without per-user wallets

**Deposit Flow**:
1. User runs `/deposit` to get deposit instructions
2. Bot provides `USER_FUNDS_ADDRESS` and user's `userId` as memo
3. User sends JUNO to `USER_FUNDS_ADDRESS` with their `userId` as memo
4. DepositMonitor detects transaction and credits internal balance
5. No per-user on-chain wallet needed

**Withdrawal Flow**:
1. User runs `/withdraw <amount> <address>`
2. Internal balance is debited immediately (with transaction lock)
3. On-chain transaction sent from `USER_FUNDS_ADDRESS` to recipient
4. If transaction fails, balance is automatically refunded
5. Transaction lock released upon completion

**Balance Checking**: `/walletstats` command shows reconciliation between internal ledger and on-chain balance

---

### 3. Internal Ledger (Database)

**Tables**:
- `user_balances`: Each user's current balance (REAL field)
- `transactions`: Complete audit trail of all operations
- `processed_deposits`: Prevents double-processing deposits
- `user_locks`: Transaction locking for concurrent operation safety
- `system_wallets`: Wallet configuration storage

**Transaction Types**:
- `deposit`: User deposit from on-chain to internal balance
- `withdrawal`: User withdrawal from internal balance to on-chain
- `transfer`: Internal transfer between users (instant, no fees)
- `fine`: Fine payment deducted from user balance
- `bail`: Bail payment deducted from user balance
- `giveaway`: Admin credits to user balance
- `refund`: Automatic refund when operations fail

**Benefits**:
- **Instant transfers**: User-to-user transfers happen instantly in database
- **No gas fees**: Internal operations don't require blockchain transactions
- **Batch operations**: Can process multiple operations then settle on-chain
- **Atomic operations**: Database transactions ensure consistency
- **Complete audit trail**: Every operation is logged with full context
- **Transaction safety**: Locking prevents double-spending and race conditions

---

## User Commands

### Balance & Deposits
- `/balance` or `/bal` - Check internal ledger balance
- `/deposit` - Get deposit address and memo instructions
- `/checkdeposit <txhash>` - Manually verify a deposit if not auto-detected

### Transfers & Withdrawals
- `/send <amount> <recipient>` - Send to user (internal) or wallet (on-chain)
  - If recipient is `@username`, performs instant internal transfer
  - If recipient is `juno1...` address, performs on-chain withdrawal
- `/withdraw <amount> <address>` - Withdraw to external Juno address
- `/transactions` or `/history` - View transaction history

### Payments (Using Internal Balance)
- `/payfines` - View unpaid fines (checks internal balance)
- `/payallfines` - Pay all fines from internal balance (instant)

### Payments (Direct On-Chain to Treasury)
- `/payfine <id>` - Get instructions for on-chain fine payment to treasury
- `/verifypayment <id> <txhash>` - Verify on-chain fine payment

### Bail (Direct On-Chain to Treasury)
- `/paybail` - Get instructions to pay your own bail (on-chain to treasury)
- `/verifybail <txhash>` - Verify your bail payment
- `/paybailfor <user>` - Get instructions to pay someone's bail
- `/verifybailfor <user> <txhash>` - Verify bail payment for someone

---

## Admin Commands

### Balance & Reconciliation
- `/treasury` - View both treasury wallet and internal ledger stats
- `/walletstats` - Detailed system statistics and reconciliation
- `/reconcile` - Manually trigger reconciliation check

### Distribution
- `/giveaway <amount> <@user1> <@user2>` - Credit users' internal balances
- Supports multiple recipients in a single command

---

## Security Features

### Transaction Locking
**Purpose**: Prevent double-spending during concurrent withdrawal attempts

**Implementation**:
- 120-second lock timeout per user
- Automatic cleanup of stale locks
- Users notified if transaction already in progress
- Locks acquired before balance deduction
- Locks released even on unexpected errors

**Flow**:
1. Check if user already has active lock
2. Acquire lock or return error
3. Verify balance after lock acquired
4. Perform operation
5. Release lock regardless of outcome

### Deposit Monitoring
**Purpose**: Automatically detect and credit deposits to user balances

**Implementation**:
- Polls blockchain every 60 seconds for new transactions
- Queries transactions where `USER_FUNDS_ADDRESS` is recipient
- Validates memo matches userId format (numeric)
- Prevents double-processing with `processed_deposits` table
- Manual verification available via `/checkdeposit`

**Process**:
1. Query recent transactions to user funds wallet
2. Extract memo from each transaction
3. Validate memo is numeric userId
4. Check if already processed
5. Credit internal balance if valid
6. Mark transaction as processed

### Reconciliation
**Purpose**: Ensure internal ledger matches on-chain reality

**Implementation**:
- Hourly automatic balance checks (via cron/interval)
- Compares sum of all internal balances vs on-chain balance
- Admin alerts when mismatch detected (>0.01 JUNO difference)
- Manual reconciliation via `/reconcile` command

**Checks**:
- Sum of `user_balances.balance` = Internal total
- Query on-chain balance of `USER_FUNDS_ADDRESS` = On-chain total
- Calculate difference and alert if significant
- Provides detailed breakdown for debugging

### Error Handling
**Purpose**: Ensure user funds are never lost due to failures

**Implementation**:
- Failed withdrawals automatically refunded to user
- Transaction failures logged with full details
- Balance restored if blockchain transaction fails
- Locks released even on unexpected errors
- All operations wrapped in try-catch with fallback refunds

**Failure Scenarios**:
1. **Insufficient balance**: Check before lock, return error
2. **Lock acquisition failure**: Return error, no balance change
3. **On-chain transaction failure**: Refund balance, release lock
4. **Non-zero transaction code**: Refund balance, release lock
5. **Unexpected error**: Attempt refund, force release lock, log details

---

## Migration from V1 (HD Wallet System)

### What Changed
**Old System (V1)**:
- Each user had individual HD wallet derived from master mnemonic
- Derivation path: `m/44'/118'/0'/0/{userId}`
- Every operation required on-chain transaction
- High gas costs for transfers between users
- Complex wallet management per user

**New System (V2)**:
- Single user funds wallet for all deposits
- Internal database tracking for balances
- Only deposits and withdrawals touch blockchain
- Internal transfers are instant and free
- Simplified wallet management

### Breaking Changes
**Environment Variables**:
- `JUNO_WALLET_ADDRESS` → `BOT_TREASURY_ADDRESS` (renamed for clarity)
- `JUNO_WALLET_MNEMONIC` → Removed (not needed for treasury)
- Added: `USER_FUNDS_ADDRESS` (collective deposit wallet)
- Added: `USER_FUNDS_MNEMONIC` (for signing withdrawals)

**Database Changes**:
- Old `user_wallets` table no longer created
- New tables: `user_balances`, `transactions`, `processed_deposits`, `user_locks`
- Users must use new deposit flow with memo

### Migration Steps
If you're upgrading from V1:

1. **Export Old Balances**
   ```sql
   SELECT user_id, balance FROM user_wallets;
   ```

2. **Update Environment Variables**
   ```bash
   # Old .env
   JUNO_WALLET_ADDRESS=juno1xxx...
   JUNO_WALLET_MNEMONIC="24 words..."

   # New .env
   BOT_TREASURY_ADDRESS=juno1xxx...  # Same as old JUNO_WALLET_ADDRESS
   USER_FUNDS_ADDRESS=juno1yyy...     # New collective wallet
   USER_FUNDS_MNEMONIC="24 words..."  # For USER_FUNDS_ADDRESS
   ```

3. **Initialize New Database Tables**
   ```bash
   yarn run setup-db
   ```

4. **Credit Existing Balances**
   - Use `/giveaway` command for each user with their old balance
   - Or insert directly into `user_balances` table

5. **Notify Users**
   - Inform users of new deposit process
   - Provide new deposit address and memo instructions
   - Old HD wallets can be gradually emptied

6. **Cleanup Old Wallets**
   - Withdraw funds from old HD wallets
   - Consolidate into new system
   - Archive old wallet data

---

## Troubleshooting

### Balance Mismatch
**Symptoms**: Reconciliation shows difference between internal and on-chain totals

**Diagnosis Steps**:
1. Check `/walletstats` for detailed breakdown
2. Verify no pending withdrawals:
   ```sql
   SELECT * FROM transactions WHERE status = 'pending';
   ```
3. Check deposit monitor is running:
   ```javascript
   DepositMonitor.getStatus()
   ```
4. Review transaction logs for failed operations
5. Sum user balances manually:
   ```sql
   SELECT SUM(balance) FROM user_balances;
   ```

**Common Causes**:
- Pending transactions not completed
- Deposits not yet detected by monitor
- Manual database edits bypassing ledger service
- Failed transactions not refunded

### Deposit Not Credited
**Symptoms**: User sent funds but balance not updated

**Diagnosis Steps**:
1. Verify transaction exists on-chain (use block explorer)
2. Check memo format (must be numeric userId)
3. Run `/checkdeposit <txhash>` to manually process
4. Check `processed_deposits` table:
   ```sql
   SELECT * FROM processed_deposits WHERE tx_hash = ?;
   ```
5. Verify `USER_FUNDS_ADDRESS` matches destination in transaction

**Common Causes**:
- Incorrect or missing memo
- Transaction sent to wrong address
- Deposit monitor not running
- Transaction already processed but balance not visible

### Withdrawal Failed
**Symptoms**: User initiated withdrawal but received error or funds not sent

**Diagnosis Steps**:
1. Check transaction logs for error details:
   ```sql
   SELECT * FROM transactions WHERE from_user_id = ? ORDER BY created_at DESC LIMIT 5;
   ```
2. Verify user balance was refunded (should happen automatically)
3. Check if transaction lock exists and is stuck:
   ```sql
   SELECT * FROM user_locks WHERE user_id = ?;
   ```
4. Verify `USER_FUNDS_MNEMONIC` is correctly configured
5. Check on-chain balance of user funds wallet

**Common Causes**:
- Insufficient gas in user funds wallet
- Invalid recipient address format
- Network issues during transaction broadcast
- User funds wallet configuration mismatch

### Transaction Lock Stuck
**Symptoms**: User unable to perform operations, receives "transaction in progress" error

**Diagnosis Steps**:
1. Check active locks:
   ```sql
   SELECT * FROM user_locks WHERE user_id = ?;
   ```
2. Check lock expiration time (should be 120 seconds)
3. Manually release lock:
   ```javascript
   TransactionLockService.releaseLock(userId)
   ```
4. Clean all expired locks:
   ```javascript
   TransactionLockService.cleanExpiredLocks()
   ```

**Prevention**:
- Locks auto-expire after 120 seconds
- Locks released even on errors
- Periodic cleanup of stale locks

---

## Configuration Reference

### Required Environment Variables
```bash
# Bot Settings
BOT_TOKEN=your_telegram_bot_token
OWNER_ID=your_telegram_user_id

# Wallet Configuration
BOT_TREASURY_ADDRESS=juno1xxx...        # Treasury for bail/fines (on-chain only)
USER_FUNDS_ADDRESS=juno1yyy...          # Collective user deposits (backs ledger)
USER_FUNDS_MNEMONIC="24 word phrase"    # For signing withdrawals

# Blockchain Endpoints
JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
JUNO_API_URL=https://api.juno.basementnodes.ca

# Optional
ADMIN_CHAT_ID=chat_id_for_alerts        # Receives reconciliation alerts
GROUP_CHAT_ID=main_group_id             # For auto-unjailing
DATABASE_PATH=./data/bot.db             # SQLite database location
```

### Database Tables

#### user_balances
Tracks current balance for each user.
```sql
CREATE TABLE user_balances (
  user_id INTEGER PRIMARY KEY,
  balance REAL DEFAULT 0,
  last_updated INTEGER,
  created_at INTEGER
);
```

#### transactions
Complete audit trail of all ledger operations.
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_type TEXT NOT NULL,
  from_user_id INTEGER,
  to_user_id INTEGER,
  amount REAL NOT NULL,
  balance_after REAL,
  description TEXT,
  tx_hash TEXT,
  external_address TEXT,
  status TEXT DEFAULT 'completed',
  created_at INTEGER,
  metadata TEXT
);
```

#### processed_deposits
Prevents double-processing of deposits.
```sql
CREATE TABLE processed_deposits (
  tx_hash TEXT PRIMARY KEY,
  processed_at INTEGER
);
```

#### user_locks
Prevents concurrent transaction conflicts.
```sql
CREATE TABLE user_locks (
  user_id INTEGER PRIMARY KEY,
  lock_type TEXT NOT NULL,
  locked_at INTEGER,
  expires_at INTEGER NOT NULL,
  metadata TEXT
);
```

#### system_wallets
Stores wallet configuration.
```sql
CREATE TABLE system_wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER
);
```

---

## Best Practices

### For Operators

1. **Backup Database Regularly**
   - Contains all user balances and transaction history
   - Loss of database = loss of user balance records
   - Recommended: Daily backups with retention

2. **Monitor Reconciliation**
   - Set up alerts for mismatches (>0.01 JUNO)
   - Investigate discrepancies immediately
   - Run manual `/reconcile` if alerts triggered

3. **Secure Mnemonics**
   - `USER_FUNDS_MNEMONIC` controls ALL user funds
   - Store in secure environment variable or secrets manager
   - Never commit to version control
   - Rotate periodically with proper migration

4. **Test Withdrawals Regularly**
   - Verify withdrawal flow works end-to-end
   - Test with small amounts
   - Ensure refunds work on failures

5. **Monitor On-Chain Balance**
   - Ensure sufficient funds in user funds wallet for withdrawals
   - Alert when balance approaches sum of internal balances
   - Maintain buffer for gas fees

6. **Review Transaction Logs**
   - Periodically audit `transactions` table
   - Look for failed transactions
   - Investigate unusual patterns

### For Users

1. **Always Include Memo**
   - Required for deposit to be credited automatically
   - Memo must be your numeric Telegram user ID
   - Get correct memo from `/deposit` command

2. **Use Internal Transfers When Possible**
   - Sending to other bot users is instant and free
   - Use `/send <amount> @username` for instant transfer
   - No gas fees for internal operations

3. **Check Balance Before Withdraw**
   - Ensure sufficient internal balance
   - Account for any pending fines or restrictions
   - Use `/balance` to check current balance

4. **Wait for Confirmations**
   - Withdrawals take 5-10 seconds for on-chain transaction
   - Deposit detection runs every 60 seconds
   - Don't spam commands if first attempt is processing

5. **Keep Transaction Hashes**
   - Save txhash for verification if issues occur
   - Use `/checkdeposit <txhash>` if deposit not auto-credited
   - Provides proof of payment for support

---

## FAQ

**Q: Why two wallets instead of one?**
A: Separating treasury (direct payments) from user funds (deposits) provides clear accounting and prevents mixing operational funds with user deposits. Treasury receives enforcement payments (bail/fines), while user funds wallet backs the internal ledger 1:1.

**Q: What happens if the bot crashes during a withdrawal?**
A: Transaction locks prevent double-processing. On restart, stale locks are automatically cleaned up (120-second expiry). Failed withdrawals are automatically refunded to the user's internal balance.

**Q: Can users lose funds?**
A: Very low risk. Internal balances are database-backed with complete transaction history. Withdrawal failures trigger automatic refunds. Deposits are verified on-chain before crediting. The main risks are database corruption (mitigated by backups) or mnemonic compromise (mitigated by secure storage).

**Q: How do I know the internal ledger matches reality?**
A: Reconciliation runs hourly and alerts on mismatch. Manual reconciliation via `/reconcile` provides detailed breakdown. The sum of all `user_balances` should match the on-chain balance of `USER_FUNDS_ADDRESS`. Any discrepancy is immediately logged and alerted.

**Q: What if someone sends funds without a memo?**
A: Transaction is detected but not automatically credited (deposit monitor requires valid userId memo). Admin can manually identify the sender and credit using `/giveaway` if user provides proof. Alternatively, funds can be returned to sender if address is identifiable.

**Q: How are gas fees handled?**
A: Internal operations (transfers, fine payments) have no gas fees. Withdrawals consume gas from the user funds wallet. Ensure `USER_FUNDS_ADDRESS` maintains sufficient balance to cover gas fees for user withdrawals. Operators should periodically fund this wallet.

**Q: What happens if user funds wallet runs out of gas?**
A: Withdrawal transactions will fail. Users receive error message and balance is automatically refunded. Operators are alerted to fund the wallet. No user funds are lost, but withdrawals cannot be processed until wallet is funded.

**Q: Can I reverse a transaction?**
A: Internal transactions (transfers, fines) are immediately final in the database. On-chain transactions (deposits, withdrawals) are final once confirmed on blockchain. Admins can issue refunds via `/giveaway` but cannot reverse completed transactions.

**Q: How long do deposits take to credit?**
A: Automatic detection occurs every 60 seconds. Once transaction is confirmed on-chain and detected by the monitor, balance is credited immediately. Manual verification via `/checkdeposit` provides instant crediting if monitor hasn't run yet.

**Q: What if internal balance exceeds on-chain balance?**
A: This indicates a critical error (potential database corruption or unauthorized balance edits). Reconciliation will alert immediately. Operators should investigate transaction history, freeze withdrawals, and resolve discrepancy before resuming operations.

---

## Technical Implementation Details

### Withdrawal Process (Detailed Flow)

```typescript
// 1. Acquire transaction lock
const lockAcquired = await TransactionLockService.acquireLock(userId, 'withdrawal', metadata);
if (!lockAcquired) {
  return { success: false, error: 'Transaction in progress' };
}

try {
  // 2. Verify balance (after lock to prevent race conditions)
  const balance = await LedgerService.getUserBalance(userId);
  if (balance < amount) {
    await TransactionLockService.releaseLock(userId);
    return { success: false, error: 'Insufficient balance' };
  }

  // 3. Record pending withdrawal (deduct from internal balance)
  const withdrawal = await LedgerService.processWithdrawal(userId, amount, address);

  // 4. Execute on-chain transaction
  const txResult = await client.sendTokens(userFundsAddress, recipientAddress, amount);

  // 5. Verify transaction success
  if (txResult.code !== 0) {
    // Refund on failure
    await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund');
    await TransactionLockService.releaseLock(userId);
    return { success: false, error: 'Transaction failed' };
  }

  // 6. Update transaction with txHash
  await LedgerService.updateTransactionStatus(withdrawal.transactionId, 'completed', txResult.transactionHash);

  // 7. Release lock
  await TransactionLockService.releaseLock(userId);

  return { success: true, txHash: txResult.transactionHash };
} catch (error) {
  // Emergency refund and cleanup
  await LedgerService.processGiveaway(userId, amount, 'Withdrawal refund (error)');
  await TransactionLockService.releaseLock(userId);
  return { success: false, error: 'System error' };
}
```

### Deposit Detection Process (Detailed Flow)

```typescript
// 1. Query recent transactions (every 60 seconds)
const transactions = await fetchRecentTransactions(userFundsAddress);

for (const tx of transactions) {
  // 2. Check if already processed
  if (await isProcessed(tx.hash)) continue;

  // 3. Extract and validate memo
  const memo = tx.body.memo;
  if (!memo.match(/^\d+$/)) {
    await markProcessed(tx.hash); // Skip invalid memo
    continue;
  }

  const userId = parseInt(memo);

  // 4. Find transfers to our wallet
  for (const msg of tx.body.messages) {
    if (msg.type === 'MsgSend' && msg.to_address === userFundsAddress) {
      const junoAmount = msg.amount.find(a => a.denom === 'ujuno');
      if (junoAmount) {
        const amount = parseFloat(junoAmount.amount) / 1_000_000;

        // 5. Credit internal balance
        await LedgerService.processDeposit(userId, amount, tx.hash, msg.from_address);

        // 6. Mark as processed
        await markProcessed(tx.hash);
      }
    }
  }
}
```

### Reconciliation Process (Detailed Flow)

```typescript
// 1. Sum all internal balances
const internalTotal = await db.get('SELECT SUM(balance) FROM user_balances');

// 2. Query on-chain balance
const onChainResponse = await fetch(`${apiUrl}/cosmos/bank/v1beta1/balances/${userFundsAddress}`);
const onChainData = await onChainResponse.json();
const onChainTotal = parseFloat(onChainData.balances.find(b => b.denom === 'ujuno').amount) / 1_000_000;

// 3. Calculate difference
const difference = Math.abs(internalTotal - onChainTotal);
const matched = difference < 0.01; // Allow for rounding

// 4. Alert if mismatch
if (!matched) {
  logger.error('Balance mismatch detected', {
    internalTotal,
    onChainTotal,
    difference
  });

  // Send alert to admin
  await bot.telegram.sendMessage(adminChatId,
    `ALERT: Balance mismatch detected!\n` +
    `Internal: ${internalTotal} JUNO\n` +
    `On-chain: ${onChainTotal} JUNO\n` +
    `Difference: ${difference} JUNO`
  );
}

return { matched, internalTotal, onChainTotal, difference };
```

---

## Related Documentation

- [Database Schema](/src/database.ts) - Complete database structure
- [Wallet Service V2](/src/services/walletServiceV2.ts) - Main wallet operations
- [Ledger Service](/src/services/ledgerService.ts) - Internal ledger management
- [Deposit Monitor](/src/services/depositMonitor.ts) - Automatic deposit detection
- [Transaction Lock](/src/services/transactionLock.ts) - Concurrency control

## Support

For issues or questions:
1. Check this documentation first
2. Review troubleshooting section
3. Check transaction logs in database
4. Contact bot operator/admin
5. Open issue on GitHub (if open source)

---

**Last Updated**: 2025-10-12
**Version**: 2.0 (Internal Ledger System)
