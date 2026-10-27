"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Cinch Agent decision timeline — the audit trail of the autonomous clearing
 * agent. Polls the same-origin /api/agent/state proxy and renders key
 * decisions (observe → propose → settle → defer) as a readable timeline.
 */

interface AgentEvent {
  t: number;
  kind: string;
  note?: string;
  [key: string]: unknown;
}

const STORY_KINDS = new Set(["propose", "settle", "defer", "observe", "error"]);

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  settle: { label: "SETTLED", bg: "var(--pos-weak)", fg: "var(--pos)" },
  propose: { label: "PROPOSED", bg: "var(--mint-weak)", fg: "var(--mint-400)" },
  defer: { label: "DEFERRED", bg: "var(--hairline)", fg: "var(--text-2)" },
  observe: { label: "OBSERVED", bg: "var(--hairline)", fg: "var(--text-2)" },
  hold: { label: "HOLD", bg: "var(--hairline)", fg: "var(--text-3)" },
  bill: { label: "BILL", bg: "var(--hairline)", fg: "var(--text-3)" },
  error: { label: "ERROR", bg: "var(--danger-weak)", fg: "var(--danger)" },
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtAge(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function lines(e: AgentEvent): string[] {
  const note = typeof e.note === "string" ? e.note : "";
  switch (e.kind) {
    case "settle": {
      const out: string[] = [];
      if (typeof e.roundId === "string") out.push(`${e.roundId} settled atomically on-chain`);
      if (typeof e.transfers === "number") out.push(`${e.transfers} net transfers executed`);
      if (typeof e.compression === "number") out.push(`Compression: ${e.compression}% (above policy threshold)`);
      if (note) out.push(note);
      return out;
    }
    case "propose": {
      const out: string[] = [];
      if (typeof e.open === "number") out.push(`Observed ${e.open} open obligations`);
      if (typeof e.transfers === "number") out.push(`Computed net positions → only ${e.transfers} transfers required`);
      if (typeof e.compression === "number") out.push(`Compression: ${e.compression}% (above policy)`);
      if (note) out.push(note);
      return out;
    }
    case "defer": {
      const out: string[] = [];
      if (e.reason === "underfunded") out.push("Net positions ready — but net debtors underfunded");
      if (note) out.push(note);
      return out;
    }
    case "observe": {
      const out: string[] = [];
      if (typeof e.open === "number") out.push(`Observed ${e.open} open obligations`);
      if (note) out.push(note);
      return out;
    }
    case "bill": {
      const debtor = typeof e.debtor === "string" ? e.debtor.split("@")[0] : "";
      const creditor = typeof e.creditor === "string" ? e.creditor.split("@")[0] : "";
      const amount = typeof e.amount === "number" ? e.amount.toFixed(2) : "";
      const memo = typeof e.memo === "string" ? e.memo : "";
      return [`${debtor} → ${creditor} · ${amount} pathUSD · ${memo}`];
    }
    default:
      return note ? [note] : [];
  }
}

export function AgentTimeline() {
  const [log, setLog] = useState<AgentEvent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/agent/state?which=log", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (data.ok) {
            setLog(Array.isArray(data.data) ? data.data : []);
            setError("");
          } else {
            setError(data.error ?? "agent unreachable");
          }
        }
      } catch {
        if (!cancelled) setError("agent unreachable");
      }
    }
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const visible = useMemo(() => {
    const reversed = [...log].reverse();
    return showAll ? reversed : reversed.filter((e) => STORY_KINDS.has(e.kind));
  }, [log, showAll]);

  if (error && log.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: 40 }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>
          Agent service unreachable — the demo and standing-policy flow are still fully tested on-chain.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--hairline)" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          Agent decision timeline
        </p>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="btn btn-ghost"
          style={{ fontSize: "0.8rem", padding: "6px 12px" }}
        >
          {showAll ? "Showing all events" : "Showing key decisions"}
        </button>
      </div>
      <div style={{ maxHeight: 480, overflowY: "auto", padding: 16 }}>
        {visible.length === 0 && (
          <p className="muted" style={{ textAlign: "center", padding: "32px 0", margin: 0 }}>
            No key decisions yet — the agent is watching.
          </p>
        )}
        {visible.map((e, i) => {
          const badge = BADGE[e.kind] ?? { label: e.kind.toUpperCase(), bg: "var(--hairline)", fg: "var(--text-2)" };
          const isStory = STORY_KINDS.has(e.kind);
          const text = lines(e);
          return (
            <div
              key={e.t + "-" + i}
              style={{
                padding: "12px 16px",
                marginBottom: 8,
                borderRadius: "var(--r-md)",
                border: `1px solid ${isStory ? "var(--mint-400)" : "var(--hairline)"}`,
                background: isStory ? "var(--mint-weak)" : "var(--surface)",
              }}
            >
              <div className="between" style={{ gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      padding: "3px 8px",
                      borderRadius: "var(--r-sm)",
                      background: badge.bg,
                      color: badge.fg,
                    }}
                  >
                    {badge.label}
                  </span>
                  {e.kind === "settle" && typeof e.roundId === "string" && (
                    <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                      {e.roundId}
                    </span>
                  )}
                </div>
                <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  {fmtTime(e.t as number)} · {fmtAge(e.t as number)}
                </span>
              </div>
              {text.length > 0 && (
                <div style={{ marginTop: 8, display: "grid", gap: 2 }}>
                  {text.map((line, j) => (
                    <div key={j} style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.55 }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
