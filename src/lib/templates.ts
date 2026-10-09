/**
 * Circle templates — ways to compile real-world situations into a clearing room.
 *
 *  - Split an expense (Splitwise-style): one person paid for a group; everyone
 *    else owes their share. Several splits in one circle net against each other,
 *    so a weekend of "I'll get this one, you get the next" collapses to the
 *    fewest transfers.
 *  - Payroll run: one funder pays many recipients. A one-to-many batch that
 *    settles atomically as a single sponsored Tempo transaction.
 *
 * Each builder returns a ready Circle; the netting engine does the rest.
 */

import type { Obligation, Token } from "./types";
import { createCircle, newId, type Circle, type Party, type Cadence } from "./circle";
import { addressForName } from "./csv";
import { isAddress, shortAddress } from "./money";

/** Turn a typed name or 0x address into a party. */
export function toParty(input: string): Party {
  const v = input.trim();
  if (isAddress(v)) return { address: v, name: shortAddress(v) };
  return { address: addressForName(v.toLowerCase()), name: v };
}

/** Split `amount` of `token` equally; the payer owes nothing to themselves. */
export function splitEqually(amountUnits: bigint, members: Party[], payer: Party): Omit<Obligation, "id" | "token" | "reference">[] {
  const owers = members.filter((m) => m.address.toLowerCase() !== payer.address.toLowerCase());
  const n = BigInt(members.length);
  if (n === 0n || owers.length === 0) return [];
  const base = amountUnits / n;
  const remainder = amountUnits - base * n; // distributed to the first owers
  return owers.map((m, i) => ({
    debtor: m.address,
    creditor: payer.address,
    // The payer's own share stays with the payer; owers split the rest, with the
    // rounding remainder landing on the earliest owers so the sum is exact.
    amount: base + (BigInt(i) < remainder ? 1n : 0n),
  }));
}

export interface SplitInput {
  circleName: string;
  payer: string;
  members: string[];
  amount: bigint;
  reason: string;
  token: Token;
}

/** Build the obligations for a single shared expense. */
export function splitExpenseObligations(input: SplitInput): { parties: Party[]; obligations: Obligation[] } {
  const payer = toParty(input.payer);
  // The full group that shares the cost: payer + members, de-duplicated by address.
  const group: Party[] = [];
  for (const p of [payer, ...input.members.map(toParty)]) {
    if (!group.some((x) => x.address.toLowerCase() === p.address.toLowerCase())) group.push(p);
  }
  const legs = splitEqually(input.amount, group, payer);
  const obligations: Obligation[] = legs.map((l) => ({
    ...l,
    id: newId("o"),
    token: input.token,
    reference: input.reason.trim() || "shared expense",
    createdAt: new Date().toISOString(),
  }));
  return { parties: group, obligations };
}

/** Build a circle from one shared expense (more can be added inside it later). */
export function buildSplitCircle(input: SplitInput, cadence: Cadence = "once"): Circle {
  const { parties, obligations } = splitExpenseObligations(input);
  const circle = createCircle({ name: input.circleName || "Shared expenses", cadence, defaultToken: input.token });
  circle.parties = parties;
  circle.obligations = obligations;
  return circle;
}

export interface PayrollLine {
  recipient: string;
  amount: bigint;
}

export interface PayrollInput {
  circleName: string;
  funder: string;
  lines: PayrollLine[];
  reference: string;
  token: Token;
  cadence?: Cadence;
}

/** Build a payroll circle: the funder owes each recipient their line amount. */
export function buildPayrollCircle(input: PayrollInput): Circle {
  const funder = toParty(input.funder);
  const parties: Party[] = [funder];
  const obligations: Obligation[] = [];
  input.lines.forEach((line, i) => {
    if (line.amount <= 0n) return;
    const r = toParty(line.recipient);
    if (!parties.some((p) => p.address.toLowerCase() === r.address.toLowerCase())) parties.push(r);
    obligations.push({
      id: newId("o"),
      debtor: funder.address,
      creditor: r.address,
      amount: line.amount,
      token: input.token,
      reference: input.reference.trim() ? `${input.reference.trim()} #${i + 1}` : `payroll #${i + 1}`,
      createdAt: new Date().toISOString(),
    });
  });
  const circle = createCircle({
    name: input.circleName || "Payroll run",
    cadence: input.cadence ?? "monthly",
    defaultToken: input.token,
  });
  circle.parties = parties;
  circle.obligations = obligations;
  return circle;
}
