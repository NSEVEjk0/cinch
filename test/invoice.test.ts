import { describe, it, expect } from "vitest";
import {
  effectiveAmount,
  discountAmount,
  discountActive,
  isOverdue,
  applyInvoicePricing,
  totalActiveDiscount,
} from "@/lib/invoice";
import type { Obligation, Token } from "@/lib/types";

const USDC: Token = {
  address: "0x20c0000000000000000000000000000000000001",
  symbol: "USDC",
  decimals: 6,
};

const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;
const usd = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

function ob(extra: Partial<Obligation> = {}): Obligation {
  return {
    id: "o1",
    debtor: A,
    creditor: B,
    amount: usd(100),
    token: USDC,
    reference: "invoice #1",
    ...extra,
  };
}

describe("invoice pricing", () => {
  it("leaves a plain obligation unchanged", () => {
    const o = ob();
    expect(effectiveAmount(o)).toBe(usd(100));
    expect(discountAmount(o)).toBe(0n);
    expect(discountActive(o)).toBe(false);
  });

  it("applies an early-pay discount inside the window", () => {
    const o = ob({ earlyPayDiscountBps: 200, earlyPayBy: iso(3) }); // 2%
    expect(discountActive(o)).toBe(true);
    expect(effectiveAmount(o)).toBe(usd(98));
    expect(discountAmount(o)).toBe(usd(2));
  });

  it("ignores an expired discount", () => {
    const o = ob({ earlyPayDiscountBps: 200, earlyPayBy: iso(-1) });
    expect(discountActive(o)).toBe(false);
    expect(effectiveAmount(o)).toBe(usd(100));
  });

  it("floors the discount to the token unit (never creates value)", () => {
    // 1 unit at 50% is 0.5 → floors to 0 discount.
    const o = ob({ amount: 1n, earlyPayDiscountBps: 5000, earlyPayBy: iso(1) });
    expect(discountAmount(o)).toBe(0n);
    expect(effectiveAmount(o)).toBe(1n);
  });

  it("flags overdue by due date", () => {
    expect(isOverdue(ob({ dueDate: iso(-1) }))).toBe(true);
    expect(isOverdue(ob({ dueDate: iso(5) }))).toBe(false);
    expect(isOverdue(ob())).toBe(false);
  });

  it("prices a list and totals active discounts", () => {
    const list = [
      ob({ id: "a", earlyPayDiscountBps: 100, earlyPayBy: iso(2) }), // 1% of 100 = 1
      ob({ id: "b", amount: usd(50) }), // plain
    ];
    const priced = applyInvoicePricing(list);
    expect(priced[0].amount).toBe(usd(99));
    expect(priced[1].amount).toBe(usd(50));
    expect(totalActiveDiscount(list)).toBe(usd(1));
  });
});
