# Audit Trail & Transaction Logging Documentation

## Overview

The CAC Admin Bot maintains a **complete, immutable audit trail** of all financial operations in the `transactions` table. This documentation explains what is logged, how to access audit data, and how to use it for troubleshooting and accountability.

---

## What is Logged

### Every Transaction Records:

1. **Transaction Type** - deposit, withdrawal, transfer, fine, bail, giveaway, refund
2. **Participants** - from_user_id and/or to_user_id
3. **Amount** - Precise to 6 decimal places (micro-JUNO)
4. **Balance After** - User's balance after the transaction
5. **Description** - Human-readable description of the transaction
6. **Transaction Hash** - For on-chain operations (deposits/withdrawals)
7. **External Address** - For deposits/withdrawals (juno1... addresses)
8. **Status** - pending, completed, or failed
9. **Metadata** - JSON field for additional context
10. **Timestamp** - Automatic creation timestamp

---

## Transaction Types

### 1. DEPOSIT (External → Internal)

**What it logs:**
```sql
transaction_type: 'deposit'
from_user_id: NULL
to_user_id: <recipient_user_id>
amount: <deposited_amount>
balance_after: <new_balance>
description: "Deposit from <external_address>"
tx_hash: <blockchain_transaction_hash>
external_address: <sender_juno_address>
status: 'completed'
```

**Example:**
```
User 123456 deposits 100 JUNO from juno1abc...
→ Creates transaction record linking blockchain tx to internal credit
```

**Logged Details:**
- Who deposited (to_user_id)
- How much (amount)
- From where (external_address)
- Blockchain proof (tx_hash)
- When (created_at timestamp)

---

### 2. WITHDRAWAL (Internal → External)

**What it logs:**
```sql
transaction_type: 'withdrawal'
from_user_id: <sender_user_id>
to_user_id: NULL
amount: <withdrawn_amount>
balance_after: <new_balance>
description: "Withdrawal to <destination_address>"
tx_hash: <blockchain_transaction_hash>
external_address: <destination_juno_address>
status: 'completed' | 'pending' | 'failed'
```

**Example:**
```
User 123456 withdraws 50 JUNO to juno1xyz...
→ Records debit from internal balance + on-chain transaction
```

**Status Flow:**
1. `pending` - Withdrawal initiated, balance deducted, blockchain tx in progress
2. `completed` - Blockchain tx confirmed
3. `failed` - Blockchain tx failed, balance refunded (separate refund transaction created)

---

### 3. TRANSFER (Internal → Internal)

**What it logs:**
```sql
transaction_type: 'transfer'
from_user_id: <sender_user_id>
to_user_id: <recipient_user_id>
amount: <transferred_amount>
balance_after: <sender_new_balance>
description: "Transfer to @<recipient_username>"
tx_hash: NULL
external_address: NULL
status: 'completed'
```

**Example:**
```
User 123456 sends 10 JUNO to User 789012 (@alice)
→ One transaction record showing the transfer
```

**Important:**
- Only sender's balance_after is recorded in this transaction
- Recipient balance change is deterministic (old_balance + amount)
- No blockchain transaction (internal ledger only)
- Instant and free

---

### 4. FINE (User → Treasury)

**What it logs:**
```sql
transaction_type: 'fine'
from_user_id: <violator_user_id>
to_user_id: -1  (BOT_TREASURY)
amount: <fine_amount>
balance_after: <violator_new_balance>
description: "Fine for <violation_reason>"
tx_hash: NULL
external_address: NULL
status: 'completed'
metadata: {"violationId": <id>}
```

**Example:**
```
User 123456 fined 5 JUNO for spam
→ Records fine payment and violation ID
```

**Links to Violations:**
- metadata.violationId references violations table
- violation row is updated with paid=1

---

### 5. BAIL (User → Treasury)

**What it logs:**
```sql
transaction_type: 'bail'
from_user_id: <jailed_user_id>
to_user_id: -1  (BOT_TREASURY)
amount: <bail_amount>
balance_after: <user_new_balance>
description: "Bail payment for <jail_reason>"
tx_hash: NULL
external_address: NULL
status: 'completed'
metadata: {"jailEventId": <id>}
```

**Example:**
```
User 123456 pays 20 JUNO bail to leave jail
→ Records bail payment and jail event ID
```

---

### 6. GIVEAWAY (Treasury → User)

**What it logs:**
```sql
transaction_type: 'giveaway'
from_user_id: -1  (BOT_TREASURY) OR admin_user_id
to_user_id: <recipient_user_id>
amount: <giveaway_amount>
balance_after: NULL  (recipient balance not stored here)
description: "Giveaway from @<admin_username>"
tx_hash: NULL
external_address: NULL
status: 'completed'
```

**Example:**
```
Admin gives 100 JUNO to 5 users
→ 5 transaction records, one per recipient
```

---

### 7. REFUND (System → User)

**What it logs:**
```sql
transaction_type: 'refund'
from_user_id: NULL
to_user_id: <recipient_user_id>
amount: <refund_amount>
balance_after: <new_balance>
description: "Refund: <reason>"
tx_hash: NULL
external_address: NULL
status: 'completed'
metadata: {"originalTransactionId": <id>}
```

**Example:**
```
Withdrawal failed, 50 JUNO refunded to user
→ Records refund linked to failed withdrawal
```

---

## Accessing Audit Trail

### Via User Commands

**View Personal History:**
```
/transactions
```

Shows last 10 transactions for the requesting user.

**Output:**
```
📜 Recent Transactions

2025-01-15 10:30:00
DEPOSIT: +100.000000 JUNO
From: juno1abc...

2025-01-15 11:45:00
TRANSFER: -5.000000 JUNO
To: @alice

Balance After: 95.000000 JUNO
```

---

### Via SQL Queries

**All transactions for a user:**
```sql
SELECT
  created_at,
  transaction_type,
  from_user_id,
  to_user_id,
  amount,
  balance_after,
  description,
  tx_hash,
  status
FROM transactions
WHERE from_user_id = <user_id> OR to_user_id = <user_id>
ORDER BY created_at DESC;
```

**Specific transaction type:**
```sql
SELECT * FROM transactions
WHERE transaction_type = 'withdrawal'
AND status = 'failed';
```

**Transactions within date range:**
```sql
SELECT * FROM transactions
WHERE created_at BETWEEN <start_timestamp> AND <end_timestamp>;
```

**Failed transactions:**
```sql
SELECT * FROM transactions
WHERE status = 'failed'
ORDER BY created_at DESC;
```

---

## Forensic Analysis

### Tracking a Specific Amount

**Question:** "Where did user 123456's 100 JUNO go?"

```sql
-- Find all outgoing transactions
SELECT
  created_at,
  transaction_type,
  to_user_id,
  amount,
  description,
  tx_hash
FROM transactions
WHERE from_user_id = 123456
AND amount >= 100
ORDER BY created_at;
```

### Verifying Deposits

**Question:** "Did blockchain tx ABC123 get credited?"

```sql
SELECT
  to_user_id,
  amount,
  created_at,
  status
FROM transactions
WHERE tx_hash = 'ABC123'
AND transaction_type = 'deposit';
```

### Finding Pre-Funded Accounts

**Question:** "Which users received funds before interacting with the bot?"

```sql
SELECT DISTINCT
  t.to_user_id,
  u.username,
  SUM(t.amount) as total_received,
  MIN(t.created_at) as first_transaction,
  u.created_at as account_created
FROM transactions t
JOIN users u ON t.to_user_id = u.id
WHERE t.transaction_type IN ('transfer', 'giveaway')
GROUP BY t.to_user_id
HAVING first_transaction <= account_created;
```

### Reconciliation Check

**Question:** "Do all balances match transaction history?"

```sql
-- Calculate balance from transactions
SELECT
  u.id,
  u.username,
  ub.balance as ledger_balance,
  (
    COALESCE((SELECT SUM(amount) FROM transactions WHERE to_user_id = u.id), 0) -
    COALESCE((SELECT SUM(amount) FROM transactions WHERE from_user_id = u.id), 0)
  ) as calculated_balance,
  (
    ub.balance - (
      COALESCE((SELECT SUM(amount) FROM transactions WHERE to_user_id = u.id), 0) -
      COALESCE((SELECT SUM(amount) FROM transactions WHERE from_user_id = u.id), 0)
    )
  ) as discrepancy
FROM users u
JOIN user_balances ub ON u.id = ub.user_id
HAVING discrepancy != 0;
```

---

## Common Audit Scenarios

### Scenario 1: User Claims Missing Deposit

**Steps:**
1. Get transaction hash from user
2. Verify on blockchain: https://www.mintscan.io/juno/txs/HASH
3. Check memo matches user ID
4. Query transaction log:
   ```sql
   SELECT * FROM transactions WHERE tx_hash = 'HASH';
   ```
5. If not found → run `/checkdeposit HASH`
6. If memo wrong → check unclaimed deposits:
   ```sql
   SELECT * FROM transactions WHERE to_user_id = -3;
   ```

**Resolution:**
- Correct memo → automatic credit
- Wrong memo → admin manually assigns with `/claimdeposit`

---

### Scenario 2: Balance Discrepancy

**Steps:**
1. Check current balance:
   ```sql
   SELECT balance FROM user_balances WHERE user_id = 123456;
   ```
2. Calculate from transactions:
   ```sql
   SELECT
     SUM(CASE WHEN to_user_id = 123456 THEN amount ELSE 0 END) as credits,
     SUM(CASE WHEN from_user_id = 123456 THEN amount ELSE 0 END) as debits,
     (
       SUM(CASE WHEN to_user_id = 123456 THEN amount ELSE 0 END) -
       SUM(CASE WHEN from_user_id = 123456 THEN amount ELSE 0 END)
     ) as calculated_balance
   FROM transactions;
   ```
3. Compare calculated vs ledger balance
4. If mismatch → review transaction log for missing/duplicate entries

**Prevention:**
- Automatic reconciliation runs hourly (bot.ts:90-99)
- Admin can trigger manually with `/reconcile`

---

### Scenario 3: Dispute Over Transfer

**Claim:** "I never sent 50 JUNO to user 789!"

**Verification:**
```sql
SELECT
  created_at,
  from_user_id,
  to_user_id,
  amount,
  description
FROM transactions
WHERE from_user_id = 123456
AND to_user_id = 789
AND amount = 50
ORDER BY created_at DESC;
```

**Evidence:**
- Transaction timestamp
- Description (may include username)
- Balance_after (confirms sender had sufficient funds)

---

## Audit Best Practices

### Daily Checks

```bash
# Check for failed transactions
sqlite3 bot.db "SELECT COUNT(*) FROM transactions WHERE status='failed';"

# Check for pending transactions older than 1 hour
sqlite3 bot.db "SELECT * FROM transactions WHERE status='pending' AND created_at < (strftime('%s','now') - 3600);"

# Check today's transaction volume
sqlite3 bot.db "SELECT transaction_type, COUNT(*), SUM(amount) FROM transactions WHERE created_at > (strftime('%s','now') - 86400) GROUP BY transaction_type;"
```

### Weekly Audit

```sql
-- 1. Verify no duplicate tx hashes
SELECT tx_hash, COUNT(*)
FROM transactions
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;

-- 2. Check for anomalous amounts
SELECT * FROM transactions
WHERE amount > 10000  -- Adjust threshold
OR amount < 0.000001;  -- Below minimum

-- 3. Verify all deposits have tx_hash
SELECT * FROM transactions
WHERE transaction_type = 'deposit'
AND tx_hash IS NULL;

-- 4. Check for orphaned transactions
SELECT t.* FROM transactions t
LEFT JOIN users u_from ON t.from_user_id = u_from.id
LEFT JOIN users u_to ON t.to_user_id = u_to.id
WHERE (t.from_user_id IS NOT NULL AND u_from.id IS NULL)
   OR (t.to_user_id IS NOT NULL AND u_to.id IS NULL);
```

### Monthly Reports

```sql
-- Transaction volume by type
SELECT
  transaction_type,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount
FROM transactions
WHERE created_at > (strftime('%s','now') - 2592000)  -- Last 30 days
GROUP BY transaction_type;

-- Most active users
SELECT
  u.id,
  u.username,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN t.from_user_id = u.id THEN t.amount ELSE 0 END) as total_sent,
  SUM(CASE WHEN t.to_user_id = u.id THEN t.amount ELSE 0 END) as total_received
FROM users u
LEFT JOIN transactions t ON u.id = t.from_user_id OR u.id = t.to_user_id
WHERE t.created_at > (strftime('%s','now') - 2592000)
GROUP BY u.id
ORDER BY transaction_count DESC
LIMIT 20;
```

---

## Backup & Retention

### Backup Strategy

**Daily:**
```bash
sqlite3 bot.db ".backup /backups/bot_$(date +%Y%m%d).db"
```

**Transaction Export:**
```bash
sqlite3 -header -csv bot.db "SELECT * FROM transactions;" > transactions_$(date +%Y%m%d).csv
```

### Retention Policy

**Recommended:**
- Keep transactions table indefinitely (it's the audit trail)
- Backup daily for 30 days
- Weekly backups for 1 year
- Monthly backups forever

**Storage:**
- Transactions table: ~100 bytes per row
- 10,000 transactions/month = ~1 MB
- Annual storage: ~12 MB (negligible)

---

## Legal & Compliance

### Data Retention

The transaction log provides:
- **Non-repudiation** - Cryptographic tx_hash for on-chain operations
- **Accountability** - Every action traceable to a user ID
- **Auditability** - Complete historical record
- **Transparency** - Users can view their own history

### Privacy

**What's Logged:**
- User IDs (not names in transaction records)
- Amounts
- Timestamps
- Transaction hashes (public blockchain data)

**Not Logged:**
- IP addresses
- Device info
- Private messages
- Deleted accounts retain transaction history (for audit integrity)

---

## Troubleshooting Checklist

### User Reports Missing Funds

- [ ] Check user's transaction history: `/transactions`
- [ ] Query database for user's transactions
- [ ] Check transaction status (completed vs pending)
- [ ] For deposits: verify tx_hash on blockchain
- [ ] For transfers: confirm recipient ID
- [ ] Review balance_after values
- [ ] Check for failed/refunded transactions
- [ ] Run reconciliation: `/reconcile`

### System-Wide Discrepancy

- [ ] Run automated reconciliation
- [ ] Export transactions and balances to CSV
- [ ] Calculate total deposits - withdrawals
- [ ] Compare to sum of all user balances
- [ ] Check for duplicate transactions
- [ ] Verify no negative balances
- [ ] Review failed transactions
- [ ] Check unclaimed deposits (user_id = -3)

---

## Summary

The CAC Admin Bot's audit trail provides:

✅ **Complete History** - Every transaction logged with full context
✅ **Immutable Record** - Transactions never deleted, only status updated
✅ **Blockchain Proof** - On-chain operations linked via tx_hash
✅ **User Transparency** - Users can view their own history
✅ **Admin Tools** - SQL queries for forensic analysis
✅ **Automated Checks** - Hourly reconciliation detects discrepancies
✅ **Backup Ready** - Simple SQLite backup for disaster recovery

**When in doubt, the audit trail has the answer.**
