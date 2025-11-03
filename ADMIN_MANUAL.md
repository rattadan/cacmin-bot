# CAC Admin Bot - Owner & Admin Manual

## Overview

CAC Admin Bot is a Telegram moderation bot with integrated wallet system for the Cosmos Airdrops Chat group. It manages user roles, restrictions, jailing, and an internal JUNO token ledger.

## Core Systems

### 1. Role Hierarchy
- **Owner** - Full system control, can promote admins, access all commands
- **Admin** - Moderation powers, treasury management, role assignment (elevated only)
- **Elevated** - View privileges, create shared accounts, no role assignment
- **Pleb** - Default user role

### 2. Internal Ledger System
- Users have internal JUNO balances tracked in database
- Separate from on-chain treasury wallet
- Supports deposits, withdrawals, transfers, fines, bail payments
- All transactions logged with tx_hash for verification

### 3. Treasury System
- **Bot Treasury**: On-chain wallet receiving deposits (`BOT_TREASURY_ADDRESS`)
- **Internal Ledger**: Database tracking user balances
- Treasury backs user withdrawals - must maintain sufficient on-chain balance

## Essential Operations

### Role Management

**Configure owners/admins in .env:**
```bash
OWNER_ID=1705203106,987654321  # Comma-separated
ADMIN_ID=123456789,456789123   # Comma-separated
```

**Promote users:**
```
/grantowner @username      # Grant owner privileges
/makeadmin @username       # Promote to admin
/elevate @username         # Grant elevated privileges
/revoke @username          # Demote to pleb
```

### Deposit Management

**User deposits JUNO:**
1. User runs `/deposit` - gets treasury address and unique memo (their user ID)
2. User sends JUNO on-chain with memo
3. Bot auto-detects and credits (checks every 30 seconds)

**Manual processing (if auto-detection fails):**
```
/checktx <tx_hash>                    # Check deposit status
/processdeposit <tx_hash>             # Process pending deposit (uses memo)
/claimdeposit <tx_hash> <userId>      # Assign unclaimed deposit
/unclaimeddeposits                    # View all unclaimed
```

### Treasury Monitoring

```
/botbalance          # Check on-chain treasury balance
/treasury            # View treasury + ledger status
/walletstats         # Detailed system statistics
/reconcile           # Check ledger vs treasury balance
```

### Moderation

**Jail users (temporary mute):**
```
/jail @user 30                # Jail for 30 minutes
/jail 123456 60               # Jail by user ID
/unjail @user                 # Release from jail
```

**Fines and bail:**
- System calculates bail amount based on jail duration
- Users pay bail from internal balance via `/paybail`
- Admins can view unpaid fines, jail statistics

**Restrictions:**
```
/addrestriction <userId> no_stickers <until>   # Block stickers
/addrestriction <userId> no_urls <until>       # Block URLs
/removerestriction <userId> no_stickers        # Remove restriction
```

### User Management

```
/transactions <userId>         # View any user's transactions (owner)
/giveaway @user 10.5          # Credit JUNO to user balance
/clearviolations <userId>     # Clear user violations (owner)
```

### Shared Accounts

**Create shared wallet:**
```
/createshared treasury_pool "Treasury Pool" "Admin shared funds"
```

**Grant access:**
```
/grantaccess treasury_pool @user view     # View only
/grantaccess treasury_pool @user spend    # Can send funds
/grantaccess treasury_pool @user admin    # Full control
```

**Use shared account:**
```
/sharedbalance treasury_pool
/sharedsend treasury_pool 5 @recipient
/sharedhistory treasury_pool
```

## Common Workflows

### Adding New Admin
1. Ensure they've interacted with bot (or know their user ID)
2. `/makeadmin @username` or `/makeadmin 123456789`
3. They can now use admin commands

### Handling Stuck Deposit
1. User reports deposit not credited
2. `/checktx <tx_hash>` - verify it exists and see status
3. If "Pending processing": `/processdeposit <tx_hash>`
4. If memo missing: `/claimdeposit <tx_hash> <userId>`
5. Verify credit: `/transactions <userId>`

### Monthly Treasury Reconciliation
1. `/reconcile` - check ledger matches expectations
2. `/treasury` - view total user balances vs on-chain funds
3. Ensure treasury balance > total user balances (for withdrawals)
4. `/walletstats` - detailed breakdown

### Investigating User Issues
1. `/transactions <userId>` - view their transaction history
2. Check for failed transactions, pending withdrawals
3. Verify balances make sense
4. Check jail/violation status if restricted

## Database & Configuration

### Key Environment Variables
```bash
BOT_TOKEN=<telegram_bot_token>
OWNER_ID=<comma_separated_owner_ids>
ADMIN_ID=<comma_separated_admin_ids>
BOT_TREASURY_ADDRESS=<juno_address>
JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
DATABASE_PATH=./data/bot.db
```

### Database Location
- SQLite database: `./data/bot.db`
- Contains: users, balances, transactions, deposits, restrictions, jail events
- Backup regularly for disaster recovery

### Transaction Tables
- `transactions` - All ledger transactions (deposits, withdrawals, transfers, fines, bail)
- `processed_deposits` - Tracks on-chain deposits by tx_hash
- `user_balances` - Current balance for each user

## System Checks & Maintenance

### Daily Checks
- `/treasury` - verify treasury status
- `/stats` - check bot statistics
- Monitor logs for errors: `journalctl -u cacmin-bot -f`

### Weekly Checks
- `/reconcile` - ensure ledger integrity
- Review unclaimed deposits: `/unclaimeddeposits`
- Check for stale jails: `/jails`

### Monthly Checks
- Backup database: `cp ./data/bot.db ./data/backup-$(date +%Y%m%d).db`
- Review transaction logs for anomalies
- Verify treasury has adequate on-chain balance

## Troubleshooting

### Bot Not Responding
```bash
systemctl status cacmin-bot
journalctl -u cacmin-bot -n 50
systemctl restart cacmin-bot
```

### Deposit Not Auto-Credited
1. Check deposit monitoring is running (logs show "Deposit monitoring started")
2. Verify tx is confirmed on-chain
3. Check memo matches user ID exactly
4. Manually process: `/processdeposit <tx_hash>`

### User Can't Withdraw
1. Check user balance: `/transactions <userId>`
2. Verify treasury has funds: `/botbalance`
3. Check for transaction locks (auto-clear after timeout)
4. Review logs for withdrawal errors

### Balance Mismatch
1. `/reconcile` - identify discrepancy
2. `/walletstats` - detailed breakdown
3. Review transaction history for anomalies
4. Check for duplicate deposits in `processed_deposits`

## Security Best Practices

1. **Protect .env file** - Never commit to git, restrict file permissions
2. **Backup mnemonic** - Store securely offline, needed for treasury access
3. **Monitor treasury** - Set up alerts for large withdrawals
4. **Audit logs regularly** - Review transaction logs for unauthorized activity
5. **Limit owner/admin access** - Only grant to trusted individuals
6. **Regular database backups** - Before major updates or monthly

## Emergency Procedures

### Suspected Unauthorized Access
1. Stop bot: `systemctl stop cacmin-bot`
2. Review logs: `journalctl -u cacmin-bot -n 1000 > incident.log`
3. Check recent transactions: query database
4. Revoke compromised admin access
5. Rotate bot token if needed

### Database Corruption
1. Stop bot
2. Restore from latest backup: `cp ./data/backup-YYYYMMDD.db ./data/bot.db`
3. Verify integrity: check key tables exist
4. Restart bot
5. Reconcile treasury

### Treasury Drained
1. Check on-chain transactions at explorer
2. Review withdrawal logs
3. If unauthorized: transfer funds to new wallet ASAP
4. Update `BOT_TREASURY_ADDRESS` in .env
5. Migrate user balances to new system

## Support Commands Reference

### Owner Commands
```
/grantowner <@user|userId>              Grant owner privileges
/makeadmin <@user|userId>               Promote to admin
/clearviolations <userId>               Clear all violations
/transactions <userId>                  View user transactions
/processdeposit <tx_hash>               Process pending deposit
/claimdeposit <tx_hash> <userId>        Assign unclaimed deposit
```

### Admin Commands
```
/botbalance                             Check treasury balance
/treasury                               Treasury & ledger status
/giveaway <@user> <amount>              Credit JUNO to user
/walletstats                            Detailed statistics
/reconcile                              Reconcile balances
/jail <@user> <minutes>                 Jail user
/unjail <@user>                         Release from jail
/elevate <@user>                        Grant elevated role
```

### User Commands
```
/balance                                Check balance
/deposit                                Get deposit instructions
/withdraw <amount> <address>            Withdraw JUNO
/send <amount> <@user|address>          Send JUNO
/transactions                           View transaction history
/checktx <tx_hash>                      Check transaction status
/mystatus                               Check jail/fine status
```

## Getting Help

- Check logs: `journalctl -u cacmin-bot -f -o cat`
- View help: `/help` (role-based command reference)
- Review codebase: `src/` directory for implementation details
- Database queries: Use sqlite3 to inspect `./data/bot.db`

---

**Version:** 1.0
**Last Updated:** 2025-11-02
