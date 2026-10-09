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
