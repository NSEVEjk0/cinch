/**
 * The Circle model — a clearing room.
 *
 * A Circle is a named set of parties and the obligations between them. It is
 * the unit a group clears together. Circles live in the browser (localStorage),
 * keyed by an id in the URL so a room can be shared by link. Nothing is held on
 * a server; the chain is the only place money ever moves.
 *
 * "Standing" circles are the Settle half of the product: they recur on a
 * cadence, accumulating obligations across a period and clearing on schedule.
 */

import type { Obligation, Token, SettlementTransfer, NettingMode } from "./types";
import { PATH_USD } from "./tempo";

export type Cadence = "once" | "daily" | "weekly" | "monthly";

export type { NettingMode };

export interface Party {
  /** Stable slot id — the member's identity in the circle, independent of address. */
  id: string;
  /** Human label the creator chose (e.g. "Meridian"). */
  name: string;
  /** Bound wallet address — set only once the member claims their invite link. */
  address?: `0x${string}`;
  /** SHA-256 of the member's secret claim code; the raw code lives only in the link. */
  claimTokenHash?: string;
  /** When the member claimed their slot by binding a wallet. */
  claimedAt?: string;
  /** Legacy: set when a party attested in the old address-first flow. */
  attestedAt?: string;
}

/** A past clearing of a circle — kept for history and certificates. */
export interface SettlementRecord {
  id: string;
  at: string;
  /** The transfers that settled, serialised amounts for storage. */
  transfers: SerialTransfer[];
  /** Transaction reference(s) the settlement produced on Tempo. */
  txRefs: string[];
  /** Gross owed vs. actually moved, per token symbol (serialised). */
  grossByToken: Record<string, string>;
  nettedByToken: Record<string, string>;
  /** 0..1 compression achieved. */
  compressionRatio: number;
  /** References the settlement discharged (for the certificate). */
  obligationCount: number;
  /** Whether this was an atomic batch or a leg-by-leg fallback. */
  atomic: boolean;
}

interface SerialTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
  tokenSymbol: string;
  tokenDecimals: number;
  references: string[];
}

export interface Circle {
  id: string;
  name: string;
  /** Who is in the room. */
  parties: Party[];
  /** The debts between them. */
  obligations: Obligation[];
  /** "once" is an ad-hoc Tally room; the rest are standing Settle circles. */
  cadence: Cadence;
  /** Default settlement token for new obligations. */
  defaultToken: Token;
  /** How clearing chooses transfers. Defaults to fewest transfers. */
  nettingMode?: NettingMode;
  createdAt: string;
  /** ISO timestamp of the last cleared settlement, if any. */
  lastClearedAt?: string;
  /** Past clearings, newest last. */
  settlements?: SettlementRecord[];
}

const STORE_KEY = "cinch:circles";

export function newId(prefix = "c"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Serialise a live settlement result into a stored record. */
export function toSettlementRecord(input: {
  transfers: SettlementTransfer[];
  txRefs: string[];
  grossByToken: Record<string, bigint>;
  nettedByToken: Record<string, bigint>;
  compressionRatio: number;
  obligationCount: number;
  atomic: boolean;
}): SettlementRecord {
  const mapBig = (r: Record<string, bigint>): Record<string, string> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toString()]));
  return {
    id: newId("s"),
    at: new Date().toISOString(),
    transfers: input.transfers.map((t) => ({
      from: t.from,
      to: t.to,
      amount: t.amount.toString(),
      tokenSymbol: t.token.symbol,
      tokenDecimals: t.token.decimals,
      references: t.references,
    })),
    txRefs: input.txRefs,
    grossByToken: mapBig(input.grossByToken),
    nettedByToken: mapBig(input.nettedByToken),
    compressionRatio: input.compressionRatio,
    obligationCount: input.obligationCount,
    atomic: input.atomic,
  };
}

/* ------------------------------- persistence ------------------------------ */

function readAll(): Circle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as SerialCircle[]).map(deserialize);
  } catch {
    return [];
  }
}

function writeAll(circles: Circle[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(circles.map(serialize)));
}

export function loadCircles(): Circle[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function loadCircle(id: string): Circle | null {
  return readAll().find((c) => c.id === id) ?? null;
}

export function saveCircle(circle: Circle): Circle[] {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === circle.id);
  if (idx >= 0) all[idx] = circle;
  else all.push(circle);
  writeAll(all);
  return loadCircles();
}

export function deleteCircle(id: string): Circle[] {
  writeAll(readAll().filter((c) => c.id !== id));
  return loadCircles();
}

/* --------------------- bigint-safe (de)serialization ---------------------- */
/* localStorage can't hold bigint, so obligation amounts round-trip as strings. */

interface SerialObligation extends Omit<Obligation, "amount"> {
  amount: string;
}
interface SerialCircle extends Omit<Circle, "obligations"> {
  obligations: SerialObligation[];
}

function serialize(c: Circle): SerialCircle {
  return { ...c, obligations: c.obligations.map((o) => ({ ...o, amount: o.amount.toString() })) };
}
function deserialize(c: SerialCircle): Circle {
  return {
    ...c,
    parties: (c.parties ?? []).map(normalizeParty),
    obligations: c.obligations.map((o) => ({ ...o, amount: BigInt(o.amount) })),
  };
}

/** A member has claimed once a wallet address is bound to their slot. */
export function isClaimed(p: Party): boolean {
  return !!p.address;
}

/** Back-fill a stable slot id on parties from older circles (keyed by address then). */
function normalizeParty(p: Party): Party {
  if (p.id) return p;
  return { ...p, id: p.address ? `m_${p.address.toLowerCase()}` : newId("m") };
}

/** A fresh unclaimed member slot (the creator names it; the code/hash come from claim.ts). */
export function newMember(name: string, claimTokenHash?: string): Party {
  return { id: newId("m"), name: name.trim() || "Member", ...(claimTokenHash ? { claimTokenHash } : {}) };
}

/** A party that already has a known address (demo data, or a counterparty typed directly). */
export function claimedParty(address: `0x${string}`, name: string): Party {
  return { id: `m_${address.toLowerCase()}`, address, name };
}

/* ------------------------------ construction ------------------------------ */

export function createCircle(input: {
  name: string;
  cadence?: Cadence;
  defaultToken?: Token;
}): Circle {
  return {
    id: newId(),
    name: input.name.trim() || "Untitled circle",
    parties: [],
    obligations: [],
    cadence: input.cadence ?? "once",
    defaultToken: input.defaultToken ?? PATH_USD,
    createdAt: new Date().toISOString(),
  };
}

/** Resolve a party's display name within a circle, falling back to the address. */
export function partyName(circle: Circle, address: string): string {
  const p = circle.parties.find((x) => x.address?.toLowerCase() === address.toLowerCase());
  return p?.name || address;
}

/* ------------------------------ status ------------------------------ */

/** Has this circle ever been cleared? */
export function hasCleared(circle: Circle): boolean {
  return (circle.settlements?.length ?? 0) > 0;
}

/**
 * A circle is "completed" when it is a one-off that has been cleared at least
 * once (its whole purpose is done). A standing circle is never "completed" —
 * it recurs — it is instead "active" and simply shows when it last cleared.
 */
export function isCompleted(circle: Circle): boolean {
  return circle.cadence === "once" && hasCleared(circle);
}

/** True when the circle still has obligations waiting to be cleared. */
export function hasOutstanding(circle: Circle): boolean {
  return circle.obligations.some((o) => !o.disputed);
}


/* ------------------------------ cadence ------------------------------ */

const PERIOD_MS: Record<Exclude<Cadence, "once">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * When a standing circle is next due to clear: one period after its last
 * clearing (or after creation if it has never cleared). Null for one-off rooms.
 */
export function nextClearingAt(circle: Circle): Date | null {
  if (circle.cadence === "once") return null;
  const base = circle.lastClearedAt ?? circle.createdAt;
  return new Date(new Date(base).getTime() + PERIOD_MS[circle.cadence]);
}

/** Human "due in 3 days" / "due now" string for a standing circle. */
export function cadenceDue(circle: Circle): string | null {
  const next = nextClearingAt(circle);
  if (!next) return null;
  const ms = next.getTime() - Date.now();
  if (ms <= 0) return "due now";
  const days = Math.floor(ms / PERIOD_MS.daily);
  const hours = Math.floor((ms % PERIOD_MS.daily) / (60 * 60 * 1000));
  if (days > 0) return `due in ${days}d ${hours}h`;
  const mins = Math.floor((ms % (60 * 60 * 1000)) / 60000);
  return hours > 0 ? `due in ${hours}h ${mins}m` : `due in ${mins}m`;
}

/* ------------------------- settlement history ------------------------- */

/** Append a settlement record and stamp lastClearedAt. */
export function recordSettlement(circle: Circle, record: SettlementRecord): Circle {
  return {
    ...circle,
    settlements: [...(circle.settlements ?? []), record],
    lastClearedAt: record.at,
  };
}

/**
 * Clear a standing circle's board after it settles: discharged obligations are
 * removed so the next period starts fresh. Disputed ones are kept (they were
 * never in the round). For a one-off circle, nothing is auto-removed.
 */
export function rollForward(circle: Circle): Circle {
  if (circle.cadence === "once") return circle;
  return { ...circle, obligations: circle.obligations.filter((o) => o.disputed) };
}

/* ----------------------- shared circles via link ---------------------- */
/*
 * A circle can be shared by packing its state into a URL fragment — no server.
 * Whoever opens the link gets the same room and can add their own obligations.
 */

export function encodeCircle(circle: Circle): string {
  const payload = serialize({ ...circle, settlements: undefined });
  const json = JSON.stringify(payload);
  if (typeof window === "undefined") return "";
  return window.btoa(encodeURIComponent(json));
}

export function decodeCircle(encoded: string): Circle | null {
  try {
    if (typeof window === "undefined") return null;
    const json = decodeURIComponent(window.atob(encoded));
    return deserialize(JSON.parse(json) as SerialCircle);
  } catch {
    return null;
  }
}

/**
 * Merge an incoming (shared) circle into the local copy without losing data:
 * union parties by slot id and obligations by id, keeping local settlements. A
 * claim made on one device (address + claimedAt bound to a slot) propagates to
 * everyone through this merge.
 */
export function mergeCircle(local: Circle, incoming: Circle): Circle {
  const parties = local.parties.map(normalizeParty);
  for (const raw of incoming.parties) {
    const p = normalizeParty(raw);
    const existing = parties.find((x) => x.id === p.id);
    if (!existing) {
      parties.push(p);
      continue;
    }
    // A bound address / claim wins over an unbound slot; keep the latest name.
    if (p.address && !existing.address) existing.address = p.address;
    if (p.claimedAt && !existing.claimedAt) existing.claimedAt = p.claimedAt;
    if (p.claimTokenHash && !existing.claimTokenHash) existing.claimTokenHash = p.claimTokenHash;
    if (p.attestedAt && !existing.attestedAt) existing.attestedAt = p.attestedAt;
    if (p.name && p.name !== existing.name && !existing.address) existing.name = p.name;
  }
  const obById = new Map(local.obligations.map((o) => [o.id, o]));
  for (const o of incoming.obligations) if (!obById.has(o.id)) obById.set(o.id, o);
  return {
    ...local,
    parties,
    obligations: [...obById.values()],
  };
}
