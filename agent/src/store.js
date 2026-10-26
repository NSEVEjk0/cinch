/**
 * Cinch Agent — shared store (Turso).
 *
 * Holds:
 *  - circles: the shared circle payloads (same table the web app uses)
 *  - agent_policies: standing authorizations + permits granted to the agent
 *    by participants, keyed by (circle_id, payer). The agent reads these to
 *    settle rounds autonomously.
 */

import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");

function readEnvLocal(key) {
  const p = path.join(ROOT, ".env.local");
  if (!existsSync(p)) return null;
  const m = readFileSync(p, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

let client = null;
let ensured = false;

export function turso() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL ?? readEnvLocal("TURSO_DATABASE_URL");
  const authToken = process.env.TURSO_AUTH_TOKEN ?? readEnvLocal("TURSO_AUTH_TOKEN");
  if (!url || !authToken) return null;
  client = createClient({ url, authToken });
  return client;
}

export async function ensureSchema() {
  if (ensured) return;
  const c = turso();
  if (!c) return;
  await c.execute(
    "CREATE TABLE IF NOT EXISTS circles (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  );
  await c.execute(
    "CREATE TABLE IF NOT EXISTS agent_policies (circle_id TEXT NOT NULL, payer TEXT NOT NULL, standing_auth TEXT NOT NULL, permit TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (circle_id, payer))"
  );
  ensured = true;
}

/** Decode a circle payload (base64 JSON, same as the app's encodeCircle). */
export function decodeCircle(payload) {
  try {
    const json = decodeURIComponent(Buffer.from(payload, "base64").toString("utf8"));
    const circle = JSON.parse(json);
    return {
      id: circle.id,
      name: circle.name,
      obligations: (circle.obligations ?? []).map((o) => ({
        id: o.id,
        debtor: o.debtor,
        creditor: o.creditor,
        amount: BigInt(o.amount),
        token: { address: o.token?.address ?? "0x20c0000000000000000000000000000000000000", symbol: o.token?.symbol ?? "pathUSD", decimals: o.token?.decimals ?? 6 },
        reference: o.reference ?? o.id,
        disputed: !!o.disputed,
        settled: !!o.settled,
      })),
    };
  } catch {
    return null;
  }
}

/** Encode a circle payload (server-side, Buffer-based). */
export function encodeCircle(circle) {
  const payload = {
    id: circle.id,
    name: circle.name,
    cadence: circle.cadence ?? "once",
    defaultToken: circle.defaultToken ?? { address: "0x20c0000000000000000000000000000000000000", symbol: "pathUSD", decimals: 6 },
    createdAt: circle.createdAt ?? new Date().toISOString(),
    parties: circle.parties ?? [],
    obligations: (circle.obligations ?? []).map((o) => ({
      ...o,
      amount: o.amount.toString(),
    })),
  };
  return Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString("base64");
}

/** Latest circle from the shared store. */
export async function latestCircle() {
  await ensureSchema();
  const c = turso();
  if (!c) return null;
  const r = await c.execute("SELECT id, payload FROM circles ORDER BY updated_at DESC LIMIT 1");
  if (r.rows.length === 0) return null;
  return decodeCircle(String(r.rows[0].payload));
}

/** Fetch a circle by id. */
export async function getCircle(id) {
  await ensureSchema();
  const c = turso();
  if (!c) return null;
  const r = await c.execute({ sql: "SELECT payload FROM circles WHERE id = ?", args: [id] });
  if (r.rows.length === 0) return null;
  return decodeCircle(String(r.rows[0].payload));
}

/** Upsert a circle. */
export async function saveCircle(circle) {
  await ensureSchema();
  const c = turso();
  if (!c) throw new Error("Turso not configured");
  await c.execute({
    sql: "INSERT INTO circles (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    args: [circle.id, encodeCircle(circle), Date.now()],
  });
}

/** JSON-safe stringify (BigInt → string). */
function jsonSafe(value) {
  return JSON.stringify(value, (k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Store a participant's standing policy + permit for a circle. */
export async function savePolicy({ circleId, payer, standingAuth, permit }) {
  await ensureSchema();
  const c = turso();
  if (!c) throw new Error("Turso not configured");
  await c.execute({
    sql: "INSERT INTO agent_policies (circle_id, payer, standing_auth, permit, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(circle_id, payer) DO UPDATE SET standing_auth = excluded.standing_auth, permit = excluded.permit, created_at = excluded.created_at",
    args: [circleId, payer.toLowerCase(), jsonSafe(standingAuth), jsonSafe(permit), Date.now()],
  });
}

/** Policies for a circle, keyed by payer address (lowercased). */
export async function policiesForCircle(circleId) {
  await ensureSchema();
  const c = turso();
  if (!c) return {};
  const r = await c.execute({ sql: "SELECT payer, standing_auth, permit FROM agent_policies WHERE circle_id = ?", args: [circleId] });
  const out = {};
  for (const row of r.rows) {
    out[String(row.payer)] = {
      standingAuth: JSON.parse(String(row.standing_auth)),
      permit: JSON.parse(String(row.permit)),
    };
  }
  return out;
}
