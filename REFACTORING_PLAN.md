# CACMIN-BOT COMPREHENSIVE REFACTORING PLAN

**Document Version**: 1.0
**Created**: 2025-11-03
**Status**: Ready for Execution
**Estimated Effort**: 8-12 hours total
**Risk Level**: MEDIUM (requires testing after each phase)

---

## EXECUTIVE SUMMARY

This document provides a complete, step-by-step plan to refactor the cacmin-bot codebase based on comprehensive architecture analysis. The refactoring is divided into 3 phases of increasing complexity, each designed to be executed independently with verification checkpoints.

**Total Impact**:
- Remove additional ~150 lines of comment bloat
- Reduce function name verbosity by 15-20%
- Split 1445-line god object into 4 focused services
- Improve testability and maintainability
- Zero breaking changes to external behavior

**Prerequisites**:
- Current codebase builds successfully (`yarn build` passes)
- Git repository with clean working directory (recommended)
- All existing tests pass (if any exist)
- Backup of `data/bot.db` database file

---

## PHASE 2: FUNCTION NAME SHORTENING (Priority: MEDIUM, Risk: LOW)

### Overview

Six function names across the codebase exceed 20 characters and contain unnecessary verbosity. This phase systematically shortens them while maintaining clarity and updating all call sites.

**Estimated Time**: 2-3 hours
**Files Affected**: 3 service files, all their consumers
**Build Breaking**: Yes (requires updating all call sites)
**Rollback Difficulty**: Easy (git revert)

---

### 2.1: `verifyWithdrawalCompletion` → `verifyTxComplete`

**Current State**:
- **File**: `src/services/transactionLock.ts:150`
- **Name**: `verifyWithdrawalCompletion` (25 characters)
- **Signature**: `static async verifyWithdrawalCompletion(userId: number, txHash: string, expectedAmount: number): Promise<VerificationResult>`
- **Purpose**: Verify withdrawal transaction confirmed on-chain and ledger updated

**Target State**:
- **New Name**: `verifyTxComplete` (15 characters, -40% reduction)
- **Rationale**: "Tx" is universally understood as "transaction" in blockchain contexts. "Complete" implies both on-chain confirmation and ledger update. The function is only called in withdrawal context, so "Withdrawal" prefix is redundant.

**Call Sites** (found via `grep -r "verifyWithdrawalCompletion"`):
1. `src/services/transactionLock.ts:64` - Within `acquireWithdrawalLock()`
2. `src/services/transactionLock.ts:310` - Within `releaseWithdrawalLock()`
3. `src/services/transactionLock.ts:494` - Within `cleanExpiredLocks()`

**Execution Steps**:

```bash
# Step 1: Rename the function definition
# File: src/services/transactionLock.ts:150
# Change:
static async verifyWithdrawalCompletion(
  userId: number,
  txHash: string,
  expectedAmount: number
): Promise<VerificationResult> {

# To:
static async verifyTxComplete(
  userId: number,
  txHash: string,
  expectedAmount: number
): Promise<VerificationResult> {

# Step 2: Update all 3 call sites in same file
# Lines 64, 310, 494
# Change all instances of:
const verification = await this.verifyWithdrawalCompletion(

# To:
const verification = await this.verifyTxComplete(

# Step 3: Update JSDoc comment (line ~149)
# Change:
/** Verify withdrawal completion with dual checks */

# To:
/** Verify tx confirmed on-chain and ledger updated (dual verification) */

# Step 4: Build and verify
yarn build
# Should complete with no errors

# Step 5: Search for any remaining references
grep -r "verifyWithdrawalCompletion" src/
# Should return: no results
```

**Verification Checklist**:
- [ ] Function renamed in definition
- [ ] All 3 call sites updated
- [ ] JSDoc comment updated for clarity
- [ ] `yarn build` completes successfully
- [ ] No grep results for old name
- [ ] Git commit: "Rename verifyWithdrawalCompletion → verifyTxComplete"

---

### 2.2: `getUserTransactionHistory` → `getTxHistory`

**Current State**:
- **File**: `src/services/unifiedWalletService.ts:~800` (search for function)
- **Name**: `getUserTransactionHistory` (24 characters)
- **Signature**: `static getUserTransactionHistory(userId: number, limit?: number): Transaction[]`
- **Purpose**: Retrieve user's transaction history from ledger

**Target State**:
- **New Name**: `getTxHistory` (12 characters, -50% reduction)
- **Rationale**: "User" is implicit from the `userId` parameter. "Transaction" → "Tx" is standard abbreviation. Still perfectly clear in context.

**Call Sites** (find with `grep -rn "getUserTransactionHistory"`):
```bash
# This will show all locations where function is called
grep -rn "getUserTransactionHistory" src/
```

**Expected Call Sites**:
- `src/commands/wallet.ts` - In `/transactions` command
- Possibly `src/handlers/wallet.ts` - Admin transaction viewing
- Export in `src/services/unifiedWalletService.ts`

**Execution Steps**:

```bash
# Step 1: Find the function definition
grep -n "getUserTransactionHistory" src/services/unifiedWalletService.ts
# Note the line number

# Step 2: Read the function to understand its current comment
# Use: Read tool on unifiedWalletService.ts at the line number found

# Step 3: Rename the function definition
# Change function name from getUserTransactionHistory to getTxHistory
# Update any JSDoc comments

# Step 4: Find all call sites
grep -rn "getUserTransactionHistory" src/
# Note each file and line number

# Step 5: Update each call site
# For each file found:
#   - Read the file
#   - Replace getUserTransactionHistory with getTxHistory
#   - Ensure variable names still make sense

# Step 6: Build and verify
yarn build

# Step 7: Verify no old references remain
grep -r "getUserTransactionHistory" src/
# Should return: no results
```

**Verification Checklist**:
- [ ] Function definition renamed
- [ ] All call sites updated (likely 2-3 files)
- [ ] JSDoc comments updated
- [ ] `yarn build` passes
- [ ] No grep results for old name
- [ ] Git commit: "Rename getUserTransactionHistory → getTxHistory"

---

### 2.3: `extractMemoFromProtobuf` → `parseMemo`

**Current State**:
- **File**: `src/services/unifiedWalletService.ts:~400` (search for function)
- **Name**: `extractMemoFromProtobuf` (22 characters)
- **Signature**: `private static extractMemoFromProtobuf(txData: any): string | null`
- **Purpose**: Parse memo field from protobuf-encoded transaction data

**Target State**:
- **New Name**: `parseMemo` (9 characters, -59% reduction)
- **Rationale**: "Extract" and "From" are redundant - parsing implies extraction. "Protobuf" is implementation detail not needed in name. Function is private and only used within UnifiedWalletService, so context is clear.

**Call Sites** (internal only, search with `grep`):
```bash
grep -rn "extractMemoFromProtobuf" src/
```

**Expected Call Sites**:
- Only within `src/services/unifiedWalletService.ts`
- Likely in `fetchRecentDeposits()` or `processDeposit()` methods
- Should be 2-4 internal calls

**Execution Steps**:

```bash
# Step 1: Locate function definition
grep -n "extractMemoFromProtobuf" src/services/unifiedWalletService.ts

# Step 2: Rename the private method
# Change:
private static extractMemoFromProtobuf(txData: any): string | null {

# To:
private static parseMemo(txData: any): string | null {

# Step 3: Update JSDoc comment
# Change:
/** Extract memo from protobuf transaction data */

# To:
/** Parse memo field from protobuf-encoded tx data */

# Step 4: Find internal call sites in same file
grep -n "extractMemoFromProtobuf" src/services/unifiedWalletService.ts
# Update each instance to use new name

# Step 5: Verify no external usage
grep -r "extractMemoFromProtobuf" src/ --exclude="unifiedWalletService.ts"
# Should return: no results (it's private)

# Step 6: Build
yarn build
```

**Verification Checklist**:
- [ ] Private method renamed
- [ ] All internal call sites updated (same file)
- [ ] JSDoc updated
- [ ] No external references exist
- [ ] `yarn build` passes
- [ ] Git commit: "Rename extractMemoFromProtobuf → parseMemo"

---

### 2.4: `acquireWithdrawalLock` → `lockWithdrawal`

**Current State**:
- **File**: `src/services/transactionLock.ts:43`
- **Name**: `acquireWithdrawalLock` (21 characters)
- **Signature**: `static async acquireWithdrawalLock(userId: number, amount: number, targetAddress: string): Promise<{ success: boolean; lockId?: string; error?: string }>`
- **Purpose**: Acquire exclusive lock for withdrawal operation

**Target State**:
- **New Name**: `lockWithdrawal` (14 characters, -33% reduction)
- **Rationale**: "Acquire" is implied by "lock" as a verb. Function does one thing: locks for withdrawal. Shorter name is clearer.

**Call Sites** (search with `grep`):
```bash
grep -rn "acquireWithdrawalLock" src/
```

**Expected Call Sites**:
- `src/services/unifiedWalletService.ts` - In `processWithdrawal()` method
- Possibly test files (if they exist)

**Execution Steps**:

```bash
# Step 1: Find function definition
grep -n "acquireWithdrawalLock" src/services/transactionLock.ts
# Should be around line 43

# Step 2: Rename the function
# Change:
static async acquireWithdrawalLock(

# To:
static async lockWithdrawal(

# Step 3: Update JSDoc
# Change:
/** Acquire lock for withdrawal with strict verification */

# To:
/** Lock user for withdrawal with strict verification */

# Step 4: Find all call sites
grep -rn "acquireWithdrawalLock" src/

# Step 5: Update UnifiedWalletService call site
# Find in src/services/unifiedWalletService.ts
# Change:
const lockResult = await TransactionLockService.acquireWithdrawalLock(

# To:
const lockResult = await TransactionLockService.lockWithdrawal(

# Step 6: Build
yarn build
```

**Verification Checklist**:
- [ ] Function definition renamed
- [ ] UnifiedWalletService call site updated
- [ ] JSDoc updated
- [ ] `yarn build` passes
- [ ] Git commit: "Rename acquireWithdrawalLock → lockWithdrawal"

---

### 2.5: `initializeSystemUsers` → `initSysUsers`

**Current State**:
- **File**: `src/services/unifiedWalletService.ts:~100`
- **Name**: `initializeSystemUsers` (21 characters)
- **Signature**: `private static async initializeSystemUsers(): Promise<void>`
- **Purpose**: Create system users (BOT_TREASURY, UNCLAIMED, SYSTEM_RESERVE) in database

**Target State**:
- **New Name**: `initSysUsers` (12 characters, -43% reduction)
- **Rationale**: "Initialize" → "Init" is standard abbreviation. "System" → "Sys" is widely understood. Function is private, so shorter name aids readability.

**Call Sites** (internal only):
```bash
grep -rn "initializeSystemUsers" src/
```

**Expected Call Sites**:
- Only within `src/services/unifiedWalletService.ts`
- Called from `initialize()` method
- Should be exactly 1 call site

**Execution Steps**:

```bash
# Step 1: Locate private method
grep -n "initializeSystemUsers" src/services/unifiedWalletService.ts
# Note definition line and call site line

# Step 2: Rename the method definition
# Change:
private static async initializeSystemUsers(): Promise<void> {

# To:
private static async initSysUsers(): Promise<void> {

# Step 3: Update the single call site in initialize()
# Change:
await this.initializeSystemUsers();

# To:
await this.initSysUsers();

# Step 4: Update JSDoc comment
# Change:
/** Initialize system users in the ledger */

# To:
/** Init system users (BOT_TREASURY, UNCLAIMED, SYSTEM_RESERVE) in ledger */

# Step 5: Build
yarn build
```

**Verification Checklist**:
- [ ] Private method renamed
- [ ] Single call site updated
- [ ] JSDoc expanded for clarity (since name is shorter)
- [ ] `yarn build` passes
- [ ] Git commit: "Rename initializeSystemUsers → initSysUsers"

---

### 2.6: `getSystemWalletBalance` → `getSysBalance`

**Current State**:
- **File**: `src/services/ledgerService.ts:~300` (search for function)
- **Name**: `getSystemWalletBalance` (21 characters)
- **Signature**: `static async getSystemWalletBalance(): Promise<number>`
- **Purpose**: Get total system wallet balance (sum of all user balances + treasury)

**Target State**:
- **New Name**: `getSysBalance` (13 characters, -38% reduction)
- **Rationale**: "System" → "Sys" is standard. "Wallet" is redundant context. Function clearly returns balance.

**Call Sites** (search with `grep`):
```bash
grep -rn "getSystemWalletBalance" src/
```

**Expected Call Sites**:
- `src/services/ledgerService.ts` - In reconciliation methods
- `src/commands/walletTest.ts` - Owner test commands
- Possibly `src/handlers/wallet.ts` - Admin wallet stats

**Execution Steps**:

```bash
# Step 1: Find function definition
grep -n "getSystemWalletBalance" src/services/ledgerService.ts

# Step 2: Rename the function
# Change:
static async getSystemWalletBalance(): Promise<number> {

# To:
static async getSysBalance(): Promise<number> {

# Step 3: Update JSDoc
# Change:
/** Get total system wallet balance */

# To:
/** Get total system balance (all users + treasury) */

# Step 4: Find all call sites
grep -rn "getSystemWalletBalance" src/

# Step 5: Update each call site
# For each file found, replace:
LedgerService.getSystemWalletBalance()
# With:
LedgerService.getSysBalance()

# Step 6: Build
yarn build
```

**Verification Checklist**:
- [ ] Function definition renamed
- [ ] All call sites updated (likely 2-3 files)
- [ ] JSDoc updated
- [ ] `yarn build` passes
- [ ] Git commit: "Rename getSystemWalletBalance → getSysBalance"

---

### Phase 2 Completion Checklist

After completing all 6 function renames:

```bash
# Final verification
yarn build
# Must pass with no errors

# Comprehensive grep check
grep -r "verifyWithdrawalCompletion\|getUserTransactionHistory\|extractMemoFromProtobuf\|acquireWithdrawalLock\|initializeSystemUsers\|getSystemWalletBalance" src/
# Should return: no results

# Count commits
git log --oneline -6
# Should show 6 new commits (one per rename)

# Test bot startup (if possible in test environment)
yarn dev
# Should start without errors
# Ctrl+C to stop

# Create summary commit
git log --oneline -6 > /tmp/renames.txt
git add -A
git commit -m "Phase 2 complete: Function name shortening

- verifyWithdrawalCompletion → verifyTxComplete (-40%)
- getUserTransactionHistory → getTxHistory (-50%)
- extractMemoFromProtobuf → parseMemo (-59%)
- acquireWithdrawalLock → lockWithdrawal (-33%)
- initializeSystemUsers → initSysUsers (-43%)
- getSystemWalletBalance → getSysBalance (-38%)

Total: 6 functions renamed, average -44% character reduction
No breaking changes, all tests pass"
```

**Rollback Plan** (if needed):
```bash
# If something breaks, revert all Phase 2 changes:
git log --oneline -6
# Note the commit hash BEFORE first rename

git reset --hard <commit-hash-before-renames>
# This undoes all Phase 2 work

# Or revert individual renames:
git revert <commit-hash> --no-edit
```

---

## PHASE 3: GOD OBJECT REFACTORING (Priority: HIGH, Risk: HIGH)

### Overview

`UnifiedWalletService` is a 1445-line god object with 24 public methods handling 5 distinct responsibilities. This phase splits it into focused services while maintaining a thin orchestrator layer for backward compatibility.

**Estimated Time**: 6-8 hours
**Files Affected**: Create 3 new files, modify 4 existing files
**Build Breaking**: No (maintains backward compatibility)
**Rollback Difficulty**: Medium (new files can be deleted)

---

### 3.1: Current Architecture Analysis

**File**: `src/services/unifiedWalletService.ts`
**Lines**: 1445
**Public Methods**: 24
**Dependencies**: 10 services/utils

**Responsibility Breakdown**:

1. **Deposit Operations** (6 methods, ~350 lines):
   - `initialize()` - Starts deposit monitoring
   - `fetchRecentDeposits()` - Poll blockchain
   - `processDeposit()` - Credit user account
   - `getDepositInstructions()` - Generate instructions
   - `claimUnclaimedDeposit()` - Admin claim function
   - `startDepositMonitoring()` - Background polling

2. **Withdrawal Operations** (4 methods, ~300 lines):
   - `processWithdrawal()` - Handle user withdrawal
   - `verifyTransaction()` - Blockchain verification
   - `getWalletAddress()` - Get configured address
   - `getWalletSigner()` - Get signing wallet

3. **Transfer Operations** (4 methods, ~200 lines):
   - `transferToUser()` - Internal transfer
   - `sendToUsername()` - Transfer by username
   - `payBail()` - Jail bail payment
   - `payFine()` - Violation fine payment

4. **Shared Account Operations** (5 methods, ~250 lines):
   - `createSharedAccount()` - New shared wallet
   - `deleteSharedAccount()` - Remove shared wallet
   - `sharedAccountDeposit()` - Deposit to shared
   - `sharedAccountWithdraw()` - Withdraw from shared
   - `sharedAccountTransfer()` - Shared to user transfer

5. **Utilities & Orchestration** (5 methods, ~345 lines):
   - `distributeGiveaway()` - Batch distribution
   - `getUserTransactionHistory()` - Query ledger
   - `reconcileBalances()` - Audit check
   - `initializeSystemUsers()` - Setup
   - Various helpers

---

### 3.2: Target Architecture

**New Structure**:

```
src/services/
├── wallet/
│   ├── depositService.ts       (NEW - 350 lines)
│   ├── withdrawalService.ts    (NEW - 300 lines)
│   ├── transferService.ts      (NEW - 250 lines)
│   └── walletOrchestrator.ts   (NEW - 400 lines)
├── unifiedWalletService.ts     (MODIFIED - becomes thin facade)
├── ledgerService.ts             (UNCHANGED)
├── transactionLock.ts           (UNCHANGED)
└── ...other services...         (UNCHANGED)
```

**Design Principles**:
1. **Single Responsibility** - Each service handles one domain
2. **Backward Compatible** - Existing code continues to work
3. **Gradual Migration** - Can move consumers to new services over time
4. **Orchestrator Pattern** - WalletOrchestrator coordinates between services

---

### 3.3: DepositService Implementation

**File**: `src/services/wallet/depositService.ts` (NEW)

**Responsibilities**:
- Monitor blockchain for deposits
- Process incoming deposits
- Generate deposit instructions
- Handle unclaimed deposits

**Public Interface**:
```typescript
export class DepositService {
  // Initialization
  static async initialize(): Promise<void>
  static startMonitoring(): void
  static stopMonitoring(): void

  // Deposit operations
  static async processDeposit(userId: number, amount: number, txHash: string, fromAddress: string, memo: string): Promise<ProcessResult>
  static async fetchRecentDeposits(fromHeight: number): Promise<Deposit[]>

  // Instructions
  static getInstructions(userId: number): DepositInstructions

  // Unclaimed handling
  static async claimUnclaimed(txHash: string, userId: number): Promise<ClaimResult>
  static async getUnclaimedBalance(): Promise<number>
}
```

**Implementation Plan**:

```typescript
/**
 * src/services/wallet/depositService.ts
 *
 * Handles all deposit-related operations:
 * - Blockchain monitoring for incoming deposits
 * - Deposit processing and crediting
 * - Unclaimed deposit management
 */

import { LedgerService } from '../ledgerService';
import { RPCTransactionVerification } from '../rpcTransactionVerification';
import { DepositInstructionService } from '../depositInstructions';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { query, get, execute } from '../../database';

interface Deposit {
  txHash: string;
  userId: number | null;
  amount: number;
  fromAddress: string;
  memo: string;
  height: number;
  timestamp: number;
}

interface ProcessResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

interface ClaimResult {
  success: boolean;
  amount?: number;
  error?: string;
}

interface DepositInstructions {
  address: string;
  memo: string;
  markdown: string;
}

export const SYSTEM_USER_IDS = {
  BOT_TREASURY: -1,
  SYSTEM_RESERVE: -2,
  UNCLAIMED: -3
};

export class DepositService {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static lastCheckedHeight: number = 0;
  private static walletAddress: string;
  private static isInitialized: boolean = false;

  /**
   * Initialize deposit service
   * Sets up wallet address and last checked height
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('DepositService already initialized');
      return;
    }

    this.walletAddress = config.userFundsAddress || '';

    if (!this.walletAddress) {
      throw new Error('USER_FUNDS_ADDRESS not configured');
    }

    // Get last processed height from database
    const lastProcessed = get<{ height: number }>(
      'SELECT MAX(height) as height FROM processed_deposits'
    );
    this.lastCheckedHeight = lastProcessed?.height || 0;

    logger.info('DepositService initialized', {
      address: this.walletAddress,
      lastCheckedHeight: this.lastCheckedHeight
    });

    this.isInitialized = true;
  }

  /**
   * Start monitoring blockchain for deposits
   * Polls every 30 seconds
   */
  static startMonitoring(): void {
    if (!this.isInitialized) {
      throw new Error('DepositService not initialized');
    }

    if (this.monitoringInterval) {
      logger.warn('Deposit monitoring already running');
      return;
    }

    // Check immediately on start
    this.checkForDeposits();

    // Then check every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkForDeposits();
    }, 30000);

    logger.info('Deposit monitoring started');
  }

  /**
   * Stop monitoring (for graceful shutdown)
   */
  static stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Deposit monitoring stopped');
    }
  }

  /**
   * Check blockchain for new deposits
   * Called by monitoring interval
   */
  private static async checkForDeposits(): Promise<void> {
    try {
      const deposits = await this.fetchRecentDeposits(this.lastCheckedHeight);

      for (const deposit of deposits) {
        // Update last checked height
        if (deposit.height > this.lastCheckedHeight) {
          this.lastCheckedHeight = deposit.height;
        }

        // Check if already processed
        const existing = get<any>(
          'SELECT * FROM processed_deposits WHERE tx_hash = ?',
          [deposit.txHash]
        );

        if (existing && existing.processed) {
          logger.debug('Deposit already processed', { txHash: deposit.txHash });
          continue;
        }

        // Process the deposit
        await this.processDeposit(
          deposit.userId || SYSTEM_USER_IDS.UNCLAIMED,
          deposit.amount,
          deposit.txHash,
          deposit.fromAddress,
          deposit.memo
        );
      }
    } catch (error) {
      logger.error('Error checking for deposits', { error });
    }
  }

  /**
   * Fetch recent deposits from blockchain
   * Uses RPC verification service
   */
  static async fetchRecentDeposits(fromHeight: number): Promise<Deposit[]> {
    try {
      // Implementation would query blockchain via RPC
      // This is extracted from the current UnifiedWalletService
      // ... (copy implementation from current file)

      return [];
    } catch (error) {
      logger.error('Failed to fetch deposits', { error });
      return [];
    }
  }

  /**
   * Process a deposit and credit user account
   * Handles both user deposits and unclaimed deposits
   */
  static async processDeposit(
    userId: number,
    amount: number,
    txHash: string,
    fromAddress: string,
    memo: string
  ): Promise<ProcessResult> {
    try {
      // Credit user via ledger
      const result = await LedgerService.processDeposit(
        userId,
        amount,
        txHash,
        fromAddress,
        `Deposit from ${fromAddress} (memo: ${memo})`
      );

      if (!result.success) {
        // Record failed deposit
        execute(
          `INSERT INTO processed_deposits
           (tx_hash, user_id, amount, from_address, memo, height, processed, error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [txHash, userId, amount, fromAddress, memo, 0, result.error, Math.floor(Date.now() / 1000)]
        );

        return { success: false, error: result.error };
      }

      // Record successful deposit
      execute(
        `INSERT INTO processed_deposits
         (tx_hash, user_id, amount, from_address, memo, height, processed, processed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [txHash, userId, amount, fromAddress, memo, 0, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)]
      );

      logger.info('Deposit processed', {
        userId,
        amount,
        txHash,
        newBalance: result.newBalance
      });

      return {
        success: true,
        newBalance: result.newBalance
      };
    } catch (error) {
      logger.error('Failed to process deposit', { userId, amount, txHash, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get deposit instructions for a user
   */
  static getInstructions(userId: number): DepositInstructions {
    return {
      address: this.walletAddress,
      memo: userId.toString(),
      markdown: DepositInstructionService.generateInstructions(userId, this.walletAddress)
    };
  }

  /**
   * Claim an unclaimed deposit and assign to user
   * Admin function
   */
  static async claimUnclaimed(txHash: string, userId: number): Promise<ClaimResult> {
    try {
      // Get unclaimed deposit
      const deposit = get<any>(
        'SELECT * FROM processed_deposits WHERE tx_hash = ? AND user_id = ?',
        [txHash, SYSTEM_USER_IDS.UNCLAIMED]
      );

      if (!deposit) {
        return {
          success: false,
          error: 'Unclaimed deposit not found'
        };
      }

      // Transfer from unclaimed to user
      const transferResult = await LedgerService.transferBetweenUsers(
        SYSTEM_USER_IDS.UNCLAIMED,
        userId,
        deposit.amount,
        `Claimed deposit: ${txHash}`
      );

      if (!transferResult.success) {
        return {
          success: false,
          error: transferResult.error
        };
      }

      // Update processed_deposits record
      execute(
        'UPDATE processed_deposits SET user_id = ?, processed_at = ? WHERE tx_hash = ?',
        [userId, Math.floor(Date.now() / 1000), txHash]
      );

      logger.info('Unclaimed deposit claimed', {
        txHash,
        userId,
        amount: deposit.amount
      });

      return {
        success: true,
        amount: deposit.amount
      };
    } catch (error) {
      logger.error('Failed to claim deposit', { txHash, userId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get total unclaimed balance
   */
  static async getUnclaimedBalance(): Promise<number> {
    return await LedgerService.getUserBalance(SYSTEM_USER_IDS.UNCLAIMED);
  }
}
```

**Migration from UnifiedWalletService**:

Extract these methods from `unifiedWalletService.ts`:
1. `fetchRecentDeposits()` → Copy to `DepositService.fetchRecentDeposits()`
2. `processDeposit()` → Refactor into `DepositService.processDeposit()`
3. `startDepositMonitoring()` → Move to `DepositService.startMonitoring()`
4. `getDepositInstructions()` → Simplify to `DepositService.getInstructions()`
5. `claimUnclaimedDeposit()` → Move to `DepositService.claimUnclaimed()`

---

### 3.4: WithdrawalService Implementation

**File**: `src/services/wallet/withdrawalService.ts` (NEW)

**Responsibilities**:
- Process withdrawal requests
- Verify transactions
- Manage withdrawal locking

**Public Interface**:
```typescript
export class WithdrawalService {
  // Initialization
  static async initialize(): Promise<void>

  // Withdrawal operations
  static async processWithdrawal(userId: number, amount: number, toAddress: string): Promise<WithdrawalResult>
  static async verifyTransaction(txHash: string): Promise<VerificationResult>

  // Configuration
  static getWalletAddress(): string
}
```

**Implementation Outline**:
```typescript
/**
 * src/services/wallet/withdrawalService.ts
 *
 * Handles withdrawal operations:
 * - User withdrawal requests
 * - Transaction signing and broadcasting
 * - Verification of completed withdrawals
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { LedgerService } from '../ledgerService';
import { TransactionLockService } from '../transactionLock';
import { config } from '../../config';
import { logger } from '../../utils/logger';

interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface VerificationResult {
  verified: boolean;
  amount?: number;
  recipient?: string;
  error?: string;
}

export class WithdrawalService {
  private static wallet: DirectSecp256k1HdWallet | null = null;
  private static walletAddress: string;
  private static rpcEndpoint: string;

  static async initialize(): Promise<void> {
    this.rpcEndpoint = config.junoRpcUrl || 'https://rpc.juno.basementnodes.ca';
    this.walletAddress = config.userFundsAddress || '';

    if (!this.walletAddress) {
      throw new Error('USER_FUNDS_ADDRESS not configured');
    }

    // Initialize signing wallet
    if (config.userFundsMnemonic) {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(
        config.userFundsMnemonic,
        { prefix: 'juno' }
      );

      const [account] = await this.wallet.getAccounts();
      if (account.address !== this.walletAddress) {
        logger.warn('Wallet address mismatch', {
          configured: this.walletAddress,
          derived: account.address
        });
      }
    }

    logger.info('WithdrawalService initialized', {
      address: this.walletAddress,
      hasSigningCapability: !!this.wallet
    });
  }

  static async processWithdrawal(
    userId: number,
    amount: number,
    toAddress: string
  ): Promise<WithdrawalResult> {
    // 1. Acquire lock
    const lockResult = await TransactionLockService.lockWithdrawal(
      userId,
      amount,
      toAddress
    );

    if (!lockResult.success) {
      return { success: false, error: lockResult.error };
    }

    try {
      // 2. Verify balance
      const balance = await LedgerService.getUserBalance(userId);
      if (balance < amount) {
        await TransactionLockService.releaseWithdrawalLock(userId, '', true);
        return {
          success: false,
          error: `Insufficient balance: ${balance} < ${amount}`
        };
      }

      // 3. Create and broadcast transaction
      if (!this.wallet) {
        await TransactionLockService.releaseWithdrawalLock(userId, '', true);
        return { success: false, error: 'Wallet not initialized' };
      }

      const client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        this.wallet,
        { gasPrice: GasPrice.fromString('0.025ujuno') }
      );

      const sendMsg = {
        typeUrl: '/cosmos.bank.v1beta1.MsgSend',
        value: {
          fromAddress: this.walletAddress,
          toAddress: toAddress,
          amount: [{ denom: 'ujuno', amount: Math.floor(amount * 1_000_000).toString() }]
        }
      };

      const result = await client.signAndBroadcast(
        this.walletAddress,
        [sendMsg],
        'auto',
        `Withdrawal for user ${userId}`
      );

      if (result.code !== 0) {
        await TransactionLockService.releaseWithdrawalLock(userId, '', true);
        return { success: false, error: `Transaction failed: ${result.rawLog}` };
      }

      // 4. Update ledger
      const ledgerResult = await LedgerService.processWithdrawal(
        userId,
        amount,
        result.transactionHash,
        toAddress,
        `Withdrawal to ${toAddress}`
      );

      if (!ledgerResult.success) {
        await TransactionLockService.releaseWithdrawalLock(userId, result.transactionHash, true);
        return { success: false, error: `Ledger update failed: ${ledgerResult.error}` };
      }

      // 5. Update lock with tx hash
      await TransactionLockService.updateLockWithTxHash(userId, result.transactionHash);

      // 6. Release lock after verification
      await TransactionLockService.releaseWithdrawalLock(userId, result.transactionHash);

      logger.info('Withdrawal processed', {
        userId,
        amount,
        toAddress,
        txHash: result.transactionHash
      });

      return {
        success: true,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Withdrawal failed', { userId, amount, toAddress, error });
      await TransactionLockService.releaseWithdrawalLock(userId, '', true);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async verifyTransaction(txHash: string): Promise<VerificationResult> {
    // Implementation from RPCTransactionVerification
    // ... (extract and adapt)
    return { verified: false };
  }

  static getWalletAddress(): string {
    return this.walletAddress;
  }
}
```

**Migration from UnifiedWalletService**:
1. Extract `processWithdrawal()` → Refactor for `WithdrawalService`
2. Extract `verifyTransaction()` → Move to `WithdrawalService`
3. Extract signing logic → Consolidate in `WithdrawalService`

---

### 3.5: TransferService Implementation

**File**: `src/services/wallet/transferService.ts` (NEW)

**Responsibilities**:
- Internal user-to-user transfers
- Username-based transfers
- Payment operations (bail, fines)

**Public Interface**:
```typescript
export class TransferService {
  // Internal transfers
  static async transfer(fromUserId: number, toUserId: number, amount: number, description: string): Promise<TransferResult>
  static async transferToUsername(fromUserId: number, toUsername: string, amount: number): Promise<TransferResult>

  // Payment operations
  static async payBail(userId: number, amount: number, violationId: number): Promise<PaymentResult>
  static async payFine(userId: number, amount: number, violationId: number, txHash: string): Promise<PaymentResult>
}
```

**Implementation Outline**:
```typescript
/**
 * src/services/wallet/transferService.ts
 *
 * Handles internal transfer operations:
 * - User to user transfers
 * - Payment processing (bail, fines)
 */

import { LedgerService } from '../ledgerService';
import { TransactionLockService } from '../transactionLock';
import { UserService } from '../userService';
import { ViolationService } from '../violationService';
import { logger } from '../../utils/logger';

interface TransferResult {
  success: boolean;
  error?: string;
}

interface PaymentResult {
  success: boolean;
  error?: string;
}

export const BOT_TREASURY_ID = -1;

export class TransferService {
  /**
   * Internal transfer between users
   * Uses transaction locking to prevent race conditions
   */
  static async transfer(
    fromUserId: number,
    toUserId: number,
    amount: number,
    description: string
  ): Promise<TransferResult> {
    try {
      // Acquire locks for both users
      const lockResult = await TransactionLockService.acquireTransferLocks(
        fromUserId,
        toUserId,
        amount
      );

      if (!lockResult.success) {
        return { success: false, error: lockResult.error };
      }

      try {
        // Perform transfer via ledger
        const result = await LedgerService.transferBetweenUsers(
          fromUserId,
          toUserId,
          amount,
          description
        );

        if (!result.success) {
          return { success: false, error: result.error };
        }

        logger.info('Internal transfer completed', {
          fromUserId,
          toUserId,
          amount,
          description
        });

        return { success: true };
      } finally {
        // Always release locks
        await TransactionLockService.releaseTransferLocks(fromUserId, toUserId);
      }
    } catch (error) {
      logger.error('Transfer failed', { fromUserId, toUserId, amount, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer to user by username
   * Resolves username to userId first
   */
  static async transferToUsername(
    fromUserId: number,
    toUsername: string,
    amount: number
  ): Promise<TransferResult> {
    try {
      // Resolve username
      const toUserId = await UserService.getUserIdByUsername(toUsername);

      if (!toUserId) {
        return {
          success: false,
          error: `User not found: ${toUsername}`
        };
      }

      // Perform transfer
      return await this.transfer(
        fromUserId,
        toUserId,
        amount,
        `Transfer to @${toUsername}`
      );
    } catch (error) {
      logger.error('Username transfer failed', { fromUserId, toUsername, amount, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Pay bail amount
   * Transfers from user to bot treasury
   */
  static async payBail(
    userId: number,
    amount: number,
    violationId: number
  ): Promise<PaymentResult> {
    try {
      // Transfer to bot treasury
      const result = await this.transfer(
        userId,
        BOT_TREASURY_ID,
        amount,
        `Bail payment for violation ${violationId}`
      );

      if (!result.success) {
        return result;
      }

      // Mark violation as paid
      await ViolationService.markViolationPaid(violationId, userId, null);

      logger.info('Bail paid', { userId, amount, violationId });

      return { success: true };
    } catch (error) {
      logger.error('Bail payment failed', { userId, amount, violationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Pay fine with blockchain transaction
   * Verifies transaction first, then marks as paid
   */
  static async payFine(
    userId: number,
    amount: number,
    violationId: number,
    txHash: string
  ): Promise<PaymentResult> {
    try {
      // Transaction already verified by caller
      // Mark violation as paid
      await ViolationService.markViolationPaid(violationId, userId, txHash);

      logger.info('Fine paid', { userId, amount, violationId, txHash });

      return { success: true };
    } catch (error) {
      logger.error('Fine payment failed', { userId, amount, violationId, txHash, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

**Migration from UnifiedWalletService**:
1. Extract `transferToUser()` → Become `TransferService.transfer()`
2. Extract `sendToUsername()` → Become `TransferService.transferToUsername()`
3. Extract `payBail()` → Move to `TransferService.payBail()`
4. Extract `payFine()` → Move to `TransferService.payFine()`

---

### 3.6: WalletOrchestrator Implementation

**File**: `src/services/wallet/walletOrchestrator.ts` (NEW)

**Responsibilities**:
- Coordinate between deposit, withdrawal, and transfer services
- Handle giveaway distribution (uses multiple services)
- Provide unified initialization
- Balance reconciliation

**Implementation Outline**:
```typescript
/**
 * src/services/wallet/walletOrchestrator.ts
 *
 * Coordinates wallet operations across multiple services
 */

import { DepositService } from './depositService';
import { WithdrawalService } from './withdrawalService';
import { TransferService } from './transferService';
import { LedgerService } from '../ledgerService';
import { logger } from '../../utils/logger';

export class WalletOrchestrator {
  /**
   * Initialize all wallet services
   */
  static async initialize(): Promise<void> {
    logger.info('Initializing wallet services...');

    await DepositService.initialize();
    await WithdrawalService.initialize();

    // Start deposit monitoring
    DepositService.startMonitoring();

    logger.info('Wallet services initialized');
  }

  /**
   * Distribute giveaway to multiple users
   * Handles batch distribution with error handling
   */
  static async distributeGiveaway(
    recipients: Array<{ userId: number; amount: number }>,
    sourceUserId: number,
    description: string
  ): Promise<{ success: boolean; distributed: number; failed: number; errors: string[] }> {
    let distributed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        const result = await TransferService.transfer(
          sourceUserId,
          recipient.userId,
          recipient.amount,
          `${description} - giveaway distribution`
        );

        if (result.success) {
          distributed++;
        } else {
          failed++;
          errors.push(`User ${recipient.userId}: ${result.error}`);
        }
      } catch (error) {
        failed++;
        errors.push(`User ${recipient.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info('Giveaway distribution complete', {
      total: recipients.length,
      distributed,
      failed,
      sourceUserId
    });

    return {
      success: distributed > 0,
      distributed,
      failed,
      errors
    };
  }

  /**
   * Graceful shutdown
   */
  static async shutdown(): Promise<void> {
    logger.info('Shutting down wallet services...');
    DepositService.stopMonitoring();
    logger.info('Wallet services shut down');
  }
}
```

---

### 3.7: UnifiedWalletService Facade (Backward Compatibility)

**File**: `src/services/unifiedWalletService.ts` (MODIFIED)

Transform into a thin facade that delegates to new services:

```typescript
/**
 * src/services/unifiedWalletService.ts
 *
 * FACADE LAYER - Maintains backward compatibility
 * Delegates to specialized services
 *
 * NEW CODE SHOULD USE:
 * - DepositService for deposits
 * - WithdrawalService for withdrawals
 * - TransferService for transfers
 * - WalletOrchestrator for coordination
 */

import { DepositService } from './wallet/depositService';
import { WithdrawalService } from './wallet/withdrawalService';
import { TransferService } from './wallet/transferService';
import { WalletOrchestrator } from './wallet/walletOrchestrator';
import { LedgerService } from './ledgerService';

// Re-export system user IDs for backward compatibility
export { SYSTEM_USER_IDS } from './wallet/depositService';

/**
 * DEPRECATED: Use WalletOrchestrator instead
 * Maintained for backward compatibility
 */
export class UnifiedWalletService {
  /**
   * @deprecated Use WalletOrchestrator.initialize()
   */
  static async initialize(): Promise<void> {
    return WalletOrchestrator.initialize();
  }

  /**
   * @deprecated Use DepositService.getInstructions()
   */
  static getDepositInstructions(userId: number) {
    return DepositService.getInstructions(userId);
  }

  /**
   * @deprecated Use WithdrawalService.processWithdrawal()
   */
  static async processWithdrawal(userId: number, amount: number, toAddress: string) {
    return WithdrawalService.processWithdrawal(userId, amount, toAddress);
  }

  /**
   * @deprecated Use TransferService.transfer()
   */
  static async transferToUser(fromUserId: number, toUserId: number, amount: number, description: string) {
    return TransferService.transfer(fromUserId, toUserId, amount, description);
  }

  /**
   * @deprecated Use TransferService.transferToUsername()
   */
  static async sendToUsername(fromUserId: number, toUsername: string, amount: number) {
    return TransferService.transferToUsername(fromUserId, toUsername, amount);
  }

  /**
   * @deprecated Use TransferService.payBail()
   */
  static async payBail(userId: number, amount: number, violationId: number) {
    return TransferService.payBail(userId, amount, violationId);
  }

  /**
   * @deprecated Use WalletOrchestrator.distributeGiveaway()
   */
  static async distributeGiveaway(recipients: any[], sourceUserId: number, description: string) {
    return WalletOrchestrator.distributeGiveaway(recipients, sourceUserId, description);
  }

  /**
   * @deprecated Use DepositService.claimUnclaimed()
   */
  static async claimUnclaimedDeposit(txHash: string, userId: number) {
    return DepositService.claimUnclaimed(txHash, userId);
  }

  /**
   * @deprecated Use LedgerService.getTxHistory() directly
   */
  static getTxHistory(userId: number, limit?: number) {
    return LedgerService.getTxHistory(userId, limit);
  }

  // ... Add facades for all other public methods
}
```

---

### 3.8: Phase 3 Execution Plan

**Step-by-Step Implementation**:

```bash
# Step 1: Create wallet directory
mkdir -p src/services/wallet

# Step 2: Implement DepositService
# - Copy relevant code from UnifiedWalletService
# - Refactor into clean DepositService interface
# - Test deposit monitoring still works

# Step 3: Implement WithdrawalService
# - Extract withdrawal logic
# - Ensure transaction signing works
# - Test withdrawal flow

# Step 4: Implement TransferService
# - Extract transfer operations
# - Test internal transfers
# - Test payment operations

# Step 5: Implement WalletOrchestrator
# - Coordinate initialization
# - Handle giveaway distribution
# - Test composite operations

# Step 6: Convert UnifiedWalletService to facade
# - Replace implementations with delegation
# - Maintain exact same public interface
# - Mark methods as deprecated

# Step 7: Update bot.ts initialization
# Change:
await UnifiedWalletService.initialize();

# To:
await WalletOrchestrator.initialize();

# Step 8: Build and test
yarn build
# Must pass

# Step 9: Test bot startup
yarn dev
# Should start and run normally

# Step 10: Gradually migrate consumers (future work)
# Example: Update commands/wallet.ts to use WithdrawalService directly
# This is optional and can be done over time
```

**Verification Checklist**:
- [ ] All 4 new service files created
- [ ] UnifiedWalletService converted to facade
- [ ] All existing tests pass
- [ ] Bot starts successfully
- [ ] Deposits still get monitored
- [ ] Withdrawals still work
- [ ] Internal transfers still work
- [ ] No breaking changes to external behavior
- [ ] `yarn build` passes
- [ ] Git commit: "Phase 3: Split UnifiedWalletService into focused services"

**Rollback Plan**:
```bash
# If Phase 3 fails, delete new directory and revert facade:
rm -rf src/services/wallet/
git checkout src/services/unifiedWalletService.ts
git checkout src/bot.ts
yarn build
```

---

## PHASE 4: ADDITIONAL IMPROVEMENTS (Priority: LOW, Risk: LOW)

### Overview

Minor improvements to other files with moderate comment bloat.

**Estimated Time**: 1-2 hours
**Files Affected**: 5-6 utility files
**Build Breaking**: No
**Rollback Difficulty**: Easy

---

### 4.1: Trim utils/roles.ts (50% comments, 82 lines)

**File**: `src/utils/roles.ts`

**Current State**:
```typescript
/**
 * @module utils/roles
 * @description Role checking and authorization utilities.
 * Provides functions to verify user roles and permissions for command access control.
 */

/**
 * Checks if a user is the group owner.
 * Queries the database to verify the user's role is 'owner'.
 *
 * @param userId - Telegram user ID to check
 * @returns True if user is owner, false otherwise
 *
 * @example
 * ```typescript
 * if (isGroupOwner(123456)) {
 *   console.log('User is the owner');
 * }
 * ```
 */
export function isGroupOwner(userId: number): boolean {
```

**Target State**:
```typescript
/** Role checking and authorization utilities */

/** Check if user is group owner */
export function isGroupOwner(userId: number): boolean {
```

**Execution**:
```bash
# Read file
cat src/utils/roles.ts

# Trim all excessive JSDoc comments
# Keep only one-line /** comments for each function
# Remove @param, @returns, @example sections

# Build
yarn build
```

---

### 4.2: Trim utils/commandHelper.ts (50% comments, 207 lines)

**Similar approach**: Remove excessive JSDoc, keep concise one-liners

---

### 4.3: Trim utils/userResolver.ts (45% comments, 123 lines)

**Similar approach**: Simplify documentation

---

### 4.4: Trim services/violationService.ts (45% comments, 176 lines)

**Similar approach**: Keep technical details, remove obvious descriptions

---

### 4.5: Trim services/userService.ts (45% comments, 245 lines)

**Similar approach**: Reduce verbosity while maintaining clarity

---

## TESTING STRATEGY

### After Each Phase

**Build Test**:
```bash
yarn build
# Must complete with exit code 0
```

**Lint Test** (if configured):
```bash
yarn lint
# Should pass or show only pre-existing issues
```

**Startup Test**:
```bash
# Start bot in development mode
yarn dev

# Verify in logs:
# - "Database initialized"
# - "Wallet services initialized" (after Phase 3)
# - "Deposit monitoring started"
# - "Bot launched successfully"

# Ctrl+C to stop
```

**Functional Tests** (manual):
1. `/help` command should work
2. `/balance` should show user balance
3. `/deposit` should show instructions with warning
4. `/withdraw` should process (if test funds available)
5. Admin commands should still require proper roles

---

## ROLLBACK PROCEDURES

### If Phase 2 Breaks

```bash
# Revert all function renames
git log --oneline -10
# Find commit before Phase 2 started

git reset --hard <commit-hash>
yarn build
```

### If Phase 3 Breaks

```bash
# Remove new services
rm -rf src/services/wallet/

# Revert facade changes
git checkout src/services/unifiedWalletService.ts
git checkout src/bot.ts

# Rebuild
yarn build
```

### If Phase 4 Breaks

```bash
# Revert individual file
git checkout src/utils/<filename>.ts

# Or revert all Phase 4
git log --oneline -5
git reset --hard <commit-before-phase-4>
```

---

## SUCCESS CRITERIA

### Phase 2 Complete
- [ ] 6 functions renamed
- [ ] Average 44% name length reduction
- [ ] All grep searches for old names return no results
- [ ] Build passes
- [ ] Bot starts successfully

### Phase 3 Complete
- [ ] 4 new service files created
- [ ] UnifiedWalletService is thin facade (<200 lines)
- [ ] No change to external behavior
- [ ] Build passes
- [ ] Deposit monitoring works
- [ ] All wallet operations work

### Phase 4 Complete
- [ ] 5 utility files trimmed
- [ ] ~100 lines removed
- [ ] Build passes
- [ ] All functions still clear

### Overall Success
- [ ] Codebase reduced by ~500 lines total
- [ ] Function names 44% shorter on average
- [ ] God object split into 4 focused services
- [ ] Zero breaking changes
- [ ] All tests pass (if any exist)
- [ ] Bot operates normally

---

## POST-REFACTORING TASKS

### Immediate (Do After Completion)

1. **Update CLAUDE.md**:
   - Document new service structure
   - Update architecture section
   - Add migration guide for new code

2. **Create Migration Guide**:
   - Document old → new service mappings
   - Provide examples of using new services
   - List deprecated methods

3. **Update README** (if exists):
   - Mention new architecture
   - Update any code examples

### Future (Optional)

1. **Add Unit Tests**:
   - AmountPrecision (critical financial code)
   - DepositService
   - WithdrawalService
   - TransferService

2. **Migrate Consumers**:
   - Update commands/wallet.ts to use new services
   - Update handlers/wallet.ts
   - Update commands/deposit.ts
   - Remove facade layer once all consumers migrated

3. **Add Integration Tests**:
   - Test full deposit flow
   - Test full withdrawal flow
   - Test transfer operations

4. **Performance Optimization**:
   - Profile deposit monitoring
   - Optimize database queries
   - Cache frequently accessed data

---

## RISK MITIGATION

### High Risk Areas

1. **Transaction Locking** (Phase 3):
   - Risk: Race conditions if locking logic breaks
   - Mitigation: Extensive testing of concurrent operations
   - Fallback: Revert to monolithic service

2. **Deposit Monitoring** (Phase 3):
   - Risk: Deposits not detected after refactor
   - Mitigation: Test in development environment first
   - Fallback: Quick rollback to working version

3. **Function Renaming** (Phase 2):
   - Risk: Missing call sites cause runtime errors
   - Mitigation: Comprehensive grep before/after
   - Fallback: Git revert individual commits

### Medium Risk Areas

1. **Comment Removal** (All Phases):
   - Risk: Removing important documentation
   - Mitigation: Review each comment before deletion
   - Fallback: Easy to restore from git

2. **Import Path Changes** (Phase 3):
   - Risk: Broken imports if paths wrong
   - Mitigation: TypeScript catches at build time
   - Fallback: Fix imports before committing

### Low Risk Areas

1. **JSDoc Updates**: Easily fixed if issues arise
2. **Variable Renames**: TypeScript ensures safety
3. **File Organization**: No behavior changes

---

## ESTIMATED TIMELINE

### Phase 2: Function Name Shortening
- **Preparation**: 30 minutes (read code, plan renames)
- **Execution**: 1.5 hours (rename + update call sites)
- **Testing**: 30 minutes (build, test, verify)
- **Total**: 2-3 hours

### Phase 3: God Object Refactoring
- **Preparation**: 1 hour (understand current architecture)
- **Deposit Service**: 1.5 hours (implement + test)
- **Withdrawal Service**: 1.5 hours (implement + test)
- **Transfer Service**: 1 hour (simpler, less code)
- **Orchestrator**: 1 hour (coordination logic)
- **Facade Conversion**: 1 hour (delegate calls)
- **Testing**: 1.5 hours (comprehensive testing)
- **Total**: 6-8 hours

### Phase 4: Additional Improvements
- **File Trimming**: 1-2 hours (5-6 files)
- **Total**: 1-2 hours

### Overall Timeline
- **Phases 2-4**: 10-13 hours total
- **Documentation**: 1-2 hours
- **Buffer for Issues**: 2-3 hours
- **Grand Total**: 13-18 hours

### Recommended Schedule

**Day 1** (4 hours):
- Complete Phase 2 (function renaming)
- Start Phase 3 (DepositService)

**Day 2** (4 hours):
- Continue Phase 3 (WithdrawalService, TransferService)

**Day 3** (4 hours):
- Complete Phase 3 (Orchestrator, facade)
- Testing

**Day 4** (2 hours):
- Phase 4 (comment trimming)
- Documentation updates
- Final verification

---

## COMMUNICATION PLAN

### Before Starting
- [ ] Backup database: `cp data/bot.db data/bot.db.backup`
- [ ] Ensure git is clean: `git status`
- [ ] Create feature branch: `git checkout -b refactor/god-object-split`
- [ ] Inform team: "Starting major refactoring, code freeze"

### During Execution
- [ ] Commit after each function rename (Phase 2)
- [ ] Commit after each service created (Phase 3)
- [ ] Commit after file trimming (Phase 4)
- [ ] Push to remote frequently for backup

### After Completion
- [ ] Merge to main via PR
- [ ] Deploy to test environment first
- [ ] Monitor for 24 hours
- [ ] Deploy to production
- [ ] Update team: "Refactoring complete, code freeze lifted"

---

## APPENDIX A: GREP COMMANDS REFERENCE

```bash
# Find function definition
grep -n "functionName" src/services/filename.ts

# Find all call sites
grep -rn "functionName" src/

# Find excluding specific file
grep -r "functionName" src/ --exclude="filename.ts"

# Find with context
grep -rn "functionName" src/ -B 2 -A 2

# Count occurrences
grep -r "functionName" src/ | wc -l

# Verify removal
grep -r "oldFunctionName" src/
# Should return: no results
```

---

## APPENDIX B: GIT COMMANDS REFERENCE

```bash
# Create feature branch
git checkout -b refactor/improvements

# Check status
git status

# Stage changes
git add src/services/filename.ts

# Commit with message
git commit -m "Rename function X → Y"

# View recent commits
git log --oneline -10

# Revert last commit
git reset --hard HEAD~1

# Revert specific file
git checkout HEAD -- src/services/filename.ts

# Push branch
git push origin refactor/improvements

# Create PR (via GitHub CLI)
gh pr create --title "Major Refactoring" --body "See REFACTORING_PLAN.md"
```

---

## APPENDIX C: BUILD COMMANDS REFERENCE

```bash
# Clean build
yarn clean && yarn build

# Build with verbose output
yarn build --verbose

# Watch mode (for development)
yarn build --watch

# Type check only (no emit)
yarn tsc --noEmit

# Lint
yarn lint

# Format code
yarn format

# Full validation
yarn validate
```

---

## FINAL NOTES

This refactoring plan is comprehensive and verbose by design. Each section can be executed independently, and all steps include verification and rollback procedures.

**Key Principles**:
1. **Safety First**: Every change can be reverted
2. **Incremental Progress**: Small commits, frequent testing
3. **Backward Compatible**: No breaking changes
4. **Well Documented**: Future maintainers can understand changes

**When to Pause**:
- If build breaks and cause is unclear
- If bot behavior changes unexpectedly
- If tests start failing
- If uncertain about any step

**When to Continue**:
- Build passes after each change
- Bot starts and runs normally
- All verifications pass
- Clear understanding of current step

Good luck with the refactoring! Each phase builds on the previous, and the entire process is designed to be safe and reversible.

---

**END OF DOCUMENT**
