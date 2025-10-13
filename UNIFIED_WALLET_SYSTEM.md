# Unified Wallet System Documentation

## Overview

The CAC Admin Bot uses a **single-wallet internal ledger system** that simplifies fund management while maintaining complete transaction tracking and security.

## Architecture

### Single Wallet Design
- **One Juno wallet** for all operations
- **Internal ledger** tracks individual balances in SQLite database
- **Bot treasury** is user ID `-1` in the ledger
- **Unclaimed deposits** go to user ID `-3`
- All user-to-user transfers are instant and gas-free (internal only)

### System User IDs
```typescript
SYSTEM_USER_IDS = {
  BOT_TREASURY: -1,    // Bot's internal account (fines, fees)
  SYSTEM_RESERVE: -2,  // Reserved for future use
  UNCLAIMED: -3        // Deposits without valid userId
}
```

## Transaction Flows

### 1. Deposits (On-Chain → Internal)
```
External Wallet → Shared Wallet (with memo: userId) → User Balance
```
- Users send JUNO to the shared wallet address
- **MEMO MUST BE**: User's Telegram ID
- Automatic detection every 30 seconds
- Credits user's internal balance upon confirmation
- Invalid/missing memos go to UNCLAIMED account

### 2. Withdrawals (Internal → On-Chain)
```
User Balance → Verify → Lock → On-Chain Transfer → Update Ledger
```
- Verifies user has sufficient balance
- Acquires transaction lock (prevents double-spending)
- Executes on-chain transfer
- Automatic refund if transaction fails

### 3. Fine Payments (Internal Transfer)
```
User Balance → Bot Treasury (ID: -1)
```
- Simple internal transfer
- No on-chain transaction needed
- Instant and gas-free

### 4. User-to-User Transfers (Internal)
```
Sender Balance → Recipient Balance
```
- Database update only
- No on-chain transaction
- Instant and free

## Configuration

### Environment Variables
```env
# Single wallet address for all operations
USER_FUNDS_ADDRESS=juno1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Mnemonic for signing withdrawals (KEEP SECURE!)
USER_FUNDS_MNEMONIC=word1 word2 ... word24

# Juno network endpoints
JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
JUNO_API_URL=https://api.juno.basementnodes.ca
```

## Database Schema

### Key Tables
1. **user_balances** - Tracks each user's JUNO balance
2. **transactions** - Complete audit trail of all operations
3. **processed_deposits** - Tracks incoming deposits
4. **transaction_locks** - Prevents double-spending

## Security Features

### Transaction Locking
- 60-second lock timeout
- Prevents concurrent withdrawals
- Automatic cleanup of expired locks

### Balance Verification
- Pre and post-transaction balance checks
- Automatic reconciliation with on-chain balance
- Admin alerts for discrepancies > 0.01 JUNO

### Automatic Refunds
Failed withdrawals are automatically refunded to user's internal balance

## Testing Commands (Owner Only)

### Balance Operations
- `/testbalance` - Check your balance and bot treasury
- `/testwalletstats` - View complete system statistics

### Transaction Testing
- `/testdeposit` - Get deposit instructions
- `/testtransfer <userId> <amount>` - Test internal transfer
- `/testfine [amount]` - Test fine payment
- `/testwithdraw <address> <amount>` - Test withdrawal (dry run)

### Verification
- `/testverify <txHash>` - Verify on-chain transaction
- `/testhistory` - View transaction history

### System Testing
- `/testsimulatedeposit [userId] [amount]` - Simulate deposit
- `/testfullflow` - Run complete flow test

## Common Operations

### User Deposits
1. User requests deposit instructions: `/deposit`
2. Bot provides wallet address and unique memo (userId)
3. User sends JUNO with exact memo
4. System auto-detects and credits balance within 30 seconds

### User Withdrawals
1. User requests withdrawal: `/withdraw <address> <amount>`
2. System verifies balance
3. Acquires transaction lock
4. Executes on-chain transfer
5. Updates ledger upon confirmation

### Paying Fines
1. Fine issued to user
2. System checks user balance
3. Internal transfer to bot treasury (ID: -1)
4. No on-chain transaction needed

## Monitoring & Reconciliation

### Automatic Processes
- **Deposit monitoring**: Every 30 seconds
- **Lock cleanup**: Every minute
- **Balance reconciliation**: Every hour
- **Jail expiry check**: Every 5 minutes

### Manual Reconciliation
```bash
# Check system statistics
/testwalletstats

# View unclaimed deposits
/unclaimeddeposits

# Claim unclaimed deposit
/claimdeposit <txHash>
```

## Error Handling

### Deposit Errors
- **No memo**: Funds go to UNCLAIMED account
- **Invalid userId**: Funds go to UNCLAIMED account
- **User not found**: Funds go to UNCLAIMED account

### Withdrawal Errors
- **Insufficient balance**: Transaction rejected
- **Invalid address**: Transaction rejected
- **Network failure**: Automatic refund
- **Transaction failed**: Automatic refund

## Balance Reconciliation

The system maintains consistency between:
1. **On-chain balance**: Actual JUNO in wallet
2. **Internal total**: Sum of all user balances

### Discrepancy Detection
- Automatic checks every hour
- Admin notification if difference > 0.01 JUNO
- Manual reconciliation tools available

## Migration from Dual-Wallet System

If migrating from the old dual-wallet system:
1. Transfer all funds to single wallet
2. Update USER_FUNDS_ADDRESS in .env
3. Bot treasury automatically becomes internal user -1
4. Run `/testwalletstats` to verify migration

## Troubleshooting

### Common Issues

**Deposits not showing**
- Check memo is exactly the userId
- Verify transaction confirmed on-chain
- Check `/testverify <txHash>`

**Withdrawal failed**
- Check balance with `/balance`
- Verify address format (must start with juno1)
- Check for transaction locks

**Balance mismatch**
- Run `/testwalletstats` for diagnostics
- Check pending deposits
- Review recent transactions

## Best Practices

1. **Regular Monitoring**
   - Check `/testwalletstats` daily
   - Monitor unclaimed deposits
   - Review transaction logs

2. **Security**
   - Keep mnemonic secure and encrypted
   - Regular database backups
   - Monitor for unusual activity

3. **User Communication**
   - Clear deposit instructions with exact memo
   - Immediate feedback on transactions
   - Help users claim unclaimed deposits

## Support

For issues or questions:
1. Check transaction history: `/testhistory`
2. Verify system status: `/testwalletstats`
3. Review logs for errors
4. Contact system administrator