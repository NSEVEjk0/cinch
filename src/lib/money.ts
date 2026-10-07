/**
 * Money helpers. All amounts are bigint in a token's smallest unit; these are
 * the only functions permitted to cross between bigint and human strings.
 */

import type { Token } from "./types";

/** Parse a decimal string like "12.50" into smallest-unit bigint for a token. */
export function parseAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`Not a valid amount: "${input}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places for a ${decimals}-decimal token.`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Format a smallest-unit bigint as a human decimal string, trimming zeros. */
export function formatAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const wholeStr = whole.toString();
  if (frac === 0n) return `${negative ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${wholeStr}.${fracStr}`;
}

/** Format with the token symbol appended, e.g. "40.00 pathUSD". */
export function formatWithSymbol(value: bigint, token: Token): string {
  return `${formatAmount(value, token.decimals)} ${token.symbol}`;
}

/** Shorten an address for display: 0x1234…abcd. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Validate a 0x-prefixed 20-byte hex address. */
export function isAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** Percent string from a 0..1 ratio, e.g. 0.846 → "85%". */
export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
