"use client";

import { useState } from "react";

/**
 * Live Cinch Agent demo.
 *
 * Calls the same-origin /api/agent-demo proxy, which forwards to the agent
 * service server-side. (The agent runs on plain HTTP on the VPS; a browser on
 * a secure page cannot fetch it directly due to mixed-content rules, so the
 * Next.js route proxies it.)
 */

interface SettleEvent {
  t: number;
  roundId?: string;
  txHash?: string;
  gross?: number;
  net?: number;
  compression?: number;
  transfers?: number;
}

interface DeferEvent {
  t: number;
  reason?: string;
}

interface DemoResult {
  ok?: boolean;
  circleId?: string;
  bills?: number;
  settled?: boolean;
  settle?: SettleEvent | null;
  defer?: DeferEvent | null;
  error?: string;
}

type Phase = "idle" | "running" | "done" | "error";

export function AgentLive() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DemoResult | null>(null);

  async function run() {
    setPhase("running");
    setResult(null);
    try {
      const res = await fetch("/api/agent-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds: 1 }),
      });
      const data = (await res.json()) as DemoResult;
      if (!data.ok) throw new Error(data.error ?? "demo failed");
      setResult(data);
      setPhase("done");
    } catch (e) {
      setResult({ error: String(e instanceof Error ? e.message : e) });
      setPhase("error");
    }
  }

  const compressionPct = result?.settle?.compression != null ? Math.round(result.settle.compression * 100) : null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "26px 30px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="between" style={{ flexWrap: "wrap", gap: 16 }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              Live demo
            </p>
            <h2 className="display" style={{ fontSize: "1.4rem" }}>
              Watch agents transact — then settle
            </h2>
            <p className="muted" style={{ maxWidth: "56ch", marginTop: 10, fontSize: "0.95rem" }}>
              Four agents deliver services, bill each other, and sign standing policies. The agent
              nets the web and settles the whole round atomically — no per-round signatures.
            </p>
          </div>
          <button
            onClick={run}
            disabled={phase === "running"}
            className="btn btn-primary"
            style={{ whiteSpace: "nowrap" }}
          >
            {phase === "running" ? "Agents transacting…" : result ? "Run again" : "Run the demo"}
          </button>
        </div>
      </div>

      <div style={{ padding: "26px 30px" }}>
        {phase === "running" && (
          <p className="muted" style={{ margin: 0 }}>
            <span className="dot" style={{ display: "inline-block", marginRight: 8 }} />
            Agents are delivering services and billing each other…
          </p>
        )}

        {phase === "error" && (
          <div style={{ padding: 18, borderRadius: "var(--r-md)", background: "var(--danger-weak)", color: "var(--danger)", fontSize: "0.95rem" }}>
            Could not reach the Cinch agent: {result?.error}. The agent service may not be running
            on this deployment — the contract and standing-authorization flow are still fully tested
            on-chain.
          </div>
        )}

        {phase === "done" && result && (
          <div style={{ display: "grid", gap: 20 }}>
            <div className="g3">
              <div className="stat-card">
                <div className="mono" style={{ color: "var(--text-3)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Services billed
                </div>
                <div style={{ fontSize: "1.9rem", fontWeight: 600, marginTop: 6 }}>{result.bills}</div>
              </div>
              <div className="stat-card">
                <div className="mono" style={{ color: "var(--text-3)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Gross obligations
                </div>
                <div style={{ fontSize: "1.9rem", fontWeight: 600, marginTop: 6 }}>
                  {result.settle?.gross ?? "—"} <span style={{ fontSize: "0.9rem", color: "var(--text-3)" }}>pathUSD</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="mono" style={{ color: "var(--text-3)", fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Net settlement
                </div>
                <div style={{ fontSize: "1.9rem", fontWeight: 600, marginTop: 6, color: "var(--pos)" }}>
                  {result.settle?.net ?? "—"} <span style={{ fontSize: "0.9rem", color: "var(--text-3)" }}>pathUSD</span>
                </div>
              </div>
            </div>

            {compressionPct != null && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--r-md)", background: "var(--pos-weak)", color: "var(--pos)", fontSize: "0.95rem" }}>
                <strong>{compressionPct}%</strong> of gross volume removed by netting — the same
                liquidity-savings mechanism banks use (CLS cuts daily FX funding needs by 90%+).
              </div>
            )}

            {result.settled && result.settle ? (
              <div style={{ padding: "14px 18px", borderRadius: "var(--r-md)", border: "1px solid var(--hairline)", background: "var(--surface)" }}>
                <span className="mono" style={{ color: "var(--pos)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  ✓ Settled atomically by the agent
                </span>
                <div style={{ marginTop: 8, fontSize: "0.9rem", color: "var(--text-2)", wordBreak: "break-all" }}>
                  {result.settle.transfers} transfers ·{" "}
                  <span className="mono" style={{ fontSize: "0.82rem" }}>{result.settle.txHash}</span>
                </div>
              </div>
            ) : result.defer ? (
              <div style={{ padding: "14px 18px", borderRadius: "var(--r-md)", border: "1px solid var(--hairline)", background: "var(--surface)", fontSize: "0.9rem", color: "var(--text-2)" }}>
                The agent deferred this round: {result.defer.reason}
              </div>
            ) : (
              <div style={{ padding: "14px 18px", borderRadius: "var(--r-md)", border: "1px solid var(--hairline)", background: "var(--surface)", fontSize: "0.9rem", color: "var(--text-2)" }}>
                The obligations already net to zero — no transfers needed. That is netting working.
              </div>
            )}
          </div>
        )}

        {phase === "idle" && (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Press “Run the demo” to script a live agent circle and settle it on-chain.
          </p>
        )}
      </div>
    </div>
  );
}
