# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAC Admin Bot is a production-ready Telegram bot for the Cosmos Airdrops Chat group, built with Telegraf (TypeScript). It provides comprehensive administrative controls including role-based permissions, user restrictions, blacklist management, violation tracking, and a unified wallet system with internal ledger for JUNO token management.

## Technology Stack

- **Runtime**: Node.js 16+ with TypeScript 5.7
- **Framework**: Telegraf 4.16 (Telegram Bot framework)
- **Database**: better-sqlite3 (SQLite3 with synchronous API)
- **Blockchain**: CosmJS (@cosmjs/stargate) for Juno blockchain integration
- **Logging**: Winston for structured logging
- **Task Scheduling**: node-cron for periodic tasks

## Development Commands

### Quick Start
```bash
yarn install              # Install dependencies
yarn setup-db             # Initialize SQLite database schema
yarn migrate:wallet       # Migrate to unified wallet system (if upgrading)
yarn dev                  # Start in development mode with hot reload
```

### Building & Running
```bash
yarn build                # Compile TypeScript to dist/
yarn start                # Run compiled code from dist/ (production)
yarn dev                  # Run with ts-node-dev (development with hot reload)
```

### Rebuild & Deploy Scripts
The project includes a unified rebuild script for easy deployment:

```bash
./rebuild.sh              # Default: clean, build, restart systemd service
./rebuild.sh --dev        # Development: clean, build, run with hot reload
./rebuild.sh --quick      # Skip clean, just build and restart
./rebuild.sh --full       # Full clean including caches, then build
```

Equivalent yarn scripts:
```bash
yarn rebuild              # Default rebuild
yarn rebuild:dev          # Development mode
yarn rebuild:quick        # Quick rebuild
yarn rebuild:full         # Full clean rebuild
```

### Testing & Validation
```bash
yarn test                 # Run Jest test suite
yarn test:watch           # Run tests in watch mode
yarn validate             # Pre-build validation checks
yarn validate:postbuild   # Post-build validation (set BUILD_VALIDATION=true)
```

### Code Quality
```bash
yarn lint                 # Run ESLint on src/**/*.ts
yarn format               # Format code with Prettier
```

### Database Operations
```bash
yarn setup-db             # Initialize/reset database schema
yarn migrate:wallet       # Migrate from old HD wallet to unified wallet
```

## Architecture

### Entry Point & Initialization Sequence
**src/bot.ts**: Main entry point with strict initialization order:
1. Validate environment configuration
2. Initialize SQLite database schema
3. Initialize ledger system (internal accounting)
4. Initialize unified wallet system (includes deposit monitoring)
5. Clean up stale transaction locks from previous session
6. Create Telegraf bot instance
7. Set bot instance for admin notifications
8. Initialize jail service with bot reference
9. Register global middleware (message filters)
10. Register all command handlers
11. Set up periodic cleanup tasks (restrictions, jails, locks, reconciliation)
12. Configure graceful shutdown handlers
13. Launch bot

### Database Layer (src/database.ts)

**SQLite database** at `./data/bot.db` (configurable via DATABASE_PATH env var)

**Core Tables**:
- `users`: User profiles with roles (owner/admin/elevated/pleb), flags, timestamps
- `user_balances`: Internal ledger for JUNO token balances (includes bot treasury as ID -1)
- `transactions`: Complete audit trail of all financial operations
- `system_wallets`: Configuration for wallet addresses
- `rules`: Violation rule definitions
- `violations`: Tracked violations with bail amounts and payment status
- `jail_events`: Log of jail/unjail actions
- `user_restrictions`: Per-user restrictions (stickers, URLs, regex) with optional expiration
- `global_restrictions`: Restrictions applied to all users
- `processed_deposits`: Deduplication tracking for blockchain deposits
- `transaction_locks`: Prevents double-spending during concurrent operations

**Typed Query API**:
```typescript
query<T>(sql, params): T[]           // SELECT queries returning array
get<T>(sql, params): T | undefined   // SELECT single row
execute(sql, params): RunResult      // INSERT/UPDATE/DELETE
```

### Configuration System (src/config.ts)

**Environment-based configuration** via `.env` file (see `.env.example`):

**Required**:
- `BOT_TOKEN`: Telegram bot token from @BotFather
- `OWNER_ID`: Telegram user ID of bot owner
- `USER_FUNDS_ADDRESS`: Shared Juno wallet address for all operations
- `USER_FUNDS_MNEMONIC`: 24-word mnemonic for signing withdrawals

**Optional**:
- `ADMIN_CHAT_ID`: Private chat for admin notifications
- `GROUP_CHAT_ID`: Main group chat ID
- `JUNO_RPC_URL`: Juno RPC endpoint (default: basementnodes.ca)
- `JUNO_API_URL`: Juno API endpoint (default: basementnodes.ca)
- `DATABASE_PATH`: Database file location (default: ./data/bot.db)
- `LOG_LEVEL`: Winston log level (default: info)

Configuration is validated on startup via `validateConfig()`.

### Role System (src/utils/roles.ts, src/handlers/roles.ts)

Four-tier hierarchy with strict permission checks:
1. **owner**: Group creator, full control (set via OWNER_ID env var)
2. **admin**: Promoted by owner, can manage users and restrictions
3. **elevated**: Promoted by owner or elevated admin, can manage bot functions but not assign roles
4. **pleb**: Default role for all users

### Middleware Stack (src/middleware/)

Applied in order:
1. **messageFilterMiddleware** (src/middleware/messageFilter.ts):
   - Auto-creates users in DB
   - Preloads user restrictions into `ctx.state.restrictions`
   - Enforces global and per-user restrictions (stickers, URLs, regex patterns)
   - Handles restriction expirations

2. **commandFilterMiddleware** (src/middleware/commandFilter.ts):
   - Validates command usage and permissions

3. **lockCheckMiddleware** (src/middleware/lockCheck.ts):
   - Checks for active transaction locks
   - Prevents concurrent wallet operations

**Permission Middlewares** (src/middleware/index.ts):
- `ownerOnly`: Restricts to bot owner
- `elevatedAdminOnly`: Owner or admins with elevated role
- `elevatedUserOnly`: Owner or elevated users
- `isElevated`: Owner or elevated role (any level)
- `userManagementMiddleware`: Ensures users exist, loads restrictions

### Command Structure

**src/commands/**: User-facing command implementations
- `help.ts`: `/help` - DM-only comprehensive command listing
- `moderation.ts`: `/warn`, `/mute`, `/unmute`, `/ban`, `/unban`, `/kick`
- `wallet.ts`: `/balance`, `/withdraw`, `/send`, `/receive`
- `walletTest.ts`: Owner-only wallet testing commands
- `deposit.ts`: `/deposit` - Shows deposit instructions
- `payment.ts`: `/paybail` - Pay violation fines
- `jail.ts`: `/jail`, `/unjail` - Temporary restriction system
- `giveaway.ts`: `/giveaway` - Token distribution

**src/handlers/**: Bot administrative handlers (typically DM-only)
- `roles.ts`: `/setowner`, `/elevate`, `/makeadmin`, `/revoke`
- `restrictions.ts`: `/addrestriction`, `/removerestriction`, `/listrestrictions`
- `actions.ts`: `/addaction`, `/removeaction`, `/viewactions` (global restrictions)
- `blacklist.ts`: `/viewblacklist`, `/addblacklist`, `/removeblacklist`
- `violations.ts`: `/violations` - View user violations
- `wallet.ts`: Wallet-related administrative handlers

### Services Layer

**Core Services**:
- **UnifiedWalletService** (src/services/unifiedWalletService.ts):
  - Single wallet with internal ledger system
  - Automatic deposit detection and processing
  - Withdrawal flow with transaction locking
  - Balance reconciliation
  - Integrates LedgerService and DepositMonitor

- **LedgerService** (src/services/ledgerService.ts):
  - Internal accounting system
  - User balances tracked in database
  - Bot treasury as user ID -1
  - Unclaimed deposits as user ID -3
  - Complete transaction history
  - Balance queries and adjustments

- **DepositMonitor** (src/services/depositMonitor.ts):
  - Polls Juno blockchain for incoming deposits
  - Memo-based routing (userId or 'bot')
  - Deduplication via processed_deposits table
  - Notifies users of deposits via Telegram

- **TransactionLockService** (src/services/transactionLock.ts):
  - Prevents double-spending during concurrent operations
  - User-specific locks with expiration
  - Automatic cleanup of stale locks
  - Used for withdrawals and balance modifications

- **JunoService** (src/services/junoService.ts):
  - Blockchain interaction via CosmJS
  - Transaction creation and signing
  - Balance queries
  - Transaction verification

- **UserService** (src/services/userService.ts):
  - User CRUD operations
  - `ensureUserExists()`: Auto-creates users on first interaction
  - Restriction management

- **ViolationService** (src/services/violationService.ts):
  - Violation tracking and bail calculations
  - Payment processing

- **JailService** (src/services/jailService.ts):
  - Temporary user restriction system
  - Automatic expiration with unjail
  - Integration with Telegram chat permissions

- **RestrictionService** (src/services/restrictionService.ts):
  - Restriction enforcement logic
  - Pattern matching for URLs and regex

**Transaction Verification** (src/services/transactionVerification.ts, rpcTransactionVerification.ts):
- Verify blockchain transactions
- Parse memos and amounts
- Fallback between REST API and RPC methods

### Key Implementation Patterns

#### Unified Wallet System

**Architecture**: Single shared wallet with internal double-entry ledger

**Deposit Flow**:
1. User sends JUNO to `USER_FUNDS_ADDRESS` with userId as memo
2. DepositMonitor detects transaction on blockchain
3. LedgerService credits user's internal balance
4. User receives Telegram notification
5. Transaction recorded in audit trail

**Withdrawal Flow**:
1. User requests `/withdraw amount address`
2. TransactionLockService acquires user lock
3. LedgerService verifies sufficient balance
4. JunoService creates and signs transaction
5. Transaction broadcast to blockchain
6. LedgerService debits user balance
7. Lock released, audit trail updated

**Internal Transfers**:
- Instant, fee-free transfers between users
- Pure ledger operations, no blockchain interaction
- Examples: fines (user → bot treasury), tips, payments

**Bot Treasury**: Managed as internal ledger user ID -1
- Receives fines and fees
- Can distribute via giveaways
- Balance tracked separately from user funds

#### Transaction Locking Pattern

Prevents race conditions in concurrent operations:

```typescript
// Acquire lock
const lock = await TransactionLockService.acquireLock(userId, 'withdrawal', 60000);
if (!lock) {
  throw new Error('Transaction already in progress');
}

try {
  // Perform operation
  await performTransaction();
} finally {
  // Always release
  await TransactionLockService.releaseLock(userId);
}
```

#### Restriction System

**Types**:
- `no_stickers`: Block all or specific sticker packs
- `no_urls`: Block all URLs or specific domains
- `regex`: Block messages matching pattern

**Granular Targeting** via `restricted_action` field:
- Sticker pack IDs
- Domain names
- Regex patterns

**Expiration**: `restricted_until` epoch timestamp (NULL = permanent)

**Enforcement Flow**:
1. Message received → `messageFilterMiddleware`
2. User auto-created/updated if not exists
3. Restrictions loaded into `ctx.state.restrictions`
4. Message checked against active restrictions
5. Violation triggers deletion + optional penalty

#### Database Type Safety

Always use typed queries for compile-time safety:

```typescript
const users = query<User>('SELECT * FROM users WHERE id = ?', [userId]);
const user = users[0]; // Properly typed as User

const singleUser = get<User>('SELECT * FROM users WHERE id = ?', [userId]);
if (singleUser) {
  // Type-safe access to user properties
}
```

#### Logging Pattern

Winston-based structured logging:

```typescript
import { logger } from './utils/logger';

logger.info('Operation completed', { userId, amount });
logger.error('Operation failed', error);
logger.debug('Debug information', { data });
```

Log level controlled via `LOG_LEVEL` env var (error, warn, info, debug).

## Testing

**Framework**: Jest with ts-jest for TypeScript support

**Run tests**:
```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode
```

**Test file pattern**: `**/*.test.ts` or `**/*.spec.ts` (currently excluded from compilation)

## Important Implementation Notes

### Wallet Migration
When upgrading from old HD wallet system:
1. Backup database
2. Run `yarn migrate:wallet` to migrate user balances
3. Update `.env` with unified wallet credentials
4. Old `user_wallets` table is deprecated but may exist in older databases

### Periodic Tasks
Bot runs scheduled tasks via node-cron:
- **Restriction expiration**: Every 5 minutes
- **Jail expiration**: Every minute
- **Lock cleanup**: Every 15 minutes
- **Balance reconciliation**: Every hour

### Graceful Shutdown
Bot handles SIGINT and SIGTERM:
1. Stop accepting new commands
2. Complete pending operations
3. Release all locks
4. Close database connections
5. Stop Telegraf bot

### Security Considerations
- `USER_FUNDS_MNEMONIC` controls all funds - keep secure
- Transaction locks prevent double-spending
- Audit trail records all operations
- Balance reconciliation detects discrepancies
- Environment variables never logged

### Systemd Deployment
Bot includes systemd service file: `cacmin-bot.service`
- Auto-restart on failure
- Runs as dedicated user
- Logs to systemd journal

## Additional Documentation

For detailed information on specific subsystems:
- **UNIFIED_WALLET_SYSTEM.md**: Comprehensive wallet system documentation
- **LEDGER_SYSTEM.md**: Internal accounting details
- **WALLET_SETUP.md**: Wallet configuration guide
- **USER_WALLET_GUIDE.md**: User-facing wallet instructions
- **PERMISSIONS.md**: Role and permission details
- **DEPLOYMENT.md**: Production deployment guide
