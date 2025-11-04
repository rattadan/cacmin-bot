# Database Schema Reference

This document defines the canonical database schema for the CAC Admin Bot. **Always reference this document when writing database queries.**

## Core Tables

### `users`
User profiles with roles and moderation state.
```sql
id INTEGER PRIMARY KEY          -- Telegram user ID
username TEXT                   -- Telegram username
role TEXT DEFAULT 'pleb'       -- Role: owner, admin, elevated, pleb
whitelist INTEGER DEFAULT 0     -- Whitelist status
blacklist INTEGER DEFAULT 0     -- Blacklist status
warning_count INTEGER DEFAULT 0 -- Warning count
muted_until INTEGER            -- Unix timestamp of mute expiration
created_at INTEGER             -- Unix timestamp of creation
updated_at INTEGER             -- Unix timestamp of last update
```

### `user_balances`
**IMPORTANT:** This is the ledger table for token balances. Do NOT reference a table called `ledger`.
```sql
user_id INTEGER PRIMARY KEY    -- References users(id)
balance REAL DEFAULT 0         -- Token balance in JUNO
last_updated INTEGER           -- Unix timestamp of last update
created_at INTEGER             -- Unix timestamp of creation
```

### `transactions`
Complete audit trail of all financial operations.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
transaction_type TEXT NOT NULL    -- Type: deposit, withdrawal, transfer, etc.
from_user_id INTEGER             -- Source user ID
to_user_id INTEGER               -- Destination user ID
amount REAL NOT NULL             -- Amount in JUNO
balance_after REAL               -- Balance after transaction
description TEXT                 -- Human-readable description
tx_hash TEXT                     -- Blockchain transaction hash (if applicable)
external_address TEXT            -- External wallet address (if applicable)
status TEXT DEFAULT 'completed' -- Status: completed, pending, failed
created_at INTEGER               -- Unix timestamp
metadata TEXT                    -- JSON metadata
```

### `processed_deposits`
Tracks blockchain deposits to prevent duplicates.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
tx_hash TEXT NOT NULL UNIQUE    -- Blockchain transaction hash
user_id INTEGER                  -- Destination user ID (-2 for UNCLAIMED)
amount REAL NOT NULL             -- Amount in JUNO
from_address TEXT NOT NULL       -- Source blockchain address
memo TEXT                        -- Transaction memo (user ID)
height INTEGER NOT NULL          -- Block height
processed INTEGER DEFAULT 0      -- Processing status (0=pending, 1=complete)
processed_at INTEGER            -- Unix timestamp of processing
error TEXT                       -- Error message if failed
created_at INTEGER              -- Unix timestamp of detection
```

### `violations`
User violations with fines.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL         -- References users(id)
rule_id INTEGER                  -- References rules(id)
restriction TEXT                 -- Restriction type
message TEXT                     -- Violation message
timestamp INTEGER                -- Unix timestamp
bail_amount REAL DEFAULT 0       -- Fine amount in JUNO
paid INTEGER DEFAULT 0           -- Payment status (0=unpaid, 1=paid)
payment_tx TEXT                  -- Payment transaction hash
paid_by_user_id INTEGER         -- User who paid the fine
paid_at INTEGER                  -- Unix timestamp of payment
```

### `jail_events`
Log of all jail/unjail events.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL         -- References users(id)
event_type TEXT NOT NULL         -- Event: jailed, unjailed, bail_paid
admin_id INTEGER                 -- Admin who performed action
duration_minutes INTEGER         -- Jail duration
bail_amount REAL DEFAULT 0       -- Bail amount in JUNO
paid_by_user_id INTEGER         -- User who paid bail
payment_tx TEXT                  -- Payment transaction hash
timestamp INTEGER                -- Unix timestamp
metadata TEXT                    -- JSON metadata
```

### `user_restrictions`
Per-user content restrictions.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL         -- References users(id)
restriction TEXT NOT NULL        -- Type: no_stickers, no_urls, etc.
restricted_action TEXT           -- Specific action (domain, pattern, etc.)
metadata TEXT                    -- JSON metadata
restricted_until INTEGER         -- Unix timestamp of expiration (NULL=permanent)
created_at INTEGER               -- Unix timestamp of creation
```

### `global_restrictions`
Restrictions applied to all users.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
restriction TEXT NOT NULL        -- Type: no_stickers, no_urls, etc.
restricted_action TEXT           -- Specific action
metadata TEXT                    -- JSON metadata
restricted_until INTEGER         -- Unix timestamp of expiration
created_at INTEGER               -- Unix timestamp of creation
```

### `transaction_locks`
Prevents double-spending during concurrent operations.
```sql
user_id INTEGER PRIMARY KEY      -- References users(id)
lock_type TEXT NOT NULL          -- Type: withdrawal, transfer, etc.
metadata TEXT                    -- JSON metadata
locked_at INTEGER                -- Unix timestamp of lock
```

### `shared_accounts`
Multi-user shared wallet accounts.
```sql
id INTEGER PRIMARY KEY           -- Account ID (negative, like -100)
name TEXT UNIQUE NOT NULL        -- Unique account name
display_name TEXT                -- Human-readable name
description TEXT                 -- Account description
created_by INTEGER NOT NULL      -- User who created account
created_at INTEGER               -- Unix timestamp
metadata TEXT                    -- JSON metadata
```

### `shared_account_permissions`
Access control for shared accounts.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
shared_account_id INTEGER NOT NULL  -- References shared_accounts(id)
user_id INTEGER NOT NULL            -- References users(id)
permission_level TEXT NOT NULL      -- Level: view, spend, admin
spend_limit REAL                    -- Spending limit in JUNO
granted_by INTEGER NOT NULL         -- User who granted permission
granted_at INTEGER                  -- Unix timestamp
revoked INTEGER DEFAULT 0           -- Revocation status
revoked_at INTEGER                 -- Unix timestamp of revocation
revoked_by INTEGER                 -- User who revoked permission
```

### `system_wallets`
Configuration for system wallet addresses.
```sql
id TEXT PRIMARY KEY              -- Wallet ID
address TEXT NOT NULL UNIQUE     -- Blockchain address
description TEXT                 -- Wallet description
created_at INTEGER               -- Unix timestamp
```

### `rules`
Violation rule definitions.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
type TEXT NOT NULL               -- Rule type
description TEXT                 -- Rule description
specific_action TEXT             -- Specific action
severity INTEGER DEFAULT 1       -- Severity level
created_at INTEGER               -- Unix timestamp
```

## System User IDs

Special negative user IDs for system accounts:

```typescript
SYSTEM_USER_IDS = {
  TREASURY: -1,      // Bot treasury account
  UNCLAIMED: -2,     // Unclaimed deposits (no valid memo)
  FEES: -3,          // Transaction fees
  GIVEAWAY: -4       // Giveaway pool
}
```

## Common Queries

### Get user balance
```sql
SELECT balance FROM user_balances WHERE user_id = ?
```

### Get all user balances
```sql
SELECT user_id, balance FROM user_balances WHERE user_id > 0
```

### Get system account balances
```sql
SELECT user_id, balance FROM user_balances WHERE user_id < 0
```

### Check if deposit already processed
```sql
SELECT * FROM processed_deposits WHERE tx_hash = ?
```

### Get pending deposits
```sql
SELECT * FROM processed_deposits WHERE processed = 0 ORDER BY created_at
```

### Get unclaimed deposits
```sql
SELECT * FROM processed_deposits WHERE user_id = -2 ORDER BY created_at DESC
```

### Get user transaction history
```sql
SELECT * FROM transactions
WHERE from_user_id = ? OR to_user_id = ?
ORDER BY created_at DESC
LIMIT ?
```

### Get total internal ledger balance
```sql
SELECT SUM(balance) as total FROM user_balances
```

## Important Notes

1. **Never use table name `ledger`** - The correct table is `user_balances`
2. **Always check `processed_deposits.tx_hash`** before processing deposits to prevent duplicates
3. **System accounts use negative user IDs** - Regular users have positive IDs
4. **Timestamps are Unix epoch seconds** - Use `Math.floor(Date.now() / 1000)`
5. **Amounts are in JUNO** - Not ujuno (already converted from base denomination)
6. **Foreign keys are enabled** - `PRAGMA foreign_keys = ON` is set on connection
7. **Use parameterized queries** - Always use `?` placeholders to prevent SQL injection

## Migration Notes

If you see references to `user_wallets` table in old databases, that's from the deprecated HD wallet system and should be ignored. The current system uses a single unified wallet with internal ledger (`user_balances`).
