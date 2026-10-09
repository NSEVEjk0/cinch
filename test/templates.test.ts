import { describe, it, expect } from "vitest";
import {
  splitEqually,
  splitExpenseObligations,
  buildPayrollCircle,
  toParty,
} from "@/lib/templates";
import { clearRoom } from "@/lib/netting";
import { PATH_USD } from "@/lib/tempo";

const usd = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

describe("split an expense", () => {
  it("splits equally with the payer owing nothing", () => {
    const payer = toParty("Mara");
    const members = ["Mara", "Jon", "Priya", "Theo"].map(toParty);
    const legs = splitEqually(usd(320), members, payer);
    // 3 owers, 320 / 4 = 80 each.
    expect(legs.length).toBe(3);
    expect(legs.every((l) => l.amount === usd(80))).toBe(true);
    expect(legs.every((l) => l.creditor === payer.address)).toBe(true);
  });

  it("distributes the rounding remainder exactly", () => {
    const payer = toParty("A");
    const members = ["A", "B", "C"].map(toParty); // 3 ways
    const legs = splitEqually(100n, members, payer); // 100 / 3 units
    const total = legs.reduce((s, l) => s + l.amount, 0n);
    // payer's own 1/3 stays with payer; owers cover 2 shares of ~33.33
    const payerShare = 100n / 3n; // 33
    expect(total).toBe(100n - payerShare);
  });

  it("compiles into obligations with a reference", () => {
    const { parties, obligations } = splitExpenseObligations({
      circleName: "Trip",
      payer: "Mara",
      members: ["Mara", "Jon"],
      amount: usd(100),
      reason: "dinner",
      token: PATH_USD,
    });
    expect(parties.length).toBe(2);
    expect(obligations.length).toBe(1);
    expect(obligations[0].amount).toBe(usd(50));
    expect(obligations[0].reference).toBe("dinner");
  });
});

describe("payroll run", () => {
  it("builds one obligation per recipient, all from the funder", () => {
    const circle = buildPayrollCircle({
      circleName: "Oct payroll",
      funder: "Treasury",
      lines: [
        { recipient: "Alice", amount: usd(3200) },
        { recipient: "Bob", amount: usd(2800) },
      ],
      reference: "Oct salary",
      token: PATH_USD,
    });
    expect(circle.obligations.length).toBe(2);
    const funder = circle.parties[0].address;
    expect(circle.obligations.every((o) => o.debtor === funder)).toBe(true);

    // A pure fan-out nets to one transfer per recipient (nothing cancels).
    const result = clearRoom(circle.obligations);
    expect(result.transfers.length).toBe(2);
    expect(result.transfers.reduce((s, t) => s + t.amount, 0n)).toBe(usd(6000));
  });

  it("skips zero-amount lines", () => {
    const circle = buildPayrollCircle({
      circleName: "x",
      funder: "T",
      lines: [
        { recipient: "A", amount: usd(10) },
        { recipient: "B", amount: 0n },
      ],
      reference: "r",
      token: PATH_USD,
    });
    expect(circle.obligations.length).toBe(1);
  });
});
