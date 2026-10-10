"use client";

/**
 * BalancesCard (#1 + #2) — live on-chain balances and a testnet faucet.
 *
 * Reads each party's actual balance of the circle's settlement token straight
 * from Tempo, and flags any net debtor who can't cover their net position — the
 * visible face of liquidity-aware clearing. For the connected wallet on
 * testnet it also offers a one-tap link to the faucet so an empty wallet is
 * never a dead end.
 */

import { useEffect, useState, useCallback } from "react";
import type { Circle } from "@/lib/circle";
import { partyName } from "@/lib/circle";
import type { ClearingResult } from "@/lib/types";
import { readBalance } from "@/lib/chain";
import { useNetwork } from "@/lib/useNetwork";
import { useCinchAccount } from "@/lib/useSettlement";
import { formatAmount, shortAddress } from "@/lib/money";

export function BalancesCard({ circle, result }: { circle: Circle; result: ClearingResult }) {
  const network = useNetwork();
  const { address } = useCinchAccount();
  const token = circle.defaultToken;
  const [balances, setBalances] = useState<Record<string, bigint> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Net position per party (what they must fund), from the clearing result.
  const netByParty = new Map(result.positions.map((p) => [p.party.toLowerCase(), p.net]));

  const load = useCallback(async () => {
    if (circle.parties.length === 0) return;
    setLoading(true);
    setErr(null);
    try {
      const entries = await Promise.all(
        circle.parties.filter((p) => p.address).map(async (p) => {
          try {
            const bal = await readBalance(p.address!, token.address, network);
            return [p.address!.toLowerCase(), bal] as const;
          } catch {
            return [p.address!.toLowerCase(), -1n] as const; // unreadable
          }
        })
      );
      setBalances(Object.fromEntries(entries));
    } catch {
      setErr("Could not read balances from Tempo just now.");
    } finally {
      setLoading(false);
    }
  }, [circle.parties, token.address, network]);

  useEffect(() => {
    setBalances(null);
  }, [network, token.address]);

  const name = (addr: string) => {
    const n = partyName(circle, addr);
    return n.startsWith("0x") ? shortAddress(n) : n;
  };

  if (circle.parties.length === 0) return null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="between" style={{ padding: "16px 22px", borderBottom: "1px solid var(--hairline)" }}>
        <span className="label">Balances · {token.symbol}</span>
        <div className="row" style={{ gap: 8 }}>
          {network.faucetUrl ? (
            <a className="btn btn-quiet btn-sm" href={network.faucetUrl} target="_blank" rel="noreferrer">
              Get test funds ↗
            </a>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Reading…" : balances ? "Refresh" : "Check balances"}
          </button>
        </div>
      </div>

      {err ? (
        <p style={{ color: "var(--neg)", fontSize: "0.86rem", padding: "14px 22px", margin: 0 }}>{err}</p>
      ) : null}

      {balances ? (
        <div>
          {circle.parties.filter((p) => p.address).map((p) => {
            const bal = balances[p.address!.toLowerCase()] ?? 0n;
            const net = netByParty.get(p.address!.toLowerCase()) ?? 0n;
            const mustFund = net < 0n ? -net : 0n;
            const unreadable = bal < 0n;
            const short = !unreadable && mustFund > 0n && bal < mustFund;
            const isMe = address && p.address!.toLowerCase() === address.toLowerCase();
            return (
              <div
                key={p.address}
                className="between"
                style={{ padding: "11px 22px", borderBottom: "1px solid var(--hairline)" }}
              >
                <span style={{ fontSize: "0.9rem" }}>
                  {name(p.address!)}
                  {isMe ? <span className="chip chip-mint" style={{ marginLeft: 8 }}>you</span> : null}
                  {short ? (
                    <span className="chip" style={{ marginLeft: 8, color: "var(--warn)" }}>underfunded</span>
                  ) : null}
                </span>
                <span className="mono tnum" style={{ fontSize: "0.86rem", color: short ? "var(--warn)" : "var(--text-2)" }}>
                  {unreadable ? "—" : formatAmount(bal, token.decimals)}
                  {mustFund > 0n ? (
                    <span className="faint"> / needs {formatAmount(mustFund, token.decimals)}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          <p className="faint" style={{ fontSize: "0.78rem", padding: "12px 22px", margin: 0 }}>
            Net debtors who hold less than their net position are flagged — Cinch can still clear the
            largest fundable sub-circle.
          </p>
        </div>
      ) : (
        <p className="faint" style={{ fontSize: "0.84rem", padding: "16px 22px", margin: 0 }}>
          Read each party&apos;s on-chain {token.symbol} balance to see who can cover their share
          before you settle.
        </p>
      )}
    </div>
  );
}
