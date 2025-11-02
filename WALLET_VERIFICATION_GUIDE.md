# Wallet System Verification & Security Audit Guide

## Overview

This guide provides comprehensive procedures for verifying the wallet system's correctness, security, and soundness. The cacmin-bot uses an internal ledger system with a single external JUNO wallet and memo-based deposit routing.

---

## Part 1: Pre-Deployment Verification

### Step 1: Database Schema Validation

```bash
# Verify all required tables exist
sqlite3 ./data/bot.db ".schema" | grep -E "(user_balances|ledger_transactions|system_wallets)"
```

**Expected Tables:**
- `user_balances` - User account balances
- `ledger_transactions` - Complete transaction audit trail
- `system_wallets` - Treasury and user funds addresses

**Verification Checklist:**
- [ ] `user_balances` has UNIQUE constraint on userId
- [ ] `ledger_transactions` has proper indexes
- [ ] All timestamp fields default to current time
- [ ] Amount fields use REAL type (6 decimal precision)

### Step 2: Wallet Configuration Check

```bash
# Check .env configuration
cat .env | grep -E "(JUNO_WALLET|BOT_TREASURY|USER_FUNDS)"
```

**Required Configuration:**
- [ ] `USER_FUNDS_ADDRESS` - Main wallet address (juno1...)
- [ ] `USER_FUNDS_MNEMONIC` - 24-word mnemonic (KEEP SECURE!)
- [ ] `JUNO_RPC_URL` - RPC endpoint for blockchain queries
- [ ] `BOT_TREASURY_ADDRESS` (optional) - Separate treasury wallet

**Security Checks:**
- [ ] .env file has 600 permissions (owner read/write only)
- [ ] Mnemonic is NOT committed to git
- [ ] Mnemonic is backed up securely offline
- [ ] Wallet has sufficient balance for withdrawals

### Step 3: Ledger Initialization

```bash
# Start bot and check logs
yarn start

# Look for these log entries:
# "Ledger service initialized"
# "Unified wallet service initialized"
# "Deposit monitor started"
```

**Verification:**
- [ ] Bot treasury user (ID: -1) created in database
- [ ] System wallets registered in `system_wallets` table
- [ ] Deposit monitoring cron job started
- [ ] No initialization errors in logs

---

## Part 2: Functional Testing (Owner Commands)

### Test 1: Balance Query

```
Command: /testbalance
Expected: Returns balance for test user (should be 0 initially)
Verify: Check database matches returned balance
```

```sql
-- Manual verification
SELECT * FROM user_balances WHERE userId = YOUR_USER_ID;
```

### Test 2: Internal Transfer

```
Command: /testtransfer
Process:
1. Credits 100 JUNO to test account
2. Transfers 50 JUNO to another user
3. Verifies both balances

Expected: Balances add up correctly, no tokens created/lost
```

**Manual Verification:**
```sql
-- Check both user balances
SELECT userId, balance FROM user_balances WHERE userId IN (SENDER_ID, RECIPIENT_ID);

-- Verify transaction log
SELECT * FROM ledger_transactions
WHERE transactionType = 'transfer'
ORDER BY createdAt DESC LIMIT 5;
```

### Test 3: Fine Payment

```
Command: /testfine
Process:
1. Creates test violation with fine
2. Pays fine from user balance to treasury
3. Marks violation as paid

Expected: User balance decreases, treasury increases by exact amount
```

**Critical Checks:**
- [ ] User balance decreased by fine amount
- [ ] Treasury (userId: -1) balance increased by fine amount
- [ ] Transaction recorded with type='fine'
- [ ] Violation marked as paid in database

### Test 4: Full Flow Integration

```
Command: /testfullflow
Process:
1. Check initial balance
2. Simulate deposit (+100 JUNO)
3. Pay fine (-10 JUNO)
4. Transfer to bot (-5 JUNO)
5. Verify final balance matches expected

Expected: initialBalance + 100 - 10 - 5 = finalBalance
```

**This is your PRIMARY validation test.** If this passes, the core arithmetic is sound.

---

## Part 3: Security Audit

### Critical Security Checks

#### 1. Transaction Atomicity

**Issue:** Are balance updates and transaction logs atomic?

**Test:**
```typescript
// In services/ledgerService.ts, verify transactions are wrapped in try/catch
// Check for rollback on error
```

**Verification:**
- [ ] All balance updates use database transactions
- [ ] Failed operations don't leave partial state
- [ ] Transaction log always reflects actual balance changes

#### 2. Concurrent Transaction Protection

**Issue:** Can two simultaneous transactions corrupt balances?

**Current Protection:** `TransactionLockService` in `services/transactionLock.ts`

**Test:**
```bash
# Attempt concurrent withdrawals (requires 2 users)
User1: /withdraw 100 juno1...
User2: /withdraw 100 juno1... (immediately after)
```

**Expected:** Second transaction should be blocked with "Another transaction is in progress"

**Verification:**
- [ ] Only one financial operation per user at a time
- [ ] Locks expire after timeout (default: 5 minutes)
- [ ] Stale locks cleaned up on bot restart

#### 3. Double-Spend Prevention

**Issue:** Can a user spend more than their balance?

**Test:**
```bash
# User with 10 JUNO balance
/withdraw 15 juno1...
```

**Expected:** "Insufficient balance" error

**Code Check:**
```typescript
// In unifiedWalletService.ts
// Verify balance check BEFORE deducting
if (currentBalance < amount) {
  return { success: false, error: 'Insufficient balance' };
}
```

#### 4. Precision & Rounding

**Issue:** Does floating-point arithmetic create/lose tokens?

**Current Protection:** `AmountPrecision` class in `utils/precision.ts`

**Test Cases:**
```typescript
// Test precision edge cases
0.000001 JUNO (minimum unit)
0.9999995 JUNO (rounding boundary)
1000000.123456 JUNO (large amount)
```

**Verification:**
- [ ] All amounts stored with 6 decimal places
- [ ] No rounding occurs (only truncation at input)
- [ ] Internal calculations use micro-units (integers)
- [ ] Sum of all balances equals total deposits - withdrawals

#### 5. Deposit Verification

**Issue:** Can someone claim a deposit they didn't make?

**Current Protection:** Memo-based routing + RPC verification

**Test:**
```bash
# Get deposit instructions
/deposit

# Send actual JUNO to address with memo
# (Use testnet or small amount)

# Wait for deposit monitor (runs every minute)
# Or manually trigger:
/checkdeposit <txHash>
```

**Verification:**
- [ ] Only deposits with correct memo are credited
- [ ] Transaction hash is verified on-chain via RPC
- [ ] Amount matches on-chain transaction exactly
- [ ] Duplicate deposits are rejected (txHash uniqueness)

#### 6. Withdrawal Security

**Issue:** Can withdrawals be sent to wrong address or manipulated?

**Code Audit:** Check `services/unifiedWalletService.ts` → `withdrawToAddress()`

**Verification:**
- [ ] Address validation (must be valid juno1... format)
- [ ] Amount validation (must be > 0, <= balance)
- [ ] Transaction lock acquired before processing
- [ ] Actual blockchain transaction confirmed before deducting balance
- [ ] On-chain failure triggers balance refund

---

## Part 4: Ledger Soundness Audit

### Balance Reconciliation

The system includes automatic reconciliation to detect ledger corruption.

**Command:** `/reconcile` (admin only)

**What It Checks:**
1. Sum of all user balances (including treasury)
2. Total deposits from ledger_transactions
3. Total withdrawals from ledger_transactions
4. **Expected:** deposits - withdrawals = total_balances

**Manual Reconciliation:**
```sql
-- 1. Sum all user balances
SELECT SUM(balance) as total_user_balances FROM user_balances;

-- 2. Sum all deposits
SELECT SUM(amount) as total_deposits
FROM ledger_transactions
WHERE transactionType IN ('deposit', 'giveaway');

-- 3. Sum all withdrawals/outflows
SELECT SUM(amount) as total_outflows
FROM ledger_transactions
WHERE transactionType IN ('withdrawal');

-- 4. Sum all internal movements (should net to zero)
SELECT
  SUM(CASE WHEN transactionType = 'fine' THEN amount ELSE 0 END) as fines,
  SUM(CASE WHEN transactionType = 'transfer' THEN amount ELSE 0 END) as transfers
FROM ledger_transactions;
```

**Expected Result:**
```
total_user_balances = total_deposits - total_outflows
```

**Automated Check:** Runs every hour (see `bot.ts` line 89-99)

### Transaction Audit Trail

**Every operation must be logged.** Verify:

```sql
-- Check for gaps in transaction IDs
SELECT id FROM ledger_transactions ORDER BY id;

-- Verify all balance changes have corresponding transactions
SELECT
  ub.userId,
  ub.balance,
  (SELECT SUM(
    CASE
      WHEN toUserId = ub.userId THEN amount
      WHEN fromUserId = ub.userId THEN -amount
      ELSE 0
    END
  ) FROM ledger_transactions lt
   WHERE lt.toUserId = ub.userId OR lt.fromUserId = ub.userId
  ) as calculated_balance
FROM user_balances ub;
```

**Expected:** calculated_balance should match balance for all users

---

## Part 5: User Acceptance Testing

### Test with Real Users (Small Amounts)

1. **Deposit Test**
   ```
   User: /deposit
   User: Sends 1 JUNO with provided memo
   Bot: Auto-credits within 1-2 minutes
   User: /balance (should show +1 JUNO)
   ```

2. **Transfer Test**
   ```
   User A: /send @UserB 0.5
   User B: /balance (should show +0.5)
   User A: /balance (should show -0.5)
   ```

3. **Withdrawal Test**
   ```
   User: /withdraw 0.1 juno1exampleaddress
   Wait for confirmation
   Check external wallet received 0.1 JUNO
   User: /balance (should show -0.1)
   ```

4. **History Verification**
   ```
   User: /transactions
   Verify: All operations appear in history with correct amounts
   ```

---

## Part 6: Ongoing Monitoring

### Daily Checks

```bash
# 1. Check reconciliation status
grep "reconciliation" logs/combined.log | tail -20

# 2. Check for failed transactions
grep "FAILED" logs/combined.log | tail -20

# 3. Check deposit monitor
grep "deposit monitor" logs/combined.log | tail -10

# 4. Check wallet balance on-chain
# Compare to sum of user balances in database
```

### Weekly Audit

```sql
-- 1. Check for orphaned balances (users with balance but no transactions)
SELECT ub.userId, ub.balance
FROM user_balances ub
LEFT JOIN ledger_transactions lt ON (lt.toUserId = ub.userId OR lt.fromUserId = ub.userId)
WHERE lt.id IS NULL AND ub.balance > 0;

-- 2. Check for negative balances (should NEVER happen)
SELECT * FROM user_balances WHERE balance < 0;

-- 3. Check for stale locks (older than 1 hour)
SELECT * FROM transaction_locks WHERE lockedAt < (strftime('%s', 'now') - 3600);

-- 4. Verify treasury balance
SELECT balance FROM user_balances WHERE userId = -1;
```

### Alerts to Set Up

**Critical Alerts:**
- Reconciliation mismatch detected
- Negative balance detected
- Withdrawal failure
- Deposit monitor stopped

**Warning Alerts:**
- User balance exceeds threshold (e.g., 10,000 JUNO)
- Transaction lock held > 5 minutes
- High withdrawal volume

---

## Part 7: Disaster Recovery

### Backup Strategy

```bash
# Daily database backup
sqlite3 ./data/bot.db ".backup ./backups/bot_$(date +%Y%m%d).db"

# Weekly wallet backup (SECURE LOCATION!)
cp .env ./secure-backups/.env.$(date +%Y%m%d)
```

### Recovery Procedures

**Scenario 1: Database Corruption**
```bash
# Restore from backup
cp ./backups/bot_YYYYMMDD.db ./data/bot.db

# Verify integrity
sqlite3 ./data/bot.db "PRAGMA integrity_check;"

# Restart bot
yarn rebuild
```

**Scenario 2: Balance Mismatch**
```bash
# Run reconciliation
/reconcile

# If mismatch found, investigate transaction logs
# Check for missing or duplicate transactions
# May need to manually correct via SQL (EXTREME CAUTION)
```

**Scenario 3: Lost Mnemonic**
```
CRITICAL: Without mnemonic, ALL USER FUNDS ARE LOST
Prevention: Keep 3+ secure backups in different locations
```

---

## Security Best Practices

1. **Never run bot as root** - Use dedicated user account
2. **Restrict .env permissions** - `chmod 600 .env`
3. **Enable UFW firewall** - Only allow SSH + necessary ports
4. **Regular updates** - Keep Node.js and dependencies updated
5. **Monitor logs** - Set up log aggregation and alerts
6. **Limit exposure** - Don't advertise wallet functionality until thoroughly tested
7. **Start small** - Begin with test amounts, increase gradually
8. **Document incidents** - Keep log of any anomalies or corrections

---

## Testing Checklist for Production Launch

- [ ] All unit tests pass (create them first!)
- [ ] `/testfullflow` passes 10 consecutive times
- [ ] Manual reconciliation matches automated
- [ ] Real deposit test with testnet JUNO
- [ ] Real withdrawal test with testnet JUNO
- [ ] Concurrent transaction test (2+ users)
- [ ] Precision test with edge-case amounts
- [ ] Lock timeout test (wait 5+ minutes)
- [ ] Bot restart doesn't corrupt state
- [ ] Backup and restore procedure tested
- [ ] Monitoring and alerts configured
- [ ] Disaster recovery plan documented
- [ ] Team trained on emergency procedures

---

## Common Issues & Solutions

### Issue: Deposits not being credited

**Diagnosis:**
```bash
# Check deposit monitor logs
grep "deposit monitor" logs/combined.log

# Check RPC connectivity
curl https://rpc.juno.basementnodes.ca/status

# Verify transaction on-chain
curl https://api.juno.basementnodes.ca/cosmos/tx/v1beta1/txs/TXHASH
```

**Solutions:**
- Verify RPC endpoint is accessible
- Check memo format matches exactly
- Ensure transaction is confirmed (wait 1-2 minutes)
- Check user used correct address

### Issue: Withdrawal stuck/failed

**Diagnosis:**
```sql
-- Check transaction status
SELECT * FROM ledger_transactions
WHERE transactionType = 'withdrawal'
AND status != 'completed'
ORDER BY createdAt DESC;

-- Check locks
SELECT * FROM transaction_locks WHERE userId = USER_ID;
```

**Solutions:**
- Release stuck lock: `/reconcile` (admin)
- Verify wallet has sufficient balance
- Check network connectivity
- Review error logs for specific failure

### Issue: Balance reconciliation mismatch

**Diagnosis:**
```sql
-- Compare user sum to transaction sum
SELECT
  (SELECT SUM(balance) FROM user_balances) as total_balances,
  (SELECT SUM(amount) FROM ledger_transactions WHERE transactionType = 'deposit') as deposits,
  (SELECT SUM(amount) FROM ledger_transactions WHERE transactionType = 'withdrawal') as withdrawals;
```

**Solutions:**
- Identify discrepancy source via transaction audit
- Check for duplicate transactions
- Verify all balance updates have corresponding logs
- May require manual correction (DOCUMENT THOROUGHLY)

---

## Recommended Improvements

1. **Add Automated Tests** - Jest test suite for all wallet operations
2. **Add Rate Limiting** - Prevent spam deposits/withdrawals
3. **Add Transaction Fees** - Small fee for treasury sustainability
4. **Add Multi-Sig** - Require multiple approvals for large withdrawals
5. **Add Cold Storage** - Move excess funds to offline wallet
6. **Add Notification System** - Alert admins of large transactions
7. **Add Withdrawal Limits** - Daily/weekly caps per user
8. **Add KYC Integration** - For regulatory compliance (if needed)

---

## Conclusion

The wallet system's security depends on:
1. **Atomicity** - All operations complete or fail entirely
2. **Locking** - No concurrent operations on same user
3. **Verification** - All deposits verified on-chain
4. **Reconciliation** - Regular balance audits
5. **Monitoring** - Continuous logging and alerting

**Before production:** Complete ALL items in the Testing Checklist above.

**During operation:** Run daily checks and weekly audits religiously.

**In emergency:** Follow disaster recovery procedures, document everything.
