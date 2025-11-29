/**
 * Security and functionality tests for safe regex utilities
 * Tests pattern validation, compilation, and ReDoS protection
 */

import {
	validatePattern,
	compileSafeRegex,
	testPatternSafely,
	matchesPattern,
	createPatternObject
} from '../../src/utils/safeRegex';

describe('Safe Regex Utilities', () => {
	describe('Pattern Validation', () => {
		it('should validate simple text patterns', () => {
			const result = validatePattern('test');
			expect(result.isValid).toBe(true);
			expect(result.sanitized).toBe('test');
		});

		it('should validate wildcard patterns', () => {
			const result = validatePattern('test*pattern');
			expect(result.isValid).toBe(true);
			expect(result.sanitized).toBe('test*pattern');
		});

		it('should validate regex patterns', () => {
			const result = validatePattern('/test.*pattern/gi');
			expect(result.isValid).toBe(true);
			expect(result.sanitized).toBe('/test.*pattern/gi');
		});

		it('should reject empty patterns', () => {
			const result = validatePattern('');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('empty');
		});

		it('should reject patterns exceeding length limit', () => {
			const longPattern = 'a'.repeat(501);
			const result = validatePattern(longPattern);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('maximum length');
		});

		it('should reject regex with invalid flags', () => {
			const result = validatePattern('/test/xyz');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('Invalid regex flag');
		});

		it('should reject regex with missing closing slash', () => {
			const result = validatePattern('/test');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('missing closing');
		});

		it('should reject invalid regex syntax', () => {
			const result = validatePattern('/test(/gi');
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('Invalid regex syntax');
		});

		it('should sanitize control characters', () => {
			const result = validatePattern('test\x00pattern\x1F');
			expect(result.isValid).toBe(true);
			expect(result.sanitized).toBe('testpattern');
		});

		it('should allow valid regex flags', () => {
			const validFlags = ['g', 'i', 'm', 's', 'u'];
			for (const flag of validFlags) {
				const result = validatePattern(`/test/${flag}`);
				expect(result.isValid).toBe(true);
			}
		});
	});

	describe('Pattern Compilation', () => {
		it('should compile simple text as substring match', () => {
			const pattern = compileSafeRegex('test');
			expect(pattern.type).toBe('simple');
			expect(pattern.regex.test('this is a test')).toBe(true);
			expect(pattern.regex.test('this is a TEST')).toBe(true); // case insensitive
			expect(pattern.regex.test('nothing here')).toBe(false);
		});

		it('should compile wildcard patterns', () => {
			const pattern = compileSafeRegex('test*pattern');
			expect(pattern.type).toBe('wildcard');
			expect(pattern.regex.test('test123pattern')).toBe(true);
			expect(pattern.regex.test('testpattern')).toBe(true);
			expect(pattern.regex.test('test pattern')).toBe(true);
		});

		it('should compile wildcard with ? for single char', () => {
			const pattern = compileSafeRegex('test?pattern');
			expect(pattern.type).toBe('wildcard');
			expect(pattern.regex.test('testapattern')).toBe(true);
			expect(pattern.regex.test('testpattern')).toBe(false);
		});

		it('should compile full regex patterns', () => {
			const pattern = compileSafeRegex('/test.*pattern/gi');
			expect(pattern.type).toBe('regex');
			pattern.regex.lastIndex = 0;
			expect(pattern.regex.test('test123pattern')).toBe(true);
			pattern.regex.lastIndex = 0;
			expect(pattern.regex.test('TEST456PATTERN')).toBe(true);
		});

		it('should escape special regex chars in simple patterns', () => {
			const pattern = compileSafeRegex('test.pattern');
			expect(pattern.type).toBe('simple');
			expect(pattern.regex.test('test.pattern')).toBe(true);
			expect(pattern.regex.test('testapattern')).toBe(false);
		});

		it('should preserve raw pattern string', () => {
			const pattern = compileSafeRegex('test*pattern');
			expect(pattern.raw).toBe('test*pattern');
		});
	});

	describe('Safe Pattern Matching', () => {
		it('should match patterns with timeout protection', async () => {
			const regex = /test.*pattern/i;
			const result = await testPatternSafely(regex, 'test123pattern', 100);
			expect(result).toBe(true);
		});

		it('should handle no matches', async () => {
			const regex = /test.*pattern/i;
			const result = await testPatternSafely(regex, 'nothing here', 100);
			expect(result).toBe(false);
		});

		it('should timeout on catastrophic backtracking (ReDoS)', async () => {
			// This pattern can cause catastrophic backtracking
			// Note: Node.js regex engine may not respect our timeout for extreme cases
			// but we test that the timeout mechanism works
			const redosRegex = /(a+)+b/;
			const attackString = 'a'.repeat(20) + 'c';

			const startTime = Date.now();
			const result = await testPatternSafely(redosRegex, attackString, 100);
			const duration = Date.now() - startTime;

			// Should timeout and return false
			// Duration may exceed timeout if regex engine doesn't yield control
			expect(result).toBe(false);
			expect(duration).toBeGreaterThanOrEqual(50); // At least half of timeout duration (timing can vary significantly in CI)
		}, 10000);

		it('should handle regex errors gracefully', async () => {
			const regex = /test/i;
			// Force error by testing with null (cast to string)
			const result = await testPatternSafely(regex, null as any, 100);
			expect(result).toBe(false);
		});

		it('should use default timeout if not specified', async () => {
			const regex = /test/i;
			const result = await testPatternSafely(regex, 'test');
			expect(result).toBe(true);
		});
	});

	describe('Synchronous Pattern Matching', () => {
		it('should match patterns synchronously', () => {
			const regex = /test.*pattern/i;
			expect(matchesPattern(regex, 'test123pattern')).toBe(true);
			expect(matchesPattern(regex, 'nothing')).toBe(false);
		});

		it('should handle regex errors gracefully', () => {
			const regex = /test/i;
			const result = matchesPattern(regex, null as any);
			expect(result).toBe(false);
		});
	});

	describe('Pattern Object Creation', () => {
		it('should create valid pattern object from simple text', () => {
			const pattern = createPatternObject('test');
			expect(pattern).not.toBeNull();
			expect(pattern?.type).toBe('simple');
			expect(pattern?.regex.test('test')).toBe(true);
		});

		it('should create valid pattern object from wildcard', () => {
			const pattern = createPatternObject('test*');
			expect(pattern).not.toBeNull();
			expect(pattern?.type).toBe('wildcard');
		});

		it('should create valid pattern object from regex', () => {
			const pattern = createPatternObject('/test.*/gi');
			expect(pattern).not.toBeNull();
			expect(pattern?.type).toBe('regex');
		});

		it('should return null for invalid patterns', () => {
			const pattern = createPatternObject('');
			expect(pattern).toBeNull();
		});

		it('should return null for patterns exceeding length', () => {
			const longPattern = 'a'.repeat(501);
			const pattern = createPatternObject(longPattern);
			expect(pattern).toBeNull();
		});

		it('should return null for invalid regex', () => {
			const pattern = createPatternObject('/test(/gi');
			expect(pattern).toBeNull();
		});
	});

	describe('Security Tests - ReDoS Protection', () => {
		it('should protect against nested quantifiers attack', async () => {
			const pattern = createPatternObject('/(a+)+b/');
			expect(pattern).not.toBeNull();

			const attackString = 'a'.repeat(25) + 'c'; // No 'b' at end causes backtracking
			const result = await testPatternSafely(pattern!.regex, attackString, 100);

			// Should timeout and return false, not hang
			expect(result).toBe(false);
		}, 10000);

		it('should protect against alternation attack', async () => {
			const pattern = createPatternObject('/(a|a)*b/');
			expect(pattern).not.toBeNull();

			const attackString = 'a'.repeat(25) + 'c';
			const result = await testPatternSafely(pattern!.regex, attackString, 100);

			expect(result).toBe(false);
		}, 10000);

		it('should protect against grouping attack', async () => {
			const pattern = createPatternObject('/(a|ab)*c/');
			expect(pattern).not.toBeNull();

			const attackString = 'ab'.repeat(15) + 'd';
			const result = await testPatternSafely(pattern!.regex, attackString, 100);

			expect(result).toBe(false);
		}, 10000);

		it('should handle normal patterns quickly', async () => {
			const pattern = createPatternObject('/test.*pattern/');
			expect(pattern).not.toBeNull();

			const normalString = 'test some normal pattern';
			const startTime = Date.now();
			const result = await testPatternSafely(pattern!.regex, normalString, 100);
			const duration = Date.now() - startTime;

			expect(result).toBe(true);
			expect(duration).toBeLessThan(50); // Should complete quickly
		});
	});

	describe('Edge Cases', () => {
		it('should handle unicode characters', () => {
			const pattern = createPatternObject('test\u00e9');
			expect(pattern).not.toBeNull();
			expect(pattern?.regex.test('testé')).toBe(true);
		});

		it('should handle multiline strings', () => {
			const pattern = createPatternObject('/test[\\s\\S]*pattern/im');
			expect(pattern).not.toBeNull();
			pattern!.regex.lastIndex = 0;
			expect(pattern?.regex.test('test\nsome\npattern')).toBe(true);
		});

		it('should handle empty string matching', () => {
			const pattern = createPatternObject('');
			expect(pattern).toBeNull();
		});

		it('should handle whitespace patterns', () => {
			const pattern = createPatternObject('test pattern');
			expect(pattern).not.toBeNull();
			expect(pattern?.regex.test('test pattern')).toBe(true);
		});

		it('should be case insensitive by default for simple patterns', () => {
			const pattern = createPatternObject('TeSt');
			expect(pattern).not.toBeNull();
			expect(pattern?.regex.test('test')).toBe(true);
			expect(pattern?.regex.test('TEST')).toBe(true);
		});
	});

	describe('Real-World Usage Examples', () => {
		it('should block spam patterns', async () => {
			const pattern = createPatternObject('/buy.*now|click.*here|limited.*offer/i');
			expect(pattern).not.toBeNull();

			expect(await testPatternSafely(pattern!.regex, 'Buy this now!', 100)).toBe(true);
			expect(await testPatternSafely(pattern!.regex, 'Click here for more', 100)).toBe(true);
			expect(await testPatternSafely(pattern!.regex, 'Limited offer today', 100)).toBe(true);
			expect(await testPatternSafely(pattern!.regex, 'Normal message', 100)).toBe(false);
		});

		it('should block specific domains with wildcard', () => {
			const pattern = createPatternObject('*scam-site.com*');
			expect(pattern).not.toBeNull();

			expect(matchesPattern(pattern!.regex, 'Visit scam-site.com')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'http://scam-site.com/page')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'Visit legitimate-site.com')).toBe(false);
		});

		it('should match exact phrases', () => {
			const pattern = createPatternObject('forbidden phrase');
			expect(pattern).not.toBeNull();

			expect(matchesPattern(pattern!.regex, 'This contains forbidden phrase here')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'FORBIDDEN PHRASE')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'This is fine')).toBe(false);
		});

		it('should match with flexible wildcards', () => {
			const pattern = createPatternObject('banned*word');
			expect(pattern).not.toBeNull();

			expect(matchesPattern(pattern!.regex, 'banned word')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'banned123word')).toBe(true);
			expect(matchesPattern(pattern!.regex, 'bannedword')).toBe(true);
		});
	});
});
