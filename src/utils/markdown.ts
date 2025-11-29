/**
 * MarkdownV2 escaping utilities for Telegram messages.
 *
 * Telegram's MarkdownV2 requires escaping of special characters:
 * _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * @module utils/markdown
 */

/**
 * Characters that must be escaped in MarkdownV2.
 */
const MARKDOWN_V2_SPECIAL_CHARS = /([_*[\]()~`>#+\-=|{}.!\\])/g;

/**
 * Escapes special characters for Telegram MarkdownV2 format.
 *
 * @param text - The text to escape
 * @returns The escaped text safe for MarkdownV2
 *
 * @example
 * ```typescript
 * escapeMarkdownV2('Hello-World 1.5 JUNO');
 * // Returns: 'Hello\\-World 1\\.5 JUNO'
 * ```
 */
export function escapeMarkdownV2(text: string | number): string {
	return String(text).replace(MARKDOWN_V2_SPECIAL_CHARS, "\\$1");
}

/**
 * Escapes a number formatted with decimals for MarkdownV2.
 * Convenience wrapper for numeric values.
 *
 * @param value - The numeric value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Escaped string representation
 *
 * @example
 * ```typescript
 * escapeNumber(123.456, 2);
 * // Returns: '123\\.46'
 * ```
 */
export function escapeNumber(value: number, decimals = 2): string {
	return escapeMarkdownV2(value.toFixed(decimals));
}

/**
 * Formats a JUNO amount with proper escaping for MarkdownV2.
 *
 * @param amount - The JUNO amount
 * @param decimals - Number of decimal places (default: 6)
 * @returns Escaped string like "1\\.234567 JUNO"
 *
 * @example
 * ```typescript
 * formatJunoAmount(1.5);
 * // Returns: '1\\.500000 JUNO'
 * ```
 */
export function formatJunoAmount(amount: number, decimals = 6): string {
	return `${escapeNumber(amount, decimals)} JUNO`;
}
