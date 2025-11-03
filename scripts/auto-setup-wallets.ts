#!/usr/bin/env ts-node
/**
 * Auto Setup Wallets Script
 *
 * This script automatically sets up wallet configuration for the bot:
 * - Can generate new wallets or use existing mnemonics
 * - Automatically derives addresses from mnemonics
 * - Updates the .env file with correct configuration
 * - Verifies everything is working
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { StargateClient } from '@cosmjs/stargate';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

// Load existing env
const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.existsSync(envPath) ? fs.readFileSync(envPath) : '');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

const prompt = (question: string): Promise<string> => {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
};

async function generateNewWallet(name: string): Promise<{ address: string; mnemonic: string }> {
  console.log(`\n${colors.blue}Generating new ${name} wallet...${colors.reset}`);

  const wallet = await DirectSecp256k1HdWallet.generate(24, {
    prefix: 'juno'
  });

  const [account] = await wallet.getAccounts();

  console.log(`${colors.green}✓ Generated ${name} wallet${colors.reset}`);
  console.log(`  Address: ${account.address}`);

  return {
    address: account.address,
    mnemonic: wallet.mnemonic
  };
}

async function recoverWallet(mnemonic: string, name: string): Promise<{ address: string; mnemonic: string }> {
  console.log(`\n${colors.blue}Recovering ${name} wallet from mnemonic...${colors.reset}`);

  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'juno'
    });

    const [account] = await wallet.getAccounts();

    console.log(`${colors.green}✓ Recovered ${name} wallet${colors.reset}`);
    console.log(`  Address: ${account.address}`);

    return {
      address: account.address,
      mnemonic: mnemonic
    };
  } catch (error) {
    throw new Error(`Invalid mnemonic for ${name} wallet`);
  }
}

async function updateEnvFile(updates: Record<string, string>) {
  // Merge with existing config
  const newConfig = { ...envConfig, ...updates };

  // Build new env file content
  const lines: string[] = [];

  // Add comments and structure
  lines.push('# Bot Configuration');
  lines.push(`BOT_TOKEN=${newConfig.BOT_TOKEN || 'your_bot_token_here'}`);
  lines.push(`OWNER_ID=${newConfig.OWNER_ID || 'your_telegram_user_id'}`);
  lines.push('');

  lines.push('# Admin Configuration');
  lines.push(`ADMIN_CHAT_ID=${newConfig.ADMIN_CHAT_ID || 'admin_chat_id'}`);
  if (newConfig.GROUP_CHAT_ID) {
    lines.push(`GROUP_CHAT_ID=${newConfig.GROUP_CHAT_ID}`);
  }
  lines.push('');

  lines.push('# Database');
  lines.push(`DATABASE_PATH=${newConfig.DATABASE_PATH || './data/bot.db'}`);
  lines.push('');

  lines.push('# Juno Network Configuration');
  lines.push(`JUNO_RPC_URL=${newConfig.JUNO_RPC_URL || 'https://rpc.juno.basementnodes.ca'}`);
  lines.push(`JUNO_API_URL=${newConfig.JUNO_API_URL || 'https://api.juno.basementnodes.ca'}`);
  lines.push('');

  lines.push('# Wallet Configuration');
  lines.push('# Bot Treasury Address - receives fines, fees, and payments');
  lines.push(`BOT_TREASURY_ADDRESS=${newConfig.BOT_TREASURY_ADDRESS || ''}`);
  lines.push('');

  lines.push('# User Funds Address - holds collective user deposits');
  lines.push(`USER_FUNDS_ADDRESS=${newConfig.USER_FUNDS_ADDRESS || ''}`);
  lines.push(`USER_FUNDS_MNEMONIC=${newConfig.USER_FUNDS_MNEMONIC || ''}`);
  lines.push('');

  lines.push('# Logging');
  lines.push(`LOG_LEVEL=${newConfig.LOG_LEVEL || 'info'}`);
  lines.push('');

  // Write to file
  fs.writeFileSync(envPath, lines.join('\n'));
  console.log(`${colors.green}✓ Updated .env file${colors.reset}`);
}

async function verifyWallet(address: string, name: string) {
  try {
    const client = await StargateClient.connect('https://rpc.juno.basementnodes.ca');
    const account = await client.getAccount(address);
    const balances = await client.getAllBalances(address);
    const junoBalance = balances.find(b => b.denom === 'ujuno');

    console.log(`\n${colors.bright}${name} Wallet Status:${colors.reset}`);
    console.log(`  Address: ${address}`);

    if (account) {
      console.log(`  ${colors.green}✓ On-chain account exists${colors.reset}`);
      console.log(`  Account #: ${account.accountNumber}`);
    } else {
      console.log(`  ${colors.yellow}  Account not yet initialized (needs first transaction)${colors.reset}`);
    }

    if (junoBalance) {
      const amount = parseFloat(junoBalance.amount) / 1_000_000;
      console.log(`  Balance: ${amount.toFixed(6)} JUNO`);
    } else {
      console.log(`  Balance: 0 JUNO`);
    }

    client.disconnect();
  } catch (error) {
    console.log(`${colors.yellow}  Could not verify ${name} wallet on-chain${colors.reset}`);
  }
}

async function main() {
  console.log(`${colors.bright}
╔═══════════════════════════════════════╗
║   CAC Admin Bot - Auto Wallet Setup  ║
╚═══════════════════════════════════════╝
${colors.reset}`);

  console.log('This script will help you set up wallets for the bot.\n');

  // Check current configuration
  console.log(`${colors.blue}Current Configuration:${colors.reset}`);
  console.log(`  Treasury Address: ${envConfig.BOT_TREASURY_ADDRESS || colors.yellow + 'Not configured' + colors.reset}`);
  console.log(`  User Funds Address: ${envConfig.USER_FUNDS_ADDRESS || colors.yellow + 'Not configured' + colors.reset}`);
  console.log(`  User Funds Mnemonic: ${envConfig.USER_FUNDS_MNEMONIC ? colors.green + 'Configured' + colors.reset : colors.yellow + 'Not configured' + colors.reset}`);

  console.log('\n' + colors.bright + 'Setup Options:' + colors.reset);
  console.log('  1. Quick Setup - Generate new wallets automatically');
  console.log('  2. Use Existing - Enter existing mnemonics');
  console.log('  3. Hybrid - New treasury, existing user funds');
  console.log('  4. Verify Only - Check current configuration');
  console.log('  5. Exit');

  const choice = await prompt('\nSelect option (1-5): ');

  try {
    let treasuryWallet: { address: string; mnemonic?: string } | null = null;
    let userFundsWallet: { address: string; mnemonic: string } | null = null;

    switch (choice) {
      case '1': // Quick Setup
        console.log(`\n${colors.bright}Quick Setup - Generating new wallets${colors.reset}`);

        treasuryWallet = await generateNewWallet('Treasury');
        userFundsWallet = await generateNewWallet('User Funds');

        console.log(`\n${colors.yellow}  IMPORTANT: Save these mnemonics securely!${colors.reset}`);
        console.log(`\n${colors.bright}Treasury Wallet Mnemonic:${colors.reset}`);
        console.log(treasuryWallet.mnemonic);
        console.log(`\n${colors.bright}User Funds Wallet Mnemonic:${colors.reset}`);
        console.log(userFundsWallet.mnemonic);

        await updateEnvFile({
          BOT_TREASURY_ADDRESS: treasuryWallet.address,
          USER_FUNDS_ADDRESS: userFundsWallet.address,
          USER_FUNDS_MNEMONIC: userFundsWallet.mnemonic,
          JUNO_RPC_URL: 'https://rpc.juno.basementnodes.ca',
          JUNO_API_URL: 'https://api.juno.basementnodes.ca'
        });

        break;

      case '2': // Use Existing
        console.log(`\n${colors.bright}Use Existing Wallets${colors.reset}`);

        const treasuryMnemonic = await prompt('\nEnter Treasury wallet mnemonic (or press Enter to skip): ');
        if (treasuryMnemonic) {
          treasuryWallet = await recoverWallet(treasuryMnemonic, 'Treasury');
        } else {
          console.log('Skipping treasury wallet...');
        }

        const userFundsMnemonic = await prompt('\nEnter User Funds wallet mnemonic: ');
        userFundsWallet = await recoverWallet(userFundsMnemonic, 'User Funds');

        await updateEnvFile({
          ...(treasuryWallet ? { BOT_TREASURY_ADDRESS: treasuryWallet.address } : {}),
          USER_FUNDS_ADDRESS: userFundsWallet.address,
          USER_FUNDS_MNEMONIC: userFundsWallet.mnemonic,
          JUNO_RPC_URL: 'https://rpc.juno.basementnodes.ca',
          JUNO_API_URL: 'https://api.juno.basementnodes.ca'
        });

        break;

      case '3': // Hybrid
        console.log(`\n${colors.bright}Hybrid Setup${colors.reset}`);

        treasuryWallet = await generateNewWallet('Treasury');

        console.log(`\n${colors.yellow}Treasury Wallet Mnemonic (save this):${colors.reset}`);
        console.log(treasuryWallet.mnemonic);

        const existingMnemonic = await prompt('\nEnter existing User Funds wallet mnemonic: ');
        userFundsWallet = await recoverWallet(existingMnemonic, 'User Funds');

        await updateEnvFile({
          BOT_TREASURY_ADDRESS: treasuryWallet.address,
          USER_FUNDS_ADDRESS: userFundsWallet.address,
          USER_FUNDS_MNEMONIC: userFundsWallet.mnemonic,
          JUNO_RPC_URL: 'https://rpc.juno.basementnodes.ca',
          JUNO_API_URL: 'https://api.juno.basementnodes.ca'
        });

        break;

      case '4': // Verify Only
        if (envConfig.BOT_TREASURY_ADDRESS) {
          await verifyWallet(envConfig.BOT_TREASURY_ADDRESS, 'Treasury');
        }
        if (envConfig.USER_FUNDS_ADDRESS) {
          await verifyWallet(envConfig.USER_FUNDS_ADDRESS, 'User Funds');
        }

        if (!envConfig.BOT_TREASURY_ADDRESS && !envConfig.USER_FUNDS_ADDRESS) {
          console.log(`${colors.red}No wallets configured!${colors.reset}`);
        }

        rl.close();
        return;

      case '5': // Exit
        console.log('Exiting...');
        rl.close();
        return;

      default:
        console.log(`${colors.red}Invalid option${colors.reset}`);
        rl.close();
        return;
    }

    // Verify the configured wallets
    if (treasuryWallet) {
      await verifyWallet(treasuryWallet.address, 'Treasury');
    }
    if (userFundsWallet) {
      await verifyWallet(userFundsWallet.address, 'User Funds');
    }

    // Final summary
    console.log(`\n${colors.bright}Setup Complete!${colors.reset}`);
    console.log(`\n${colors.green}✓ Wallets configured successfully${colors.reset}`);
    console.log(`${colors.green}✓ .env file updated${colors.reset}`);
    console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
    console.log('1. Save any mnemonics shown above in a secure location');
    console.log('2. Fund the wallets with some JUNO if needed');
    console.log('3. Restart the bot: sudo systemctl restart cacmin-bot');
    console.log('4. Check logs: journal cacmin-bot');

  } catch (error: any) {
    console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
  }

  rl.close();
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});