/**
 * @module utils/precision
 * @description Precise arithmetic utilities for handling JUNO token amounts.
 * Implements exact 6-decimal precision arithmetic without rounding, using micro-unit
 * conversion for integer math to avoid floating-point errors. Critical for financial
 * operations to prevent rounding errors and ensure blockchain-compatible amounts.
 *
 * Key features:
 * - NO ROUNDING - operations maintain exact precision or throw errors
 * - 6-decimal precision matching JUNO token specification
 * - Micro-unit conversion (1 JUNO = 1,000,000 uJUNO) for exact integer arithmetic
 * - Validation to prevent precision loss and invalid amounts
 */

/**
 * AmountPrecision class providing static methods for exact JUNO amount arithmetic.
 * All operations use integer math in micro-units (uJUNO) to avoid floating-point errors.
 */
export class AmountPrecision {
  /**
   * Validates that an amount has at most 6 decimal places and returns exact 6-decimal representation.
   * Throws an error if amount exceeds 6 decimal places - NO ROUNDING is performed.
   *
   * @param amount - The JUNO amount to validate
   * @returns The amount with exactly 6 decimal places
   * @throws Error if amount has more than 6 decimal places
   *
   * @example
   * AmountPrecision.validateAmount(1.5)       // Returns 1.500000
   * AmountPrecision.validateAmount(1.123456)  // Returns 1.123456
   * AmountPrecision.validateAmount(1.1234567) // Throws Error
   */
  static validateAmount(amount: number): number {
    // Convert to string to check decimal places
    const amountStr = amount.toString();

    // Check if it has a decimal point
    if (amountStr.includes('.')) {
      const parts = amountStr.split('.');
      const decimals = parts[1];

      // If more than 6 decimals, it's invalid
      if (decimals.length > 6) {
        throw new Error(
          `Invalid amount precision: ${amount} has ${decimals.length} decimals. ` +
          `JUNO amounts must have at most 6 decimal places.`
        );
      }
    }

    // Parse to exactly 6 decimals (padding with zeros if needed for storage)
    return this.toExact6Decimals(amount);
  }

  /**
   * Converts an amount to exactly 6 decimal places.
   * Pads with zeros if fewer decimals, throws if more than 6 decimals.
   *
   * @param amount - The JUNO amount to convert
   * @returns The amount as a number with exactly 6 decimal places
   * @throws Error if amount has more than 6 decimal places
   *
   * @example
   * AmountPrecision.toExact6Decimals(1.5)     // Returns 1.500000
   * AmountPrecision.toExact6Decimals(1.12)    // Returns 1.120000
   * AmountPrecision.toExact6Decimals(5)       // Returns 5.000000
   */
  static toExact6Decimals(amount: number): number {
    // First validate it doesn't have too many decimals
    const amountStr = amount.toString();

    if (amountStr.includes('.')) {
      const decimals = amountStr.split('.')[1];
      if (decimals.length > 6) {
        throw new Error(`Cannot convert ${amount} to 6 decimals - too many decimal places`);
      }
    }

    // Convert to 6 decimal string representation
    const fixed = amount.toFixed(6);

    // Parse back to number (this preserves exact precision)
    return parseFloat(fixed);
  }

  /**
   * Formats an amount for display with exactly 6 decimal places.
   *
   * @param amount - The JUNO amount to format
   * @returns Formatted string with 6 decimal places
   *
   * @example
   * AmountPrecision.format(1.5)      // Returns '1.500000'
   * AmountPrecision.format(100.123)  // Returns '100.123000'
   */
  static format(amount: number): string {
    return amount.toFixed(6);
  }

  /**
   * Converts JUNO amount to micro JUNO (uJUNO) for blockchain operations.
   * Conversion: 1 JUNO = 1,000,000 uJUNO
   * Uses integer arithmetic to avoid floating-point errors.
   *
   * @param amount - The JUNO amount to convert
   * @returns The amount in uJUNO (micro units) as an integer
   * @throws Error if precision loss is detected during conversion
   *
   * @example
   * AmountPrecision.toMicroJuno(1.5)      // Returns 1500000
   * AmountPrecision.toMicroJuno(0.000001) // Returns 1
   * AmountPrecision.toMicroJuno(100)      // Returns 100000000
   */
  static toMicroJuno(amount: number): number {
    // Validate first
    this.validateAmount(amount);

    // Multiply by 1 million and ensure it's an integer
    const micro = Math.floor(amount * 1_000_000);

    // Verify no precision loss
    const backToJuno = micro / 1_000_000;
    if (Math.abs(backToJuno - amount) > 0.000001) {
      throw new Error(`Precision loss detected converting ${amount} to micro units`);
    }

    return micro;
  }

  /**
   * Converts micro JUNO (uJUNO) to JUNO amount.
   * Inverse of toMicroJuno. Always returns exactly 6 decimal places.
   *
   * @param microAmount - The uJUNO amount (must be an integer)
   * @returns The amount in JUNO with exactly 6 decimal places
   * @throws Error if microAmount is not an integer
   *
   * @example
   * AmountPrecision.fromMicroJuno(1500000)  // Returns 1.500000
   * AmountPrecision.fromMicroJuno(1)        // Returns 0.000001
   * AmountPrecision.fromMicroJuno(100000000) // Returns 100.000000
   */
  static fromMicroJuno(microAmount: number): number {
    // Ensure it's an integer
    if (!Number.isInteger(microAmount)) {
      throw new Error(`Micro amount must be an integer, got ${microAmount}`);
    }

    // Convert to JUNO with exactly 6 decimals
    const juno = microAmount / 1_000_000;
    return this.toExact6Decimals(juno);
  }

  /**
   * Adds two JUNO amounts with exact precision using integer arithmetic.
   * Converts both amounts to uJUNO, performs integer addition, converts back.
   *
   * @param amount1 - First JUNO amount to add
   * @param amount2 - Second JUNO amount to add
   * @returns The sum with exactly 6 decimal places
   * @throws Error if either amount has invalid precision
   *
   * @example
   * AmountPrecision.add(1.5, 2.3)        // Returns 3.800000
   * AmountPrecision.add(0.000001, 0.000002) // Returns 0.000003
   * AmountPrecision.add(100, 50.5)       // Returns 150.500000
   */
  static add(amount1: number, amount2: number): number {
    // Validate both amounts
    const validated1 = this.validateAmount(amount1);
    const validated2 = this.validateAmount(amount2);

    // Convert to micro for exact integer math
    const micro1 = this.toMicroJuno(validated1);
    const micro2 = this.toMicroJuno(validated2);

    // Add in micro units
    const resultMicro = micro1 + micro2;

    // Convert back to JUNO
    return this.fromMicroJuno(resultMicro);
  }

  /**
   * Subtracts two JUNO amounts with exact precision using integer arithmetic.
   * Converts both amounts to uJUNO, performs integer subtraction, converts back.
   * Prevents negative results by throwing an error.
   *
   * @param amount1 - JUNO amount to subtract from
   * @param amount2 - JUNO amount to subtract
   * @returns The difference with exactly 6 decimal places
   * @throws Error if result would be negative or either amount has invalid precision
   *
   * @example
   * AmountPrecision.subtract(5.5, 2.3)   // Returns 3.200000
   * AmountPrecision.subtract(1, 0.5)     // Returns 0.500000
   * AmountPrecision.subtract(1, 2)       // Throws Error (negative result)
   */
  static subtract(amount1: number, amount2: number): number {
    // Validate both amounts
    const validated1 = this.validateAmount(amount1);
    const validated2 = this.validateAmount(amount2);

    // Convert to micro for exact integer math
    const micro1 = this.toMicroJuno(validated1);
    const micro2 = this.toMicroJuno(validated2);

    // Ensure no negative result
    if (micro1 < micro2) {
      throw new Error(
        `Cannot subtract ${amount2} from ${amount1} - would result in negative amount`
      );
    }

    // Subtract in micro units
    const resultMicro = micro1 - micro2;

    // Convert back to JUNO
    return this.fromMicroJuno(resultMicro);
  }

  /**
   * Compares two JUNO amounts for exact equality at micro precision.
   * Returns true only if amounts are identical at the uJUNO level.
   *
   * @param amount1 - First JUNO amount to compare
   * @param amount2 - Second JUNO amount to compare
   * @returns True if amounts are exactly equal, false otherwise
   *
   * @example
   * AmountPrecision.equals(1.5, 1.500000)  // Returns true
   * AmountPrecision.equals(1.5, 1.500001)  // Returns false
   * AmountPrecision.equals(0, 0.000000)    // Returns true
   */
  static equals(amount1: number, amount2: number): boolean {
    try {
      const micro1 = this.toMicroJuno(amount1);
      const micro2 = this.toMicroJuno(amount2);
      return micro1 === micro2;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the first JUNO amount is greater than the second.
   * Compares at micro precision level for exact comparison.
   *
   * @param amount1 - First JUNO amount
   * @param amount2 - Second JUNO amount
   * @returns True if amount1 > amount2, false otherwise
   *
   * @example
   * AmountPrecision.isGreaterThan(5.5, 2.3)     // Returns true
   * AmountPrecision.isGreaterThan(1.5, 1.5)     // Returns false
   * AmountPrecision.isGreaterThan(1, 1.000001)  // Returns false
   */
  static isGreaterThan(amount1: number, amount2: number): boolean {
    const micro1 = this.toMicroJuno(amount1);
    const micro2 = this.toMicroJuno(amount2);
    return micro1 > micro2;
  }

  /**
   * Checks if the first JUNO amount is greater than or equal to the second.
   * Compares at micro precision level for exact comparison.
   *
   * @param amount1 - First JUNO amount
   * @param amount2 - Second JUNO amount
   * @returns True if amount1 >= amount2, false otherwise
   *
   * @example
   * AmountPrecision.isGreaterOrEqual(5.5, 2.3)  // Returns true
   * AmountPrecision.isGreaterOrEqual(1.5, 1.5)  // Returns true
   * AmountPrecision.isGreaterOrEqual(1, 1.000001) // Returns false
   */
  static isGreaterOrEqual(amount1: number, amount2: number): boolean {
    const micro1 = this.toMicroJuno(amount1);
    const micro2 = this.toMicroJuno(amount2);
    return micro1 >= micro2;
  }

  /**
   * Parses and validates a JUNO amount from user input string.
   * Strips whitespace, validates format, ensures positive value, and checks precision.
   * Suitable for parsing amounts from command arguments and user messages.
   *
   * @param input - The user input string to parse
   * @returns The validated JUNO amount with exactly 6 decimal places
   * @throws Error if input is not a valid number, is non-positive, or has too many decimals
   *
   * @example
   * AmountPrecision.parseUserInput('1.5')      // Returns 1.500000
   * AmountPrecision.parseUserInput('  100  ')  // Returns 100.000000
   * AmountPrecision.parseUserInput('0.000001') // Returns 0.000001
   * AmountPrecision.parseUserInput('abc')      // Throws Error
   * AmountPrecision.parseUserInput('-5')       // Throws Error (negative)
   * AmountPrecision.parseUserInput('1.1234567') // Throws Error (too many decimals)
   */
  static parseUserInput(input: string): number {
    // Remove any whitespace
    const cleaned = input.trim();

    // Check if valid number
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) {
      throw new Error(`Invalid amount: ${input}`);
    }

    // Check if positive
    if (parsed <= 0) {
      throw new Error(`Amount must be positive: ${parsed}`);
    }

    // Validate precision
    return this.validateAmount(parsed);
  }
}