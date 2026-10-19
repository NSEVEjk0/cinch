"use client";

/**
 * MultiPartyClearing — the Model C settlement UI.
 *
 * Rendered in place of the single-signer settle button when a cleared round has
 * more than one distinct payer. Each payer authorizes their own funds with two
 * gasless signatures; the organiser then submits one atomic clear(). This is the
 * "nobody goes first, nobody is left short" path made real on-chain.
 */

import { useState } from "react";
import type { Circle, SettlementRecord } from "@/lib/circle";
import { partyName, toSettlementRecord } from "@/lib/circle";
import type { ClearingResult } from "@/lib/types";
import { useClearing } from "@/lib/useClearing";
import { confirmSettlement, type ChainConfirmation } from "@/lib/chain";
import { useNetwork } from "@/lib/useNetwork";
import { shortAddress, formatAmount } from "@/lib/money";
import { explorerTxUrl } from "@/lib/tempo";

export function MultiPartyClearing({
  circle,
  result,
  onSettled,
}: {
  circle: Circle;
  result: ClearingResult;
  onSettled: (record: SettlementRecord) => void;
}) {
  const network = useNetwork();
  const c = useClearing(circle, result);
  const [confirmation, setConfirmation] = useState<ChainConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  const name = (addr: string) => {
    const n = partyName(circle, addr);
    return n.startsWith("0x") ? shortAddress(n) : n;
  };

  // The clearing contract isn't configured — be honest rather than mis-settle
  // a multi-party round through a single signer.
  if (!c.configured) {
    return (
      <div className="card card-pad">
        <span className="label">Multi-party settlement</span>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
          This circle has {c.payers.length} different payers, so each must authorize their own
          funds — that needs the on-chain CinchClearing contract, which isn&apos;t configured for{" "}
          {network.name} yet. Set <span className="mono">NEXT_PUBLIC_CINCH_CLEARING_ADDRESS</span> to
          enable trustless clearing.
        </p>
      </div>
    );
  }

  if (c.available === false) {
    return (
      <div className="card card-pad">
        <span className="label">Multi-party settlement</span>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
          Collecting each payer&apos;s signature needs the shared round store, which isn&apos;t
          available right now. Everyone must open the same circle link for live clearing.
        </p>
      </div>
    );
  }

  async function onClear() {
    const ref = await c.clear();
    if (!ref) return;
    onSettled(
      toSettlementRecord({
        transfers: result.transfers,
        txRefs: [ref],
        grossByToken: result.stats.grossByToken,
        nettedByToken: result.stats.nettedByToken,
        compressionRatio: result.stats.compressionRatio,
        obligationCount: result.stats.obligationCount,
        atomic: true,
      })
    );
    if (/^0x[0-9a-fA-F]{64}$/.test(ref)) {
      setConfirming(true);
      try {
        setConfirmation(await confirmSettlement(ref, { network }));
      } finally {
        setConfirming(false);
      }
    }
  }

  if (c.status === "sent") {
    return (
      <div className="card card-pad glow-ring">
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <span aria-hidden="true" style={checkBadge}>✓</span>
          <h2 className="display" style={{ fontSize: "1.3rem", margin: 0 }}>Circle cleared.</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {result.transfers.length} transfer{result.transfers.length === 1 ? "" : "s"} across{" "}
          {c.payers.length} payers settled in one atomic transaction — each payer&apos;s own funds,
          moved only as they signed.
        </p>
        {c.txRef ? (
          <a
            className="btn btn-ghost btn-sm"
            href={explorerTxUrl(network, c.txRef)}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 8 }}
          >
            View on the Tempo explorer →
          </a>
        ) : null}
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          {confirming ? (
            <span className="faint mono" style={{ fontSize: "0.82rem" }}>Reading it back from Tempo…</span>
          ) : confirmation?.confirmed ? (
            <span className="mono" style={{ fontSize: "0.82rem", color: "var(--mint-400)" }}>
              ✓ Confirmed on-chain in block {confirmation.blockNumber?.toString()}
            </span>
          ) : confirmation?.status === "reverted" ? (
            <span className="mono" style={{ fontSize: "0.82rem", color: "var(--rose-400)" }}>
              ✕ The settlement reverted on-chain — nothing moved.
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--hairline)" }}>
        <span className="label">Multi-party clearing</span>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.9rem", lineHeight: 1.6 }}>
          {c.payers.length} payers · each authorizes their own funds with two gasless signatures.
          Nothing moves until the single atomic clear.
        </p>
      </div>

      {/* Per-payer authorization status */}
      <div>
        {c.payers.map((p) => {
          const authorized = c.authorizedPayers.has(p.toLowerCase());
          const isMe = c.me && p.toLowerCase() === c.me.toLowerCase();
          return (
            <div
              key={p}
              className="between"
              style={{ padding: "12px 22px", borderBottom: "1px solid var(--hairline)" }}
            >
              <span style={{ fontSize: "0.9rem" }}>
                {name(p)}
                {isMe ? <span className="faint"> (you)</span> : null}
              </span>
              {authorized ? (
                <span className="mono" style={{ fontSize: "0.78rem", color: "var(--pos)" }}>✓ authorized</span>
              ) : (
                <span className="mono faint" style={{ fontSize: "0.78rem" }}>awaiting signature</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "16px 22px" }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <span className="faint mono" style={{ fontSize: "0.82rem" }}>
            {c.authorizedPayers.size} of {c.payers.length} authorized
          </span>
          <button className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={() => c.refresh()}>
            refresh
          </button>
        </div>

        {/* My action */}
        {c.iAmPayer && !c.iHaveAuthorized ? (
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => setSignOpen(true)}
            disabled={c.status === "signing"}
          >
            {c.status === "signing"
              ? "Sign in your wallet…"
              : `Review & authorize your ${c.myDebitLabel}`}
          </button>
        ) : c.iAmPayer && c.iHaveAuthorized ? (
          <p className="mono" style={{ fontSize: "0.84rem", color: "var(--pos)", textAlign: "center", margin: "0 0 12px" }}>
            ✓ You&apos;ve authorized. Waiting on the rest of the circle.
          </p>
        ) : !c.iAmPayer ? (
          <p className="faint" style={{ fontSize: "0.84rem", textAlign: "center", margin: "0 0 12px" }}>
            You&apos;re not a payer in this round — you&apos;ll receive your net position when it clears.
          </p>
        ) : null}

        {/* Clear — available to anyone once all have signed */}
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: c.iAmPayer && !c.iHaveAuthorized ? 10 : 0 }}
          onClick={onClear}
          disabled={!c.allAuthorized || c.status === "submitting"}
        >
          {c.status === "submitting"
            ? "Clearing on Tempo…"
            : c.allAuthorized
            ? `Clear the circle · ${result.transfers.length} transfer${result.transfers.length === 1 ? "" : "s"}, one atomic tx`
            : `Clear the circle · ${c.payers.length - c.authorizedPayers.size} signature${c.payers.length - c.authorizedPayers.size === 1 ? "" : "s"} to go`}
        </button>

        {c.error ? (
          <p style={{ color: "var(--rose-400)", marginTop: 12, fontSize: "0.86rem" }}>{c.error}</p>
        ) : null}
        <p className="faint" style={{ fontSize: "0.78rem", marginTop: 12, textAlign: "center", lineHeight: 1.6 }}>
          Each payer&apos;s funds move only as they signed — the whole circle settles in one
          transaction, or none of it does.
        </p>
      </div>
    </div>

    {/* Confirmation before signing — states exactly what will leave the wallet. */}
    {signOpen ? (
      <div className="modal-backdrop" onClick={() => setSignOpen(false)}>
        <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Confirm authorization">
          <h3 className="display" style={{ fontSize: "1.25rem", margin: "0 0 10px" }}>Approve this settlement</h3>
          <p className="muted" style={{ margin: "0 0 14px", lineHeight: 1.6 }}>
            You&apos;re authorizing funds to leave your wallet to settle{" "}
            <strong style={{ color: "var(--text)" }}>{circle.name}</strong>.
          </p>
          <div
            className="between"
            style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface-2)", marginBottom: 14 }}
          >
            <span className="faint">Leaves your wallet</span>
            <span className="mono tnum" style={{ fontWeight: 600, fontSize: "1.05rem" }}>{c.myDebitLabel}</span>
          </div>

          {/* Cross-currency funding: convert surplus stablecoins into the ones
              you owe, via the enshrined DEX, before signing. */}
          {c.pendingConversions.length > 0 ? (
            <div
              style={{
                padding: "12px 14px",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                marginBottom: 14,
              }}
            >
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--amber-400)" }}>⇄</span>
                <span style={{ fontWeight: 540, fontSize: "0.9rem" }}>
                  Convert to fund this payment
                </span>
              </div>
              {c.pendingConversions.map((conv) => (
                <div key={conv.id} className="between" style={{ padding: "6px 0", gap: 10, alignItems: "flex-start" }}>
                  <span className="mono" style={{ fontSize: "0.84rem", minWidth: 0, overflowWrap: "anywhere" }}>
                    Sell {formatAmount(conv.amountIn, conv.from.decimals)} {conv.from.symbol} →{" "}
                    ~{formatAmount(conv.expectedOut, conv.to.decimals)} {conv.to.symbol}
                  </span>
                  <button
                    className="btn btn-quiet btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => void c.doConvert(conv)}
                    disabled={c.convertingId !== null}
                  >
                    {c.convertingId === conv.id ? "Converting…" : "Convert"}
                  </button>
                </div>
              ))}
              <p className="faint" style={{ fontSize: "0.76rem", margin: "8px 0 0", lineHeight: 1.6 }}>
                You hold these in other stablecoins. Cinch swaps them at the enshrined DEX rate in
                one sponsored transaction, so your payment is funded.
              </p>
              {c.convertError ? (
                <p style={{ color: "var(--rose-400)", fontSize: "0.8rem", margin: "8px 0 0" }}>
                  {c.convertError}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="faint" style={{ fontSize: "0.82rem", margin: "0 0 18px", lineHeight: 1.6 }}>
            This is a gasless signature — nothing moves now. The amount above leaves your wallet only
            once every payer has signed and the circle clears, all in one atomic transaction.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => { setSignOpen(false); void c.authorize(); }}
            >
              Sign &amp; approve
            </button>
            <button className="btn btn-ghost" onClick={() => setSignOpen(false)}>Cancel</button>
          </div>
        </div>
      </div>
    ) : null}
    </>
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
