"use client";

/**
 * Signs and sends a cleared settlement as one atomic Tempo transaction.
 *
 * The settlement is a set of `transferWithMemo` calls across one or more token
 * contracts. We submit them together via EIP-5792 `wallet_sendCalls`, which
 * Tempo honours as a single atomic batch — every leg lands or none does. That
 * atomicity is what makes multilateral clearing safe: the signer can never end
 * up having paid into a settlement that left another party short.
 *
 * `wallet_sendCalls` is the right primitive here (not one tx per leg) precisely
 * because the whole circle must be all-or-nothing.
 */

import { useCallback, useState } from "react";
import { useSendCalls, useSendTransaction } from "wagmi";
import type { TempoCall } from "./batch";

export type SettleStatus = "idle" | "signing" | "sent" | "error";

export function useSettlement() {
  const { sendCallsAsync } = useSendCalls();
  const { sendTransactionAsync } = useSendTransaction();
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
      setStatus("signing");
      setError(null);
      try {
        if (calls.length === 1) {
          // A single leg is a plain contract call.
          const hash = await sendTransactionAsync({
            to: calls[0].to,
            data: calls[0].data,
          } as never);
          setTxRef(hash);
          setStatus("sent");
          return hash;
        }
        // The whole circle, atomic, one signature.
        const res = await sendCallsAsync({
          calls: calls.map((c) => ({ to: c.to, data: c.data })),
        } as never);
        const ref = resolveRef(res);
        setTxRef(ref);
        setStatus("sent");
        return ref;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "The wallet did not complete the settlement.";
        setError(message);
        setStatus("error");
        return null;
      }
    },
    [sendCallsAsync, sendTransactionAsync]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxRef("");
    setError(null);
  }, []);

  return { settle, status, txRef, error, reset };
}

/** `sendCalls` returns an id (string) or an object with an id/receipts. */
function resolveRef(res: unknown): string {
  if (typeof res === "string") return res;
  if (res && typeof res === "object") {
    const r = res as { id?: string; receipts?: { transactionHash?: string }[] };
    if (r.id) return r.id;
    const hash = r.receipts?.find((x) => x?.transactionHash)?.transactionHash;
    if (hash) return hash;
  }
  return "";
}
