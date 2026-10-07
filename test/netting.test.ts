import { describe, it, expect } from "vitest";
import { clearRoom, trimToLiquidity } from "@/lib/netting";
import type { Balance, Obligation, Token } from "@/lib/types";

const USDC: Token = {
  address: "0x20c0000000000000000000000000000000000001",
  symbol: "USDC",
  decimals: 6,
};
const USDT: Token = {
  address: "0x20c0000000000000000000000000000000000002",
  symbol: "USDT",
  decimals: 6,
};

// Readable party addresses.
const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;
const C = "0x000000000000000000000000000000000000000c" as const;
const D = "0x000000000000000000000000000000000000000d" as const;

const usd = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

function ob(
  id: string,
  debtor: `0x${string}`,
  creditor: `0x${string}`,
  amount: bigint,
  extra: Partial<Obligation> = {}
): Obligation {
  return { id, debtor, creditor, amount, token: USDC, reference: id, ...extra };
}

describe("netting engine — the perfect circle", () => {
  it("collapses a balanced 3-party cycle to zero transfers", () => {
    // A→B 100, B→C 100, C→A 100. Everyone is square. Nothing should move.
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(100)),
      ob("inv3", C, A, usd(100)),
    ]);
    expect(result.transfers).toHaveLength(0);
    expect(result.stats.compressionRatio).toBe(1);
    expect(result.stats.obligationCount).toBe(3);
  });

  it("every net is zero when the circle closes", () => {
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(100)),
      ob("inv3", C, A, usd(100)),
    ]);
    for (const p of result.positions) expect(p.net).toBe(0n);
  });
});

describe("netting engine — partial cycles", () => {
  it("nets an unbalanced triangle to a single transfer", () => {
    // A→B 100, B→C 100, C→A 60.  Nets: A -40, B 0, C +40.  → one transfer A→C 40.
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(100)),
      ob("inv3", C, A, usd(60)),
    ]);
    expect(result.transfers).toHaveLength(1);
    const t = result.transfers[0];
    expect(t.from).toBe(A);
    expect(t.to).toBe(C);
    expect(t.amount).toBe(usd(40));
  });

  it("conserves value: sum of debtor nets equals sum of creditor nets", () => {
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(100)),
      ob("inv3", C, A, usd(60)),
    ]);
    const totalOut = result.transfers.reduce((s, t) => s + t.amount, 0n);
    // Only 40 actually moves, vs 260 gross.
    expect(totalOut).toBe(usd(40));
    expect(result.stats.grossByToken.USDC).toBe(usd(260));
    expect(result.stats.nettedByToken.USDC).toBe(usd(40));
  });

  it("produces at most (n-1) transfers for n active parties", () => {
    // A chain with no cancellation: A→B, B→C, C→D of differing amounts.
    const result = clearRoom([
      ob("inv1", A, B, usd(50)),
      ob("inv2", B, C, usd(30)),
      ob("inv3", C, D, usd(20)),
    ]);
    const activeParties = new Set(
      result.positions.filter((p) => p.net !== 0n).map((p) => p.party)
    );
    expect(result.transfers.length).toBeLessThanOrEqual(activeParties.size - 1);
  });
});

describe("netting engine — settlement conservation", () => {
  it("each party's inflow minus outflow equals their net position", () => {
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(70)),
      ob("inv3", C, A, usd(40)),
      ob("inv4", D, A, usd(25)),
    ]);
    const posByParty = new Map(result.positions.map((p) => [p.party, p.net]));
    const flow = new Map<string, bigint>();
    for (const t of result.transfers) {
      flow.set(t.from, (flow.get(t.from) ?? 0n) - t.amount);
      flow.set(t.to, (flow.get(t.to) ?? 0n) + t.amount);
    }
    for (const [party, net] of posByParty) {
      expect(flow.get(party) ?? 0n).toBe(net);
    }
  });
});

describe("netting engine — references for the memo", () => {
  it("attaches discharged obligation references to each transfer", () => {
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(60)),
    ]);
    // A owes 100, B nets -? : B owes C 60 but is owed 100, so B net +40, C -? ...
    // Nets: A -100, B +40, C +60.  Debtor A pays B 40 and C 60 (greedy).
    const allRefs = result.transfers.flatMap((t) => t.references);
    expect(allRefs).toContain("inv1");
    // Every transfer carries at least one reference.
    for (const t of result.transfers) expect(t.references.length).toBeGreaterThan(0);
  });
});

describe("netting engine — determinism", () => {
  it("yields identical output across runs regardless of input order", () => {
    const base = [
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(70)),
      ob("inv3", C, A, usd(40)),
      ob("inv4", D, B, usd(25)),
    ];
    const r1 = clearRoom(base);
    const r2 = clearRoom([...base].reverse());
    const norm = (r: ReturnType<typeof clearRoom>) =>
      r.transfers
        .map((t) => `${t.from}->${t.to}:${t.amount}`)
        .sort()
        .join("|");
    expect(norm(r1)).toBe(norm(r2));
  });
});

describe("netting engine — multiple tokens", () => {
  it("nets each token independently", () => {
    const result = clearRoom([
      ob("usdc1", A, B, usd(100)),
      ob("usdc2", B, A, usd(60)),
      { id: "usdt1", debtor: A, creditor: B, amount: usd(50), token: USDT, reference: "usdt1" },
    ]);
    // USDC nets to A→B 40; USDT stays A→B 50. Two transfers, different tokens.
    const usdc = result.transfers.filter((t) => t.token.symbol === "USDC");
    const usdt = result.transfers.filter((t) => t.token.symbol === "USDT");
    expect(usdc).toHaveLength(1);
    expect(usdc[0].amount).toBe(usd(40));
    expect(usdt).toHaveLength(1);
    expect(usdt[0].amount).toBe(usd(50));
  });
});

describe("netting engine — disputes", () => {
  it("holds disputed obligations out of the round", () => {
    const result = clearRoom([
      ob("inv1", A, B, usd(100)),
      ob("inv2", B, C, usd(100)),
      ob("inv3", C, A, usd(100), { disputed: true }),
    ]);
    expect(result.excluded.map((o) => o.id)).toContain("inv3");
    expect(result.stats.obligationCount).toBe(2);
    // Without the closing leg the circle no longer cancels: real transfers remain.
    expect(result.transfers.length).toBeGreaterThan(0);
  });
});

describe("liquidity-aware clearing", () => {
  it("drops a debtor's obligation when they cannot fund their net position", () => {
    // A owes B 100 and C 100 → net -200. A holds only 100. One leg must drop.
    const obligations = [ob("inv1", A, B, usd(100)), ob("inv2", A, C, usd(100))];
    const balances: Balance[] = [{ party: A, token: USDC, available: usd(100) }];
    const { kept, dropped } = trimToLiquidity(obligations, balances);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });

  it("keeps everything when balances cover net positions", () => {
    const obligations = [ob("inv1", A, B, usd(100)), ob("inv2", A, C, usd(100))];
    const balances: Balance[] = [{ party: A, token: USDC, available: usd(200) }];
    const { kept, dropped } = trimToLiquidity(obligations, balances);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });

  it("a netted debtor only needs to fund their NET, not their gross", () => {
    // A owes B 100, B owes A 80 → A net -20. A holds 20. Fully fundable, nothing dropped.
    const obligations = [ob("inv1", A, B, usd(100)), ob("inv2", B, A, usd(80))];
    const balances: Balance[] = [
      { party: A, token: USDC, available: usd(20) },
      { party: B, token: USDC, available: usd(0) },
    ];
    const { dropped } = trimToLiquidity(obligations, balances);
    expect(dropped).toHaveLength(0);
  });

  it("clearRoom surfaces liquidity drops in excluded", () => {
    const result = clearRoom(
      [ob("inv1", A, B, usd(100)), ob("inv2", A, C, usd(100))],
      { balances: [{ party: A, token: USDC, available: usd(100) }] }
    );
    expect(result.excluded.length).toBe(1);
  });
});

describe("netting engine — edge cases", () => {
  it("handles an empty room", () => {
    const result = clearRoom([]);
    expect(result.transfers).toHaveLength(0);
    expect(result.stats.compressionRatio).toBe(0);
  });

  it("handles a single obligation (no netting possible)", () => {
    const result = clearRoom([ob("inv1", A, B, usd(100))]);
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].amount).toBe(usd(100));
    expect(result.stats.compressionRatio).toBe(0);
  });
});
