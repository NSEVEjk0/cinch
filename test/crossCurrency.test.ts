import { describe, it, expect } from "vitest";
import { planFundingConversions, withSlippage } from "@/lib/crossCurrency";
import type { Token } from "@/lib/types";

const PATH_USD: Token = {
  address: "0x20c0000000000000000000000000000000000000",
  symbol: "pathUSD",
  decimals: 6,
};
const ALPHA_USD: Token = {
  address: "0x20c0000000000000000000000000000000000001",
  symbol: "AlphaUSD",
  decimals: 6,
};
const BETA_USD: Token = {
  address: "0x20c0000000000000000000000000000000000002",
  symbol: "BetaUSD",
  decimals: 6,
};

const usd = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

/** A fake quote engine: 1:1 with a 0.4% spread, like the live DEX pairs. */
const fakeQuote = async (from: Token, to: Token, amountIn: bigint): Promise<bigint> =>
  (amountIn * 9960n) / 10_000n;

describe("planFundingConversions", () => {
  it("returns nothing when debits are fully covered by same-token balances", async () => {
    const plan = await planFundingConversions(
      [{ token: ALPHA_USD, amount: usd(100) }],
      [{ token: ALPHA_USD, balance: usd(150) }],
      fakeQuote
    );
    expect(plan).toEqual([]);
  });

  it("returns nothing when there are no debits", async () => {
    const plan = await planFundingConversions([], [{ token: PATH_USD, balance: usd(10) }], fakeQuote);
    expect(plan).toEqual([]);
  });

  it("returns nothing when there is no surplus to sell", async () => {
    const plan = await planFundingConversions(
      [{ token: ALPHA_USD, amount: usd(100) }],
      [{ token: ALPHA_USD, balance: usd(50) }],
      fakeQuote
    );
    expect(plan).toEqual([]);
  });

  it("plans a conversion from a surplus stablecoin into the shortfall token", async () => {
    const plan = await planFundingConversions(
      [{ token: ALPHA_USD, amount: usd(100) }],
      [
        { token: ALPHA_USD, balance: usd(40) },
        { token: PATH_USD, balance: usd(500) },
      ],
      fakeQuote
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].from.symbol).toBe("pathUSD");
    expect(plan[0].to.symbol).toBe("AlphaUSD");
    // The sell is bumped past the 60 shortfall so the DEX spread doesn't leave
    // the payer underfunded — expectedOut must cover the shortfall.
    expect(plan[0].expectedOut).toBeGreaterThanOrEqual(usd(60) - 1n);
    expect(plan[0].amountIn).toBeGreaterThan(usd(60));
  });

  it("does not sell a token that is itself needed to cover its own debit", async () => {
    const plan = await planFundingConversions(
      [
        { token: ALPHA_USD, amount: usd(100) },
        { token: PATH_USD, amount: usd(80) },
      ],
      [
        { token: ALPHA_USD, balance: usd(30) },
        { token: PATH_USD, balance: usd(300) },
      ],
      fakeQuote
    );
    // pathUSD surplus after covering its own 80 debit = 220, so the AlphaUSD
    // shortfall (70) is funded from pathUSD.
    expect(plan).toHaveLength(1);
    expect(plan[0].from.symbol).toBe("pathUSD");
    expect(plan[0].to.symbol).toBe("AlphaUSD");
    expect(plan[0].expectedOut).toBeGreaterThanOrEqual(usd(70) - 1n);
  });

  it("plans multiple conversions when several tokens have shortfalls", async () => {
    const plan = await planFundingConversions(
      [
        { token: ALPHA_USD, amount: usd(100) },
        { token: BETA_USD, amount: usd(50) },
      ],
      [
        { token: ALPHA_USD, balance: usd(20) },
        { token: BETA_USD, balance: usd(10) },
        { token: PATH_USD, balance: usd(1000) },
      ],
      fakeQuote
    );
    expect(plan).toHaveLength(2);
    const targets = plan.map((c) => c.to.symbol).sort();
    expect(targets).toEqual(["AlphaUSD", "BetaUSD"]);
  });

  it("stops when surplus runs out", async () => {
    const plan = await planFundingConversions(
      [{ token: ALPHA_USD, amount: usd(500) }],
      [{ token: PATH_USD, balance: usd(100) }],
      fakeQuote
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].amountIn).toBe(usd(100));
  });
});

describe("withSlippage", () => {
  it("applies the default 0.5% guard", () => {
    expect(withSlippage(usd(100))).toBe(usd(99.5));
  });

  it("applies a custom slippage", () => {
    expect(withSlippage(usd(100), 100)).toBe(usd(99));
  });
});
