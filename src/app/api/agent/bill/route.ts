/**
 * Public agent billing API.
 *
 * Lets an external agent register a debt (a service delivered → a bill) into a
 * circle in the shared store. The obligation is appended to the circle; the
 * Cinch Agent then nets and settles it under standing policy.
 *
 * POST /api/agent/bill
 *   { circleId, debtor, creditor, amount, reference, token? }
 *     - debtor/creditor: 0x addresses
 *     - amount: decimal string in the token's units (e.g. "20.00" pathUSD)
 *     - reference: human label (invoice no., service name)
 *
 * NOTE: this is an open, demo-grade endpoint — no auth. In production you'd
 * authenticate agents and authorize them to bill specific circles.
 */

import { NextRequest, NextResponse } from "next/server";
import { turso, ensureSchema, getCircle, saveCircle, type StoredObligation } from "@/lib/agentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    circleId?: string;
    debtor?: string;
    creditor?: string;
    amount?: string | number;
    reference?: string;
    token?: { address?: string; symbol?: string; decimals?: number };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { circleId, debtor, creditor, amount, reference, token } = body;
  if (!circleId || !debtor || !creditor || amount === undefined) {
    return NextResponse.json({ error: "circleId, debtor, creditor and amount required" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(debtor) || !/^0x[0-9a-fA-F]{40}$/.test(creditor)) {
    return NextResponse.json({ error: "debtor/creditor must be 0x addresses" }, { status: 400 });
  }
  if (debtor.toLowerCase() === creditor.toLowerCase()) {
    return NextResponse.json({ error: "debtor and creditor must differ" }, { status: 400 });
  }

  const decimals = token?.decimals ?? 6;
  const amountBig = BigInt(Math.round(Number(amount) * 10 ** decimals));
  if (amountBig <= 0n) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  const c = turso();
  if (!c) return NextResponse.json({ error: "shared store not configured" }, { status: 503 });
  await ensureSchema(c);

  const circle = await getCircle(circleId);
  if (!circle) return NextResponse.json({ error: "circle not found" }, { status: 404 });

  const obligation: StoredObligation = {
    id: `obl-${Date.now().toString(36)}`,
    debtor,
    creditor,
    amount: amountBig.toString(),
    token: {
      address: token?.address ?? "0x20c0000000000000000000000000000000000000",
      symbol: token?.symbol ?? "pathUSD",
      decimals,
    },
    reference: reference ?? "agent-bill",
    disputed: false,
    createdAt: new Date().toISOString(),
  };

  circle.obligations.push(obligation);
  await saveCircle(circle);

  return NextResponse.json({ ok: true, obligationId: obligation.id, circleId });
}
