import { describe, it, expect } from "vitest";
import { parseAmount, formatAmount, formatWithSymbol, shortAddress, isAddress } from "@/lib/money";
import { PATH_USD } from "@/lib/tempo";

describe("money — parseAmount", () => {
  it("parses whole and fractional amounts for a 6-decimal token", () => {
    expect(parseAmount("1", 6)).toBe(1_000_000n);
    expect(parseAmount("1.5", 6)).toBe(1_500_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
    expect(parseAmount("1234.56", 6)).toBe(1_234_560_000n);
  });

  it("rejects over-precise and malformed amounts", () => {
    expect(() => parseAmount("1.0000001", 6)).toThrow();
    expect(() => parseAmount("abc", 6)).toThrow();
    expect(() => parseAmount("", 6)).toThrow();
    expect(() => parseAmount(".", 6)).toThrow();
  });
});

describe("money — formatAmount", () => {
  it("round-trips with parseAmount", () => {
    for (const s of ["1", "1.5", "1234.56", "0.000001"]) {
      expect(formatAmount(parseAmount(s, 6), 6)).toBe(s);
    }
  });
  it("trims trailing zeros and handles negatives", () => {
    expect(formatAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatAmount(-40_000_000n, 6)).toBe("-40");
    expect(formatAmount(0n, 6)).toBe("0");
  });
  it("formats with symbol", () => {
    expect(formatWithSymbol(40_000_000n, PATH_USD)).toBe("40 pathUSD");
  });
});

describe("money — address helpers", () => {
  it("validates addresses", () => {
    expect(isAddress("0x000000000000000000000000000000000000000a")).toBe(true);
    expect(isAddress("0x123")).toBe(false);
    expect(isAddress("nope")).toBe(false);
  });
  it("shortens addresses", () => {
    expect(shortAddress("0x1234567890123456789012345678901234567890")).toBe("0x1234…7890");
  });
});
