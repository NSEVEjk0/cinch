/**
 * The netting engine — the heart of Cinch.
 *
 * Given a set of obligations (who owes whom, in which stablecoin), it computes
 * each party's net position and the *minimal* set of transfers that discharges
 * every obligation. A cycle of debts that moves a large gross sum collapses to
 * a far smaller set of real transfers — often zero, when the circle closes.
 *
 * Design rules:
 *  - Money is always bigint in the token's smallest unit. Floats never touch it.
 *  - Each token nets independently: USDC debts settle in USDC, USDT in USDT.
 *    (Cross-currency netting through the enshrined DEX is layered on separately
 *    in `crossCurrency.ts`, which reduces to this engine per settlement token.)
 *  - Determinism: the same obligations always yield the same transfers, so a
 *    settlement a user previews is exactly what they sign.
 */

import type {
  Balance,
  ClearingResult,
  ClearingStats,
  NetPosition,
  NettingMode,
  Obligation,
  SettlementTransfer,
  Token,
} from "./types";

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/** Stable key for a token so Maps key by identity, not object reference. */
function tokenKey(t: Token): string {
  return t.address.toLowerCase();
}

/**
 * Net every party's position within a single token.
 * Returns positions keyed by party address, each carrying gross in/out too so
 * the UI can show "owed 300, owes 250, net +50".
 */
function netPositionsForToken(
  obligations: Obligation[],
  token: Token
): Map<`0x${string}`, NetPosition> {
  const positions = new Map<`0x${string}`, NetPosition>();

  const ensure = (party: `0x${string}`): NetPosition => {
    let p = positions.get(party);
    if (!p) {
      p = { party, token, net: 0n, grossIn: 0n, grossOut: 0n };
      positions.set(party, p);
    }
    return p;
  };

  for (const o of obligations) {
    const debtor = ensure(o.debtor);
    const creditor = ensure(o.creditor);
    debtor.net -= o.amount;
    debtor.grossOut += o.amount;
    creditor.net += o.amount;
    creditor.grossIn += o.amount;
  }

  return positions;
}

/**
 * Greedy min-cash-flow settlement for one token.
 *
 * Standard, provably near-minimal approach: repeatedly match the largest net
 * debtor against the largest net creditor, moving the smaller of the two
 * magnitudes, until all nets are zero. Produces at most (n-1) transfers for n
 * parties with non-zero positions — the theoretical floor when no coincidental
 * sub-sums cancel.
 *
 * References are attached greedily: each produced transfer "consumes" debtor
 * obligations in order, so the memo of a settlement leg carries the real
 * invoice ids it discharges.
 */
function settleToken(
  obligations: Obligation[],
  token: Token
): { transfers: SettlementTransfer[]; positions: NetPosition[] } {
  const positionMap = netPositionsForToken(obligations, token);
  const positions = [...positionMap.values()];

  // Per-debtor queue of obligation references, drawn down as transfers form.
  const debtorRefs = new Map<`0x${string}`, { ref: string; remaining: bigint }[]>();
  for (const o of obligations) {
    const q = debtorRefs.get(o.debtor) ?? [];
    q.push({ ref: o.reference, remaining: o.amount });
    debtorRefs.set(o.debtor, q);
  }

  // Mutable net ledger: who still owes (negative) / is owed (positive).
  const nets = positions
    .filter((p) => p.net !== 0n)
    .map((p) => ({ party: p.party, net: p.net }));

  const transfers: SettlementTransfer[] = [];

  // Deterministic ordering: by magnitude desc, then address, so ties never
  // depend on insertion order.
  const byDebt = () =>
    [...nets]
      .filter((n) => n.net < 0n)
      .sort((a, b) => (a.net === b.net ? cmpAddr(a.party, b.party) : a.net < b.net ? -1 : 1));
  const byCredit = () =>
    [...nets]
      .filter((n) => n.net > 0n)
      .sort((a, b) => (a.net === b.net ? cmpAddr(a.party, b.party) : a.net > b.net ? -1 : 1));

  let guard = 0;
  const maxIterations = nets.length * nets.length + 1;

  while (true) {
    if (guard++ > maxIterations) break; // defensive; math guarantees termination
    const debtors = byDebt();
    const creditors = byCredit();
    if (debtors.length === 0 || creditors.length === 0) break;

    const debtor = debtors[0];
    const creditor = creditors[0];
    const move = abs(debtor.net) < creditor.net ? abs(debtor.net) : creditor.net;

    transfers.push({
      from: debtor.party,
      to: creditor.party,
      amount: move,
      token,
      references: drawReferences(debtorRefs, debtor.party, move),
    });

    // Apply the move to the live ledger.
    for (const n of nets) {
      if (n.party === debtor.party) n.net += move;
      if (n.party === creditor.party) n.net -= move;
    }
  }

  return { transfers, positions };
}

/** Draw `amount` worth of reference ids from a debtor's obligation queue. */
function drawReferences(
  debtorRefs: Map<`0x${string}`, { ref: string; remaining: bigint }[]>,
  debtor: `0x${string}`,
  amount: bigint
): string[] {
  const q = debtorRefs.get(debtor);
  if (!q) return [];
  const refs: string[] = [];
  let left = amount;
  for (const item of q) {
    if (left <= 0n) break;
    if (item.remaining <= 0n) continue;
    const take = item.remaining < left ? item.remaining : left;
    item.remaining -= take;
    left -= take;
    refs.push(item.ref);
  }
  return refs;
}

function cmpAddr(a: string, b: string): number {
  return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
}

/**
 * Clear a room. Disputed obligations are held out automatically. If `balances`
 * is supplied, liquidity-aware clearing (see `liquidity.ts`) trims the round to
 * the largest subset every debtor can actually fund; otherwise all non-disputed
 * obligations are included.
 *
 * `mode` chooses how transfers are formed:
 *  - "min-transfers" (default): global min-cash-flow — the fewest payments,
 *    even if that means A's debt to B is satisfied by C. Smallest settlement.
 *  - "preserve-relationships": net only within each debtor↔creditor pair, so a
 *    debt is only ever discharged by the two parties to it. More transfers, but
 *    no third party is ever routed through.
 */
export function clearRoom(
  obligations: Obligation[],
  options: { balances?: Balance[]; mode?: NettingMode } = {}
): ClearingResult {
  const mode = options.mode ?? "min-transfers";
  const disputed = obligations.filter((o) => o.disputed);
  let included = obligations.filter((o) => !o.disputed);
  const excluded: Obligation[] = [...disputed];

  if (options.balances && options.balances.length > 0) {
    const trimmed = trimToLiquidity(included, options.balances);
    excluded.push(...trimmed.dropped);
    included = trimmed.kept;
  }

  // Group obligations by settlement token, settle each independently.
  const byToken = new Map<string, { token: Token; obligations: Obligation[] }>();
  for (const o of included) {
    const k = tokenKey(o.token);
    const bucket = byToken.get(k) ?? { token: o.token, obligations: [] };
    bucket.obligations.push(o);
    byToken.set(k, bucket);
  }

  const transfers: SettlementTransfer[] = [];
  const positions: NetPosition[] = [];
  for (const { token, obligations: group } of byToken.values()) {
    const r =
      mode === "preserve-relationships"
        ? settleTokenBilateral(group, token)
        : settleToken(group, token);
    transfers.push(...r.transfers);
    positions.push(...r.positions);
  }

  return {
    transfers,
    positions,
    excluded,
    stats: computeStats(included, transfers),
  };
}

/**
 * Preserve-relationships settlement: net each unordered pair of parties against
 * each other only. If A owes B 100 and B owes A 60, that becomes a single A→B
 * 40 — but a debt A owes B is never satisfied by anyone except A paying B.
 */
function settleTokenBilateral(
  obligations: Obligation[],
  token: Token
): { transfers: SettlementTransfer[]; positions: NetPosition[] } {
  const positions = [...netPositionsForToken(obligations, token).values()];

  // Sum directed amounts per ordered pair, and collect references per pair.
  const directed = new Map<string, bigint>();
  const refs = new Map<string, string[]>();
  const key = (from: string, to: string) => `${from.toLowerCase()}>${to.toLowerCase()}`;
  for (const o of obligations) {
    const k = key(o.debtor, o.creditor);
    directed.set(k, (directed.get(k) ?? 0n) + o.amount);
    refs.set(k, [...(refs.get(k) ?? []), o.reference]);
  }

  const transfers: SettlementTransfer[] = [];
  const seen = new Set<string>();
  for (const o of obligations) {
    const a = o.debtor;
    const b = o.creditor;
    const fwdK = key(a, b);
    const revK = key(b, a);
    const pairId = [a.toLowerCase(), b.toLowerCase()].sort().join("|");
    if (seen.has(pairId)) continue;
    seen.add(pairId);

    const fwd = directed.get(fwdK) ?? 0n;
    const rev = directed.get(revK) ?? 0n;
    const net = fwd - rev;
    if (net === 0n) continue;
    const from = net > 0n ? a : b;
    const to = net > 0n ? b : a;
    const amount = net > 0n ? net : -net;
    const combinedRefs = [...(refs.get(fwdK) ?? []), ...(refs.get(revK) ?? [])];
    transfers.push({ from, to, amount, token, references: combinedRefs });
  }

  return { transfers, positions };
}

/** Headline stats: gross vs netted per token, and the overall compression. */
function computeStats(
  included: Obligation[],
  transfers: SettlementTransfer[]
): ClearingStats {
  const grossByToken: Record<string, bigint> = {};
  const nettedByToken: Record<string, bigint> = {};

  for (const o of included) {
    grossByToken[o.token.symbol] = (grossByToken[o.token.symbol] ?? 0n) + o.amount;
  }
  for (const t of transfers) {
    nettedByToken[t.token.symbol] = (nettedByToken[t.token.symbol] ?? 0n) + t.amount;
  }

  // Weighted compression across tokens, scaled to each token's decimals so a
  // 6-decimal and an 18-decimal token contribute on equal footing.
  let grossScaled = 0;
  let nettedScaled = 0;
  const decimalsBySymbol: Record<string, number> = {};
  for (const o of included) decimalsBySymbol[o.token.symbol] = o.token.decimals;
  for (const t of transfers) decimalsBySymbol[t.token.symbol] = t.token.decimals;

  for (const [sym, gross] of Object.entries(grossByToken)) {
    const d = decimalsBySymbol[sym] ?? 6;
    grossScaled += Number(gross) / 10 ** d;
  }
  for (const [sym, netted] of Object.entries(nettedByToken)) {
    const d = decimalsBySymbol[sym] ?? 6;
    nettedScaled += Number(netted) / 10 ** d;
  }

  const compressionRatio = grossScaled === 0 ? 0 : 1 - nettedScaled / grossScaled;

  return {
    obligationCount: included.length,
    transferCount: transfers.length,
    grossByToken,
    nettedByToken,
    compressionRatio: Math.max(0, Math.min(1, compressionRatio)),
  };
}

/* -------------------------------------------------------------------------- */
/* Liquidity-aware clearing (standout feature)                                */
/* -------------------------------------------------------------------------- */

/**
 * Trim a round to what every debtor can actually fund.
 *
 * A pure netting engine assumes a net debtor will pay their net position. In
 * the real world a debtor may not hold their net amount on chain, and in an
 * *atomic* settlement a single underfunded leg fails the whole batch. So before
 * clearing we check each party's net position against their on-chain balance,
 * and if any party is short we drop their least-critical obligations until the
 * round is fundable — settling the largest circle that *can* fully clear rather
 * than failing entirely.
 *
 * Strategy: iterative. Compute net positions; for any debtor whose net exceeds
 * their balance, drop their smallest-value obligation (the one that frees them
 * most per unit of discharged debt is a refinement; smallest keeps the biggest
 * relationships intact) and recompute, until every net debtor is fundable.
 */
export function trimToLiquidity(
  obligations: Obligation[],
  balances: Balance[]
): { kept: Obligation[]; dropped: Obligation[] } {
  const balanceOf = new Map<string, bigint>();
  for (const b of balances) {
    balanceOf.set(`${b.party.toLowerCase()}:${tokenKey(b.token)}`, b.available);
  }

  let kept = [...obligations];
  const dropped: Obligation[] = [];

  // Settle per token independently for the liquidity check.
  const tokens = new Map<string, Token>();
  for (const o of obligations) tokens.set(tokenKey(o.token), o.token);

  let safety = 0;
  while (safety++ < obligations.length + 1) {
    let changed = false;

    for (const token of tokens.values()) {
      const group = kept.filter((o) => tokenKey(o.token) === tokenKey(token));
      const positions = netPositionsForToken(group, token);

      // Find the worst-underfunded net debtor in this token.
      let worst: { party: `0x${string}`; shortfall: bigint } | null = null;
      for (const p of positions.values()) {
        if (p.net >= 0n) continue; // creditor or square — needs no funding
        const need = -p.net;
        const have = balanceOf.get(`${p.party.toLowerCase()}:${tokenKey(token)}`) ?? 0n;
        if (need > have) {
          const shortfall = need - have;
          if (!worst || shortfall > worst.shortfall) worst = { party: p.party, shortfall };
        }
      }

      if (worst) {
        // Drop this debtor's smallest obligation in this token.
        const candidates = kept
          .filter((o) => o.debtor === worst!.party && tokenKey(o.token) === tokenKey(token))
          .sort((a, b) => (a.amount === b.amount ? cmpAddr(a.id, b.id) : a.amount < b.amount ? -1 : 1));
        if (candidates.length > 0) {
          const drop = candidates[0];
          kept = kept.filter((o) => o.id !== drop.id);
          dropped.push(drop);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return { kept, dropped };
}
