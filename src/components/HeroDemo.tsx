"use client";

/**
 * HeroDemo — the interactive centrepiece on the landing page.
 *
 * Loads a real scenario, runs it through the actual netting engine, and lets
 * the visitor flip between the tangle of obligations and the cleared
 * settlement, watching the stats change live. No wallet, no typing.
 */

import { useMemo, useState } from "react";
import { CircleDiagram } from "./CircleDiagram";
import { SCENARIOS, scenarioObligations } from "@/lib/scenarios";
import { clearRoom } from "@/lib/netting";
import { formatAmount, formatPercent } from "@/lib/money";

export function HeroDemo() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [mode, setMode] = useState<"gross" | "net">("gross");

  const scenario = SCENARIOS[scenarioIdx];
  const obligations = useMemo(() => scenarioObligations(scenario), [scenario]);
  const result = useMemo(() => clearRoom(obligations), [obligations]);

  const symbol = obligations[0]?.token.symbol ?? "pathUSD";
  const decimals = obligations[0]?.token.decimals ?? 6;
  const gross = result.stats.grossByToken[symbol] ?? 0n;
  const netted = result.stats.nettedByToken[symbol] ?? 0n;

  return (
    <div className="card" style={{ padding: 20, boxShadow: "var(--shadow-lg)" }}>
      {/* window chrome — reads as a real product surface */}
      <div className="between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 7 }}>
          <span className="dot" style={{ background: "var(--text-4)", boxShadow: "none" }} />
          <span className="label">Live preview</span>
        </div>
        <div className="segment">
          {SCENARIOS.map((s, i) => (
            <button key={s.id} data-active={i === scenarioIdx} onClick={() => setScenarioIdx(i)}>
              {s.title.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
      </div>

      <p className="faint" style={{ margin: "0 0 10px", fontSize: "0.82rem", minHeight: 36, lineHeight: 1.5 }}>
        {scenario.blurb}
      </p>

      {/* diagram */}
      <div
        style={{
          background: "radial-gradient(540px 260px at 50% 15%, var(--accent-glow), transparent 70%)",
          borderRadius: "var(--r-sm)",
          padding: "6px 0",
        }}
      >
        <div style={{ margin: "0 auto", maxWidth: 400 }}>
          <CircleDiagram
            parties={scenario.parties}
            obligations={obligations}
            transfers={result.transfers}
            mode={mode}
            size={400}
          />
        </div>
      </div>

      {/* toggle */}
      <div className="segment" style={{ margin: "6px auto 18px", width: "fit-content" }}>
        <button data-active={mode === "gross"} onClick={() => setMode("gross")}>
          {obligations.length} obligations
        </button>
        <button data-active={mode === "net"} onClick={() => setMode("net")}>
          {result.transfers.length} transfers
        </button>
      </div>

      {/* live stats */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--hairline)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        <Stat label="Gross owed" value={formatAmount(gross, decimals)} unit={symbol} />
        <Stat label="Actually moves" value={formatAmount(netted, decimals)} unit={symbol} highlight />
        <Stat label="Compressed" value={formatPercent(result.stats.compressionRatio)} unit="less to send" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ background: "var(--bg-raised)", padding: "15px 16px" }}>
      <div className="label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div
        className="mono tnum"
        style={{
          fontSize: "1.3rem",
          fontWeight: 500,
          color: highlight ? "var(--accent)" : "var(--text)",
          lineHeight: 1.1,
          transition: "color 0.2s var(--ease)",
        }}
      >
        {value}
      </div>
      <div className="faint" style={{ fontSize: "0.7rem", marginTop: 3 }}>
        {unit}
      </div>
    </div>
  );
}
