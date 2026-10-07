"use client";

/**
 * HeroDemo — the interactive centrepiece on the landing page.
 *
 * It loads a real scenario, runs it through the actual netting engine, and lets
 * the visitor flip between the tangle of obligations and the cleared
 * settlement, watching the stats (transfers, value moved, compression) change
 * live. No wallet, no typing — the pitch lands in one click.
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
    <div className="card card-pad glow-ring" style={{ padding: 24 }}>
      {/* scenario switcher */}
      <div className="between wrap" style={{ gap: 12, marginBottom: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              className="btn btn-quiet btn-sm"
              onClick={() => setScenarioIdx(i)}
              style={{
                color: i === scenarioIdx ? "var(--mint-400)" : "var(--text-faint)",
                background: i === scenarioIdx ? "var(--mint-glow)" : "transparent",
                borderRadius: 999,
                padding: "6px 12px",
              }}
            >
              {s.title.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
      </div>

      <p className="faint" style={{ margin: "0 0 14px", fontSize: "0.85rem", minHeight: 38 }}>
        {scenario.blurb}
      </p>

      {/* diagram */}
      <div
        style={{
          background: "radial-gradient(600px 300px at 50% 20%, rgba(79,227,176,0.05), transparent 70%)",
          borderRadius: "var(--radius)",
          padding: "8px 0",
        }}
      >
        <div style={{ margin: "0 auto", maxWidth: 420 }}>
          <CircleDiagram
            parties={scenario.parties}
            obligations={obligations}
            transfers={result.transfers}
            mode={mode}
            size={420}
          />
        </div>
      </div>

      {/* toggle */}
      <div
        className="row"
        style={{
          gap: 4,
          padding: 4,
          borderRadius: 999,
          border: "1px solid var(--line)",
          width: "fit-content",
          margin: "4px auto 20px",
          background: "var(--ink-900)",
        }}
      >
        <ToggleBtn active={mode === "gross"} onClick={() => setMode("gross")}>
          {obligations.length} obligations
        </ToggleBtn>
        <ToggleBtn active={mode === "net"} onClick={() => setMode("net")}>
          {result.transfers.length} transfers
        </ToggleBtn>
      </div>

      {/* live stats */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <Stat label="Gross owed" value={`${formatAmount(gross, decimals)}`} unit={symbol} />
        <Stat
          label="Actually moves"
          value={`${formatAmount(netted, decimals)}`}
          unit={symbol}
          highlight
        />
        <Stat label="Compressed" value={formatPercent(result.stats.compressionRatio)} unit="less to send" />
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{
        border: 0,
        cursor: "pointer",
        fontSize: "0.8rem",
        letterSpacing: "0.02em",
        padding: "8px 16px",
        borderRadius: 999,
        background: active ? "linear-gradient(180deg, var(--mint-400), var(--mint-500))" : "transparent",
        color: active ? "#04120d" : "var(--text-soft)",
        fontWeight: active ? 600 : 500,
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </button>
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
    <div style={{ background: "var(--ink-850)", padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div
        className="mono tnum"
        style={{
          fontSize: "1.35rem",
          fontWeight: 500,
          color: highlight ? "var(--mint-400)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div className="faint" style={{ fontSize: "0.72rem", marginTop: 3 }}>
        {unit}
      </div>
    </div>
  );
}
