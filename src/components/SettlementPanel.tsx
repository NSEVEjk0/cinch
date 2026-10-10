"use client";

/**
 * SettlementPanel — shows what clearing produced and settles it atomically.
 *
 * It renders the net positions, the minimal transfer set, the headline
 * compression, and anything excluded (disputed or dropped for liquidity). The
 * "Settle the circle" button encodes the transfers into one Tempo batch and
 * sends it through the connected wallet as a single atomic transaction.
 */

import { useMemo, useState } from "react";
import type { Circle, SettlementRecord } from "@/lib/circle";
import { partyName, toSettlementRecord, isCompleted } from "@/lib/circle";
import type { ClearingResult } from "@/lib/types";
import { buildSettlementBatch } from "@/lib/batch";
import { useSettlement, useCinchAccount } from "@/lib/useSettlement";
import { MultiPartyClearing } from "./MultiPartyClearing";
import { confirmSettlement, type ChainConfirmation } from "@/lib/chain";
import { formatAmount, formatWithSymbol, formatPercent, shortAddress } from "@/lib/money";
import { explorerTxUrl } from "@/lib/tempo";
import { useNetwork } from "@/lib/useNetwork";

export function SettlementPanel({
  circle,
  result,
  onSettled,
}: {
  circle: Circle;
  result: ClearingResult;
  onSettled: (record: SettlementRecord) => void;
}) {
  const network = useNetwork();
  const {
    settle,
    settleSequentially,
    status,
    txRef,
    txRefs,
    error,
    batchUnsupported,
    legProgress,
    reset,
  } = useSettlement();
  const { enabled: accountEnabled } = useCinchAccount();
  // The self-custodial Cinch account is the signer.
  const isConnected = accountEnabled;
  const [confirmation, setConfirmation] = useState<ChainConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const batch = useMemo(() => buildSettlementBatch(result.transfers), [result.transfers]);
  const token = circle.defaultToken;
  const symbol = token.symbol;

  // Multi-party: more than one distinct payer in the cleared set. One key can't
  // move everyone's funds, so this routes to the on-chain clearing contract
  // (Model C) where each payer authorizes their own leg by signature.
  const isMultiParty = useMemo(
    () => new Set(result.transfers.map((t) => t.from.toLowerCase())).size > 1,
    [result.transfers]
  );

  const name = (addr: string) => {
    const n = partyName(circle, addr);
    return n.startsWith("0x") ? shortAddress(n) : n;
  };

  const debtors = result.positions.filter((p) => p.net < 0n).sort((a, b) => (a.net < b.net ? -1 : 1));
  const creditors = result.positions.filter((p) => p.net > 0n).sort((a, b) => (a.net > b.net ? -1 : 1));

  async function record(ref: string | null, refs: string[], atomic: boolean) {
    if (ref === null) return;
    // Write the settlement into the circle's history (powers the ledger,
    // certificates and the savings graph).
    onSettled(
      toSettlementRecord({
        transfers: result.transfers,
        txRefs: refs.filter(Boolean),
        grossByToken: result.stats.grossByToken,
        nettedByToken: result.stats.nettedByToken,
        compressionRatio: result.stats.compressionRatio,
        obligationCount: result.stats.obligationCount,
        atomic,
      })
    );
    if (ref && /^0x[0-9a-fA-F]{64}$/.test(ref)) {
      setConfirming(true);
      try {
        setConfirmation(await confirmSettlement(ref, { network }));
      } finally {
        setConfirming(false);
      }
    }
  }

  async function onSettle() {
    // Scheduled clearing: time-lock the atomic batch with Tempo's validAfter.
    const validAfter =
      scheduleOpen && scheduleAt
        ? Math.floor(new Date(scheduleAt).getTime() / 1000)
        : undefined;
    const schedule = validAfter && validAfter > Math.floor(Date.now() / 1000) ? { validAfter } : undefined;
    const ref = await settle(batch, schedule);
    await record(ref, ref ? [ref, ...txRefs] : txRefs, true);
  }

  async function onSettleSequentially() {
    const ref = await settleSequentially(batch);
    await record(ref, ref ? [ref, ...txRefs] : txRefs, false);
  }

  // A one-off circle that has already been cleared is done — show a persistent
  // completed state (not the settle UI) when the user reopens it later.
  if (isCompleted(circle) && status !== "sent") {
    const last = circle.settlements![circle.settlements!.length - 1];
    return (
      <div className="card card-pad glow-ring">
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <span aria-hidden="true" style={checkBadge}>✓</span>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>
            Circle completed.
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Cleared {new Date(last.at).toLocaleDateString()} ·{" "}
          {last.transfers.length} transfer{last.transfers.length === 1 ? "" : "s"} ·{" "}
          {Math.round(last.compressionRatio * 100)}% compressed. See the full record in the
          settlement history below.
        </p>
      </div>
    );
  }

  if (circle.obligations.filter((o) => !o.disputed).length === 0) {
    return (
      <div className="card card-pad">
        <span className="label">Settlement</span>
        <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
          Add obligations to compute a settlement.
        </p>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="card card-pad glow-ring">
        <div className="row" style={{ gap: 10, marginBottom: 14 }}>
          <span aria-hidden="true" style={checkBadge}>✓</span>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>
            {circle.cadence === "once" ? "Circle completed." : "Circle cleared."}
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {batch.length === 0
            ? "The circle netted to zero — every debt cancelled, so nothing needed to move."
            : `${batch.length} transfer${batch.length === 1 ? "" : "s"} settled in one atomic Tempo transaction. Each leg carried its obligation references in the memo.`}
        </p>
        {txRef ? (
          <a
            className="btn btn-ghost btn-sm"
            href={explorerTxUrl(network, txRef)}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 8 }}
          >
            View on the Tempo explorer →
          </a>
        ) : null}

        {/* On-chain confirmation — flagged from the chain, not the wallet. */}
        {batch.length > 0 && txRef ? (
          <div
            className="row"
            style={{
              gap: 8,
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)",
              background: confirmation?.confirmed ? "var(--mint-glow)" : "transparent",
            }}
          >
            {confirming ? (
              <span className="faint mono" style={{ fontSize: "0.82rem" }}>
                Reading it back from Tempo…
              </span>
            ) : confirmation?.confirmed ? (
              <span className="mono" style={{ fontSize: "0.82rem", color: "var(--mint-400)" }}>
                ✓ Confirmed on-chain in block {confirmation.blockNumber?.toString()}
              </span>
            ) : confirmation?.status === "reverted" ? (
              <span className="mono" style={{ fontSize: "0.82rem", color: "var(--rose-400)" }}>
                ✕ The settlement reverted on-chain — nothing moved.
              </span>
            ) : (
              <span className="faint mono" style={{ fontSize: "0.82rem" }}>
                Awaiting on-chain confirmation…
              </span>
            )}
          </div>
        ) : null}

        {/* Per-party settlement status: each leg, flagged from the chain. */}
        {batch.length > 0 && result.transfers.length > 0 ? (
          <div className="card" style={{ overflow: "hidden", marginTop: 16 }}>
            <div className="card-pad" style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)" }}>
              <span className="label">Per-party status</span>
            </div>
            <div>
              {result.transfers.map((t, i) => {
                const settled = confirmation?.confirmed;
                return (
                  <div key={i} className="between" style={{ padding: "10px 16px", borderBottom: "1px solid var(--hairline)" }}>
                    <span style={{ fontSize: "0.86rem" }}>
                      {name(t.from)} <span className="faint">→</span> {name(t.to)}
                    </span>
                    <span className="row" style={{ gap: 10 }}>
                      <span className="mono tnum" style={{ fontSize: "0.84rem" }}>{formatWithSymbol(t.amount, t.token)}</span>
                      {settled ? (
                        <span className="mono" style={{ fontSize: "0.74rem", color: "var(--pos)" }}>✓ settled</span>
                      ) : confirming ? (
                        <span className="mono faint" style={{ fontSize: "0.74rem" }}>confirming…</span>
                      ) : (
                        <span className="mono faint" style={{ fontSize: "0.74rem" }}>pending</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {txRef && /^0x[0-9a-fA-F]{64}$/.test(txRef) ? (
              <p className="faint" style={{ fontSize: "0.74rem", padding: "10px 16px", margin: 0 }}>
                All legs settled together in one atomic transaction —{" "}
                <a href={explorerTxUrl(network, txRef)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  view it on the explorer ↗
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          {circle.cadence === "once" ? (
            <p className="faint" style={{ fontSize: "0.82rem", margin: 0 }}>
              This circle is complete. You can review it any time from your circles list.
            </p>
          ) : (
            <button className="btn btn-quiet btn-sm" onClick={() => { reset(); setConfirmation(null); }}>
              Start the next round →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="between" style={{ padding: "18px 22px", borderBottom: "1px solid var(--hairline)" }}>
        <div>
          <span className="label">Cleared settlement</span>
          <div className="row" style={{ gap: 8, marginTop: 7, alignItems: "baseline" }}>
            <span className="mono tnum" style={{ fontSize: "1.7rem", fontWeight: 540, letterSpacing: "-0.02em" }}>
              {formatAmount(result.stats.nettedByToken[symbol] ?? 0n, token.decimals)}
            </span>
            <span className="faint mono" style={{ fontSize: "0.9rem" }}>{symbol}</span>
            <span className="faint" style={{ fontSize: "0.82rem" }}>
              of {formatAmount(result.stats.grossByToken[symbol] ?? 0n, token.decimals)} owed
            </span>
          </div>
        </div>
        <span className="chip chip-mint mono">{formatPercent(result.stats.compressionRatio)} ↓</span>
      </div>

      {/* transfers — Ramp-style review table */}
      {result.transfers.length > 0 ? (
        <table className="dtable">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Reference</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {result.transfers.map((t, i) => (
              <tr key={i}>
                <td>{name(t.from)}</td>
                <td>
                  <span className="faint" style={{ marginRight: 6 }}>→</span>
                  {name(t.to)}
                </td>
                <td className="faint" style={{ fontSize: "0.82rem" }}>
                  {t.references.slice(0, 2).join(", ")}
                  {t.references.length > 2 ? ` +${t.references.length - 2}` : ""}
                </td>
                <td className="num" style={{ color: "var(--accent)", fontWeight: 560 }}>
                  {formatWithSymbol(t.amount, t.token)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "16px 22px", background: "var(--accent-glow)" }}>
          <p className="mono" style={{ margin: 0, color: "var(--accent)", fontSize: "0.88rem" }}>
            The circle closes perfectly — nothing needs to move.
          </p>
        </div>
      )}

      <div style={{ padding: "16px 22px" }}>
      {/* net positions, compact */}
      <details style={{ marginBottom: 16 }}>
        <summary className="faint" style={{ cursor: "pointer", fontSize: "0.84rem", userSelect: "none" }}>
          Net positions ({debtors.length} pay · {creditors.length} receive)
        </summary>
        <div className="g2" style={{ gap: 16, marginTop: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label" style={{ color: "var(--neg)" }}>Pay in</span>
            {debtors.map((p) => (
              <div key={p.party} className="between mono" style={{ fontSize: "0.84rem" }}>
                <span>{name(p.party)}</span>
                <span className="tnum">{formatAmount(-p.net, token.decimals)}</span>
              </div>
            ))}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label" style={{ color: "var(--accent)" }}>Receive</span>
            {creditors.map((p) => (
              <div key={p.party} className="between mono" style={{ fontSize: "0.84rem" }}>
                <span>{name(p.party)}</span>
                <span className="tnum">{formatAmount(p.net, token.decimals)}</span>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* excluded */}
      {result.excluded.length > 0 ? (
        <p className="faint" style={{ fontSize: "0.82rem", marginBottom: 16 }}>
          {result.excluded.length} obligation{result.excluded.length === 1 ? "" : "s"} held out of this round
          (disputed or beyond available liquidity).
        </p>
      ) : null}

      {/* settle */}
      <div className="hairline" style={{ margin: "4px 0 18px" }} />

      {isMultiParty ? (
        <MultiPartyClearing circle={circle} result={result} onSettled={onSettled} />
      ) : batchUnsupported ? (
        /* The wallet can't do an atomic batch. Offer the honest fallback. */
        <div className="stack" style={{ gap: 12 }}>
          <div
            className="card-pad"
            style={{
              padding: 14,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)",
              background: "rgba(240,184,111,0.08)",
            }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span style={{ color: "var(--amber-400)" }}>⚠</span>
              <span style={{ fontWeight: 540, fontSize: "0.92rem" }}>
                This wallet can&apos;t sign an atomic batch
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.6 }}>
              Your wallet doesn&apos;t support EIP-5792, so the {batch.length} legs can&apos;t go in
              one all-or-nothing transaction. You can still settle them{" "}
              <strong>one at a time</strong> — but note this is <strong>not atomic</strong>: each leg
              is final as you sign it, so if you stop partway, the earlier legs have already paid.
              For a true one-shot settlement, use a wallet with EIP-5792 support.
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={onSettleSequentially}
            disabled={status === "signing" || status === "switching"}
          >
            {status === "signing" && legProgress
              ? `Signing leg ${legProgress.done + 1} of ${legProgress.total}…`
              : `Settle leg by leg · ${batch.length} signatures`}
          </button>
          {error ? <p style={{ color: "var(--rose-400)", fontSize: "0.86rem", margin: 0 }}>{error}</p> : null}
          <button
            className="btn btn-quiet btn-sm"
            style={{ alignSelf: "center" }}
            onClick={reset}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {batch.length > 0 && isConnected ? (
            <div style={{ marginBottom: 12 }}>
              {!scheduleOpen ? (
                <button
                  className="btn btn-quiet btn-sm"
                  style={{ color: "var(--accent)", padding: 0 }}
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule this clearing for later →
                </button>
              ) : (
                <div
                  className="stack"
                  style={{ gap: 8, padding: 14, borderRadius: "var(--r-xs)", border: "1px solid var(--line)", background: "var(--surface-2)" }}
                >
                  <span className="label">Clear automatically after</span>
                  <input
                    className="field"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                  <p className="faint" style={{ fontSize: "0.78rem", margin: 0 }}>
                    Signs the batch now with Tempo&apos;s <span className="mono">validAfter</span>{" "}
                    time-lock — it can only execute on-chain once that moment passes.
                  </p>
                  <button className="btn btn-quiet btn-sm" style={{ padding: 0, alignSelf: "flex-start" }} onClick={() => { setScheduleOpen(false); setScheduleAt(""); }}>
                    clear now instead
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={onSettle}
            disabled={!isConnected || status === "signing" || status === "switching"}
          >
            {status === "switching"
              ? `Switching to ${network.name}…`
              : status === "signing"
              ? "Settling on Tempo…"
              : batch.length === 0
              ? "Mark circle cleared"
              : scheduleOpen && scheduleAt
              ? `Schedule settlement · ${batch.length} transfer${batch.length === 1 ? "" : "s"}`
              : `Settle the circle · ${batch.length} transfer${batch.length === 1 ? "" : "s"}, one signature`}
          </button>
          {!isConnected ? (
            <p className="faint" style={{ fontSize: "0.82rem", marginTop: 10, textAlign: "center" }}>
              Create your Cinch account above to settle. Previewing the clearing needs nothing.
            </p>
          ) : null}
          {error ? <p style={{ color: "var(--rose-400)", marginTop: 12, fontSize: "0.88rem" }}>{error}</p> : null}
          <p className="faint" style={{ fontSize: "0.78rem", marginTop: 12, textAlign: "center" }}>
            {batch.length > 1
              ? "One atomic transaction — every leg settles, or none does. If your wallet can't batch, Cinch will offer to settle leg by leg instead."
              : "One atomic transaction — every leg settles, or none does."}
          </p>
        </>
      )}
      </div>
    </div>
  );
}

const checkBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "linear-gradient(180deg, var(--mint-400), var(--mint-500))",
  color: "var(--accent-ink)",
  fontSize: "0.9rem",
  fontWeight: 700,
};
