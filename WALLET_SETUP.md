# Wallet Setup and Configuration Guide

## Overview

The CAC Admin Bot uses a dual-wallet system for managing funds:

1. **Bot Treasury Wallet** (`BOT_TREASURY_ADDRESS`) - Receives fines, fees, and payments
2. **User Funds Wallet** (`USER_FUNDS_ADDRESS`) - Holds collective user deposits

## Network Endpoints

### Understanding Juno Endpoints

The bot uses three types of endpoints to interact with the Juno blockchain:

#### 1. RPC Endpoint (Tendermint RPC)
- **URL**: `https://rpc.juno.basementnodes.ca`
- **Protocol**: HTTP/WebSocket
- **Used for**:
  - Broadcasting transactions
  - Querying blockchain state
  - Subscribing to events
  - Used by CosmJS libraries
- **Example paths**: `/status`, `/block`, `/tx_search`

#### 2. REST API Endpoint (Cosmos SDK API)
- **URL**: `https://api.juno.basementnodes.ca`
- **Protocol**: HTTP/JSON
- **Used for**:
  - RESTful queries
  - Transaction verification
  - Module-specific queries
- **Example paths**: `/cosmos/bank/v1beta1/balances/{address}`

#### 3. gRPC Endpoint
- **URL**: `grpc.juno.basementnodes.ca:443`
- **Protocol**: gRPC/Protocol Buffers
- **Used for**:
  - High-performance queries
  - Binary protocol (more efficient)
  - Streaming responses
- **Note**: Not currently used by the bot but could improve performance

## Wallet Generation

### Method 1: Using the Wallet Utility Tool

```bash
# Run the interactive wallet utility
cd /root/repos/cacmin-bot
npx ts-node scripts/wallet-utils.ts
```

This tool allows you to:
- Generate new wallets with 24-word mnemonics
- Recover wallets from existing mnemonics
- Verify address formats
- Check wallet balances

### Method 2: Quick Generation Commands

```bash
# Generate a new wallet (one-liner)
npx ts-node -e "
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
(async () => {
  const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: 'juno' });
  const [account] = await wallet.getAccounts();
  console.log('Address:', account.address);
  console.log('Mnemonic:', wallet.mnemonic);
})();
"
```

### Method 3: Using junod CLI (if installed)

```bash
# Generate a new key
junod keys add treasury --output json

# Or recover from mnemonic
junod keys add treasury --recover
```

## Wallet Verification

### Quick Verification Script

```bash
# Verify current wallet configuration
cd /root/repos/cacmin-bot
npx ts-node scripts/verify-wallets.ts
```

This will:
- Check if addresses are valid
- Query current balances
- Verify accounts exist on-chain
- Test endpoint connectivity

### Manual Verification

```bash
# Check balance via REST API
curl https://api.juno.basementnodes.ca/cosmos/bank/v1beta1/balances/YOUR_ADDRESS

# Check account info
curl https://api.juno.basementnodes.ca/cosmos/auth/v1beta1/accounts/YOUR_ADDRESS
```

## Configuration Setup

### 1. Generate Wallets

For production, you should use two separate wallets:

```bash
# Generate treasury wallet
npx ts-node scripts/wallet-utils.ts
# Select option 1, save the address and mnemonic

# Generate user funds wallet
npx ts-node scripts/wallet-utils.ts
# Select option 1, save the address and mnemonic
```

### 2. Update .env File

```bash
# Edit the .env file
nano /root/repos/cacmin-bot/.env
```

Add/update these lines:

```env
# Juno Network Endpoints
JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
JUNO_API_URL=https://api.juno.basementnodes.ca

# Wallet Configuration
BOT_TREASURY_ADDRESS=juno1xxxxx...  # Your treasury wallet address
USER_FUNDS_ADDRESS=juno1yyyyy...    # Your user funds wallet address
USER_FUNDS_MNEMONIC=word1 word2...  # 24-word mnemonic for user funds wallet
```

### 3. Verify Configuration

```bash
# Run verification
npx ts-node scripts/verify-wallets.ts

# Should show:
# ✓ All wallet configurations are valid!
```

### 4. Restart Bot

```bash
sudo systemctl restart cacmin-bot
journal cacmin-bot  # Check logs
```

## Security Best Practices

### 1. Wallet Security

- **NEVER** commit mnemonics to git
- Store mnemonics in a secure password manager
- Use hardware wallets for large amounts
- Keep treasury and user funds wallets separate

### 2. Address Validation

Juno addresses must:
- Start with `juno1`
- Be exactly 43 characters long
- Contain only lowercase letters and numbers after the prefix

Example valid address: `juno1s6uf7vqd7svqjgv06l4efsn9hp3lelyukhmlka`

### 3. Recommended Setup

For production environments:

1. **Treasury Wallet**:
   - Cold wallet or multisig
   - Only needs address in config
   - Receives payments automatically

2. **User Funds Wallet**:
   - Hot wallet (needs mnemonic for withdrawals)
   - Should have minimal balance
   - Regular sweeps to cold storage

## Funding Wallets

### Initial Funding

Both wallets need some JUNO for operations:

1. **Treasury**: Needs minimal balance (receives from users)
2. **User Funds**: Needs ~1 JUNO for gas fees on withdrawals

### Getting Testnet JUNO

For testing on testnet:
```bash
# Use the Juno testnet faucet
# Visit: https://faucet.reece.sh/
```

### Getting Mainnet JUNO

For production:
- Buy from exchanges (Osmosis, JunoSwap)
- Transfer from existing wallets
- Receive from users

## Troubleshooting

### Common Issues

1. **"Account not initialized"**
   - Normal for new wallets
   - Will initialize on first transaction

2. **"Invalid address format"**
   - Check address starts with `juno1`
   - Verify it's 43 characters long

3. **"REST API not accessible"**
   - Check JUNO_API_URL is correct
   - Try alternative endpoints

### Alternative Endpoints

If primary endpoints are down:

```env
# Alternative RPC endpoints
JUNO_RPC_URL=https://juno-rpc.polkachu.com
JUNO_RPC_URL=https://rpc-juno.mib.tech

# Alternative REST API endpoints
JUNO_API_URL=https://juno-api.polkachu.com
JUNO_API_URL=https://api-juno.mib.tech
```

## Quick Reference

```bash
# Generate wallet
npx ts-node scripts/wallet-utils.ts

# Verify configuration
npx ts-node scripts/verify-wallets.ts

# Check specific balance
curl https://api.juno.basementnodes.ca/cosmos/bank/v1beta1/balances/juno1xxxxx

# Restart bot after config changes
sudo systemctl restart cacmin-bot
```