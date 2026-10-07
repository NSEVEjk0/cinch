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

import type { Obligation, Token } from "./types";
import { PATH_USD } from "./tempo";

export type Cadence = "once" | "daily" | "weekly" | "monthly";

export interface Party {
  address: `0x${string}`;
  /** Human label chosen in the room; never leaves the browser. */
  name: string;
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
  createdAt: string;
  /** ISO timestamp of the last cleared settlement, if any. */
  lastClearedAt?: string;
}

const STORE_KEY = "cinch:circles";

export function newId(prefix = "c"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
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
  return { ...c, obligations: c.obligations.map((o) => ({ ...o, amount: BigInt(o.amount) })) };
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
  const p = circle.parties.find((x) => x.address.toLowerCase() === address.toLowerCase());
  return p?.name || address;
}
