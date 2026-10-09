"use client";

/**
 * Signs and sends a cleared settlement.
 *
 * The ideal is one atomic transaction: the whole cleared circle settles or none
 * of it does, so no party ever pays into a settlement that left another short.
 * We get that from EIP-5792 `wallet_sendCalls`, which many Tempo-aware wallets
 * support.
 *
 * But a lot of injected wallets (today's MetaMask, Rabby, …) don't implement
 * `wallet_sendCalls` yet. Rather than dead-end, Cinch offers an explicit
 * leg-by-leg fallback: each `transferWithMemo` is sent as its own plain
 * contract call. This is honest about the trade-off — it is NOT atomic, so a
 * party could sign some legs and stop — so it is never silent: the UI surfaces
 * it and the user chooses it deliberately.
 *
 * Other Tempo specifics:
 *  - A send resolves to a transaction *receipt*, not a bare hash, so the
 *    reference is read out of the result shape, not assumed.
 *  - The wallet must be on the Tempo chain first, or the send throws a chain
 *    mismatch; we switch before sending.
 */

import { useCallback, useState } from "react";
import { useSyncExternalStore } from "react";
import { useSendTransaction, useSendCalls, useSwitchChain, useChainId } from "wagmi";
import type { TempoCall } from "./batch";
import { useNetwork } from "./useNetwork";
import { tempoModeratoChain, tempoMainnetChain } from "./wagmi";
import {
  accountSettle,
  storedKey,
  addressForKey,
  subscribeAccount,
} from "./cinchAccount";

export type SettleStatus = "idle" | "switching" | "signing" | "sent" | "error";

/** Live state of the self-custodial Cinch account (now the primary identity). */
export function useCinchAccount() {
  const key = useSyncExternalStore(subscribeAccount, storedKey, () => null);
  // The Cinch account is the wallet: whenever a key exists it is the signer.
  const address = key ? addressForKey(key) : null;
  return { key, address, enabled: !!key, hasKey: !!key };
}

/** Progress of a leg-by-leg (non-atomic) settlement. */
export interface LegProgress {
  done: number;
  total: number;
}

export function useSettlement() {
  const network = useNetwork();
  const targetChain = network.key === "mainnet" ? tempoMainnetChain : tempoModeratoChain;
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendCallsAsync } = useSendCalls();
  const { key: accountKey, enabled: accountEnabled } = useCinchAccount();

  const [status, setStatus] = useState<SettleStatus>("idle");
  const [txRef, setTxRef] = useState<string>("");
  const [txRefs, setTxRefs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** True when the connected wallet can't do an atomic batch. */
  const [batchUnsupported, setBatchUnsupported] = useState(false);
  const [legProgress, setLegProgress] = useState<LegProgress | null>(null);

  /** Ensure the wallet is on the target Tempo chain. Returns false on failure. */
  const ensureChain = useCallback(async (): Promise<boolean> => {
    if (chainId === targetChain.id) return true;
    setStatus("switching");
    try {
      await switchChainAsync({ chainId: targetChain.id });
      return true;
    } catch {
      setError(
        `Your wallet needs to be on ${network.name} to settle. Approve the network switch and try again.`
      );
      setStatus("error");
      return false;
    }
  }, [chainId, targetChain.id, network.name, switchChainAsync]);

  /** The preferred path: settle the whole circle atomically in one signature. */
  const settle = useCallback(
    async (
      calls: TempoCall[],
      schedule?: { validAfter?: number; validBefore?: number }
    ): Promise<string | null> => {
      if (calls.length === 0) {
        setStatus("sent");
        setTxRef("");
        return "";
      }
      setError(null);
      setBatchUnsupported(false);

      // Preferred of the preferred: the self-custodial Cinch account signs a
      // real atomic 0x76 batch with the fee sponsored — no chain switch, no
      // wallet popup, no EIP-5792 support needed. It also carries the
      // `validAfter` time-lock for scheduled clearing.
      if (accountEnabled && accountKey) {
        setStatus("signing");
        try {
          const ref = await accountSettle(network, accountKey, calls, schedule);
          setTxRef(ref);
          setTxRefs(ref ? [ref] : []);
          setStatus("sent");
          return ref;
        } catch (err) {
          setError(explainError(err, network.name));
          setStatus("error");
          return null;
        }
      }

      if (!(await ensureChain())) return null;

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
          setTxRefs(ref ? [ref] : []);
          setStatus("sent");
          return ref;
        }
        const result = await sendCallsAsync({
          calls: calls.map((c) => ({ to: c.to, data: c.data })),
          chainId: targetChain.id,
        } as never);
        const ref = resolveRef(result);
        setTxRef(ref);
        setTxRefs(ref ? [ref] : []);
        setStatus("sent");
        return ref;
      } catch (err) {
        // If the only problem is that the wallet can't batch, don't call it a
        // failure — offer the leg-by-leg fallback instead.
        if (isBatchUnsupported(err)) {
          setBatchUnsupported(true);
          setStatus("idle");
          setError(null);
          return null;
        }
        setError(explainError(err, network.name));
        setStatus("error");
        return null;
      }
    },
    [ensureChain, targetChain.id, network, accountEnabled, accountKey, sendTransactionAsync, sendCallsAsync]
  );

  /**
   * The explicit fallback: send each leg as its own transaction, in order.
   * NOT atomic — the user has been told so and chose it. Stops on the first
   * failure (e.g. a declined signature) and reports how far it got.
   */
  const settleSequentially = useCallback(
    async (calls: TempoCall[]): Promise<string | null> => {
      if (calls.length === 0) {
        setStatus("sent");
        return "";
      }
      setError(null);
      if (!(await ensureChain())) return null;

      setStatus("signing");
      setLegProgress({ done: 0, total: calls.length });
      const refs: string[] = [];
      try {
        for (let i = 0; i < calls.length; i++) {
          const result = await sendTransactionAsync({
            to: calls[i].to,
            data: calls[i].data,
            chainId: targetChain.id,
          } as never);
          const ref = resolveRef(result);
          if (ref) refs.push(ref);
          setLegProgress({ done: i + 1, total: calls.length });
        }
        setTxRefs(refs);
        setTxRef(refs[0] ?? "");
        setStatus("sent");
        return refs[0] ?? "";
      } catch (err) {
        // Record what did land, so the user can see the partial settlement.
        setTxRefs(refs);
        setTxRef(refs[0] ?? "");
        const done = refs.length;
        setError(
          done === 0
            ? explainError(err, network.name)
            : `Stopped after ${done} of ${calls.length} legs — this fallback is not atomic, so the legs already signed have settled. ${explainError(err, network.name)}`
        );
        setStatus("error");
        return null;
      }
    },
    [ensureChain, targetChain.id, network.name, sendTransactionAsync]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxRef("");
    setTxRefs([]);
    setError(null);
    setBatchUnsupported(false);
    setLegProgress(null);
  }, []);

  return {
    settle,
    settleSequentially,
    status,
    txRef,
    txRefs,
    error,
    batchUnsupported,
    legProgress,
    reset,
  };
}

/** Does this error mean the wallet simply can't do an atomic batch? */
function isBatchUnsupported(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    raw.includes("wallet_sendcalls") ||
    raw.includes("does not support") ||
    raw.includes("method not found") ||
    raw.includes("method not supported") ||
    raw.includes("unsupported method") ||
    raw.includes("not been authorized") ||
    raw.includes("eip-5792") ||
    raw.includes("eip5792") ||
    raw.includes("sendcalls")
  );
}

/**
 * Read a transaction reference from whatever a send resolves to. A Tempo send
 * returns a receipt object (not a bare hash); `sendCalls` returns an id or a
 * calls-status object with a `receipts[]` array. Normalise all of them.
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
    const fromReceipts = r.receipts?.find((x) => x?.transactionHash)?.transactionHash;
    if (fromReceipts) return fromReceipts;
    if (r.id) return r.id;
  }
  return "";
}

/** Turn a wallet/RPC error into something a person can act on. */
function explainError(err: unknown, networkName: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied")) {
    return "You declined the signature, so nothing was settled.";
  }
  if (lower.includes("insufficient") || lower.includes("exceeds balance")) {
    return "A party does not hold enough to cover their net position. Try liquidity-aware clearing, or top up and retry.";
  }
  if (lower.includes("chain") && lower.includes("match")) {
    return `Your wallet is on the wrong network — switch to ${networkName} and try again.`;
  }
  // Keep it honest: show the first line of the real error, trimmed.
  return raw.split("\n")[0].slice(0, 180) || "The wallet did not complete the settlement.";
}
