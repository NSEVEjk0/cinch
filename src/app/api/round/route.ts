/**
 * Round-authorization sync API (Model C — multi-party clearing).
 *
 *   GET  /api/round?roundId=<id>  → { authorizations: [{ payer, payload, updatedAt }] }
 *   POST /api/round               → body { roundId, payer, payload } ; upserts
 *
 * Each payer in a cleared round signs an EIP-2612 permit + an EIP-712
 * Authorization and POSTs the pair here; the organiser GETs them all and, once
 * every payer has signed, submits one atomic clear(). The payload is an opaque
 * JSON string the client builds and verifies — the server never interprets it,
 * and no funds are implied by storing it (nothing moves until clear()).
 *
 * When Turso isn't configured both routes return 503 { configured:false } so the
 * client can tell the user that live collection needs the shared store.
 */

import { NextResponse } from "next/server";
import { turso, ensureRoundSchema } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = turso();
  if (!c) return NextResponse.json({ configured: false }, { status: 503 });
  const roundId = new URL(req.url).searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ error: "missing roundId" }, { status: 400 });
  try {
    await ensureRoundSchema(c);
    const r = await c.execute({
      sql: "SELECT payer, payload, updated_at FROM round_auths WHERE round_id = ?",
      args: [roundId],
    });
    return NextResponse.json({
      authorizations: r.rows.map((row) => ({
        payer: row.payer as string,
        payload: row.payload as string,
        updatedAt: Number(row.updated_at),
      })),
    });
  } catch {
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const c = turso();
  if (!c) return NextResponse.json({ configured: false }, { status: 503 });
  let body: { roundId?: string; payer?: string; payload?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { roundId, payer, payload } = body;
  if (!roundId || !payer || typeof payload !== "string") {
    return NextResponse.json({ error: "roundId, payer and payload required" }, { status: 400 });
  }
  if (payload.length > 100_000) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  try {
    await ensureRoundSchema(c);
    await c.execute({
      sql: "INSERT INTO round_auths (round_id, payer, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(round_id, payer) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      args: [roundId, payer.toLowerCase(), payload, Date.now()],
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
