/**
 * End-to-end tests for fine configuration and price tracking system
 * Tests the complete flow from price fetching to fine calculation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

// Test database
let testDb: Database.Database | null = null;
const TEST_DB_PATH = join(__dirname, '../test-data/fine-config-e2e.db');

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    botToken: 'test-token',
    junoRpcUrl: 'https://test.rpc',
    adminChatId: 123456789,
    groupChatId: -100123456789,
    ownerIds: [111111111],
    adminIds: [],
    databasePath: join(__dirname, '../test-data/fine-config-e2e.db'),
    logLevel: 'silent',
    fineAmounts: {
      sticker: 1.0,
      url: 2.0,
      regex: 1.5,
      blacklist: 5.0
    }
  },
  validateConfig: vi.fn()
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  StructuredLogger: {
    logDebug: vi.fn(),
    logError: vi.fn(),
    logUserAction: vi.fn(),
    logSecurityEvent: vi.fn(),
    logTransaction: vi.fn()
  }
}));

// Mock database
vi.mock('../../src/database', () => {
  const Database = require('better-sqlite3');
  const { join } = require('path');
  const testDbPath = join(__dirname, '../test-data/fine-config-e2e.db');

  const getDb = () => {
    if (!testDb) {
      testDb = new Database(testDbPath);
      testDb!.exec('PRAGMA foreign_keys = ON');
    }
    return testDb!;
  };

  return {
    query: <T>(sql: string, params: unknown[] = []): T[] => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.all(params) as T[];
    },
    execute: (sql: string, params: unknown[] = []): Database.RunResult => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.run(params);
    },
    get: <T>(sql: string, params: unknown[] = []): T | undefined => {
      const db = getDb();
      const stmt = db.prepare(sql);
      return stmt.get(params) as T | undefined;
    },
    initDb: vi.fn()
  };
});

function initTestDatabase(): void {
  const testDataDir = join(__dirname, '../test-data');
  if (!existsSync(testDataDir)) {
    mkdirSync(testDataDir, { recursive: true });
  }

  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  testDb = new Database(TEST_DB_PATH);
  testDb!.exec('PRAGMA foreign_keys = ON');

  testDb!.exec(`
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

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_usd REAL NOT NULL,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS fine_config (
      fine_type TEXT PRIMARY KEY,
      amount_usd REAL NOT NULL,
      description TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(user_id);
    CREATE INDEX IF NOT EXISTS idx_jail_events_user ON jail_events(user_id);
  `);
}

function cleanupTestDatabase(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
}

describe('Fine Configuration E2E', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  afterAll(() => {
    cleanupTestDatabase();
  });

  describe('Complete fine calculation flow', () => {
    it('should calculate fines correctly with price fluctuations', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Setup: Create owner user
      testDb!.exec(`INSERT INTO users (id, username, role) VALUES (111111111, 'owner', 'owner')`);

      // Setup: Add price history
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600}),
        (0.12, ${now - 7200}),
        (0.08, ${now - 10800})
      `);
      // Average = 0.10

      // Configure fine amounts
      PriceService.setFineConfigUsd('sticker', 0.10, 'Sticker fine', 111111111);
      PriceService.setFineConfigUsd('url', 0.20, 'URL fine', 111111111);
      PriceService.setFineConfigUsd('jail_per_minute', 0.01, 'Per minute', 111111111);
      PriceService.setFineConfigUsd('jail_minimum', 0.10, 'Minimum', 111111111);

      // Test violation fine
      const stickerFine = await PriceService.calculateViolationFine('no_stickers');
      expect(stickerFine).toBe(1); // $0.10 / $0.10 = 1 JUNO

      const urlFine = await PriceService.calculateViolationFine('no_urls');
      expect(urlFine).toBe(2); // $0.20 / $0.10 = 2 JUNO

      // Test bail calculation
      const shortBail = await PriceService.calculateBailAmount(5);
      expect(shortBail).toBe(1); // Minimum $0.10 / $0.10 = 1 JUNO

      const hourBail = await PriceService.calculateBailAmount(60);
      expect(hourBail).toBe(6); // 60 * $0.01 = $0.60 / $0.10 = 6 JUNO
    });

    it('should adjust fines when price changes', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Clear old price history
      testDb!.exec('DELETE FROM price_history');

      // Add new price history at higher price
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.20, ${now - 3600})
      `);

      // Same USD fine, but now at $0.20/JUNO
      const stickerFine = await PriceService.calculateViolationFine('no_stickers');
      expect(stickerFine).toBe(0.5); // $0.10 / $0.20 = 0.5 JUNO

      const hourBail = await PriceService.calculateBailAmount(60);
      expect(hourBail).toBe(3); // $0.60 / $0.20 = 3 JUNO
    });
  });

  describe('Integration with JailService', () => {
    it('should calculate bail amount through JailService', async () => {
      const { JailService } = await import('../../src/services/jailService');
      const { PriceService } = await import('../../src/services/priceService');

      // Setup price
      testDb!.exec('DELETE FROM price_history');
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      // Setup fine config
      PriceService.setFineConfigUsd('jail_per_minute', 0.01, 'Per minute', 111111111);
      PriceService.setFineConfigUsd('jail_minimum', 0.10, 'Minimum', 111111111);

      const bail = await JailService.calculateBailAmount(120); // 2 hours
      expect(bail).toBe(12); // 120 * $0.01 = $1.20 / $0.10 = 12 JUNO
    });
  });

  describe('Fine config persistence', () => {
    it('should persist fine configs across service reloads', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Set config
      PriceService.setFineConfigUsd('blacklist', 0.75, 'Blacklist fine', 111111111);

      // Verify it's persisted in database
      const result = testDb!.prepare('SELECT * FROM fine_config WHERE fine_type = ?').get('blacklist') as any;
      expect(result.amount_usd).toBe(0.75);
      expect(result.description).toBe('Blacklist fine');

      // Verify we can read it back
      const amount = PriceService.getFineConfigUsd('blacklist');
      expect(amount).toBe(0.75);
    });

    it('should list all configured fines', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      const configs = PriceService.getAllFineConfigs();

      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);
    });
  });

  describe('Price history management', () => {
    it('should maintain price history for averaging', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0.15 } })
      });

      await PriceService.fetchCurrentPrice();

      // Check price was stored
      const history = testDb!.prepare('SELECT * FROM price_history ORDER BY timestamp DESC LIMIT 1').get() as any;
      expect(history).toBeDefined();
      expect(history.price_usd).toBe(0.15);
    });
  });
});
