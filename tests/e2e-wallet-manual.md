# E2E Wallet System Test Suite - Manual Testing Guide

**Test Environment:**
- Group: @CosmosAirdrops (ID: 1540576068)
- Bot: @cacmin_bot (API: 7881554749:AAHplathUAN1mOugNiroBqrE3lmUB4P3ji8)
- Owner: @BasementNodes (userId: 1705203106)

## Pre-Test Setup

1. Ensure bot is running and connected to database
2. Backup database: `cp data/bot.db data/bot.db.backup-$(date +%s)`
3. Have test wallet with JUNO tokens ready for deposit testing
4. Note current database state: `sqlite3 data/bot.db "SELECT COUNT(*) FROM users; SELECT SUM(balance) FROM user_balances;"`

---

## Test 1: New User Auto-Registration

**Objective:** Verify users are automatically created on first interaction

**Steps:**
1. Use a fresh Telegram account that has never interacted with bot
2. Send `/balance` command in @CosmosAirdrops group
3. Check response

**Expected Result:**
- Bot replies with balance: 0 JUNO
- Database verification:
  ```sql
  SELECT * FROM users WHERE id = <test_user_id>;
  SELECT * FROM user_balances WHERE user_id = <test_user_id>;
  ```
- User should exist with role='pleb' and balance=0

**Status:** [ ] Pass [ ] Fail

---

## Test 2: Pre-Funded Account via Deposit

**Objective:** Verify account creation when deposit arrives for non-existent user

**Prerequisites:**
- Fresh userId that doesn't exist in database
- Test wallet with JUNO tokens

**Steps:**
1. Choose a test userId (e.g., 999999999) that doesn't exist
2. Send JUNO tokens to bot deposit address with memo: `999999999`
3. Wait for deposit monitoring cycle (check logs)
4. Verify in database

**Expected Result:**
- Deposit detected in logs
- User 999999999 created with placeholder username
- Balance credited to user_balances
- Transaction recorded in transactions table
- Database verification:
  ```sql
  SELECT * FROM users WHERE id = 999999999;
  SELECT * FROM user_balances WHERE user_id = 999999999;
  SELECT * FROM transactions WHERE to_user_id = 999999999 AND transaction_type = 'deposit';
  SELECT * FROM processed_deposits WHERE user_id = 999999999;
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 3: Internal Transfer to userId (Existing User)

**Objective:** Verify internal transfers work with userId

**Prerequisites:**
- Sender has sufficient balance
- Recipient exists in database

**Steps:**
1. As @BasementNodes (userId: 1705203106), send: `/send 1 <recipient_user_id>`
2. Check bot response
3. Recipient sends `/balance` to verify

**Expected Result:**
- Sender receives confirmation with new balance
- Recipient balance increased by 1 JUNO
- Transaction recorded:
  ```sql
  SELECT * FROM transactions
  WHERE from_user_id = 1705203106
  AND to_user_id = <recipient_user_id>
  AND transaction_type = 'transfer';
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 4: Internal Transfer to userId (Pre-Funded Account)

**Objective:** Verify transfer creates account if recipient doesn't exist

**Prerequisites:**
- Sender has sufficient balance
- Choose non-existent userId (e.g., 888888888)

**Steps:**
1. As @BasementNodes, send: `/send 1 888888888`
2. Check bot response
3. Verify database

**Expected Result:**
- Transfer succeeds
- New user 888888888 created with placeholder username
- Balance credited
- Database verification:
  ```sql
  SELECT * FROM users WHERE id = 888888888;
  SELECT * FROM user_balances WHERE user_id = 888888888;
  SELECT * FROM transactions WHERE to_user_id = 888888888;
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 5: Internal Transfer to @username (Mapped)

**Objective:** Verify transfers work with known username

**Prerequisites:**
- Target user exists and has interacted with bot
- Username is mapped in database

**Steps:**
1. As @BasementNodes, send: `/send 1 @<known_username>`
2. Check bot response

**Expected Result:**
- Transfer succeeds
- Username resolved to userId from database
- Transaction recorded with correct user_id

**Status:** [ ] Pass [ ] Fail

---

## Test 6: Internal Transfer to @username (Unmapped, Telegram API Resolution)

**Objective:** Verify Telegram API resolution creates pre-funded account

**Prerequisites:**
- Target username exists on Telegram
- Target user has never interacted with bot
- Username not in database

**Steps:**
1. As @BasementNodes, send: `/send 1 @<unmapped_username>`
2. Check bot response and logs

**Expected Result:**
- Bot attempts database lookup (fails)
- Bot queries Telegram API via `telegram.getChat()`
- Pre-funded account created with resolved userId
- Transfer succeeds
- Log entry: "Created pre-funded account via Telegram username resolution"

**Status:** [ ] Pass [ ] Fail

---

## Test 7: Internal Transfer to @username (Not Found)

**Objective:** Verify proper error when username cannot be resolved

**Prerequisites:**
- Use non-existent username or private account

**Steps:**
1. As @BasementNodes, send: `/send 1 @nonexistent_user_12345`
2. Check bot response

**Expected Result:**
- Error message explaining username not found
- Suggests using userId instead
- No transaction created
- Database unchanged

**Status:** [ ] Pass [ ] Fail

---

## Test 8: Deposit with Valid Memo (ujuno Conversion)

**Objective:** Verify correct ujuno to JUNO conversion and crediting

**Prerequisites:**
- Test wallet with JUNO tokens
- Known userId with existing account

**Steps:**
1. Send 1000000 ujuno (1 JUNO) to bot deposit address
2. Include memo with your userId: `1705203106`
3. Wait for deposit monitoring
4. Check balance: `/balance`

**Expected Result:**
- Bot detects deposit with ujuno denom
- Converts: 1000000 ujuno / 1000000 = 1 JUNO
- Credits 1 JUNO to balance
- Log shows both ujuno and JUNO amounts:
  ```
  Deposit detected { amount: "1 JUNO", ujunoAmount: "1000000", userId: 1705203106 }
  ```
- Database verification:
  ```sql
  SELECT * FROM transactions
  WHERE to_user_id = 1705203106
  AND transaction_type = 'deposit'
  ORDER BY created_at DESC LIMIT 1;
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 9: Deposit with Invalid Memo

**Objective:** Verify deposits without valid memo go to unclaimed account

**Prerequisites:**
- Test wallet with JUNO tokens

**Steps:**
1. Send JUNO tokens to bot deposit address
2. Use invalid memo (empty or non-numeric)
3. Check logs

**Expected Result:**
- Deposit detected
- Credited to UNCLAIMED system account (userId: -2)
- Log: "Deposit without valid userId in memo, sending to unclaimed"
- Database verification:
  ```sql
  SELECT * FROM transactions WHERE to_user_id = -2 ORDER BY created_at DESC LIMIT 1;
  SELECT * FROM user_balances WHERE user_id = -2;
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 10: Withdrawal to On-Chain Address

**Objective:** Verify withdrawal process and on-chain transaction

**Prerequisites:**
- Sender has sufficient balance (amount + tx fees ~0.025 JUNO)
- Valid juno1... destination address

**Steps:**
1. Check starting balance: `/balance`
2. Send: `/withdraw 1 juno1<test_address>`
3. Wait for transaction confirmation
4. Check ending balance: `/balance`

**Expected Result:**
- Bot validates sufficient balance
- On-chain transaction executed
- Balance decreased by (amount + fees)
- Transaction recorded in database:
  ```sql
  SELECT * FROM transactions
  WHERE from_user_id = 1705203106
  AND transaction_type = 'withdrawal'
  ORDER BY created_at DESC LIMIT 1;
  ```
- tx_hash populated with on-chain transaction hash
- Can verify on chain explorer: https://www.mintscan.io/juno/tx/<tx_hash>

**Status:** [ ] Pass [ ] Fail

---

## Test 11: Insufficient Balance Scenarios

**Objective:** Verify proper error handling for insufficient funds

**Test 11a: Transfer with insufficient balance**

**Steps:**
1. Send: `/send 999999 <recipient_user_id>`

**Expected Result:**
- Error: "Insufficient balance"
- No transaction created
- Balances unchanged

**Status:** [ ] Pass [ ] Fail

**Test 11b: Withdrawal with insufficient balance**

**Steps:**
1. Send: `/withdraw 999999 juno1<address>`

**Expected Result:**
- Error: "Insufficient balance"
- No on-chain transaction
- Balance unchanged

**Status:** [ ] Pass [ ] Fail

---

## Test 12: Transaction History

**Objective:** Verify complete audit trail

**Steps:**
1. Perform several transactions (transfer, deposit, withdrawal)
2. Query database for complete history

**Expected Result:**
- All transactions recorded with:
  - Correct transaction_type
  - Accurate from_user_id / to_user_id
  - Correct amounts
  - balance_after values
  - Timestamps
  - Descriptions

**Database Query:**
```sql
SELECT
  id,
  transaction_type,
  from_user_id,
  to_user_id,
  amount,
  balance_after,
  description,
  tx_hash,
  status,
  datetime(created_at, 'unixepoch') as created_at_human
FROM transactions
WHERE from_user_id = 1705203106 OR to_user_id = 1705203106
ORDER BY created_at DESC
LIMIT 20;
```

**Status:** [ ] Pass [ ] Fail

---

## Test 13: Username Update on Interaction

**Objective:** Verify username updates when user changes Telegram username

**Prerequisites:**
- Test account that can change username

**Steps:**
1. User sends `/balance` with username "oldname"
2. User changes Telegram username to "newname"
3. User sends `/balance` again
4. Check database

**Expected Result:**
- Database username field updated to "newname"
- userId remains unchanged
- Database verification:
  ```sql
  SELECT id, username, updated_at FROM users WHERE id = <test_user_id>;
  ```

**Status:** [ ] Pass [ ] Fail

---

## Test 14: Concurrent Transaction Locking

**Objective:** Verify transaction locks prevent race conditions

**Prerequisites:**
- Two devices/accounts able to send commands simultaneously

**Steps:**
1. From Device A: Initiate `/withdraw 5 juno1<address>` (slow operation)
2. Immediately from Device B: Send `/send 5 <user_id>`
3. Check responses and logs

**Expected Result:**
- First transaction acquires lock
- Second transaction blocked: "Transaction in progress"
- Only one transaction succeeds
- Database verification:
  ```sql
  SELECT * FROM transaction_locks WHERE user_id = 1705203106;
  ```
- Lock released after first transaction completes

**Status:** [ ] Pass [ ] Fail

---

## Test 15: System Wallet Balance Reconciliation

**Objective:** Verify internal ledger matches on-chain reality

**Steps:**
1. Query total internal balances:
  ```sql
  SELECT SUM(balance) as total_internal FROM user_balances;
  ```
2. Check on-chain balance of bot wallet address
3. Compare values

**Expected Result:**
- Internal ledger total ≤ on-chain balance
- Difference should only be:
  - Unclaimed deposits
  - Transaction fees
  - Treasury reserves
- Reconciliation logs show no discrepancies

**Database Query:**
```sql
-- Total user balances
SELECT SUM(balance) as total_user_balances FROM user_balances WHERE user_id > 0;

-- System account balances
SELECT user_id, balance FROM user_balances WHERE user_id < 0;

-- All transactions summary
SELECT
  transaction_type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM transactions
GROUP BY transaction_type;
```

**Status:** [ ] Pass [ ] Fail

---

## Post-Test Verification

After completing all tests, run these database integrity checks:

```sql
-- Check for orphaned transactions
SELECT COUNT(*) FROM transactions
WHERE from_user_id IS NOT NULL
AND from_user_id NOT IN (SELECT id FROM users);

SELECT COUNT(*) FROM transactions
WHERE to_user_id IS NOT NULL
AND to_user_id NOT IN (SELECT id FROM users);

-- Check for negative balances
SELECT * FROM user_balances WHERE balance < 0;

-- Check for users without balance entries
SELECT u.id, u.username
FROM users u
LEFT JOIN user_balances ub ON u.id = ub.user_id
WHERE ub.user_id IS NULL AND u.id > 0;

-- Check transaction lock cleanup
SELECT * FROM transaction_locks WHERE locked_at < strftime('%s', 'now') - 600;

-- Verify processed deposits are unique
SELECT tx_hash, COUNT(*) as count
FROM processed_deposits
GROUP BY tx_hash
HAVING count > 1;
```

**All checks should return 0 rows except balance entries query (should match user count).**

---

## Test Summary

**Total Tests:** 15
**Passed:** ___
**Failed:** ___
**Blocked:** ___

**Critical Issues Found:**

**Notes:**
