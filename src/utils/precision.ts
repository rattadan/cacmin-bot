/**
 * Utility for handling JUNO amounts with exact 6-decimal precision
 * NO ROUNDING - exact precision only
 */
export class AmountPrecision {
  /**
   * Ensure amount has exactly 6 decimal places
   * Throws error if amount has more than 6 decimals
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
   * Convert amount to exactly 6 decimal places
   * Pads with zeros if fewer decimals, throws if more
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
   * Format amount for display (exactly 6 decimals)
   */
  static format(amount: number): string {
    return amount.toFixed(6);
  }

  /**
   * Convert JUNO to uJUNO (micro JUNO)
   * 1 JUNO = 1,000,000 uJUNO
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
   * Convert uJUNO to JUNO
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
   * Add two amounts with exact precision
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
   * Subtract two amounts with exact precision
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
   * Compare two amounts for equality (within micro precision)
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
   * Check if amount1 is greater than amount2
   */
  static isGreaterThan(amount1: number, amount2: number): boolean {
    const micro1 = this.toMicroJuno(amount1);
    const micro2 = this.toMicroJuno(amount2);
    return micro1 > micro2;
  }

  /**
   * Check if amount1 is greater than or equal to amount2
   */
  static isGreaterOrEqual(amount1: number, amount2: number): boolean {
    const micro1 = this.toMicroJuno(amount1);
    const micro2 = this.toMicroJuno(amount2);
    return micro1 >= micro2;
  }

  /**
   * Parse amount from user input
   * Validates and returns exact 6-decimal amount
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