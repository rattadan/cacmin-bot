# Internal Ledger System Documentation

## Overview

The CAC Admin Bot uses an internal ledger system to manage user balances and transactions. This system replaces the previous HD wallet approach where each user had their own on-chain wallet. Instead, all user funds are managed through two main system wallets with an internal database tracking individual balances.

## Architecture

### System Wallets

1. **Bot Treasury Wallet** (`BOT_TREASURY_ADDRESS`)
   - Collects fines and penalties
   - Distributes giveaways and rewards
   - Controlled by bot administrators

2. **User Funds Wallet** (`USER_FUNDS_ADDRESS`)
   - Holds all user deposits collectively
   - Processes withdrawals to external wallets
   - Requires mnemonic for signing transactions

### Database Tables

#### `user_balances`
Tracks the current balance for each user:
- `user_id`: Telegram user ID (primary key)
- `balance`: Current JUNO balance
- `last_updated`: Timestamp of last balance change
- `created_at`: When the balance entry was created

#### `transactions`
Complete audit trail of all transactions:
- `id`: Auto-incrementing transaction ID
- `transaction_type`: deposit, withdrawal, transfer, fine, bail, giveaway, refund
- `from_user_id`: Sender's user ID (for transfers/payments)
- `to_user_id`: Recipient's user ID (for transfers/deposits)
- `amount`: Transaction amount in JUNO
- `balance_after`: User's balance after transaction
- `description`: Human-readable description
- `tx_hash`: On-chain transaction hash (for deposits/withdrawals)
- `external_address`: External wallet address (for deposits/withdrawals)
- `status`: pending, completed, failed
- `created_at`: Transaction timestamp
- `metadata`: JSON field for additional data

#### `user_locks`
Prevents double-spending during withdrawals:
- `user_id`: User being locked
- `lock_type`: Type of lock (withdrawal, transfer)
- `locked_at`: When the lock was acquired
- `expires_at`: When the lock expires (120 seconds)
- `metadata`: Additional lock information

#### `processed_deposits`
Tracks processed deposits to prevent double-crediting:
- `tx_hash`: Transaction hash (primary key)
- `processed_at`: When the deposit was processed

## User Flow

### Depositing Funds

1. User requests deposit instructions: `/deposit`
2. Bot provides the user funds wallet address and unique memo (user's Telegram ID)
3. User sends JUNO to the address with their user ID as the memo
4. Deposit monitor checks for new transactions every minute
5. When a matching deposit is found (correct memo), the user's balance is credited
6. User receives notification of successful deposit

**Important**: The memo (user ID) is permanent and never changes for each user.

### Withdrawing Funds

The withdrawal process implements strict security measures:

1. **User initiates withdrawal**: `/withdraw <amount> <juno_address>`
2. **Lock acquisition**: User is locked from other transactions
3. **Balance verification**: System confirms sufficient balance
4. **Pre-transaction snapshot**: Current on-chain balance is recorded
5. **Ledger update**: User's internal balance is decreased
6. **On-chain transaction**: Tokens sent from user funds wallet
7. **Transaction verification**: Confirms tx.code === 0 (success)
8. **Balance reconciliation**: Verifies expected balance change
9. **Lock release**: User can transact again
10. **Confirmation**: User receives tx hash and new balance

If any step fails, the user's balance is automatically refunded and the lock is released.

### Internal Transfers

Transfers between users are instant and free:

1. User initiates transfer: `/send <amount> @username`
2. System verifies sender has sufficient balance
3. Sender's balance is decreased
4. Recipient's balance is increased
5. Transaction is recorded in the ledger
6. Both users receive confirmation

### External Transfers

Sending to external wallets follows the withdrawal flow:

1. User initiates: `/send <amount> juno1...`
2. Same secure withdrawal process is followed
3. Network fees are paid from the user funds wallet

## Security Features

### Transaction Locking

- Users are locked during withdrawals to prevent double-spending
- Locks expire after 120 seconds (failsafe)
- Lock status can be checked before any financial operation
- Emergency admin command to release all locks if needed

### Balance Verification

- Pre and post-transaction on-chain balances are compared
- Expected vs actual differences are logged
- Automatic refunds on failed transactions
- Reconciliation tools to verify ledger matches on-chain

### Deposit Security

- Only deposits with correct memo are credited
- Transaction hashes are tracked to prevent double-processing
- 30-day retention of processed deposit records
- Manual verification available via `/checkdeposit <tx_hash>`

## Commands

### User Commands

- `/balance` - Check your internal balance
- `/deposit` - Get deposit instructions
- `/withdraw <amount> <address>` - Withdraw to external wallet
- `/send <amount> <recipient>` - Send to user or external wallet
- `/transactions` - View transaction history
- `/checkdeposit <tx_hash>` - Verify a specific deposit

### Admin Commands

- `/walletstats` - View system statistics and reconciliation
- `/giveaway <amount> <@user1> <@user2>...` - Distribute tokens

## Configuration

Required environment variables:

```env
# System wallet addresses
BOT_TREASURY_ADDRESS=juno1...
USER_FUNDS_ADDRESS=juno1...

# Mnemonic for user funds wallet (for withdrawals)
USER_FUNDS_MNEMONIC=word1 word2 ... word24

# Network endpoints
JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
JUNO_API_URL=https://api.juno.basementnodes.ca
```

## Monitoring and Maintenance

### Automatic Processes

- **Deposit monitoring**: Runs every 60 seconds
- **Lock cleanup**: Expired locks cleared every 60 seconds
- **Deposit record cleanup**: Old records purged daily

### Manual Reconciliation

Administrators can verify system integrity:

1. Check `/walletstats` for balance comparison
2. Internal ledger total should match user funds wallet balance
3. Investigate any discrepancies in transaction logs

### Backup Recommendations

1. Regular database backups (contains all balances and history)
2. Secure storage of wallet mnemonics
3. Transaction log retention for audit purposes

## Migration from HD Wallets

If migrating from the old HD wallet system:

1. Users must withdraw from old individual wallets
2. Deposit to new system using their user ID as memo
3. Old wallet addresses are retained for reference only
4. No automatic migration of balances

## Troubleshooting

### Common Issues

**Deposit not credited:**
- Verify correct memo (user ID) was used
- Check transaction on-chain
- Use `/checkdeposit <tx_hash>` to manually process

**Withdrawal stuck:**
- Check if user is locked: admin can view active locks
- Locks auto-expire after 120 seconds
- Emergency unlock available to admins

**Balance mismatch:**
- Run reconciliation via `/walletstats`
- Check recent transactions for failures
- Review refund transactions in database

### Error Recovery

All withdrawal failures trigger automatic refunds:
- Transaction failures
- Network errors
- Insufficient wallet balance
- Invalid addresses

The system prioritizes user fund safety over transaction speed.