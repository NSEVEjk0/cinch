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
import { useAccount } from "wagmi";
import type { Circle, SettlementRecord } from "@/lib/circle";
import { partyName, toSettlementRecord } from "@/lib/circle";
import type { ClearingResult } from "@/lib/types";
import { buildSettlementBatch } from "@/lib/batch";
import { useSettlement } from "@/lib/useSettlement";
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
  const { isConnected } = useAccount();
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
  const [confirmation, setConfirmation] = useState<ChainConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);

  const batch = useMemo(() => buildSettlementBatch(result.transfers), [result.transfers]);
  const token = circle.defaultToken;
  const symbol = token.symbol;

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
    const ref = await settle(batch);
    await record(ref, ref ? [ref, ...txRefs] : txRefs, true);
  }

  async function onSettleSequentially() {
    const ref = await settleSequentially(batch);
    await record(ref, ref ? [ref, ...txRefs] : txRefs, false);
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
          <span className="dot" />
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>
            Circle cleared.
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

        <div style={{ marginTop: 16 }}>
          <button className="btn btn-quiet btn-sm" onClick={() => { reset(); setConfirmation(null); }}>
            Clear again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 18 }}>
        <span className="label">Cleared settlement</span>
        <span className="chip chip-mint mono">{formatPercent(result.stats.compressionRatio)} compressed</span>
      </div>

      {/* headline */}
      <div className="row" style={{ gap: 0, marginBottom: 20, alignItems: "baseline" }}>
        <span className="mono tnum" style={{ fontSize: "2rem", fontWeight: 500 }}>
          {formatAmount(result.stats.nettedByToken[symbol] ?? 0n, token.decimals)}
        </span>
        <span className="faint mono" style={{ fontSize: "1rem", marginLeft: 8 }}>
          {symbol} moves
        </span>
        <span className="faint" style={{ marginLeft: 12, fontSize: "0.85rem" }}>
          of {formatAmount(result.stats.grossByToken[symbol] ?? 0n, token.decimals)} owed
        </span>
      </div>

      {/* transfers */}
      {result.transfers.length > 0 ? (
        <div className="stack" style={{ gap: 1, background: "var(--line)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: 18 }}>
          {result.transfers.map((t, i) => (
            <div
              key={i}
              className="between"
              style={{ background: "var(--ink-850)", padding: "12px 16px" }}
            >
              <span style={{ fontSize: "0.92rem" }}>
                {name(t.from)} <span className="faint" style={{ margin: "0 6px" }}>pays</span> {name(t.to)}
              </span>
              <span className="mono tnum" style={{ color: "var(--mint-400)", fontSize: "0.95rem" }}>
                {formatWithSymbol(t.amount, t.token)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-pad" style={{ padding: 16, background: "var(--mint-glow)", borderRadius: "var(--radius-sm)", marginBottom: 18 }}>
          <p className="mono" style={{ margin: 0, color: "var(--mint-400)", fontSize: "0.9rem" }}>
            The circle closes perfectly — nothing needs to move.
          </p>
        </div>
      )}

      {/* net positions, compact */}
      <details style={{ marginBottom: 18 }}>
        <summary className="faint" style={{ cursor: "pointer", fontSize: "0.85rem", userSelect: "none" }}>
          Net positions ({debtors.length} pay · {creditors.length} receive)
        </summary>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label" style={{ color: "var(--rose-400)" }}>Pay in</span>
            {debtors.map((p) => (
              <div key={p.party} className="between mono" style={{ fontSize: "0.84rem" }}>
                <span>{name(p.party)}</span>
                <span>{formatAmount(-p.net, token.decimals)}</span>
              </div>
            ))}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label" style={{ color: "var(--mint-400)" }}>Receive</span>
            {creditors.map((p) => (
              <div key={p.party} className="between mono" style={{ fontSize: "0.84rem" }}>
                <span>{name(p.party)}</span>
                <span>{formatAmount(p.net, token.decimals)}</span>
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

      {batchUnsupported ? (
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
              : `Settle the circle · ${batch.length} transfer${batch.length === 1 ? "" : "s"}, one signature`}
          </button>
          {!isConnected ? (
            <p className="faint" style={{ fontSize: "0.82rem", marginTop: 10, textAlign: "center" }}>
              Connect a wallet to settle. Previewing needs nothing.
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
  );
}
