/**
 * Agent state proxy — stats + recent log for the agent page.
 *
 * The browser cannot fetch the agent service directly (plain HTTP on the VPS
 * vs HTTPS page), so this route proxies /stats and /log server-side.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.NEXT_PUBLIC_CINCH_AGENT_URL ?? "http://127.0.0.1:4171";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const which = url.searchParams.get("which") ?? "stats";
  const endpoint = which === "log" ? "/log" : "/stats";

  try {
    const res = await fetch(`${AGENT_URL}${endpoint}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `agent ${endpoint} → ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Agent unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
