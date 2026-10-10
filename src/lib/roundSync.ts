"use client";

/**
 * Round-authorization sync (Model C, client half).
 *
 * Mirrors sync.ts: a thin wrapper over /api/round that collects each payer's
 * signed permit + Authorization for a clearing round. Every call degrades to a
 * safe no-op when the shared store isn't configured, so the UI can report that
 * live collection is unavailable rather than throwing.
 */

import type { Hex } from "viem";

/** One payer's stored, signed consent for a round. Bigints are strings on the wire. */
export interface SerialPermit {
  token: Hex;
  owner: Hex;
  value: string;
  deadline: string;
  v: number;
  r: Hex;
  s: Hex;
}

export interface StoredAuthorization {
  payer: Hex;
  /** The EIP-712 Authorization signature binding this payer to the leg set. */
  auth: Hex;
  /** One EIP-2612 permit per token this payer pays. */
  permits: SerialPermit[];
}

/** Push this payer's signed authorization for a round. Returns true if stored. */
export async function postAuthorization(
  roundId: Hex,
  payload: StoredAuthorization
): Promise<boolean> {
  try {
    const res = await fetch("/api/round", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, payer: payload.payer, payload: JSON.stringify(payload) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch every payer's authorization for a round, or null if unavailable. */
export async function fetchAuthorizations(roundId: Hex): Promise<StoredAuthorization[] | null> {
  try {
    const res = await fetch(`/api/round?roundId=${encodeURIComponent(roundId)}`, { cache: "no-store" });
    if (res.status === 503) return null;
    if (!res.ok) return [];
    const body = (await res.json()) as { authorizations?: { payload: string }[] };
    if (!body.authorizations) return [];
    const out: StoredAuthorization[] = [];
    for (const row of body.authorizations) {
      try {
        out.push(JSON.parse(row.payload) as StoredAuthorization);
      } catch {
        /* skip a corrupt row rather than failing the whole round */
      }
    }
    return out;
  } catch {
    return null;
  }
}
