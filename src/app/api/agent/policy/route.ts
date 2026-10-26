/**
 * Agent policy proxy — stores a participant's signed standing policy + permit
 * with the agent service (server-side, avoiding mixed-content/CORS issues).
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.NEXT_PUBLIC_CINCH_AGENT_URL ?? "http://127.0.0.1:4171";

export async function POST(req: NextRequest) {
  let body: { circleId?: string; payer?: string; standingAuth?: unknown; permit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body.circleId || !body.payer || !body.standingAuth || !body.permit) {
    return NextResponse.json({ ok: false, error: "circleId, payer, standingAuth and permit required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${AGENT_URL}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Agent unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
