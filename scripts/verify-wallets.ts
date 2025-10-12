#!/usr/bin/env ts-node
/**
 * Quick wallet verification script for CAC Admin Bot
 * Verifies the wallets configured in .env file
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { StargateClient } from '@cosmjs/stargate';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

async function verifyWallets() {
  console.log(`\n${colors.bright}CAC Admin Bot - Wallet Configuration Verification${colors.reset}`);
  console.log('=' .repeat(50));

  const treasuryAddress = process.env.BOT_TREASURY_ADDRESS;
  const userFundsAddress = process.env.USER_FUNDS_ADDRESS;
  const rpcUrl = process.env.JUNO_RPC_URL || 'https://rpc.juno.basementnodes.ca';

  // Check configuration
  console.log(`\n${colors.blue}Configuration:${colors.reset}`);
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  API URL: ${process.env.JUNO_API_URL || 'not configured'}`);
  console.log(`  Treasury Address: ${treasuryAddress || colors.red + 'NOT CONFIGURED' + colors.reset}`);
  console.log(`  User Funds Address: ${userFundsAddress || colors.red + 'NOT CONFIGURED' + colors.reset}`);
  console.log(`  User Funds Mnemonic: ${process.env.USER_FUNDS_MNEMONIC ? colors.green + 'CONFIGURED' + colors.reset : colors.red + 'NOT CONFIGURED' + colors.reset}`);

  if (!treasuryAddress && !userFundsAddress) {
    console.log(`\n${colors.red}✗ No wallet addresses configured!${colors.reset}`);
    console.log(`${colors.yellow}Please configure BOT_TREASURY_ADDRESS and USER_FUNDS_ADDRESS in .env file${colors.reset}`);
    return;
  }

  // Connect to Juno RPC
  console.log(`\n${colors.blue}Connecting to Juno network...${colors.reset}`);
  const client = await StargateClient.connect(rpcUrl);

  try {
    // Verify Treasury Wallet
    if (treasuryAddress) {
      console.log(`\n${colors.bright}Treasury Wallet:${colors.reset}`);
      await verifyWallet(client, treasuryAddress, 'Bot Treasury');
    }

    // Verify User Funds Wallet
    if (userFundsAddress) {
      console.log(`\n${colors.bright}User Funds Wallet:${colors.reset}`);
      await verifyWallet(client, userFundsAddress, 'User Funds');

      // Check if addresses are different (they should be for security)
      if (treasuryAddress && userFundsAddress) {
        if (treasuryAddress === userFundsAddress) {
          console.log(`\n${colors.yellow}⚠️  Warning: Treasury and User Funds use the same address!${colors.reset}`);
          console.log(`${colors.yellow}   Consider using separate wallets for better security and accounting.${colors.reset}`);
        } else {
          console.log(`\n${colors.green}✓ Treasury and User Funds use separate addresses (recommended)${colors.reset}`);
        }
      }
    }

    // Test REST API endpoint
    if (process.env.JUNO_API_URL) {
      console.log(`\n${colors.blue}Testing REST API endpoint...${colors.reset}`);
      try {
        const response = await fetch(`${process.env.JUNO_API_URL}/cosmos/base/tendermint/v1beta1/node_info`);
        if (response.ok) {
          const data = await response.json();
          console.log(`${colors.green}✓ REST API is accessible${colors.reset}`);
          console.log(`  Network: ${data.default_node_info?.network || 'unknown'}`);
        } else {
          console.log(`${colors.yellow}⚠️  REST API returned status ${response.status}${colors.reset}`);
        }
      } catch (error: any) {
        console.log(`${colors.red}✗ REST API is not accessible: ${error.message}${colors.reset}`);
      }
    }

    console.log(`\n${colors.bright}Summary:${colors.reset}`);
    const issues: string[] = [];

    if (!treasuryAddress) issues.push('Treasury address not configured');
    if (!userFundsAddress) issues.push('User funds address not configured');
    if (!process.env.USER_FUNDS_MNEMONIC) issues.push('User funds mnemonic not configured (withdrawals disabled)');

    if (issues.length === 0) {
      console.log(`${colors.green}✓ All wallet configurations are valid!${colors.reset}`);
      console.log(`${colors.green}  The bot ledger system should work fully.${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️  Configuration issues found:${colors.reset}`);
      issues.forEach(issue => console.log(`  - ${issue}`));
      console.log(`\n${colors.yellow}The bot will run with limited functionality.${colors.reset}`);
    }

  } finally {
    client.disconnect();
  }
}

async function verifyWallet(client: StargateClient, address: string, label: string) {
  // Verify address format
  const junoAddressRegex = /^juno1[a-z0-9]{38}$/;
  if (!junoAddressRegex.test(address)) {
    console.log(`  ${colors.red}✗ Invalid address format for ${label}${colors.reset}`);
    return;
  }

  console.log(`  Address: ${address}`);

  try {
    // Get account info
    const account = await client.getAccount(address);

    if (account) {
      console.log(`  ${colors.green}✓ Account exists on-chain${colors.reset}`);
      console.log(`    Account #: ${account.accountNumber}`);
      console.log(`    Sequence: ${account.sequence}`);
    } else {
      console.log(`  ${colors.yellow}⚠️  Account not initialized (needs first transaction)${colors.reset}`);
    }

    // Get balance
    const balances = await client.getAllBalances(address);
    const junoBalance = balances.find(b => b.denom === 'ujuno');

    if (junoBalance) {
      const amount = parseFloat(junoBalance.amount) / 1_000_000;
      console.log(`    Balance: ${amount.toFixed(6)} JUNO`);

      if (amount < 0.1) {
        console.log(`    ${colors.yellow}Note: Low balance, consider funding for operations${colors.reset}`);
      }
    } else {
      console.log(`    Balance: 0 JUNO`);
    }

  } catch (error: any) {
    console.log(`  ${colors.red}✗ Error querying ${label}: ${error.message}${colors.reset}`);
  }
}

// Run verification
verifyWallets()
  .then(() => {
    console.log(`\n${colors.bright}Verification complete!${colors.reset}\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  });