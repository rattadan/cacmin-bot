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

  // User wallets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_wallets (
      user_id INTEGER PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      hd_path TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create index for faster address lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(address);
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
  `);

  logger.info('Database initialized successfully');
};
