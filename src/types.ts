/**
 * Type definitions for database entities used throughout the CAC Admin Bot.
 * All interfaces map directly to SQLite table schemas.
 *
 * Note: Property names use snake_case to match SQLite column naming conventions.
 *
 * @module types
 */

/**
 * User entity representing a Telegram user in the database.
 * Tracks role, permissions, restrictions, and activity.
 *
 * @interface User
 */
export interface User {
  /** Telegram user ID (unique identifier) */
  id: number;

  /** Telegram username (without @ prefix) */
  username: string;

  /** Whether user is on the whitelist (exempt from restrictions) */
  whitelist: boolean;

  /** Whether user is on the blacklist (blocked from group) */
  blacklist: boolean;

  /** User's role in the hierarchy: owner > admin > elevated > pleb */
  role: 'owner' | 'admin' | 'elevated' | 'pleb';

  /** Number of warnings issued to user */
  warning_count: number;

  /** Unix timestamp when mute expires (undefined if not muted) */
  muted_until?: number;

  /** Unix timestamp when user record was created */
  created_at: number;

  /** Unix timestamp when user record was last updated */
  updated_at: number;
}

/**
 * Global action (restriction) applied to all users in the group.
 *
 * @interface GlobalAction
 */
export interface GlobalAction {
  /** Unique identifier for the global action */
  id: number;

  /** Type of restriction applied */
  restriction: string;

  /** Specific target of restriction (e.g., domain, pattern) */
  restrictedAction?: string;

  /** JSON-encoded additional metadata */
  metadata?: string;

  /** Unix timestamp when restriction expires (undefined for permanent) */
  restrictedUntil?: number;

  /** Unix timestamp when restriction was created */
  createdAt: number;
}

/**
 * Rule definition for violations.
 * Defines what constitutes a violation and its severity.
 *
 * @interface Rule
 */
export interface Rule {
  /** Unique rule identifier */
  id: number;

  /** Category of rule (whitelist, blacklist, restriction) */
  type: 'whitelist' | 'blacklist' | 'restriction';

  /** Human-readable description of the rule */
  description: string;

  /** Specific action targeted by rule (e.g., domain name, pattern) */
  specificAction?: string;

  /** Severity level on 1-10 scale (affects bail amount) */
  severity: number;

  /** Unix timestamp when rule was created */
  createdAt: number;
}

/**
 * Violation record for a user breaking a rule.
 * Tracks the violation, bail amount, and payment status.
 *
 * @interface Violation
 */
export interface Violation {
  /** Unique violation identifier */
  id: number;

  /** ID of user who committed the violation */
  userId: number;

  /** ID of rule that was violated */
  ruleId: number;

  /** Type of restriction that was triggered */
  restriction: string;

  /** Optional message or context about the violation */
  message?: string;

  /** Unix timestamp when violation occurred */
  timestamp: number;

  /** Bail amount required to clear violation (in JUNO tokens) */
  bailAmount: number;

  /** Whether bail has been paid */
  paid: boolean;

  /** Blockchain transaction hash of payment (if paid) */
  paymentTx?: string;

  /** User ID who paid the bail (may differ from violator) */
  paidByUserId?: number;

  /** Unix timestamp when bail was paid */
  paidAt?: number;
}

/**
 * Jail event log entry.
 * Records all jail-related actions (jailing, unjailing, bail payments).
 *
 * @interface JailEvent
 */
export interface JailEvent {
  /** Unique event identifier */
  id: number;

  /** ID of user who was jailed/unjailed */
  userId: number;

  /** Type of jail event */
  eventType: 'jailed' | 'unjailed' | 'auto_unjailed' | 'bail_paid';

  /** ID of admin who performed the action (if applicable) */
  adminId?: number;

  /** Duration of jail sentence in minutes (if applicable) */
  durationMinutes?: number;

  /** Bail amount set for release (in JUNO tokens) */
  bailAmount: number;

  /** User ID who paid bail (if applicable) */
  paidByUserId?: number;

  /** Blockchain transaction hash of bail payment (if applicable) */
  paymentTx?: string;

  /** Unix timestamp when event occurred */
  timestamp: number;

  /** JSON-encoded additional event metadata */
  metadata?: string;
}

/**
 * User-specific restriction configuration.
 * Defines what a particular user is not allowed to do.
 *
 * @interface UserRestriction
 */
export interface UserRestriction {
  /** Unique restriction identifier */
  id: number;

  /** ID of user this restriction applies to */
  userId: number;

  /** Type of restriction imposed */
  restriction: 'no_stickers' | 'no_urls' | 'regex_block' | 'no_media' | 'muted' | 'no_gifs' | 'no_voice' | 'no_forwarding';

  /** Specific target of restriction (e.g., sticker pack ID, domain, regex pattern) */
  restrictedAction?: string;

  /** JSON-encoded additional restriction metadata */
  metadata?: string;

  /** Unix timestamp when restriction expires (undefined for permanent) */
  restrictedUntil?: number;

  /** Unix timestamp when restriction was created */
  createdAt: number;
}

/**
 * Union type of all available restriction types.
 * Used for type safety when applying restrictions.
 *
 * @typedef {string} RestrictionType
 */
export type RestrictionType =
  /** User cannot send stickers */
  | 'no_stickers'
  /** User cannot post URLs */
  | 'no_urls'
  /** User's messages are blocked if matching a regex pattern */
  | 'regex_block'
  /** User cannot send media files (images, videos, documents) */
  | 'no_media'
  /** User cannot send GIF animations */
  | 'no_gifs'
  /** User cannot send voice messages */
  | 'no_voice'
  /** User cannot forward messages */
  | 'no_forwarding'
  /** User is completely muted (cannot send any messages) */
  | 'muted';
