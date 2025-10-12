#!/usr/bin/env ts-node
/**
 * Juno Wallet Generation and Verification Utility
 *
 * This script helps you:
 * 1. Generate new Juno wallet addresses with mnemonics
 * 2. Verify existing wallet addresses
 * 3. Check wallet balances
 * 4. Recover addresses from mnemonics
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, StargateClient } from '@cosmjs/stargate';
import * as readline from 'readline';
import * as fs from 'fs';

// Juno network configuration
const JUNO_CONFIG = {
  // RPC endpoint (for blockchain queries and transactions via Tendermint RPC)
  rpcUrl: 'https://rpc.juno.basementnodes.ca',

  // REST API endpoint (for REST queries - cosmos-sdk API)
  apiUrl: 'https://api.juno.basementnodes.ca',

  // gRPC endpoint (for efficient binary queries - not used in this script)
  grpcUrl: 'grpc.juno.basementnodes.ca:443',

  // Chain configuration
  prefix: 'juno',
  denom: 'ujuno',
  gasPrice: '0.075ujuno'
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (question: string): Promise<string> => {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
};

/**
 * Generate a new wallet with mnemonic
 */
async function generateWallet() {
  console.log(`\n${colors.blue}Generating new Juno wallet...${colors.reset}`);

  // Generate a new wallet with 24-word mnemonic
  const wallet = await DirectSecp256k1HdWallet.generate(24, {
    prefix: JUNO_CONFIG.prefix
  });

  const [account] = await wallet.getAccounts();
  const mnemonic = wallet.mnemonic;

  console.log(`\n${colors.green}✓ Wallet generated successfully!${colors.reset}`);
  console.log(`\n${colors.bright}Address:${colors.reset} ${account.address}`);
  console.log(`\n${colors.bright}Mnemonic (24 words):${colors.reset}`);
  console.log(`${colors.yellow}${mnemonic}${colors.reset}`);
  console.log(`\n${colors.red}⚠️  IMPORTANT: Save this mnemonic securely! It's the only way to recover your wallet.${colors.reset}`);

  // Offer to save to file
  const saveToFile = await prompt('\nSave wallet info to file? (y/n): ');
  if (saveToFile.toLowerCase() === 'y') {
    const filename = `wallet_${Date.now()}.json`;
    const walletData = {
      address: account.address,
      mnemonic: mnemonic,
      created: new Date().toISOString(),
      network: 'juno',
      warning: 'KEEP THIS FILE SECURE! Anyone with the mnemonic can access your funds.'
    };

    fs.writeFileSync(filename, JSON.stringify(walletData, null, 2));
    console.log(`${colors.green}✓ Saved to ${filename}${colors.reset}`);
    console.log(`${colors.red}⚠️  Remember to move this file to a secure location!${colors.reset}`);
  }

  return account.address;
}

/**
 * Recover wallet from mnemonic
 */
async function recoverWallet() {
  console.log(`\n${colors.blue}Recover wallet from mnemonic${colors.reset}`);
  const mnemonic = await prompt('Enter your mnemonic (24 words): ');

  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: JUNO_CONFIG.prefix
    });

    const [account] = await wallet.getAccounts();
    console.log(`\n${colors.green}✓ Wallet recovered successfully!${colors.reset}`);
    console.log(`${colors.bright}Address:${colors.reset} ${account.address}`);

    return account.address;
  } catch (error) {
    console.log(`${colors.red}✗ Invalid mnemonic. Please check and try again.${colors.reset}`);
    return null;
  }
}

/**
 * Verify if an address is valid
 */
function verifyAddress(address: string): boolean {
  // Juno addresses should start with 'juno1' and be 43 characters long
  const junoAddressRegex = /^juno1[a-z0-9]{38}$/;
  return junoAddressRegex.test(address);
}

/**
 * Check wallet balance using RPC
 */
async function checkBalance(address: string) {
  if (!verifyAddress(address)) {
    console.log(`${colors.red}✗ Invalid Juno address format${colors.reset}`);
    return;
  }

  console.log(`\n${colors.blue}Checking balance for ${address}...${colors.reset}`);

  try {
    // Connect to the Juno RPC endpoint
    const client = await StargateClient.connect(JUNO_CONFIG.rpcUrl);

    // Get all balances for the address
    const balances = await client.getAllBalances(address);

    if (balances.length === 0) {
      console.log(`${colors.yellow}Balance: 0 JUNO (empty wallet)${colors.reset}`);
    } else {
      console.log(`\n${colors.bright}Balances:${colors.reset}`);
      for (const balance of balances) {
        if (balance.denom === 'ujuno') {
          const junoAmount = parseFloat(balance.amount) / 1_000_000;
          console.log(`  JUNO: ${junoAmount.toFixed(6)}`);
        } else {
          console.log(`  ${balance.denom}: ${balance.amount}`);
        }
      }
    }

    // Also show account info
    const account = await client.getAccount(address);
    if (account) {
      console.log(`\n${colors.bright}Account Info:${colors.reset}`);
      console.log(`  Account Number: ${account.accountNumber}`);
      console.log(`  Sequence: ${account.sequence}`);
    } else {
      console.log(`${colors.yellow}Note: Account not yet initialized on-chain (needs first transaction)${colors.reset}`);
    }

    client.disconnect();
  } catch (error: any) {
    console.log(`${colors.red}✗ Error checking balance: ${error.message}${colors.reset}`);
  }
}

/**
 * Main menu
 */
async function main() {
  console.log(`${colors.bright}
╔═══════════════════════════════════════╗
║      Juno Wallet Utility Tool         ║
╚═══════════════════════════════════════╝
${colors.reset}`);

  console.log(`Network Configuration:`);
  console.log(`  RPC URL: ${JUNO_CONFIG.rpcUrl}`);
  console.log(`  API URL: ${JUNO_CONFIG.apiUrl}`);
  console.log(`  Chain Prefix: ${JUNO_CONFIG.prefix}`);

  while (true) {
    console.log(`\n${colors.bright}Options:${colors.reset}`);
    console.log('  1. Generate new wallet');
    console.log('  2. Recover wallet from mnemonic');
    console.log('  3. Verify address format');
    console.log('  4. Check wallet balance');
    console.log('  5. Show endpoint information');
    console.log('  6. Exit');

    const choice = await prompt('\nSelect option (1-6): ');

    switch (choice) {
      case '1':
        await generateWallet();
        break;

      case '2':
        await recoverWallet();
        break;

      case '3':
        const addressToVerify = await prompt('Enter Juno address: ');
        if (verifyAddress(addressToVerify)) {
          console.log(`${colors.green}✓ Valid Juno address format${colors.reset}`);
        } else {
          console.log(`${colors.red}✗ Invalid Juno address format${colors.reset}`);
          console.log(`${colors.yellow}Juno addresses should start with 'juno1' and be 43 characters long${colors.reset}`);
        }
        break;

      case '4':
        const addressToCheck = await prompt('Enter Juno address: ');
        await checkBalance(addressToCheck);
        break;

      case '5':
        console.log(`\n${colors.bright}Juno Network Endpoints:${colors.reset}`);
        console.log(`\n${colors.blue}RPC (Tendermint RPC):${colors.reset}`);
        console.log(`  URL: ${JUNO_CONFIG.rpcUrl}`);
        console.log(`  Used for: Transaction broadcast, queries via Tendermint RPC`);
        console.log(`  Protocol: HTTP/WebSocket`);
        console.log(`  Example: /status, /block, /tx_search`);

        console.log(`\n${colors.blue}REST API (Cosmos SDK):${colors.reset}`);
        console.log(`  URL: ${JUNO_CONFIG.apiUrl}`);
        console.log(`  Used for: REST queries, module queries`);
        console.log(`  Protocol: HTTP/JSON`);
        console.log(`  Example: /cosmos/bank/v1beta1/balances/{address}`);

        console.log(`\n${colors.blue}gRPC:${colors.reset}`);
        console.log(`  URL: ${JUNO_CONFIG.grpcUrl}`);
        console.log(`  Used for: Efficient binary queries, streaming`);
        console.log(`  Protocol: gRPC/Protocol Buffers`);
        console.log(`  Note: More efficient than REST for high-volume queries`);

        console.log(`\n${colors.yellow}For this bot:${colors.reset}`);
        console.log(`  - RPC is used for blockchain interaction (via CosmJS)`);
        console.log(`  - REST API is used for transaction verification`);
        console.log(`  - gRPC could be used for better performance (future enhancement)`);
        break;

      case '6':
        console.log(`${colors.green}Goodbye!${colors.reset}`);
        rl.close();
        process.exit(0);

      default:
        console.log(`${colors.red}Invalid option${colors.reset}`);
    }
  }
}

// Run the utility
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});