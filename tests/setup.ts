/**
 * Global test setup
 * Runs once before all tests
 */

import { config } from '../src/config';

// Mock environment variables for testing
process.env.BOT_TOKEN = 'test-bot-token';
process.env.GROUP_CHAT_ID = '-100123456789';
process.env.BOT_TREASURY_ADDRESS = 'juno1testtreasuryaddress';
process.env.USER_FUNDS_ADDRESS = 'juno1testuserfundsaddress';
process.env.USER_FUNDS_MNEMONIC = 'test mnemonic for user funds wallet';
process.env.ADMIN_CHAT_ID = '123456789';

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test timeout
jest.setTimeout(10000);
