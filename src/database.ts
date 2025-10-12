import Database from 'better-sqlite3';
import { config } from './config';
import { logger } from './utils/logger';

const db = new Database(config.databasePath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

export const query = <T>(sql: string, params: unknown[] = []): T[] => {
  try {
    const stmt = db.prepare(sql);
    return stmt.all(params) as T[];
  } catch (error) {
    logger.error(`Database query failed: ${sql}`, error);
    throw error;
  }
};

export const execute = (sql: string, params: unknown[] = []): Database.RunResult => {
  try {
    const stmt = db.prepare(sql);
    return stmt.run(params);
  } catch (error) {
    logger.error(`Database execution failed: ${sql}`, error);
    throw error;
  }
};

export const get = <T>(sql: string, params: unknown[] = []): T | undefined => {
  try {
    const stmt = db.prepare(sql);
    return stmt.get(params) as T | undefined;
  } catch (error) {
    logger.error(`Database get failed: ${sql}`, error);
    throw error;
  }
};

export const initDb = (): void => {
  // Enhanced users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      role TEXT DEFAULT 'pleb',
      whitelist INTEGER DEFAULT 0,
      blacklist INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      muted_until INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // NOTE: user_wallets table (from old HD wallet system) has been removed
  // If migrating from an old database, that table may still exist with historical data
  // but is no longer created or used by the current code.

  // User balances table - Internal ledger system
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_balances (
      user_id INTEGER PRIMARY KEY,
      balance REAL DEFAULT 0,
      last_updated INTEGER DEFAULT (strftime('%s', 'now')),
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Transactions table - Complete audit trail
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER,
      amount REAL NOT NULL,
      balance_after REAL,
      description TEXT,
      tx_hash TEXT,
      external_address TEXT,
      status TEXT DEFAULT 'completed',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      metadata TEXT,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    );
  `);

  // System wallets configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_wallets (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Enhanced rules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT,
      specific_action TEXT,
      severity INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Enhanced violations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      rule_id INTEGER,
      restriction TEXT,
      message TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      bail_amount REAL DEFAULT 0,
      paid INTEGER DEFAULT 0,
      payment_tx TEXT,
      paid_by_user_id INTEGER,
      paid_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (paid_by_user_id) REFERENCES users(id)
    );
  `);

  // Jail events log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jail_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      admin_id INTEGER,
      duration_minutes INTEGER,
      bail_amount REAL DEFAULT 0,
      paid_by_user_id INTEGER,
      payment_tx TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (admin_id) REFERENCES users(id),
      FOREIGN KEY (paid_by_user_id) REFERENCES users(id)
    );
  `);

  // Enhanced user_restrictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      restriction TEXT NOT NULL,
      restricted_action TEXT,
      metadata TEXT,
      restricted_until INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Enhanced global_restrictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restriction TEXT NOT NULL,
      restricted_action TEXT,
      metadata TEXT,
      restricted_until INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_blacklist ON users(blacklist);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(user_id);
    CREATE INDEX IF NOT EXISTS idx_violations_paid ON violations(paid);
    CREATE INDEX IF NOT EXISTS idx_restrictions_user ON user_restrictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_restrictions_until ON user_restrictions(restricted_until);
    CREATE INDEX IF NOT EXISTS idx_jail_events_user ON jail_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_jail_events_type ON jail_events(event_type);

    -- Ledger system indexes
    CREATE INDEX IF NOT EXISTS idx_user_balances_balance ON user_balances(balance);
    CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
  `);

  logger.info('Database initialized successfully');
};
