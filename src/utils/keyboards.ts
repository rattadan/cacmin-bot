/**
 * Inline keyboard utilities for the CAC Admin Bot.
 * Provides reusable keyboard layouts for interactive commands.
 *
 * @module utils/keyboards
 */

import type { InlineKeyboardMarkup } from "telegraf/types";

/**
 * Restriction type options for user restrictions
 */
export const restrictionTypeKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "No Stickers", callback_data: "restrict_no_stickers" },
			{ text: "No URLs", callback_data: "restrict_no_urls" },
		],
		[
			{ text: "No Media (All)", callback_data: "restrict_no_media" },
			{ text: "No GIFs", callback_data: "restrict_no_gifs" },
		],
		[
			{ text: "No Photos", callback_data: "restrict_no_photos" },
			{ text: "No Videos", callback_data: "restrict_no_videos" },
		],
		[
			{ text: "No Documents", callback_data: "restrict_no_documents" },
			{ text: "No Voice", callback_data: "restrict_no_voice" },
		],
		[
			{ text: "No Forwarding", callback_data: "restrict_no_forwarding" },
			{ text: "Regex Block", callback_data: "restrict_regex_block" },
		],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Common jail duration options (in minutes)
 */
export const jailDurationKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "5 min", callback_data: "jail_5" },
			{ text: "10 min", callback_data: "jail_10" },
			{ text: "15 min", callback_data: "jail_15" },
		],
		[
			{ text: "30 min", callback_data: "jail_30" },
			{ text: "1 hour", callback_data: "jail_60" },
			{ text: "2 hours", callback_data: "jail_120" },
		],
		[
			{ text: "6 hours", callback_data: "jail_360" },
			{ text: "12 hours", callback_data: "jail_720" },
			{ text: "24 hours", callback_data: "jail_1440" },
		],
		[
			{ text: "Custom", callback_data: "jail_custom" },
			{ text: "Cancel", callback_data: "cancel" },
		],
	],
};

/**
 * Giveaway slot count options (how many users can claim)
 */
export const giveawaySlotKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "10 slots", callback_data: "giveaway_slots_10" },
			{ text: "25 slots", callback_data: "giveaway_slots_25" },
		],
		[
			{ text: "50 slots", callback_data: "giveaway_slots_50" },
			{ text: "100 slots", callback_data: "giveaway_slots_100" },
		],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Generate claim button for active giveaway
 */
export function giveawayClaimKeyboard(
	giveawayId: number,
	claimedSlots: number,
	totalSlots: number,
): InlineKeyboardMarkup {
	const remaining = totalSlots - claimedSlots;
	return {
		inline_keyboard: [
			[
				{
					text: `Claim (${remaining}/${totalSlots} left)`,
					callback_data: `claim_giveaway_${giveawayId}`,
				},
			],
		],
	};
}

/**
 * Giveaway completed (no more slots)
 */
export const giveawayCompletedKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [[{ text: "Giveaway Complete", callback_data: "noop" }]],
};

/**
 * Global action restriction types
 */
export const globalActionKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "No Stickers", callback_data: "action_no_stickers" },
			{ text: "No URLs", callback_data: "action_no_urls" },
		],
		[
			{ text: "No Media (All)", callback_data: "action_no_media" },
			{ text: "No GIFs", callback_data: "action_no_gifs" },
		],
		[
			{ text: "No Photos", callback_data: "action_no_photos" },
			{ text: "No Videos", callback_data: "action_no_videos" },
		],
		[
			{ text: "No Documents", callback_data: "action_no_documents" },
			{ text: "No Voice", callback_data: "action_no_voice" },
		],
		[{ text: "No Forwarding", callback_data: "action_no_forwarding" }],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Restriction duration presets
 */
export const durationKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "1 hour", callback_data: "duration_3600" },
			{ text: "6 hours", callback_data: "duration_21600" },
			{ text: "12 hours", callback_data: "duration_43200" },
		],
		[
			{ text: "1 day", callback_data: "duration_86400" },
			{ text: "3 days", callback_data: "duration_259200" },
			{ text: "7 days", callback_data: "duration_604800" },
		],
		[
			{ text: "30 days", callback_data: "duration_2592000" },
			{ text: "Permanent", callback_data: "duration_permanent" },
		],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Yes/No confirmation keyboard
 */
export function confirmationKeyboard(action: string): InlineKeyboardMarkup {
	return {
		inline_keyboard: [
			[
				{ text: "Confirm", callback_data: `confirm_${action}` },
				{ text: "Cancel", callback_data: "cancel" },
			],
		],
	};
}

/**
 * Role assignment keyboard
 */
export const roleKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "Make Admin", callback_data: "role_admin" },
			{ text: "Elevate User", callback_data: "role_elevated" },
		],
		[{ text: "Revoke Role", callback_data: "role_revoke" }],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Whitelist/Blacklist action keyboard
 */
export const listActionKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "Add to Whitelist", callback_data: "list_add_white" },
			{ text: "Add to Blacklist", callback_data: "list_add_black" },
		],
		[
			{ text: "Remove from Whitelist", callback_data: "list_remove_white" },
			{ text: "Remove from Blacklist", callback_data: "list_remove_black" },
		],
		[
			{ text: "View Whitelist", callback_data: "list_view_white" },
			{ text: "View Blacklist", callback_data: "list_view_black" },
		],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Shared account permission levels
 */
export const sharedPermissionKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "View Only", callback_data: "perm_view" },
			{ text: "Can Spend", callback_data: "perm_spend" },
		],
		[{ text: "Admin", callback_data: "perm_admin" }],
		[{ text: "Cancel", callback_data: "cancel" }],
	],
};

/**
 * Main menu keyboard for bot commands
 */
export const mainMenuKeyboard: InlineKeyboardMarkup = {
	inline_keyboard: [
		[
			{ text: "Wallet", callback_data: "menu_wallet" },
			{ text: "Shared Accounts", callback_data: "menu_shared" },
		],
		[
			{ text: "Moderation", callback_data: "menu_moderation" },
			{ text: "Lists", callback_data: "menu_lists" },
		],
		[
			{ text: "Roles", callback_data: "menu_roles" },
			{ text: "Statistics", callback_data: "menu_stats" },
		],
		[{ text: "Help", callback_data: "menu_help" }],
	],
};
