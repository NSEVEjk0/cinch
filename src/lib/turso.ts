/**
 * Turso (libSQL) client — server-only.
 *
 * Backs optional live shared circles: a circle can be pushed to a tiny hosted
 * table so several people opening the same link see one another's edits, rather
 * than each holding a private copy. It is strictly additive — when the Turso
 * env vars are absent, the API routes report "not configured" and the client
 * silently falls back to the existing URL-fragment sharing.
 *
 * Only the opaque, bigint-safe circle payload is stored (produced by
 * encodeCircle on the client); the server never interprets it.
 */

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

/** The shared libSQL client, or null when Turso isn't configured. */
export function turso(): Client | null {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  client = createClient({ url, authToken });
  return client;
}

export function tursoConfigured(): boolean {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

let ensured = false;

/** Create the circles table once per process. */
export async function ensureSchema(c: Client): Promise<void> {
  if (ensured) return;
  await c.execute(
    "CREATE TABLE IF NOT EXISTS circles (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  );
  ensured = true;
}

let ensuredRounds = false;

/**
 * Create the round-authorizations table once per process. Each row is one
 * payer's signed authorization (permit + Authorization signature) for a Model C
 * clearing round, so the organiser can collect every payer's consent before
 * submitting the single atomic clear(). The payload is opaque to the server.
 */
export async function ensureRoundSchema(c: Client): Promise<void> {
  if (ensuredRounds) return;
  await c.execute(
    "CREATE TABLE IF NOT EXISTS round_auths (round_id TEXT NOT NULL, payer TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (round_id, payer))"
  );
  ensuredRounds = true;
}
