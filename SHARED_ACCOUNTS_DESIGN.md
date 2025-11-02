# Shared Account System Design

## Overview

Extends the UnifiedWalletService system account architecture to support **shared accounts** that multiple users can access with different permission levels. Think "team wallets" or "department budgets" within the bot's internal ledger.

## Architecture

### Account ID Scheme

```
Positive IDs (1+):        Regular users
0:                        Reserved
-1 to -99:               System accounts (treasury, reserve, unclaimed)
-100 to -999:            Shared accounts (900 possible accounts)
```

### Permission Levels

| Level | Description | Can View | Can Spend | Can Admin |
|-------|-------------|----------|-----------|-----------|
| `view` | Read-only access | ✅ | ❌ | ❌ |
| `spend` | Can send funds | ✅ | ✅ (with optional limit) | ❌ |
| `admin` | Full control | ✅ | ✅ (unlimited) | ✅ |

### Use Cases

1. **Admin Pool**: All admins have `admin` access to shared treasury
2. **Project Funds**: Team members have `spend` access with limits
3. **Event Budget**: Organizers have `admin` access, helpers have `spend` with limits
4. **Tiered Access**: Elevated users `view` only, admins can `spend`

## Database Schema

### shared_accounts Table

```sql
CREATE TABLE IF NOT EXISTS shared_accounts (
  id INTEGER PRIMARY KEY,           -- Must be < -99
  name TEXT UNIQUE NOT NULL,        -- Human-readable name (e.g., "admin_pool")
  display_name TEXT,                -- Display name (e.g., "Admin Pool")
  description TEXT,                 -- Purpose description
  created_by INTEGER NOT NULL,      -- Creator user ID
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  metadata TEXT,                    -- JSON for extensibility
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### shared_account_permissions Table

```sql
CREATE TABLE IF NOT EXISTS shared_account_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shared_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('view', 'spend', 'admin')),
  spend_limit REAL,                 -- NULL = unlimited (for 'spend' level)
  granted_by INTEGER NOT NULL,
  granted_at INTEGER DEFAULT (strftime('%s', 'now')),
  revoked INTEGER DEFAULT 0,        -- Soft delete
  revoked_at INTEGER,
  revoked_by INTEGER,
  UNIQUE(shared_account_id, user_id),
  FOREIGN KEY (shared_account_id) REFERENCES shared_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (granted_by) REFERENCES users(id),
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_shared_accounts_name ON shared_accounts(name);
CREATE INDEX IF NOT EXISTS idx_shared_permissions_account ON shared_account_permissions(shared_account_id);
CREATE INDEX IF NOT EXISTS idx_shared_permissions_user ON shared_account_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_permissions_revoked ON shared_account_permissions(revoked);
```

## API Design

### SharedAccountService

```typescript
class SharedAccountService {
  // Account Management
  static createSharedAccount(name: string, displayName: string, description: string, createdBy: number): Promise<number>;
  static deleteSharedAccount(accountId: number, deletedBy: number): Promise<boolean>;
  static getSharedAccount(accountId: number): Promise<SharedAccount | null>;
  static getSharedAccountByName(name: string): Promise<SharedAccount | null>;
  static listSharedAccounts(): Promise<SharedAccount[]>;

  // Permission Management
  static grantPermission(accountId: number, userId: number, level: PermissionLevel, grantedBy: number, spendLimit?: number): Promise<boolean>;
  static revokePermission(accountId: number, userId: number, revokedBy: number): Promise<boolean>;
  static updatePermission(accountId: number, userId: number, level: PermissionLevel, updatedBy: number, spendLimit?: number): Promise<boolean>;

  // Permission Checks
  static getUserPermission(accountId: number, userId: number): Promise<Permission | null>;
  static hasPermission(accountId: number, userId: number, requiredLevel: PermissionLevel): Promise<boolean>;
  static canSpend(accountId: number, userId: number, amount: number): Promise<boolean>;
  static listUserPermissions(userId: number): Promise<Permission[]>;
  static listAccountPermissions(accountId: number): Promise<Permission[]>;

  // Helpers
  static getNextAccountId(): Promise<number>; // Returns next available ID < -99
  static validateAccountName(name: string): boolean;
}
```

### UnifiedWalletService Extensions

```typescript
class UnifiedWalletService {
  // Existing methods...

  // Shared Account Operations
  static async getSharedBalance(accountId: number): Promise<number>;
  static async sendFromShared(accountId: number, userId: number, toUserId: number, amount: number, description?: string): Promise<TransactionResult>;
  static async depositToShared(accountId: number, fromUserId: number, amount: number, description?: string): Promise<TransactionResult>;
  static async getSharedTransactions(accountId: number, limit?: number): Promise<Transaction[]>;
}
```

## Commands

### Admin Commands (Owner/Elevated Admin Only)

#### /createshared
```
/createshared <name> <display_name> [description]
Creates a new shared account

Example:
/createshared admin_pool "Admin Pool" "Shared treasury for admins"
```

#### /deleteshared
```
/deleteshared <name>
Deletes a shared account (requires admin permission on the account)

Example:
/deleteshared admin_pool
```

#### /grantaccess
```
/grantaccess <account_name> <@username|user_id> <level> [spend_limit]
Grants access to shared account

Levels: view, spend, admin

Examples:
/grantaccess admin_pool @alice admin
/grantaccess project_fund 123456 spend 100
/grantaccess event_budget @bob view
```

#### /revokeaccess
```
/revokeaccess <account_name> <@username|user_id>
Revokes access to shared account

Example:
/revokeaccess admin_pool @alice
```

#### /updateaccess
```
/updateaccess <account_name> <@username|user_id> <level> [spend_limit]
Updates permission level or spend limit

Example:
/updateaccess project_fund @alice spend 500
```

### User Commands

#### /sharedbalance
```
/sharedbalance <account_name>
Check balance of shared account you have access to

Example:
/sharedbalance admin_pool
```

#### /sharedsend
```
/sharedsend <account_name> <@username|user_id> <amount> [description]
Send funds from shared account to user

Example:
/sharedsend admin_pool @alice 50 "Project payment"
```

#### /shareddeposit
```
/shareddeposit <account_name> <amount>
Deposit your personal funds into shared account

Example:
/shareddeposit event_budget 100
```

#### /myshared
```
/myshared
Lists all shared accounts you have access to with permission levels

Output:
📊 Your Shared Accounts:

admin_pool (Admin Pool)
├─ Permission: admin
├─ Balance: 1,000 JUNO
└─ Description: Shared treasury for admins

project_fund (Project Fund)
├─ Permission: spend (limit: 100 JUNO)
├─ Balance: 500 JUNO
└─ Description: Development project budget
```

#### /sharedinfo
```
/sharedinfo <account_name>
Shows details about a shared account

Example:
/sharedinfo admin_pool
```

#### /sharedhistory
```
/sharedhistory <account_name> [limit]
Shows transaction history for shared account

Example:
/sharedhistory admin_pool 20
```

## Implementation Plan

### Phase 1: Database & Core Service
1. ✅ Add database schema to `database.ts`
2. ✅ Create `SharedAccountService` with permission management
3. ✅ Add shared account ID allocation logic

### Phase 2: UnifiedWalletService Integration
4. ✅ Extend UnifiedWalletService with shared account methods
5. ✅ Add permission checks to transfer operations
6. ✅ Update transaction logging for shared accounts

### Phase 3: Commands
7. ✅ Create `commands/sharedAccounts.ts` with all commands
8. ✅ Add middleware for permission validation
9. ✅ Register commands in bot.ts

### Phase 4: Migration & Cleanup
10. ✅ Add missing methods to UnifiedWalletService (from WalletServiceV2)
11. ✅ Migrate all handlers to UnifiedWalletService
12. ✅ Delete WalletServiceV2
13. ✅ Update documentation

### Phase 5: Testing
14. ✅ Test shared account creation and permissions
15. ✅ Test spend limits and validation
16. ✅ Test transaction history
17. ✅ Integration testing with existing wallet features

## Security Considerations

1. **Permission Validation**: Every shared account operation must verify user permissions
2. **Spend Limits**: Enforce spend limits at service layer, not just UI
3. **Audit Trail**: All permission changes logged with granter/revoker
4. **Cascading Deletes**: Deleting shared account removes permissions but preserves transaction history
5. **System Account Protection**: Shared accounts (-100 to -999) separate from system accounts (-1 to -99)

## Example Workflows

### Workflow 1: Admin Pool Setup

```
1. Owner: /createshared admin_pool "Admin Pool" "Shared funds for admins"
   → Creates account with ID -100, owner has admin permission

2. Owner: /grantaccess admin_pool @alice admin
   → Alice gets full admin access

3. Owner: /grantaccess admin_pool @bob spend 500
   → Bob can spend up to 500 JUNO

4. Alice: /sharedsend admin_pool @charlie 100 "Payment"
   → Sends 100 JUNO from shared account to Charlie

5. Bob: /sharedsend admin_pool @david 600 "Large payment"
   → Fails: exceeds spend limit of 500 JUNO

6. Bob: /sharedbalance admin_pool
   → Shows current balance
```

### Workflow 2: Project Budget

```
1. Admin: /createshared project_x "Project X" "Budget for Project X"

2. Admin: /shareddeposit project_x 1000
   → Deposits 1000 JUNO from personal balance

3. Admin: /grantaccess project_x @team_lead admin
4. Admin: /grantaccess project_x @developer1 spend 100
5. Admin: /grantaccess project_x @developer2 spend 100

6. Developer1: /sharedsend project_x @contractor 75 "Week 1 payment"
   → Success

7. Developer1: /sharedsend project_x @contractor 50 "Bonus"
   → Fails: would exceed 100 JUNO limit (already spent 75)

8. Team Lead: /updateaccess project_x @developer1 spend 200
   → Increases developer1's limit

9. Anyone with access: /sharedhistory project_x
   → Views all transactions
```

## Future Enhancements

1. **Role-Based Access**: Map roles (admin, elevated) to auto-grant permissions
2. **Time-Limited Access**: Permissions expire after certain time
3. **Approval Workflow**: Large transactions require multi-sig approval
4. **Notifications**: Alert on shared account activity
5. **Budget Tracking**: Monitor spending patterns and alerts
6. **Sub-Accounts**: Nested shared accounts (e.g., project_x:frontend, project_x:backend)

## Migration Notes

When migrating from WalletServiceV2:
- Existing system accounts (-1, -2, -3) remain unchanged
- All user balances preserved
- Treasury (ID: -1) can be converted to shared account if desired
- No changes to transaction history table
- Backward compatible with existing ledger system
