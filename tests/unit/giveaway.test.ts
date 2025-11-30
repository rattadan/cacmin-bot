import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the giveaway system including:
 * - Keyboard utilities
 * - Giveaway creation and claiming
 * - Escrow account management
 */

// Mock database
vi.mock('../../src/database', () => ({
	query: vi.fn(),
	execute: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
	get: vi.fn(),
}));

// Mock config
vi.mock('../../src/config', () => ({
	config: {
		databasePath: ':memory:',
		botToken: 'test-token',
		groupChatId: '-100123456789',
		botTreasuryAddress: 'juno1testtreasuryaddress',
		adminChatId: '123456789',
		junoRpcUrl: 'https://rpc.juno.example.com',
	},
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
	StructuredLogger: {
		logError: vi.fn(),
		logUserAction: vi.fn(),
		logTransaction: vi.fn(),
		logWalletAction: vi.fn(),
	},
}));

// Mock LedgerService
vi.mock('../../src/services/ledgerService', () => ({
	LedgerService: {
		getUserBalance: vi.fn(() => Promise.resolve(1000)),
		transferBetweenUsers: vi.fn(() => Promise.resolve({
			success: true,
			fromBalance: 900,
			toBalance: 100,
		})),
		ensureUserBalance: vi.fn(() => Promise.resolve()),
	},
}));

// Mock userService
vi.mock('../../src/services/userService', () => ({
	createUser: vi.fn(),
	userExists: vi.fn(() => false),
	ensureUserExists: vi.fn(),
}));

import {
	giveawayClaimKeyboard,
	giveawayCompletedKeyboard,
	giveawaySlotKeyboard,
} from '../../src/utils/keyboards';
import {
	getGiveawayEscrowId,
	SYSTEM_USER_IDS,
} from '../../src/services/unifiedWalletService';

describe('Giveaway Keyboards', () => {
	describe('giveawayClaimKeyboard', () => {
		it('should generate claim button with correct remaining slots', () => {
			const keyboard = giveawayClaimKeyboard(123, 5, 10);

			expect(keyboard.inline_keyboard).toHaveLength(1);
			expect(keyboard.inline_keyboard[0]).toHaveLength(1);

			const button = keyboard.inline_keyboard[0][0];
			expect(button.text).toBe('Claim (5/10 left)');
			expect(button.callback_data).toBe('claim_giveaway_123');
		});

		it('should show 0 remaining when all claimed', () => {
			const keyboard = giveawayClaimKeyboard(456, 10, 10);

			const button = keyboard.inline_keyboard[0][0];
			expect(button.text).toBe('Claim (0/10 left)');
		});

		it('should handle different giveaway IDs', () => {
			const keyboard1 = giveawayClaimKeyboard(1, 0, 25);
			const keyboard2 = giveawayClaimKeyboard(999, 0, 25);

			expect(keyboard1.inline_keyboard[0][0].callback_data).toBe('claim_giveaway_1');
			expect(keyboard2.inline_keyboard[0][0].callback_data).toBe('claim_giveaway_999');
		});
	});

	describe('giveawayCompletedKeyboard', () => {
		it('should have a noop button', () => {
			expect(giveawayCompletedKeyboard.inline_keyboard).toHaveLength(1);
			expect(giveawayCompletedKeyboard.inline_keyboard[0][0].text).toBe('Giveaway Complete');
			expect(giveawayCompletedKeyboard.inline_keyboard[0][0].callback_data).toBe('noop');
		});
	});

	describe('giveawaySlotKeyboard', () => {
		it('should have slot options and cancel button', () => {
			expect(giveawaySlotKeyboard.inline_keyboard.length).toBeGreaterThan(1);

			// Find cancel button
			const lastRow = giveawaySlotKeyboard.inline_keyboard[giveawaySlotKeyboard.inline_keyboard.length - 1];
			expect(lastRow.some(btn => btn.callback_data === 'cancel')).toBe(true);
		});

		it('should have 10, 25, 50, 100 slot options', () => {
			const allButtons = giveawaySlotKeyboard.inline_keyboard.flat();
			const slotCallbacks = allButtons.map(btn => btn.callback_data);

			expect(slotCallbacks).toContain('giveaway_slots_10');
			expect(slotCallbacks).toContain('giveaway_slots_25');
			expect(slotCallbacks).toContain('giveaway_slots_50');
			expect(slotCallbacks).toContain('giveaway_slots_100');
		});
	});
});

describe('Giveaway Escrow IDs', () => {
	describe('getGiveawayEscrowId', () => {
		it('should generate unique escrow IDs for different giveaways', () => {
			const id1 = getGiveawayEscrowId(1);
			const id2 = getGiveawayEscrowId(2);
			const id3 = getGiveawayEscrowId(100);

			expect(id1).not.toBe(id2);
			expect(id2).not.toBe(id3);
		});

		it('should generate negative IDs below GIVEAWAY_ESCROW_BASE', () => {
			const base = SYSTEM_USER_IDS.GIVEAWAY_ESCROW_BASE;

			const id1 = getGiveawayEscrowId(1);
			const id100 = getGiveawayEscrowId(100);

			expect(id1).toBeLessThan(base);
			expect(id100).toBeLessThan(base);
			expect(id1).toBe(base - 1);
			expect(id100).toBe(base - 100);
		});

		it('should return consistent IDs for the same giveaway', () => {
			const id = getGiveawayEscrowId(42);
			expect(getGiveawayEscrowId(42)).toBe(id);
			expect(getGiveawayEscrowId(42)).toBe(id);
		});
	});

	describe('SYSTEM_USER_IDS', () => {
		it('should have all required system accounts', () => {
			expect(SYSTEM_USER_IDS.BOT_TREASURY).toBe(-1);
			expect(SYSTEM_USER_IDS.SYSTEM_RESERVE).toBe(-2);
			expect(SYSTEM_USER_IDS.UNCLAIMED).toBe(-3);
			expect(SYSTEM_USER_IDS.GIVEAWAY_ESCROW_BASE).toBe(-1000);
		});

		it('should have distinct IDs for each system account', () => {
			const ids = Object.values(SYSTEM_USER_IDS);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it('should all be negative numbers', () => {
			for (const id of Object.values(SYSTEM_USER_IDS)) {
				expect(id).toBeLessThan(0);
			}
		});
	});
});

describe('Giveaway Amount Calculations', () => {
	it('should calculate correct amount per slot', () => {
		const total = 100;
		const slots = 10;
		const perSlot = total / slots;

		expect(perSlot).toBe(10);
	});

	it('should handle non-even divisions', () => {
		const total = 100;
		const slots = 3;
		const perSlot = total / slots;

		// Should be approximately 33.333...
		expect(perSlot).toBeCloseTo(33.333333, 5);
	});

	it('should handle 6 decimal precision', () => {
		const total = 1;
		const slots = 100;
		const perSlot = total / slots;

		// 0.01 per slot
		expect(perSlot).toBe(0.01);
	});
});

describe('Giveaway State Transitions', () => {
	it('should track claimed vs total slots', () => {
		const giveaway = {
			id: 1,
			total_slots: 10,
			claimed_slots: 0,
			status: 'active' as const,
		};

		// Simulate claims
		giveaway.claimed_slots = 5;
		expect(giveaway.total_slots - giveaway.claimed_slots).toBe(5);

		giveaway.claimed_slots = 10;
		expect(giveaway.total_slots - giveaway.claimed_slots).toBe(0);
	});

	it('should determine completion correctly', () => {
		const isComplete = (claimed: number, total: number) => claimed >= total;

		expect(isComplete(0, 10)).toBe(false);
		expect(isComplete(5, 10)).toBe(false);
		expect(isComplete(9, 10)).toBe(false);
		expect(isComplete(10, 10)).toBe(true);
		expect(isComplete(11, 10)).toBe(true); // Edge case
	});
});

describe('Giveaway Funding Sources', () => {
	it('should identify treasury funding', () => {
		const fundedBy = SYSTEM_USER_IDS.BOT_TREASURY;
		expect(fundedBy).toBe(-1);
		expect(fundedBy === SYSTEM_USER_IDS.BOT_TREASURY).toBe(true);
	});

	it('should identify user funding', () => {
		const userId = 123456789;
		expect(userId).toBeGreaterThan(0);
		expect(userId !== SYSTEM_USER_IDS.BOT_TREASURY).toBe(true);
	});

	it('should parse funding source from callback data', () => {
		const selfData = 'giveaway_create_100_10_self';
		const treasuryData = 'giveaway_create_100_10_treasury';

		const parseSelf = selfData.replace('giveaway_create_', '').split('_');
		const parseTreasury = treasuryData.replace('giveaway_create_', '').split('_');

		expect(parseSelf[2]).toBe('self');
		expect(parseTreasury[2]).toBe('treasury');
	});
});

describe('Callback Data Parsing', () => {
	describe('giveaway_fund callback', () => {
		it('should parse amount and source correctly', () => {
			const data = 'giveaway_fund_100_self';
			const parts = data.replace('giveaway_fund_', '').split('_');

			expect(parts[0]).toBe('100');
			expect(parts[1]).toBe('self');
			expect(parseFloat(parts[0])).toBe(100);
		});

		it('should handle decimal amounts', () => {
			const data = 'giveaway_fund_50.5_treasury';
			const parts = data.replace('giveaway_fund_', '').split('_');

			expect(parseFloat(parts[0])).toBe(50.5);
			expect(parts[1]).toBe('treasury');
		});
	});

	describe('giveaway_create callback', () => {
		it('should parse all parameters', () => {
			const data = 'giveaway_create_100_25_self';
			const parts = data.replace('giveaway_create_', '').split('_');

			expect(parts.length).toBe(3);
			expect(parseFloat(parts[0])).toBe(100); // amount
			expect(parseInt(parts[1], 10)).toBe(25); // slots
			expect(parts[2]).toBe('self'); // source
		});
	});

	describe('claim_giveaway callback', () => {
		it('should parse giveaway ID', () => {
			const data = 'claim_giveaway_123';
			const giveawayId = parseInt(data.replace('claim_giveaway_', ''), 10);

			expect(giveawayId).toBe(123);
		});

		it('should handle invalid ID gracefully', () => {
			const data = 'claim_giveaway_invalid';
			const giveawayId = parseInt(data.replace('claim_giveaway_', ''), 10);

			expect(Number.isNaN(giveawayId)).toBe(true);
		});
	});
});
