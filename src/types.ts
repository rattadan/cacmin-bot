// Type for a User in the database
// Note: Property names match SQLite column names (snake_case)
export interface User {
  id: number; // Telegram user ID
  username: string;
  whitelist: boolean;
  blacklist: boolean;
  role: 'owner' | 'admin' | 'elevated' | 'pleb'; // User roles
  warning_count: number;
  muted_until?: number;
  created_at: number;
  updated_at: number;
}

export interface GlobalAction {
  id: number;
  restriction: string;
  restrictedAction?: string;
  metadata?: string;
  restrictedUntil?: number;
  createdAt: number;
}

// Type for a Rule
export interface Rule {
  id: number; // Rule ID
  type: 'whitelist' | 'blacklist' | 'restriction'; // Rule type
  description: string; // Description of the rule
  specificAction?: string; // Optional specific action (e.g., a domain name)
  severity: number; // 1-10 scale
  createdAt: number;
}

// Type for a Violation
export interface Violation {
  id: number; // Violation ID
  userId: number; // Associated user's ID
  ruleId: number; // Rule ID that was violated
  restriction: string;
  message?: string;
  timestamp: number; // Time of violation (epoch time)
  bailAmount: number; // Bail amount in JUNO
  paid: boolean; // true if the violation's bail is paid
  paymentTx?: string;
}

// Type for a User Restriction
export interface UserRestriction {
  id: number;
  userId: number; // User ID from the database
  restriction: 'no_stickers' | 'no_urls' | 'regex_block' | 'no_media' | 'muted' | 'no_gifs' | 'no_voice' | 'no_forwarding'; // Restriction type
  restrictedAction?: string; // Optional target (e.g., domain, sticker pack ID)
  metadata?: string; // Optional JSON-encoded metadata
  restrictedUntil?: number; // Expiration timestamp (epoch time) or NULL
  createdAt: number;
}

export type RestrictionType =
  | 'no_stickers'
  | 'no_urls'
  | 'regex_block'
  | 'no_media'
  | 'no_gifs'
  | 'no_voice'
  | 'no_forwarding'
  | 'muted';
