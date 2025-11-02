# CAC Admin Bot - User Wallet Guide

## Welcome to the Internal Wallet System

The CAC Admin Bot provides an internal wallet system that allows you to hold, send, and manage JUNO tokens directly within Telegram. This guide explains how to use all wallet features.

---

## Automatic Registration

**You are automatically registered when you first interact with the bot.**

The first time you use any command (like `/balance` or `/help`), the bot will:
1. Create your user account in the database
2. Initialize your wallet balance at 0 JUNO
3. Generate your unique deposit memo

No signup required - just start using it!

---

## Basic Commands

### Check Your Balance

```
/balance
```

Shows your current JUNO token balance in the internal ledger.

**Example:**
```
User: /balance
Bot: 💰 Balance for @alice

Current balance: `10.500000 JUNO`
```

---

## Depositing JUNO Tokens

### Get Your Deposit Instructions

```
/deposit
```

The bot will provide you with:
- A deposit address (same for all users)
- **Your unique memo** (your Telegram user ID)

**CRITICAL:** You must include YOUR unique memo with every deposit, or the tokens cannot be credited to your account.

**Example:**
```
User: /deposit
Bot: 📥 Deposit Instructions

To deposit JUNO to your account:

1️⃣ Send JUNO to this address:
`juno1s6uf7vqd7svqjgv06l4efsn9hp3lelyukhmlka`

2️⃣ IMPORTANT: Include this memo:
`123456789`

⚠️ Your memo is unique to you and will never change
⚠️ Deposits without the correct memo cannot be credited

Your deposit will be credited automatically once confirmed on-chain.
```

### How Deposits Work

1. **Send JUNO** to the provided address with YOUR unique memo
2. **Wait 1-2 minutes** for blockchain confirmation
3. **Automatic credit** - The bot monitors the blockchain and automatically credits your account
4. **Check your balance** with `/balance` to confirm

**Important Notes:**
- Deposits are checked every 30 seconds
- Minimum 1 block confirmation required
- Deposits without correct memo go to an "unclaimed" account (admin can manually assign them)
- Your memo never changes - save it for future deposits

---

## Sending JUNO Tokens

The `/send` command is very flexible and supports three recipient formats:

### 1. Send to a Telegram Username (Internal Transfer)

```
/send <amount> @username
```

Instantly transfers JUNO to another Telegram user in the internal ledger. **No blockchain fees**.

**Example:**
```
User: /send 5 @bob
Bot: ⏳ Processing internal transfer...

✅ Transfer Successful

Amount: `5.000000 JUNO`
To: @bob
Your New Balance: `5.500000 JUNO`
```

### 2. Send to a Telegram User ID (Internal Transfer)

```
/send <amount> <user_id>
```

Same as above, but uses the numeric Telegram user ID instead of username.

**Example:**
```
User: /send 10 987654321
Bot: ⏳ Processing internal transfer...

✅ Transfer Successful

Amount: `10.000000 JUNO`
To: User 987654321
Your New Balance: `0.500000 JUNO`
```

### 3. Send to an External Juno Address (On-Chain Withdrawal)

```
/send <amount> juno1xxxxx...
```

Sends JUNO from your internal balance to any external Juno wallet address. **This creates an on-chain transaction with network fees**.

**Example:**
```
User: /send 2.5 juno1abc123xyz...
Bot: ⏳ Processing external transfer...

✅ External Transfer Successful

Amount: `2.500000 JUNO`
To: `juno1abc123xyz...`
New Balance: `8.000000 JUNO`

Transaction: `A1B2C3D4E5F6...`
```

**Important Notes:**
- Internal transfers are instant and free
- External transfers take 5-10 seconds and incur blockchain gas fees (deducted from amount)
- You cannot send to yourself
- Sufficient balance required

---

## Withdrawing to Your Wallet

```
/withdraw <amount> <juno_address>
```

Withdraw JUNO from your internal balance to your personal Juno wallet.

**Example:**
```
User: /withdraw 10 juno1mywalletaddress...
Bot: ⏳ Processing withdrawal...

✅ Withdrawal Successful

Amount: `10.000000 JUNO`
To: `juno1mywalletaddress...`
New Balance: `0.500000 JUNO`

Transaction: `ABC123...`
```

**Important:**
- Address must start with `juno1`
- Balance must be sufficient for amount + gas fees
- Withdrawal is processed on-chain and takes 5-10 seconds
- Transaction hash provided for verification

---

## Transaction History

```
/transactions
```

View your recent transaction history (last 10 transactions).

**Example:**
```
User: /transactions
Bot: 📜 Recent Transactions

2025-01-15 10:30:00
DEPOSIT: +100.000000 JUNO

2025-01-15 11:45:00
TRANSFER: -5.000000 JUNO to @bob

2025-01-15 12:00:00
WITHDRAWAL: -10.000000 JUNO

Balance After: 85.000000 JUNO
```

Shows:
- Deposits from external wallets
- Withdrawals to external wallets
- Internal transfers (sent/received)
- Fine payments
- Giveaways received
- Balance after each transaction

---

## Transaction Safety Features

### Transaction Locks

When you initiate a withdrawal or external send:
1. **Lock acquired** - Prevents concurrent transactions
2. **Balance verified** - Ensures sufficient funds
3. **Transaction processed** - Sent on-chain
4. **Lock released** - You can make another transaction

**What this means:**
- You cannot make two withdrawals simultaneously
- If you try, you'll see: "Another transaction is in progress. Please wait and try again."
- Locks expire after 5 minutes if something fails
- Prevents double-spending and race conditions

### Precision

All amounts support **6 decimal places** (micro-JUNO precision):
- Minimum amount: `0.000001 JUNO`
- Maximum precision: `123456.123456 JUNO`
- No rounding - exact arithmetic

---

## Fee Structure

### Internal Transfers (User to User)
- **Cost:** FREE
- **Speed:** Instant
- **Use case:** Sending to friends, splitting costs, tips

### External Transfers & Withdrawals
- **Gas fee:** ~0.025 JUNO (network fee)
- **Speed:** 5-10 seconds (1 block confirmation)
- **Use case:** Moving to your personal wallet, DeFi, exchanges

---

## Common Use Cases

### Splitting a Bill

Alice pays 30 JUNO for dinner with Bob and Charlie:

```
Bob: /send 10 @alice
Charlie: /send 10 @alice
```

Alice receives 20 JUNO instantly, no fees.

### Collecting Tips

Stream viewers can send you JUNO:

```
Viewer1: /send 1 @streamer
Viewer2: /send 5 @streamer
Viewer3: /send 0.5 @streamer
```

You receive all tips in your balance, withdraw whenever you want.

### Paying Fines

If you violate group rules and get fined:

```
/payfines
```

View your fines and pay them from your internal balance. Fines go to the bot treasury.

### Receiving Giveaways

Admins can distribute JUNO to users:

```
Admin: /giveaway 10 @alice @bob @charlie
```

Each user receives 10 JUNO automatically.

---

## Security Best Practices

### Protect Your Memo

Your deposit memo is like a bank account number:
- **Save it securely** - You'll need it for every deposit
- **Don't share it publicly** - Anyone with your memo can claim deposits as theirs
- **Never use someone else's memo** - Those tokens go to their account

### Verify Recipients

Before sending large amounts:
- **Double-check usernames** - @alice vs @alica (typo!)
- **Verify addresses** - juno1xxx... must be exactly correct
- **Start with small test** - Send 0.1 JUNO first to new addresses

### Check Transaction History

Regularly review your `/transactions` to:
- Verify all deposits credited correctly
- Confirm all sends went to intended recipients
- Track your balance changes

---

## Troubleshooting

### "Deposit not showing up"

**Possible causes:**
1. **Wrong memo** - Verify you used YOUR unique memo from `/deposit`
2. **Still confirming** - Wait 1-2 minutes for blockchain confirmation
3. **Memo missing** - Deposit goes to "unclaimed" (contact admin)

**Solution:**
```
/deposit          # Verify your memo
/balance          # Check if credited
/checkdeposit <txHash>  # Manually verify (if admin)
```

### "Insufficient balance"

You're trying to send more than you have.

**Solution:**
```
/balance          # Check current balance
/deposit          # Add more funds
```

### "Another transaction is in progress"

You have an active transaction lock (withdrawal/external send in progress).

**Solution:**
- Wait 30 seconds and try again
- If persists after 5 minutes, contact admin (stale lock)

### "User @username not found"

The recipient username doesn't exist in the bot's database.

**Possible causes:**
1. They haven't interacted with the bot yet (tell them to use `/balance` first)
2. Typo in username
3. User changed their username

**Solution:**
- Ask them to use `/balance` to register
- Use their Telegram user ID instead: `/send 10 123456789`
- Verify spelling

### "Invalid Juno address"

The address format is incorrect.

**Solution:**
- Address must start with `juno1`
- Address must be exactly 44-45 characters
- No spaces or extra characters
- Copy-paste to avoid typos

---

## Privacy & Transparency

### What's Private
- Your current balance (only you can see with `/balance`)
- Your transaction history (only you can see with `/transactions`)
- Your deposit memo (only you receive it)

### What's Public (to admins)
- Admins can view overall system statistics
- Admins can see unclaimed deposits
- Admins can trigger reconciliation checks

### On-Chain Transparency
- External withdrawals/sends are public on Juno blockchain
- Internal transfers are NOT visible on-chain (ledger only)
- Blockchain explorer: https://www.mintscan.io/juno

---

## Advanced Features

### Check Deposit Status (Manual)

```
/checkdeposit <transaction_hash>
```

Manually verify a deposit by transaction hash. Useful if automatic detection failed.

**Example:**
```
User: /checkdeposit A1B2C3D4E5F6...
Bot: ✅ Deposit Verified

Amount: 50.000000 JUNO
From: juno1abc...
Credited to: @alice
```

---

## Getting Help

### Commands
```
/help         # View all available commands
/balance      # Check your balance
/deposit      # Get deposit instructions
/transactions # View transaction history
```

### Support
- **Admin assistance:** Use `/help` and message an admin
- **Technical issues:** Report in group or DM bot owner
- **Lost deposits:** Provide transaction hash to admin

---

## FAQ

**Q: Can I lose my tokens?**
A: The internal ledger is backed by on-chain deposits. As long as the bot's wallet is secure and you use the correct memo, your tokens are safe.

**Q: Are internal transfers really free?**
A: Yes! Internal transfers only update the database ledger, no blockchain transaction occurs.

**Q: How long do deposits take?**
A: 1-2 minutes after blockchain confirmation (usually 1 block ~6 seconds + monitoring interval ~30 seconds).

**Q: Can I cancel a withdrawal?**
A: No, once initiated, withdrawals are irreversible. Always double-check the address before confirming.

**Q: What happens if I send to the wrong user?**
A: Internal transfers are final. You would need to ask them to send it back. External sends to wrong addresses cannot be recovered.

**Q: Is there a minimum deposit/withdrawal amount?**
A: Technical minimum is 0.000001 JUNO. Practical minimum for withdrawals is ~1 JUNO to cover gas fees.

**Q: Can I change my deposit memo?**
A: No, your memo is permanently tied to your Telegram user ID.

**Q: Do decimals matter?**
A: Yes! 1 JUNO = 1.000000, not 1.0. The system uses 6 decimal precision.

---

## Example Full User Flow

### New User Journey

**Step 1: First Interaction**
```
User: /balance
Bot: 💰 Balance for @alice

Current balance: `0.000000 JUNO`
```
✅ You're now registered!

**Step 2: Get Deposit Info**
```
User: /deposit
Bot: 📥 Deposit Instructions

To deposit JUNO to your account:

1️⃣ Send JUNO to this address:
`juno1s6uf7vqd7svqjgv06l4efsn9hp3lelyukhmlka`

2️⃣ IMPORTANT: Include this memo:
`123456789`

⚠️ Your memo is unique to you and will never change
```

**Step 3: Send JUNO from Your Wallet**
Open Keplr/Leap wallet:
- To: `juno1s6uf7vqd7svqjgv06l4efsn9hp3lelyukhmlka`
- Amount: `100 JUNO`
- Memo: `123456789`
- Send!

**Step 4: Wait for Confirmation**
~1-2 minutes...

**Step 5: Verify Deposit**
```
User: /balance
Bot: 💰 Balance for @alice

Current balance: `100.000000 JUNO`
```
✅ Credited!

**Step 6: Send to a Friend**
```
User: /send 10 @bob
Bot: ✅ Transfer Successful

Amount: `10.000000 JUNO`
To: @bob
Your New Balance: `90.000000 JUNO`
```

**Step 7: Withdraw to Your Wallet**
```
User: /withdraw 50 juno1myaddress...
Bot: ✅ Withdrawal Successful

Amount: `50.000000 JUNO`
To: `juno1myaddress...`
New Balance: `40.000000 JUNO`

Transaction: `ABC123...`
```

**Step 8: Check History**
```
User: /transactions
Bot: 📜 Recent Transactions

[Shows all your activity]
```

---

## Summary

The CAC Admin Bot wallet system provides:
- ✅ **Automatic registration** - Just start using it
- ✅ **Memo-based deposits** - Unique memo for each user
- ✅ **Flexible sending** - @username, user ID, or juno1... address
- ✅ **Instant internal transfers** - No fees between users
- ✅ **On-chain withdrawals** - Move to your personal wallet anytime
- ✅ **Transaction history** - Full audit trail
- ✅ **Secure locking** - Prevents double-spending
- ✅ **6-decimal precision** - Exact micro-JUNO arithmetic

**Start using it now:**
```
/balance
```

Welcome to the CAC wallet system! 🚀
