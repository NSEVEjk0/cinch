"use client";

/**
 * Settlement certificate.
 *
 * Produces a clean, printable certificate for a cleared circle — the terms of
 * the settlement plus its on-chain proof — that a party can save as PDF (via
 * the browser's print-to-PDF) for their records. No dependency: it opens a
 * self-contained printable document.
 */

import type { Circle, SettlementRecord } from "./circle";
import { partyName } from "./circle";
import { formatAmount } from "./money";
import type { TempoNetwork } from "./tempo";
import { explorerTxUrl } from "./tempo";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function name(circle: Circle, addr: string): string {
  const n = partyName(circle, addr);
  return n.startsWith("0x") ? `${n.slice(0, 8)}…${n.slice(-6)}` : n;
}

export function certificateHtml(
  circle: Circle,
  record: SettlementRecord,
  network: TempoNetwork
): string {
  const when = new Date(record.at).toLocaleString();
  const rows = record.transfers
    .map(
      (t) => `
      <tr>
        <td>${esc(name(circle, t.from))}</td>
        <td class="arrow">→</td>
        <td>${esc(name(circle, t.to))}</td>
        <td class="num">${esc(formatAmount(BigInt(t.amount), t.tokenDecimals))} ${esc(t.tokenSymbol)}</td>
        <td class="ref">${esc(t.references.join(", "))}</td>
      </tr>`
    )
    .join("");

  const txLinks = record.txRefs
    .filter(Boolean)
    .map((r) =>
      /^0x[0-9a-fA-F]{64}$/.test(r)
        ? `<a href="${explorerTxUrl(network, r)}">${esc(r)}</a>`
        : esc(r)
    )
    .join("<br/>");

  const pct = Math.round(record.compressionRatio * 100);

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Cinch settlement certificate · ${esc(circle.name)}</title>
<style>
  :root { --ink:#0b0f14; --mint:#1a9d78; --soft:#5c6b78; --line:#dfe6ec; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); margin: 0; padding: 48px; background: #fff; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:16px; }
  .brand { font-weight:700; font-size:22px; letter-spacing:-0.02em; }
  .brand span { color: var(--mint); }
  .eyebrow { font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:var(--soft); }
  h1 { font-size:24px; margin:28px 0 4px; letter-spacing:-0.02em; }
  .meta { color:var(--soft); font-size:13px; margin-bottom:28px; }
  .stats { display:flex; gap:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin-bottom:28px; }
  .stat { flex:1; padding:14px 16px; border-right:1px solid var(--line); }
  .stat:last-child { border-right:0; }
  .stat .k { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--soft); }
  .stat .v { font-size:20px; font-weight:600; margin-top:4px; }
  .stat .v.mint { color: var(--mint); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--soft); padding:8px 10px; border-bottom:1px solid var(--line); }
  td { padding:11px 10px; border-bottom:1px solid var(--line); }
  td.num { text-align:right; font-variant-numeric: tabular-nums; font-weight:600; }
  td.arrow { color:var(--soft); text-align:center; }
  td.ref { color:var(--soft); font-size:12px; }
  .proof { margin-top:28px; font-size:12px; color:var(--soft); word-break:break-all; }
  .proof a { color: var(--mint); }
  .foot { margin-top:36px; font-size:11px; color:var(--soft); border-top:1px solid var(--line); padding-top:14px; }
  @media print { body { padding:24px; } .noprint { display:none; } }
</style></head><body><div class="wrap">
  <div class="top">
    <div>
      <div class="brand">Cinch<span>.</span></div>
      <div class="eyebrow">Settlement certificate</div>
    </div>
    <div style="text-align:right">
      <div class="eyebrow">Network</div>
      <div style="font-size:13px">${esc(network.name)}</div>
    </div>
  </div>

  <h1>${esc(circle.name)}</h1>
  <div class="meta">Cleared ${esc(when)} · ${record.obligationCount} obligations · ${
    record.atomic ? "atomic settlement" : "settled leg by leg"
  }</div>

  <div class="stats">
    <div class="stat"><div class="k">Transfers</div><div class="v">${record.transfers.length}</div></div>
    <div class="stat"><div class="k">Compression</div><div class="v mint">${pct}%</div></div>
    <div class="stat"><div class="k">Obligations cleared</div><div class="v">${record.obligationCount}</div></div>
  </div>

  <table>
    <thead><tr><th>From</th><th></th><th>To</th><th style="text-align:right">Amount</th><th>For</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" style="color:var(--soft)">The circle netted to zero — no transfer was required.</td></tr>`}</tbody>
  </table>

  ${txLinks ? `<div class="proof"><strong>On-chain proof</strong><br/>${txLinks}</div>` : ""}

  <div class="foot">
    This certificate records a multilateral netting settlement computed and executed through Cinch on Tempo.
    The transfers above discharge the listed obligations in full. Verify against the transaction reference(s) on the Tempo explorer.
  </div>

  <div class="noprint" style="margin-top:28px">
    <button onclick="window.print()" style="padding:10px 18px;border-radius:8px;border:0;background:#1a9d78;color:#fff;font-size:14px;cursor:pointer">Save as PDF / Print</button>
  </div>
</div></body></html>`;
}

/** Open the certificate in a new tab, ready to print or save as PDF. */
export function openCertificate(
  circle: Circle,
  record: SettlementRecord,
  network: TempoNetwork
): void {
  if (typeof window === "undefined") return;
  const html = certificateHtml(circle, record, network);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
