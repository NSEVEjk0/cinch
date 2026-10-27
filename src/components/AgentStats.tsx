"use client";

import { useEffect, useState } from "react";

/**
 * Live outcome metrics for the Cinch agent — rounds settled, gross volume
 * compressed, net moved, liquidity saved. Polls the /api/agent/state proxy.
 */

interface AgentStats {
  roundsSettled?: number;
  grossSettled?: string;
  netSettled?: string;
  errors?: number;
  uptimeMs?: number;
}

function fmtUptime(ms?: number) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function AgentStats() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/agent/state?which=stats", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (data.ok) {
            setStats(data.data);
            setError("");
          } else {
            setError(data.error ?? "unreachable");
          }
        }
      } catch {
        if (!cancelled) setError("unreachable");
      }
    }
    poll();
    const iv = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const gross = stats?.grossSettled ? Number(stats.grossSettled) / 1e6 : 0;
  const net = stats?.netSettled ? Number(stats.netSettled) / 1e6 : 0;
  const savedPct = gross > 0 ? Math.round((1 - net / gross) * 100) : 0;

  const cards = [
    { label: "Rounds settled", value: String(stats?.roundsSettled ?? "—"), sub: "autonomous clearWithStanding" },
    { label: "Gross volume", value: gross ? gross.toFixed(0) : "—", sub: "pathUSD gross" },
    { label: "Net moved", value: net ? net.toFixed(0) : "—", sub: "pathUSD net" },
    { label: "Liquidity saved", value: gross > 0 ? `${savedPct}%` : "—", sub: `up ${fmtUptime(stats?.uptimeMs)}` },
  ];

  return (
    <div>
      <div className="g4" style={{ gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} className="stat-card" style={{ padding: "18px 20px" }}>
            <div className="mono" style={{ color: "var(--text-3)", fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {c.label}
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: 600, marginTop: 6, color: c.label === "Liquidity saved" ? "var(--pos)" : "inherit" }}>
              {c.value}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      {error && (
        <p className="muted" style={{ marginTop: 10, fontSize: "0.82rem" }}>
          Agent service unreachable — showing last known state.
        </p>
      )}
    </div>
  );
}
