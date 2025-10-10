-- Migration: Convert from HD wallets to internal ledger system
-- This migration adds tables for tracking internal balances and transactions

-- User balances table
-- Tracks the current balance for each user in the internal ledger
CREATE TABLE IF NOT EXISTS user_balances (
  user_id INTEGER PRIMARY KEY,
  balance REAL DEFAULT 0,
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Transactions table
-- Complete audit trail of all transactions (internal and external)
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_type TEXT NOT NULL, -- 'deposit', 'withdrawal', 'transfer', 'fine', 'bail', 'giveaway', 'refund'
  from_user_id INTEGER,
  to_user_id INTEGER,
  amount REAL NOT NULL,
  balance_after REAL, -- Balance after transaction for the primary user
  description TEXT,
  tx_hash TEXT, -- On-chain transaction hash (for deposits/withdrawals)
  external_address TEXT, -- External wallet address (for deposits/withdrawals)
  status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'failed'
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  metadata TEXT, -- JSON field for additional data
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_balances_balance ON user_balances(balance);
CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);

-- Migrate existing wallet data if needed
-- This preserves the user_wallets table for historical reference but it won't be actively used
-- INSERT INTO user_balances (user_id, balance, created_at)
-- SELECT user_id, 0, created_at FROM user_wallets
-- WHERE NOT EXISTS (SELECT 1 FROM user_balances WHERE user_balances.user_id = user_wallets.user_id);

-- Add system wallets configuration table
CREATE TABLE IF NOT EXISTS system_wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Insert default system wallets (these will be configured in the app)
-- INSERT OR IGNORE INTO system_wallets (id, address, description) VALUES
-- ('treasury', '', 'Bot treasury wallet for fines and giveaways'),
-- ('user_funds', '', 'Collective user funds wallet');