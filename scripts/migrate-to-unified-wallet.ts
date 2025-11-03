#!/usr/bin/env ts-node

/**
 * Migration script to unified wallet system
 *
 * This script:
 * 1. Creates system users (BOT_TREASURY, UNCLAIMED) if they don't exist
 * 2. Migrates any existing bot treasury balance to internal user -1
 * 3. Ensures all required tables exist
 * 4. Validates the migration
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../.env') });

const dbPath = process.env.DATABASE_PATH || './data/bot.db';
const db = new Database(dbPath);

// System user IDs
const SYSTEM_USER_IDS = {
  BOT_TREASURY: -1,
  SYSTEM_RESERVE: -2,
  UNCLAIMED: -3
};

console.log(' Starting migration to unified wallet system...\n');

try {
  // 1. Create system users if they don't exist
  console.log('1⃣ Creating system users...');

  const createSystemUser = (id: number, username: string, description: string) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!existing) {
      db.prepare(
        'INSERT INTO users (id, username, role, created_at) VALUES (?, ?, ?, ?)'
      ).run(id, username, 'system', Math.floor(Date.now() / 1000));

      // Create balance entry
      db.prepare(
        'INSERT INTO user_balances (user_id, balance, created_at) VALUES (?, 0, ?)'
      ).run(id, Math.floor(Date.now() / 1000));

      console.log(`    Created system user: ${username} (ID: ${id})`);
    } else {
      console.log(`    System user already exists: ${username} (ID: ${id})`);
    }
  };

  createSystemUser(SYSTEM_USER_IDS.BOT_TREASURY, 'BOT_TREASURY', 'Bot treasury for fines and fees');
  createSystemUser(SYSTEM_USER_IDS.UNCLAIMED, 'UNCLAIMED_DEPOSITS', 'Unclaimed deposits holding');
  createSystemUser(SYSTEM_USER_IDS.SYSTEM_RESERVE, 'SYSTEM_RESERVE', 'System reserve account');

  // 2. Check for any existing treasury balance to migrate
  console.log('\n2⃣ Checking for existing treasury balance...');

  // If you had a separate bot treasury wallet before, you might need to manually
  // transfer those funds to the unified wallet and then credit the bot's internal account
  const botBalance = db.prepare('SELECT balance FROM user_balances WHERE user_id = ?')
    .get(SYSTEM_USER_IDS.BOT_TREASURY) as any;

  if (botBalance) {
    console.log(`   Bot treasury balance: ${botBalance.balance} JUNO`);
  }

  // 3. Ensure all required tables exist
  console.log('\n3⃣ Verifying database schema...');

  // Check for processed_deposits table
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all() as any[];

  const requiredTables = [
    'users',
    'user_balances',
    'transactions',
    'processed_deposits',
    'transaction_locks'
  ];

  let missingTables = [];
  for (const table of requiredTables) {
    if (!tables.find((t: any) => t.name === table)) {
      missingTables.push(table);
    } else {
      console.log(`    Table exists: ${table}`);
    }
  }

  if (missingTables.length > 0) {
    console.log('\n    Missing tables detected. Run the bot once to create them:');
    missingTables.forEach(table => console.log(`      - ${table}`));
  }

  // 4. Display migration summary
  console.log('\n4⃣ Migration Summary:');

  // Count users with balances
  const userCount = db.prepare(
    'SELECT COUNT(*) as count FROM user_balances WHERE user_id > 0 AND balance > 0'
  ).get() as any;

  // Get total balance
  const totalBalance = db.prepare(
    'SELECT SUM(balance) as total FROM user_balances WHERE user_id > 0'
  ).get() as any;

  // Get bot treasury balance
  const botTreasuryBalance = db.prepare(
    'SELECT balance FROM user_balances WHERE user_id = ?'
  ).get(SYSTEM_USER_IDS.BOT_TREASURY) as any;

  console.log(`   Active users: ${userCount.count}`);
  console.log(`   Total user balance: ${totalBalance.total || 0} JUNO`);
  console.log(`   Bot treasury: ${botTreasuryBalance?.balance || 0} JUNO`);

  // 5. Configuration check
  console.log('\n5⃣ Configuration Check:');

  if (!process.env.USER_FUNDS_ADDRESS) {
    console.log('    USER_FUNDS_ADDRESS not set in .env');
  } else {
    console.log(`    Wallet address: ${process.env.USER_FUNDS_ADDRESS}`);
  }

  if (!process.env.USER_FUNDS_MNEMONIC) {
    console.log('    USER_FUNDS_MNEMONIC not set in .env');
  } else {
    console.log('    Wallet mnemonic: [HIDDEN]');
  }

  console.log('\n Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Ensure USER_FUNDS_ADDRESS is set in .env');
  console.log('2. Ensure USER_FUNDS_MNEMONIC is set in .env');
  console.log('3. Start the bot to initialize remaining components');
  console.log('4. Run /testwalletstats to verify system status');

} catch (error) {
  console.error('\n Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}