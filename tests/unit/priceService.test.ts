/**
 * Unit tests for PriceService
 * Tests price fetching, caching, rolling averages, and USD-to-JUNO conversion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

// Test database setup
let testDb: Database.Database | null = null;
const TEST_DB_PATH = join(__dirname, '../test-data/price-service-test.db');

// Mock fetch globally
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
    databasePath: join(__dirname, '../test-data/price-service-test.db'),
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
  const testDbPath = join(__dirname, '../test-data/price-service-test.db');

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

  // Create tables
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

describe('PriceService', () => {
  beforeEach(() => {
    initTestDatabase();
    mockFetch.mockReset();
  });

  afterEach(() => {
    cleanupTestDatabase();
    vi.clearAllMocks();
  });

  describe('fetchCurrentPrice', () => {
    it('should fetch price from CoinGecko API', async () => {
      // Reset module cache for fresh import
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0.25 } })
      });

      const price = await PriceService.fetchCurrentPrice();

      expect(price).toBe(0.25);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('juno-network')
      );
    });

    it('should return cached price within cache duration', async () => {
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0.30 } })
      });

      // First call
      await PriceService.fetchCurrentPrice();

      // Second call should use cache
      const price = await PriceService.fetchCurrentPrice();

      expect(price).toBe(0.30);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const price = await PriceService.fetchCurrentPrice();

      // Should return null when no cache exists
      expect(price).toBeNull();
    });

    it('should handle network errors', async () => {
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const price = await PriceService.fetchCurrentPrice();

      expect(price).toBeNull();
    });
  });

  describe('getRollingAveragePrice', () => {
    it('should calculate average from price history', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Insert test price data
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.20, ${now - 3600}),
        (0.25, ${now - 7200}),
        (0.30, ${now - 10800})
      `);

      const avgPrice = await PriceService.getRollingAveragePrice();

      expect(avgPrice).toBeCloseTo(0.25, 2);
    });

    it('should fall back to current price if no history', async () => {
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0.15 } })
      });

      const avgPrice = await PriceService.getRollingAveragePrice();

      expect(avgPrice).toBe(0.15);
    });
  });

  describe('usdToJuno', () => {
    it('should convert USD to JUNO correctly', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Insert price history
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      const junoAmount = await PriceService.usdToJuno(1.0);

      expect(junoAmount).toBe(10); // $1 / $0.10 = 10 JUNO
    });

    it('should handle zero price gracefully', async () => {
      vi.resetModules();
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0 } })
      });

      const junoAmount = await PriceService.usdToJuno(1.0);

      // Should use fallback price ($0.10/JUNO = 10 JUNO per $1)
      expect(junoAmount).toBe(10);
    });
  });

  describe('Fine Configuration', () => {
    it('should get default fine config values', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      const stickerFine = PriceService.getFineConfigUsd('sticker');

      expect(stickerFine).toBe(0.10);
    });

    it('should set and get custom fine config', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Create test user first
      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);

      PriceService.setFineConfigUsd('sticker', 0.05, 'Reduced fine', 123);

      const fineAmount = PriceService.getFineConfigUsd('sticker');

      expect(fineAmount).toBe(0.05);
    });

    it('should update existing fine config', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);

      PriceService.setFineConfigUsd('url', 0.15, 'First update', 123);
      PriceService.setFineConfigUsd('url', 0.25, 'Second update', 123);

      const fineAmount = PriceService.getFineConfigUsd('url');

      expect(fineAmount).toBe(0.25);
    });

    it('should get all fine configs', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);

      PriceService.setFineConfigUsd('sticker', 0.10, 'Sticker fine', 123);
      PriceService.setFineConfigUsd('url', 0.20, 'URL fine', 123);

      const configs = PriceService.getAllFineConfigs();

      expect(configs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('calculateBailAmount', () => {
    it('should calculate bail based on USD per minute rate', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      // Set up price history
      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);

      // Set jail_per_minute to $0.01 and jail_minimum to $0.10
      PriceService.setFineConfigUsd('jail_per_minute', 0.01, 'Per minute', 123);
      PriceService.setFineConfigUsd('jail_minimum', 0.10, 'Minimum', 123);

      const bail = await PriceService.calculateBailAmount(60); // 1 hour

      // 60 min * $0.01 = $0.60 / $0.10 per JUNO = 6 JUNO
      expect(bail).toBe(6);
    });

    it('should respect minimum bail amount', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);

      PriceService.setFineConfigUsd('jail_per_minute', 0.01, 'Per minute', 123);
      PriceService.setFineConfigUsd('jail_minimum', 0.50, 'Minimum', 123);

      const bail = await PriceService.calculateBailAmount(5); // 5 minutes

      // 5 min * $0.01 = $0.05, but minimum is $0.50 / $0.10 = 5 JUNO
      expect(bail).toBe(5);
    });
  });

  describe('calculateViolationFine', () => {
    it('should calculate violation fine for sticker', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);
      PriceService.setFineConfigUsd('sticker', 0.10, 'Sticker fine', 123);

      const fine = await PriceService.calculateViolationFine('no_stickers');

      expect(fine).toBe(1); // $0.10 / $0.10 = 1 JUNO
    });

    it('should calculate violation fine for URL', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      const now = Math.floor(Date.now() / 1000);
      testDb!.exec(`
        INSERT INTO price_history (price_usd, timestamp) VALUES
        (0.10, ${now - 3600})
      `);

      testDb!.exec(`INSERT INTO users (id, username) VALUES (123, 'testuser')`);
      PriceService.setFineConfigUsd('url', 0.20, 'URL fine', 123);

      const fine = await PriceService.calculateViolationFine('no_urls');

      expect(fine).toBe(2); // $0.20 / $0.10 = 2 JUNO
    });
  });

  describe('getPriceInfo', () => {
    it('should return price information', async () => {
      const { PriceService } = await import('../../src/services/priceService');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'juno-network': { usd: 0.20 } })
      });

      const info = await PriceService.getPriceInfo();

      expect(info).toHaveProperty('current');
      expect(info).toHaveProperty('average');
      expect(info).toHaveProperty('lastUpdate');
    });
  });
});
