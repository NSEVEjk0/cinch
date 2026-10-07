"use client";

/**
 * Signs and sends a cleared settlement as one atomic Tempo transaction.
 *
 * The settlement is a set of `transferWithMemo` calls across one or more token
 * contracts. The whole set must be all-or-nothing — the signer can never end up
 * having paid into a settlement that left another party short — so a multi-leg
 * circle is submitted together.
 *
 * Tempo specifics that matter here:
 *  - A generic injected wallet cannot sign a Tempo batch envelope, so each leg
 *    is sent as a plain `transferWithMemo` contract call. For a multi-leg
 *    circle we use EIP-5792 `wallet_sendCalls`, which keeps one signature
 *    without handing the wallet any Tempo-only field it would drop.
 *  - The sync send resolves to a transaction *receipt*, not a bare hash string,
 *    so the reference has to be read out of the result shape, not assumed.
 *  - The wallet must be on the Tempo chain first, or the send throws a chain
 *    mismatch; we switch (or add) the chain before sending.
 */

import { useCallback, useState } from "react";
import { useSendTransaction, useSendCalls, useSwitchChain, useChainId } from "wagmi";
import type { TempoCall } from "./batch";
import { DEFAULT_NETWORK } from "./tempo";
import { tempoModeratoChain, tempoMainnetChain } from "./wagmi";

export type SettleStatus = "idle" | "switching" | "signing" | "sent" | "error";

const targetChain =
  DEFAULT_NETWORK.key === "mainnet" ? tempoMainnetChain : tempoModeratoChain;

export function useSettlement() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendCallsAsync } = useSendCalls();
  const [status, setStatus] = useState<SettleStatus>("idle");
  const [txRef, setTxRef] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const settle = useCallback(
    async (calls: TempoCall[]): Promise<string | null> => {
      if (calls.length === 0) {
        // A fully-cancelled circle: nothing to send, and that is a success.
        setStatus("sent");
        setTxRef("");
        return "";
      }
      setError(null);

      // 1) Make sure the wallet is on Tempo. A mismatch here is the most common
      //    cause of a payment failing, so we handle it explicitly and clearly.
      if (chainId !== targetChain.id) {
        setStatus("switching");
        try {
          await switchChainAsync({ chainId: targetChain.id });
        } catch {
          setError(
            `Your wallet needs to be on ${DEFAULT_NETWORK.name} to settle. Approve the network switch and try again.`
          );
          setStatus("error");
          return null;
        }
      }

      // 2) Sign and send.
      setStatus("signing");
      try {
        if (calls.length === 1) {
          const result = await sendTransactionAsync({
            to: calls[0].to,
            data: calls[0].data,
            chainId: targetChain.id,
          } as never);
          const ref = resolveRef(result);
          setTxRef(ref);
          setStatus("sent");
          return ref;
        }
        // The whole circle, atomic, one signature.
        const result = await sendCallsAsync({
          calls: calls.map((c) => ({ to: c.to, data: c.data })),
          chainId: targetChain.id,
        } as never);
        const ref = resolveRef(result);
        setTxRef(ref);
        setStatus("sent");
        return ref;
      } catch (err) {
        setError(explainError(err));
        setStatus("error");
        return null;
      }
    },
    [chainId, switchChainAsync, sendTransactionAsync, sendCallsAsync]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxRef("");
    setError(null);
  }, []);

  return { settle, status, txRef, error, reset };
}

/**
 * Read a transaction reference from whatever a send resolves to. Tempo's sync
 * send returns a receipt object (not a bare hash); `sendCalls` returns an id or
 * a calls-status object with a `receipts[]` array. Normalise all of them.
 */
function resolveRef(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as {
      id?: string;
      hash?: string;
      transactionHash?: string;
      receipts?: { transactionHash?: string }[];
    };
    if (r.transactionHash) return r.transactionHash;
    if (r.hash) return r.hash;
    if (r.id) return r.id;
    const fromReceipts = r.receipts?.find((x) => x?.transactionHash)?.transactionHash;
    if (fromReceipts) return fromReceipts;
  }
  return "";
}

/** Turn a wallet/RPC error into something a person can act on. */
function explainError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied")) {
    return "You declined the signature, so nothing was settled.";
  }
  if (lower.includes("insufficient") || lower.includes("exceeds balance")) {
    return "A party does not hold enough to cover their net position. Try liquidity-aware clearing, or top up and retry.";
  }
  if (lower.includes("chain") && lower.includes("match")) {
    return `Your wallet is on the wrong network — switch to ${DEFAULT_NETWORK.name} and try again.`;
  }
  if (lower.includes("does not support") || lower.includes("wallet_sendcalls") || lower.includes("method not")) {
    return "This wallet does not support atomic batches. Each leg can still be sent individually — or use a wallet with EIP-5792 support.";
  }
  // Keep it honest: show the first line of the real error, trimmed.
  return raw.split("\n")[0].slice(0, 180) || "The wallet did not complete the settlement.";
}
