/**
 * Agent demo proxy.
 *
 * The browser cannot fetch the agent service directly: it runs on plain HTTP
 * on the VPS, and a secure page blocks mixed content. This route proxies the
 * demo call server-side — the browser talks to this same-origin HTTPS endpoint,
 * and the server (Node on Vercel) makes the HTTP call to the agent.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.NEXT_PUBLIC_CINCH_AGENT_URL ?? "http://127.0.0.1:4171";

export async function POST(req: NextRequest) {
  let rounds = 1;
  try {
    const body = await req.json();
    if (typeof body.rounds === "number") rounds = body.rounds;
  } catch {
    // default rounds = 1
  }

  try {
    const res = await fetch(`${AGENT_URL}/demo/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rounds }),
      signal: AbortSignal.timeout(120_000),
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
