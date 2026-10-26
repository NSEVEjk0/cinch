/**
 * Server-side agent store — circle read/write helpers used by the agent API
 * routes (/api/agent/bill). Circles are stored as opaque base64 payloads in
 * Turso (same table the client uses); this module decodes/encodes them with
 * Buffer so the server can append obligations.
 */

import { turso, ensureSchema } from "./turso";
import type { Client } from "@libsql/client";

export { turso, ensureSchema };

export interface StoredObligation {
  id: string;
  debtor: string;
  creditor: string;
  amount: string; // serialised bigint
  token?: { address: string; symbol: string; decimals: number };
  reference?: string;
  disputed?: boolean;
  createdAt?: string;
}

export interface StoredCircle {
  id: string;
  name: string;
  cadence?: string;
  createdAt?: string;
  parties?: { id: string; name: string; address?: string }[];
  obligations: StoredObligation[];
}

/** Decode a circle payload (base64 JSON). */
export function decodeCircle(payload: string): StoredCircle | null {
  try {
    const json = decodeURIComponent(Buffer.from(payload, "base64").toString("utf8"));
    return JSON.parse(json) as StoredCircle;
  } catch {
    return null;
  }
}

/** Encode a circle payload (base64 JSON). BigInts must already be strings. */
export function encodeCircle(circle: StoredCircle): string {
  return Buffer.from(encodeURIComponent(JSON.stringify(circle))).toString("base64");
}

/** Fetch a circle by id, or null. */
export async function getCircle(id: string): Promise<StoredCircle | null> {
  const c = turso();
  if (!c) return null;
  await ensureSchema(c);
  const r = await c.execute({ sql: "SELECT payload FROM circles WHERE id = ?", args: [id] });
  if (r.rows.length === 0) return null;
  return decodeCircle(String(r.rows[0].payload));
}

/** Upsert a circle. */
export async function saveCircle(circle: StoredCircle): Promise<void> {
  const c = turso();
  if (!c) throw new Error("Turso not configured");
  await ensureSchema(c);
  await c.execute({
    sql: "INSERT INTO circles (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    args: [circle.id, encodeCircle(circle), Date.now()],
  });
}

export type { Client };
