import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { logger } from './utils/logger';

dotenv.config({ path: resolve(__dirname, '../.env') });

interface Config {
  botToken: string;
  junoRpcUrl: string;
  junoApiUrl?: string;
  adminChatId: number;
  groupChatId?: number;
  ownerId: number;
  botTreasuryAddress?: string; // Bot treasury wallet address
  userFundsAddress?: string; // Collective user funds wallet address
  userFundsMnemonic?: string; // Mnemonic for user funds wallet (for withdrawals)
  databasePath: string;
  logLevel: string;
  fineAmounts: {
    sticker: number;
    url: number;
    regex: number;
    blacklist: number;
  };
  restrictionDurations: {
    warning: number; // milliseconds
    mute: number;
    tempBan: number;
  };
}

export const config: Config = {
  botToken: process.env.BOT_TOKEN || '',
  junoRpcUrl: process.env.JUNO_RPC_URL || 'https://rpc.juno.basementnodes.ca',
  junoApiUrl: process.env.JUNO_API_URL || 'https://api.juno.basementnodes.ca',
  adminChatId: parseInt(process.env.ADMIN_CHAT_ID || '0'),
  groupChatId: process.env.GROUP_CHAT_ID ? parseInt(process.env.GROUP_CHAT_ID) : undefined,
  ownerId: parseInt(process.env.OWNER_ID || '0'),
  botTreasuryAddress: process.env.BOT_TREASURY_ADDRESS,
  userFundsAddress: process.env.USER_FUNDS_ADDRESS,
  userFundsMnemonic: process.env.USER_FUNDS_MNEMONIC,
  databasePath: process.env.DATABASE_PATH || './data/bot.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  fineAmounts: {
    sticker: 1.0,
    url: 2.0,
    regex: 1.5,
    blacklist: 5.0
  },
  restrictionDurations: {
    warning: 24 * 60 * 60 * 1000, // 24 hours
    mute: 60 * 60 * 1000, // 1 hour
    tempBan: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

// Validate configuration
export function validateConfig(): void {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN is required in environment variables');
  }
  if (!config.ownerId) {
    throw new Error('OWNER_ID is required in environment variables');
  }

  // Warn about ledger system configuration
  if (!config.userFundsAddress || !config.userFundsMnemonic) {
    logger.warn('User funds wallet not fully configured - deposit/withdrawal features will be limited');
  }

  if (!config.botTreasuryAddress) {
    logger.warn('Bot treasury address not configured - some payment features may not work');
  }
}
