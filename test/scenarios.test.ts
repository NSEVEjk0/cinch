import { describe, it, expect } from "vitest";
import { SCENARIOS, scenarioObligations, scenarioToCircle } from "@/lib/scenarios";
import { clearRoom } from "@/lib/netting";

describe("demo scenarios", () => {
  it("every scenario is internally consistent", () => {
    for (const s of SCENARIOS) {
      const obligations = scenarioObligations(s);
      expect(obligations.length).toBe(s.edges.length);
      // Every debtor/creditor is a known party.
      const addrs = new Set(s.parties.map((p) => p.address));
      for (const o of obligations) {
        expect(addrs.has(o.debtor)).toBe(true);
        expect(addrs.has(o.creditor)).toBe(true);
        expect(o.amount).toBeGreaterThan(0n);
      }
    }
  });

  it("every scenario compresses meaningfully (netting beats paying gross)", () => {
    for (const s of SCENARIOS) {
      const result = clearRoom(scenarioObligations(s));
      // Fewer transfers than obligations, and real value removed.
      expect(result.transfers.length).toBeLessThan(s.edges.length);
      expect(result.stats.compressionRatio).toBeGreaterThan(0);
    }
  });

  it("scenarioToCircle produces a usable circle", () => {
    const c = scenarioToCircle(SCENARIOS[0], "test");
    expect(c.parties.length).toBeGreaterThan(0);
    expect(c.obligations.length).toBe(SCENARIOS[0].edges.length);
    expect(c.cadence).toBe("once");
  });

  it("settlement conserves value in every scenario", () => {
    for (const s of SCENARIOS) {
      const result = clearRoom(scenarioObligations(s));
      const posByParty = new Map(result.positions.map((p) => [p.party, p.net]));
      const flow = new Map<string, bigint>();
      for (const t of result.transfers) {
        flow.set(t.from, (flow.get(t.from) ?? 0n) - t.amount);
        flow.set(t.to, (flow.get(t.to) ?? 0n) + t.amount);
      }
      for (const [party, net] of posByParty) {
        expect(flow.get(party) ?? 0n).toBe(net);
      }
    }
  });
});
