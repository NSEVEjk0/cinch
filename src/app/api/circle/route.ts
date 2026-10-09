/**
 * Shared-circle sync API.
 *
 *   GET  /api/circle?id=<id>   → { payload, updatedAt } | 404
 *   POST /api/circle           → body { id, payload } ; upserts, returns { ok }
 *
 * The payload is the opaque, bigint-safe circle string the client produces with
 * encodeCircle. The server stores and returns it verbatim — it never parses the
 * circle. When Turso isn't configured, both routes return 503 { configured:false }
 * so the client can fall back to URL sharing without treating it as an error.
 */

import { NextResponse } from "next/server";
import { turso, ensureSchema } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = turso();
  if (!c) return NextResponse.json({ configured: false }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    await ensureSchema(c);
    const r = await c.execute({ sql: "SELECT payload, updated_at FROM circles WHERE id = ?", args: [id] });
    if (r.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      payload: r.rows[0].payload as string,
      updatedAt: Number(r.rows[0].updated_at),
    });
  } catch {
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const c = turso();
  if (!c) return NextResponse.json({ configured: false }, { status: 503 });
  let body: { id?: string; payload?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { id, payload } = body;
  if (!id || typeof payload !== "string") {
    return NextResponse.json({ error: "id and payload required" }, { status: 400 });
  }
  // Guard against absurd sizes (a circle payload is small).
  if (payload.length > 500_000) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  try {
    await ensureSchema(c);
    await c.execute({
      sql: "INSERT INTO circles (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      args: [id, payload, Date.now()],
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
