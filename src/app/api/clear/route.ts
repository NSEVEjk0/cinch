/**
 * Agent clearing endpoint.
 *
 * A stateless API that lets a machine (an AI agent, a backend, an MCP tool) run
 * Cinch's netting without a browser: POST a set of obligations, get back the
 * minimal cleared settlement — the same engine the UI uses.
 *
 * POST /api/clear
 *   {
 *     "mode": "min-transfers" | "preserve-relationships",   // optional
 *     "obligations": [
 *       { "debtor": "0x..", "creditor": "0x..", "amount": "100.00",
 *         "token": { "address": "0x..", "symbol": "pathUSD", "decimals": 6 },
 *         "reference": "invoice-42", "disputed": false }
 *     ]
 *   }
 *
 * Returns the transfers, net positions, excluded obligations and headline
 * stats. Amounts in the request may be decimal strings or smallest-unit
 * integers; amounts out are decimal strings so the response is agent-friendly.
 */

import { NextRequest, NextResponse } from "next/server";
import { clearRoom } from "@/lib/netting";
import { parseAmount, formatAmount } from "@/lib/money";
import type { NettingMode, Obligation, Token } from "@/lib/types";
import { PATH_USD } from "@/lib/tempo";

export const runtime = "nodejs";

interface InObligation {
  debtor?: string;
  creditor?: string;
  amount?: string | number;
  token?: Partial<Token>;
  reference?: string;
  disputed?: boolean;
}

function coerceToken(t?: Partial<Token>): Token {
  if (t?.address && t.symbol && typeof t.decimals === "number") {
    return { address: t.address as `0x${string}`, symbol: t.symbol, decimals: t.decimals };
  }
  return PATH_USD;
}

function coerceAmount(raw: string | number | undefined, decimals: number): bigint {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s)) return BigInt(s); // already smallest-unit
  return parseAmount(s, decimals); // decimal string
}

export async function POST(req: NextRequest) {
  let body: { obligations?: InObligation[]; mode?: NettingMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.obligations) || body.obligations.length === 0) {
    return NextResponse.json({ error: "Provide a non-empty `obligations` array." }, { status: 400 });
  }

  const obligations: Obligation[] = [];
  for (let i = 0; i < body.obligations.length; i++) {
    const o = body.obligations[i];
    if (!o.debtor || !o.creditor) {
      return NextResponse.json({ error: `obligation[${i}] needs debtor and creditor.` }, { status: 400 });
    }
    const token = coerceToken(o.token);
    let amount: bigint;
    try {
      amount = coerceAmount(o.amount, token.decimals);
    } catch {
      return NextResponse.json({ error: `obligation[${i}] has an invalid amount.` }, { status: 400 });
    }
    obligations.push({
      id: `in-${i}`,
      debtor: o.debtor as `0x${string}`,
      creditor: o.creditor as `0x${string}`,
      amount,
      token,
      reference: o.reference ?? `obligation-${i}`,
      disputed: o.disputed ?? false,
    });
  }

  const result = clearRoom(obligations, { mode: body.mode });

  const serialBig = (r: Record<string, bigint>, decimalsFor: (s: string) => number) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, formatAmount(v, decimalsFor(k))]));
  const decimalsBySymbol: Record<string, number> = {};
  for (const o of obligations) decimalsBySymbol[o.token.symbol] = o.token.decimals;
  const dFor = (s: string) => decimalsBySymbol[s] ?? 6;

  return NextResponse.json({
    transfers: result.transfers.map((t) => ({
      from: t.from,
      to: t.to,
      amount: formatAmount(t.amount, t.token.decimals),
      token: t.token.symbol,
      references: t.references,
    })),
    positions: result.positions.map((p) => ({
      party: p.party,
      token: p.token.symbol,
      net: formatAmount(p.net, p.token.decimals),
    })),
    excluded: result.excluded.map((o) => ({ reference: o.reference, disputed: !!o.disputed })),
    stats: {
      obligationCount: result.stats.obligationCount,
      transferCount: result.stats.transferCount,
      compressionRatio: result.stats.compressionRatio,
      grossByToken: serialBig(result.stats.grossByToken, dFor),
      nettedByToken: serialBig(result.stats.nettedByToken, dFor),
    },
  });
}

/** A GET returns a tiny self-description so an agent can discover the shape. */
export async function GET() {
  return NextResponse.json({
    service: "cinch-clear",
    description:
      "Multilateral netting. POST { obligations: [{debtor, creditor, amount, token?, reference?}], mode? } to get the minimal cleared settlement.",
    modes: ["min-transfers", "preserve-relationships"],
  });
}
