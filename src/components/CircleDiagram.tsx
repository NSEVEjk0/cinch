"use client";

/**
 * CircleDiagram — the signature visual.
 *
 * Parties sit on a ring. In "gross" mode it draws every obligation as a thin
 * curved edge between debtors and creditors — the tangle. In "net" mode it
 * draws only the cleared settlement transfers — a handful of bright arrows.
 * Toggling between the two is the whole pitch in one motion.
 *
 * It is driven by real data: pass obligations + the clearing result and it
 * renders exactly what the engine produced.
 */

import { useMemo } from "react";
import type { Obligation, SettlementTransfer } from "@/lib/types";

interface Node {
  address: string;
  name: string;
  x: number;
  y: number;
  angle: number;
}

export function CircleDiagram({
  parties,
  obligations,
  transfers,
  mode,
  size = 420,
}: {
  parties: { address: string; name: string }[];
  obligations: Obligation[];
  transfers: SettlementTransfer[];
  mode: "gross" | "net";
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 54;

  const nodes = useMemo<Node[]>(() => {
    const n = parties.length;
    return parties.map((p, i) => {
      // Start at top, go clockwise.
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return {
        address: p.address,
        name: p.name,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        angle,
      };
    });
  }, [parties, cx, cy, r]);

  const nodeFor = (address: string): Node | undefined =>
    nodes.find((x) => x.address.toLowerCase() === address.toLowerCase());

  const edges = mode === "gross" ? obligations : transfers;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block" }}
      role="img"
      aria-label={mode === "gross" ? "Obligations between parties" : "Cleared settlement transfers"}
    >
      <defs>
        <linearGradient id="edgeNet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c67b3e" />
          <stop offset="1" stopColor="#a9693a" />
        </linearGradient>
        <marker
          id="arrowNet"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#a9693a" />
        </marker>
        <marker
          id="arrowGross"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="rgba(138,122,104,0.55)" />
        </marker>
      </defs>

      {/* guide ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(74,54,34,0.12)" strokeWidth={1} />

      {/* edges */}
      <g>
        {edges.map((e, i) => {
          const from = nodeFor("debtor" in e ? e.debtor : e.from);
          const to = nodeFor("creditor" in e ? e.creditor : e.to);
          if (!from || !to) return null;
          const path = curve(from, to, cx, cy);
          const isNet = mode === "net";
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={isNet ? "url(#edgeNet)" : "rgba(138,122,104,0.3)"}
              strokeWidth={isNet ? 2.4 : 1.1}
              markerEnd={isNet ? "url(#arrowNet)" : "url(#arrowGross)"}
              style={{
                filter: isNet ? "drop-shadow(0 0 5px rgba(169,105,58,0.4))" : "none",
                animation: `edge-draw 0.6s ease ${i * 0.05}s both`,
              }}
            />
          );
        })}
      </g>

      {/* nodes */}
      <g>
        {nodes.map((n, i) => (
          <g key={n.address} style={{ animation: `fade-in 0.4s ease ${i * 0.04}s both` }}>
            <circle cx={n.x} cy={n.y} r={7} fill="#ffffff" stroke="#a9693a" strokeWidth={1.6} />
            <circle cx={n.x} cy={n.y} r={2.6} fill="#c67b3e" />
            <text
              x={labelX(n, cx)}
              y={n.y}
              dy="0.34em"
              textAnchor={n.x < cx - 4 ? "end" : n.x > cx + 4 ? "start" : "middle"}
              fontFamily="var(--font-mono)"
              fontSize={12.5}
              fill="#5d4e40"
            >
              {n.name}
            </text>
          </g>
        ))}
      </g>

      <style>{`
        @keyframes edge-draw {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

/** Quadratic curve bowed toward the centre, so edges don't all overlap. */
function curve(from: Node, to: Node, cx: number, cy: number): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Pull control point toward centre for a gentle inward bow.
  const ctrlX = mx + (cx - mx) * 0.35;
  const ctrlY = my + (cy - my) * 0.35;
  // Shorten the end so the arrowhead lands at the node edge, not its centre.
  const end = shorten(ctrlX, ctrlY, to.x, to.y, 11);
  return `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${end.x} ${end.y}`;
}

function shorten(fromX: number, fromY: number, toX: number, toY: number, by: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: toX - (dx / len) * by, y: toY - (dy / len) * by };
}

function labelX(n: Node, cx: number): number {
  if (n.x < cx - 4) return n.x - 13;
  if (n.x > cx + 4) return n.x + 13;
  return n.x;
}
