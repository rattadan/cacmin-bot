# Unified Wallet + Shared Accounts Implementation Plan

## What's Been Done

### ✅ Phase 1: Foundation (Completed)
1. **Database Schema** - Added shared accounts tables:
   - `shared_accounts` - stores shared account metadata (ID < -99)
   - `shared_account_permissions` - manages user access with permission levels
   - Indexes for performance
   - Build verified: ✅ Compiles successfully

2. **Design Documentation**:
   - `SHARED_ACCOUNTS_DESIGN.md` - Complete architecture and API design
   - `CONSOLIDATION_REPORT.md` - Analysis of current redundancy
   - `IMPLEMENTATION_PLAN.md` - This document

## What Remains

### 📋 Phase 2: Core Services (~1,100 lines)

#### 2.1 SharedAccountService (~400 lines)
**File**: `src/services/sharedAccountService.ts`

**Responsibilities:**
- Account CRUD operations (create, delete, get, list)
- Permission management (grant, revoke, update, check)
- Spend limit validation
- Permission queries

**Key Methods:**
```typescript
- createSharedAccount(name, displayName, description, createdBy)
- deleteSharedAccount(accountId, deletedBy)
- grantPermission(accountId, userId, level, grantedBy, spendLimit?)
- revokePermission(accountId, userId, revokedBy)
- hasPermission(accountId, userId, requiredLevel)
- canSpend(accountId, userId, amount)
- listUserPermissions(userId)
```

**Estimated Time**: 2-3 hours

---

#### 2.2 UnifiedWalletService Extensions (~300 lines)
**File**: `src/services/unifiedWalletService.ts`

**Add Methods:**
```typescript
// Shared Account Operations
- getSharedBalance(accountId)
- sendFromShared(accountId, userId, toUserId, amount, description?)
- depositToShared(accountId, fromUserId, amount, description?)
- getSharedTransactions(accountId, limit?)

// Missing from WalletServiceV2 (needed for migration)
- sendToUsername(fromUserId, toUsername, amount, description?, botContext?)
- payBail(payerUserId, bailedUserId, amount, description?)
- distributeGiveaway(userIds[], amountPerUser, description?)
- getUserTransactionHistory(userId, limit?)
- getSystemBalances()
- reconcileBalances()
- findUserByUsername(username)
- getLedgerStats()
```

**Estimated Time**: 3-4 hours

---

### 📋 Phase 3: Commands (~600 lines)

#### 3.1 Create commands/sharedAccounts.ts

**Commands to Implement:**

| Command | Permission | Description |
|---------|------------|-------------|
| `/createshared` | Owner/Elevated Admin | Create shared account |
| `/deleteshared` | Account Admin | Delete shared account |
| `/grantaccess` | Account Admin | Grant user permission |
| `/revokeaccess` | Account Admin | Revoke user permission |
| `/updateaccess` | Account Admin | Update permission level/limit |
| `/sharedbalance` | Any with access | Check shared balance |
| `/sharedsend` | Spend/Admin permission | Send from shared account |
| `/shareddeposit` | Any user | Deposit to shared account |
| `/myshared` | Any user | List accessible shared accounts |
| `/sharedinfo` | Any with access | Show account details |
| `/sharedhistory` | View permission | Show transaction history |

**Estimated Time**: 3-4 hours

---

### 📋 Phase 4: Migration (~200 lines changes)

#### 4.1 Update Command Handlers

**Files to Update:**
- `src/handlers/wallet.ts` - Replace WalletServiceV2 with UnifiedWalletService
- `src/commands/giveaway.ts` - Update service calls
- `src/commands/payment.ts` - Update service calls
- `src/commands/jail.ts` - Replace JunoService with UnifiedWalletService

**Changes Per File**: ~20-50 lines of method call updates

**Estimated Time**: 2-3 hours

---

#### 4.2 Delete WalletServiceV2
- Remove `src/services/walletServiceV2.ts` (~683 lines removed)
- Remove any remaining imports

**Estimated Time**: 30 minutes

---

### 📋 Phase 5: Testing & Verification

**Test Scenarios:**

1. **Basic Wallet Operations** (existing functionality):
   - User balance queries
   - Deposits with memo routing
   - Withdrawals to external addresses
   - Internal transfers by userId and @username
   - Fine/bail payments
   - Giveaway distributions

2. **Shared Account Operations** (new functionality):
   - Create/delete shared accounts
   - Grant/revoke/update permissions
   - Permission level validation (view/spend/admin)
   - Spend limit enforcement
   - Shared account transfers
   - Transaction history
   - Balance reconciliation

3. **Integration Testing**:
   - Concurrent operations with locking
   - Multiple users accessing same shared account
   - Permission boundary testing
   - Database consistency checks

**Estimated Time**: 4-6 hours

---

## Total Effort Estimate

| Phase | Time | Lines of Code |
|-------|------|---------------|
| Phase 1 (Done) | ✅ 2h | +60 lines (DB schema) |
| Phase 2: Services | 5-7h | ~1,100 lines |
| Phase 3: Commands | 3-4h | ~600 lines |
| Phase 4: Migration | 2.5-3.5h | -683 lines (deleted) + 200 (changes) |
| Phase 5: Testing | 4-6h | Test files |
| **Total** | **14.5-20.5h** | **Net: ~+1,277 lines** |

---

## Implementation Options

### Option 1: Full Implementation Now (Recommended)
**Do all phases 2-5 in this session**

**Pros:**
- Complete unified wallet system
- Shared accounts fully functional
- Clean codebase (no WalletServiceV2 duplication)
- Immediate deployment-ready

**Cons:**
- Long session (10+ hours remaining work)
- Requires extensive testing before production
- High cognitive load

**Best For**: If you have time and want everything done at once

---

### Option 2: Staged Implementation (Safer)
**Break into multiple sessions:**

**Session 1 (This Session)**: ✅ Database schema (done) + SharedAccountService
**Session 2**: UnifiedWalletService extensions + shared account commands
**Session 3**: Migration from WalletServiceV2 + testing
**Session 4**: Production deployment + monitoring

**Pros:**
- Easier to review each stage
- Can test incrementally
- Less risk of bugs
- Natural break points

**Cons:**
- Takes longer calendar time
- Need to maintain both systems temporarily
- Multiple review cycles

**Best For**: Production systems, want careful testing between stages

---

### Option 3: Minimal Implementation (Conservative)
**Just consolidate to UnifiedWalletService, skip shared accounts for now**

**Phase 2a**: Add missing methods to UnifiedWalletService (~400 lines)
**Phase 4**: Migrate handlers from WalletServiceV2 (~200 lines)
**Delete**: WalletServiceV2 (~-683 lines)

**Pros:**
- Faster (4-5 hours)
- Solves immediate redundancy problem
- Shared accounts can be added later
- Lower risk

**Cons:**
- Misses opportunity for shared accounts feature
- Still significant work
- Database schema already added (no harm, just unused)

**Best For**: Need to deploy soon, want to minimize changes

---

## Recommendation

Given your production environment and the fact that I've already added the database schema:

**Proceed with Option 2: Staged Implementation**

**This Session**:
1. Create SharedAccountService (~2-3 hours)
2. Test service in isolation
3. Create foundation for next session

**Next Session(s)**:
4. Complete UnifiedWalletService extensions
5. Add commands
6. Migrate and test thoroughly

This approach:
- Validates the shared account design incrementally
- Allows you to test each piece
- Maintains production stability
- Database schema is already done (no rollback needed)

---

## Current Status

```
✅ Database schema added (shared_accounts + permissions tables)
✅ Design documented (SHARED_ACCOUNTS_DESIGN.md)
✅ Build verified (compiles successfully)
⏳ Awaiting decision on implementation approach
```

---

## Next Steps

**Tell me which option you prefer:**
1. **Full implementation now** - I'll build everything
2. **Staged (recommended)** - I'll start with SharedAccountService
3. **Minimal** - Skip shared accounts, just consolidate wallets

Or suggest your own approach!
