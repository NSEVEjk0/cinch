import { describe, it, expect } from "vitest";
import { parseObligationsCsv } from "@/lib/csv";
import { clearRoom } from "@/lib/netting";
import { PATH_USD } from "@/lib/tempo";

describe("csv import", () => {
  it("parses a simple debt list and derives parties", () => {
    const text = `Alice, Bob, 100, dinner
Bob, Carol, 60, taxi
Carol, Alice, 40, tickets`;
    const r = parseObligationsCsv(text, PATH_USD);
    expect(r.errors).toHaveLength(0);
    expect(r.obligations).toHaveLength(3);
    expect(r.parties).toHaveLength(3);
    expect(r.obligations[0].amount).toBe(100_000_000n);
    expect(r.obligations[0].reference).toBe("dinner");
  });

  it("skips a header row", () => {
    const text = `payer, payee, amount, reason
Alice, Bob, 10, x`;
    const r = parseObligationsCsv(text, PATH_USD);
    expect(r.obligations).toHaveLength(1);
  });

  it("reuses a party across lines by name", () => {
    const text = `Alice, Bob, 10, a
Alice, Carol, 20, b`;
    const r = parseObligationsCsv(text, PATH_USD);
    // Alice, Bob, Carol = 3 parties; Alice appears once in the party list.
    expect(r.parties).toHaveLength(3);
    const alice = r.obligations[0].debtor;
    expect(r.obligations[1].debtor).toBe(alice);
  });

  it("accepts 0x addresses as parties", () => {
    const text = `0x000000000000000000000000000000000000000a, 0x000000000000000000000000000000000000000b, 5, x`;
    const r = parseObligationsCsv(text, PATH_USD);
    expect(r.obligations).toHaveLength(1);
    expect(r.obligations[0].debtor).toBe("0x000000000000000000000000000000000000000a");
  });

  it("reports errors for bad rows but keeps good ones", () => {
    const text = `Alice, Bob, notanumber, x
Bob, Carol, 10, y
Dave`;
    const r = parseObligationsCsv(text, PATH_USD);
    expect(r.obligations).toHaveLength(1);
    expect(r.errors.length).toBe(2);
  });

  it("rejects a party owing themselves", () => {
    const r = parseObligationsCsv(`Alice, Alice, 10, x`, PATH_USD);
    expect(r.obligations).toHaveLength(0);
    expect(r.errors[0]).toMatch(/themselves/);
  });

  it("imported obligations clear through the engine", () => {
    const text = `Alice, Bob, 100, a
Bob, Carol, 100, b
Carol, Alice, 100, c`;
    const r = parseObligationsCsv(text, PATH_USD);
    const cleared = clearRoom(r.obligations);
    // Perfect circle → nets to zero.
    expect(cleared.transfers).toHaveLength(0);
  });
});
