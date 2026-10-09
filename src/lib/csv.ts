/**
 * CSV / paste import for obligations.
 *
 * Accepts a simple, forgiving format — one obligation per line:
 *
 *     debtor, creditor, amount, reason
 *     Alice, Bob, 100, dinner
 *     0xabc…, 0xdef…, 25.50, taxi
 *
 * Names are matched to existing parties; a bare 0x address becomes a new party.
 * A header row (if present) is detected and skipped. Blank lines are ignored.
 */

import type { Obligation, Token } from "./types";
import { parseAmount, isAddress, shortAddress } from "./money";
import { newId } from "./circle";

export interface ImportParty {
  address: `0x${string}`;
  name: string;
}

export interface ImportResult {
  parties: ImportParty[];
  obligations: Obligation[];
  errors: string[];
}

const HEADER_WORDS = ["debtor", "creditor", "payer", "payee", "from", "to", "amount", "reason"];

/** Deterministically derive a party address from a typed name (demo-friendly). */
export function addressForName(name: string): `0x${string}` {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `0x${hex.repeat(5).slice(0, 40)}` as `0x${string}`;
}

export function parseObligationsCsv(text: string, token: Token): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parties = new Map<string, ImportParty>();
  const obligations: Obligation[] = [];
  const errors: string[] = [];

  const resolve = (raw: string): ImportParty => {
    const v = raw.trim();
    if (isAddress(v)) {
      const key = v.toLowerCase();
      const existing = parties.get(key);
      if (existing) return existing;
      const p = { address: v as `0x${string}`, name: shortAddress(v) };
      parties.set(key, p);
      return p;
    }
    // A name: reuse by case-insensitive name, else derive a stable address.
    const byName = [...parties.values()].find((p) => p.name.toLowerCase() === v.toLowerCase());
    if (byName) return byName;
    const p = { address: addressForName(v.toLowerCase()), name: v };
    parties.set(p.address.toLowerCase(), p);
    return p;
  };

  lines.forEach((line, idx) => {
    const cols = line.split(/[,\t;]/).map((c) => c.trim());
    // Skip a header row.
    if (idx === 0 && cols.filter((c) => HEADER_WORDS.includes(c.toLowerCase())).length >= 2) return;
    if (cols.length < 3) {
      errors.push(`Line ${idx + 1}: needs at least payer, payee, amount.`);
      return;
    }
    const [debtorRaw, creditorRaw, amountRaw, ...rest] = cols;
    const debtor = resolve(debtorRaw);
    const creditor = resolve(creditorRaw);
    if (debtor.address.toLowerCase() === creditor.address.toLowerCase()) {
      errors.push(`Line ${idx + 1}: a party cannot owe themselves.`);
      return;
    }
    let amount: bigint;
    try {
      amount = parseAmount(amountRaw, token.decimals);
    } catch {
      errors.push(`Line ${idx + 1}: "${amountRaw}" is not a valid amount.`);
      return;
    }
    if (amount <= 0n) {
      errors.push(`Line ${idx + 1}: amount must be above zero.`);
      return;
    }
    obligations.push({
      id: newId("o"),
      debtor: debtor.address,
      creditor: creditor.address,
      amount,
      token,
      reference: rest.join(" ").trim() || "imported",
      createdAt: new Date().toISOString(),
    });
  });

  return { parties: [...parties.values()], obligations, errors };
}
