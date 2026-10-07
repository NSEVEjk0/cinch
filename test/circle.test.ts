import { describe, it, expect } from "vitest";
import {
  createCircle,
  toSettlementRecord,
  recordSettlement,
  rollForward,
  nextClearingAt,
  mergeCircle,
  type Circle,
} from "@/lib/circle";
import { PATH_USD } from "@/lib/tempo";
import type { Obligation, SettlementTransfer } from "@/lib/types";

const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;

function ob(id: string, disputed = false): Obligation {
  return { id, debtor: A, creditor: B, amount: 100_000_000n, token: PATH_USD, reference: id, disputed };
}

const transfer: SettlementTransfer = {
  from: A,
  to: B,
  amount: 40_000_000n,
  token: PATH_USD,
  references: ["inv1"],
};

describe("circle — settlement records", () => {
  it("serialises a settlement record with string amounts", () => {
    const rec = toSettlementRecord({
      transfers: [transfer],
      txRefs: ["0xabc"],
      grossByToken: { pathUSD: 100_000_000n },
      nettedByToken: { pathUSD: 40_000_000n },
      compressionRatio: 0.6,
      obligationCount: 2,
      atomic: true,
    });
    expect(rec.transfers[0].amount).toBe("40000000");
    expect(rec.grossByToken.pathUSD).toBe("100000000");
    expect(rec.atomic).toBe(true);
  });

  it("records a settlement and stamps lastClearedAt", () => {
    const c = createCircle({ name: "t" });
    const rec = toSettlementRecord({
      transfers: [],
      txRefs: [],
      grossByToken: {},
      nettedByToken: {},
      compressionRatio: 1,
      obligationCount: 2,
      atomic: true,
    });
    const next = recordSettlement(c, rec);
    expect(next.settlements).toHaveLength(1);
    expect(next.lastClearedAt).toBe(rec.at);
  });
});

describe("circle — roll forward", () => {
  it("clears discharged obligations on a standing circle but keeps disputed", () => {
    const c: Circle = { ...createCircle({ name: "t", cadence: "weekly" }), obligations: [ob("a"), ob("b", true)] };
    const rolled = rollForward(c);
    expect(rolled.obligations).toHaveLength(1);
    expect(rolled.obligations[0].id).toBe("b");
  });

  it("leaves a one-off circle's obligations untouched", () => {
    const c: Circle = { ...createCircle({ name: "t", cadence: "once" }), obligations: [ob("a")] };
    expect(rollForward(c).obligations).toHaveLength(1);
  });
});

describe("circle — cadence", () => {
  it("a one-off circle has no next clearing", () => {
    expect(nextClearingAt(createCircle({ name: "t", cadence: "once" }))).toBeNull();
  });
  it("a weekly circle's next clearing is a week out", () => {
    const c = createCircle({ name: "t", cadence: "weekly" });
    const next = nextClearingAt(c)!;
    const diff = next.getTime() - new Date(c.createdAt).getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("circle — merge", () => {
  it("unions parties and obligations without losing local data", () => {
    const local: Circle = {
      ...createCircle({ name: "t" }),
      parties: [{ address: A, name: "Alice" }],
      obligations: [ob("a")],
    };
    const incoming: Circle = {
      ...createCircle({ name: "t" }),
      parties: [{ address: B, name: "Bob" }],
      obligations: [ob("b")],
    };
    const merged = mergeCircle(local, incoming);
    expect(merged.parties).toHaveLength(2);
    expect(merged.obligations).toHaveLength(2);
  });

  it("does not duplicate an obligation already present", () => {
    const local: Circle = { ...createCircle({ name: "t" }), obligations: [ob("a")] };
    const incoming: Circle = { ...createCircle({ name: "t" }), obligations: [ob("a")] };
    expect(mergeCircle(local, incoming).obligations).toHaveLength(1);
  });
});
