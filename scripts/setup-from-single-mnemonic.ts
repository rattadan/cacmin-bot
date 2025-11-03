#!/usr/bin/env ts-node
/**
 * Single Mnemonic Wallet Setup
 *
 * Uses one mnemonic to derive both wallets using different HD paths:
 * - Treasury Wallet: account index 0 (m/44'/118'/0'/0/0)
 * - User Funds Wallet: account index 1 (m/44'/118'/0'/0/1)
 *
 * This is more secure and easier to manage than having separate mnemonics.
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { StargateClient } from '@cosmjs/stargate';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.existsSync(envPath) ? fs.readFileSync(envPath) : '');

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
 * Generate or recover wallets from a single mnemonic using different HD paths
 */
async function setupWalletsFromMnemonic(mnemonic: string): Promise<{
  treasuryAddress: string;
  userFundsAddress: string;
  mnemonic: string;
}> {
  console.log(`\n${colors.blue}Deriving wallets from mnemonic...${colors.reset}`);

  // Derive treasury wallet (account index 0)
  const treasuryWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: 'juno',
    hdPaths: [{
      account: 0,
      change: 0,
      addressIndex: 0
    }]
  });
  const [treasuryAccount] = await treasuryWallet.getAccounts();

  // Derive user funds wallet (account index 1)
  const userFundsWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: 'juno',
    hdPaths: [{
      account: 0,
      change: 0,
      addressIndex: 1
    }]
  });
  const [userFundsAccount] = await userFundsWallet.getAccounts();

  console.log(`${colors.green}✓ Wallets derived successfully${colors.reset}`);
  console.log(`\n${colors.bright}Treasury Wallet (HD index 0):${colors.reset}`);
  console.log(`  Address: ${treasuryAccount.address}`);
  console.log(`\n${colors.bright}User Funds Wallet (HD index 1):${colors.reset}`);
  console.log(`  Address: ${userFundsAccount.address}`);

  return {
    treasuryAddress: treasuryAccount.address,
    userFundsAddress: userFundsAccount.address,
    mnemonic: mnemonic
  };
}

async function updateEnvFile(
  treasuryAddress: string,
  userFundsAddress: string,
  mnemonic: string
) {
  const updates = {
    ...envConfig,
    BOT_TREASURY_ADDRESS: treasuryAddress,
    USER_FUNDS_ADDRESS: userFundsAddress,
    USER_FUNDS_MNEMONIC: mnemonic,
    JUNO_RPC_URL: envConfig.JUNO_RPC_URL || 'https://rpc.juno.basementnodes.ca',
    JUNO_API_URL: envConfig.JUNO_API_URL || 'https://api.juno.basementnodes.ca'
  };

  // Build new env file content
  const lines: string[] = [];

  lines.push('# Bot Configuration');
  lines.push(`BOT_TOKEN=${updates.BOT_TOKEN || 'your_bot_token_here'}`);
  lines.push(`OWNER_ID=${updates.OWNER_ID || 'your_telegram_user_id'}`);
  lines.push('');

  lines.push('# Admin Configuration');
  lines.push(`ADMIN_CHAT_ID=${updates.ADMIN_CHAT_ID || 'admin_chat_id'}`);
  if (updates.GROUP_CHAT_ID) {
    lines.push(`GROUP_CHAT_ID=${updates.GROUP_CHAT_ID}`);
  }
  lines.push('');

  lines.push('# Database');
  lines.push(`DATABASE_PATH=${updates.DATABASE_PATH || './data/bot.db'}`);
  lines.push('');

  lines.push('# Juno Network Configuration');
  lines.push(`JUNO_RPC_URL=${updates.JUNO_RPC_URL}`);
  lines.push(`JUNO_API_URL=${updates.JUNO_API_URL}`);
  lines.push('');

  lines.push('# Wallet Configuration (Single Mnemonic, Multiple HD Paths)');
  lines.push('# Bot Treasury Address - HD index 0');
  lines.push(`BOT_TREASURY_ADDRESS=${treasuryAddress}`);
  lines.push('');

  lines.push('# User Funds Address - HD index 1');
  lines.push(`USER_FUNDS_ADDRESS=${userFundsAddress}`);
  lines.push('');

  lines.push('# Shared mnemonic for both wallets (different HD paths)');
  lines.push(`USER_FUNDS_MNEMONIC=${mnemonic}`);
  lines.push('');

  lines.push('# Logging');
  lines.push(`LOG_LEVEL=${updates.LOG_LEVEL || 'info'}`);
  lines.push('');

  fs.writeFileSync(envPath, lines.join('\n'));
  console.log(`\n${colors.green}✓ Updated .env file${colors.reset}`);
}

async function verifyWallet(address: string, name: string) {
  try {
    const client = await StargateClient.connect('https://rpc.juno.basementnodes.ca');
    const account = await client.getAccount(address);
    const balances = await client.getAllBalances(address);
    const junoBalance = balances.find(b => b.denom === 'ujuno');

    console.log(`\n${colors.bright}${name}:${colors.reset}`);
    console.log(`  Address: ${address}`);

    if (account) {
      console.log(`  ${colors.green}✓ On-chain${colors.reset} (Account #${account.accountNumber})`);
    } else {
      console.log(`  ${colors.yellow}  Not yet on-chain${colors.reset} (needs first transaction)`);
    }

    if (junoBalance) {
      const amount = parseFloat(junoBalance.amount) / 1_000_000;
      console.log(`  Balance: ${amount.toFixed(6)} JUNO`);
    } else {
      console.log(`  Balance: 0 JUNO`);
    }

    client.disconnect();
  } catch (error) {
    console.log(`${colors.red}✗ Could not verify ${name}${colors.reset}`);
  }
}

async function main() {
  console.log(`${colors.bright}
╔═══════════════════════════════════════╗
║  Single Mnemonic Wallet Setup (HD)    ║
╚═══════════════════════════════════════╝
${colors.reset}`);

  console.log('This will set up both wallets using a single mnemonic');
  console.log('with different HD derivation paths.\n');

  // Check current configuration
  if (envConfig.BOT_TREASURY_ADDRESS || envConfig.USER_FUNDS_ADDRESS) {
    console.log(`${colors.yellow}Current Configuration:${colors.reset}`);
    if (envConfig.BOT_TREASURY_ADDRESS) {
      console.log(`  Treasury: ${envConfig.BOT_TREASURY_ADDRESS}`);
    }
    if (envConfig.USER_FUNDS_ADDRESS) {
      console.log(`  User Funds: ${envConfig.USER_FUNDS_ADDRESS}`);
    }
    console.log('');
  }

  console.log(`${colors.bright}Setup Options:${colors.reset}`);
  console.log('  1. Generate new mnemonic');
  console.log('  2. Use existing mnemonic');
  console.log('  3. Exit');

  const choice = await prompt('\nSelect option (1-3): ');

  try {
    let mnemonic: string;

    switch (choice) {
      case '1': // Generate new
        console.log(`\n${colors.blue}Generating new 24-word mnemonic...${colors.reset}`);
        const newWallet = await DirectSecp256k1HdWallet.generate(24, {
          prefix: 'juno'
        });
        mnemonic = newWallet.mnemonic;

        console.log(`\n${colors.bright}Generated Mnemonic:${colors.reset}`);
        console.log(`${colors.yellow}${mnemonic}${colors.reset}`);
        console.log(`\n${colors.red}  SAVE THIS MNEMONIC SECURELY!${colors.reset}`);
        console.log('This single mnemonic controls both wallets.\n');

        const confirm = await prompt('Continue with this mnemonic? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
          console.log('Setup cancelled');
          rl.close();
          return;
        }
        break;

      case '2': // Use existing
        mnemonic = await prompt('\nEnter your 24-word mnemonic: ');
        if (!mnemonic || mnemonic.split(' ').length !== 24) {
          console.log(`${colors.red}Invalid mnemonic (must be 24 words)${colors.reset}`);
          rl.close();
          return;
        }
        break;

      case '3': // Exit
        console.log('Exiting...');
        rl.close();
        return;

      default:
        console.log(`${colors.red}Invalid option${colors.reset}`);
        rl.close();
        return;
    }

    // Setup wallets from mnemonic
    const wallets = await setupWalletsFromMnemonic(mnemonic);

    // Update .env file
    await updateEnvFile(
      wallets.treasuryAddress,
      wallets.userFundsAddress,
      wallets.mnemonic
    );

    // Verify wallets
    console.log(`\n${colors.blue}Verifying wallets on-chain...${colors.reset}`);
    await verifyWallet(wallets.treasuryAddress, 'Treasury Wallet');
    await verifyWallet(wallets.userFundsAddress, 'User Funds Wallet');

    // Summary
    console.log(`\n${colors.bright}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}✓ Setup Complete!${colors.reset}`);
    console.log(`\n${colors.bright}Configuration Summary:${colors.reset}`);
    console.log(`  Single mnemonic controls both wallets`);
    console.log(`  Treasury uses HD index 0`);
    console.log(`  User Funds uses HD index 1`);
    console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
    console.log('1. Keep the mnemonic secure');
    console.log('2. Fund wallets if needed');
    console.log('3. Restart bot: sudo systemctl restart cacmin-bot');
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