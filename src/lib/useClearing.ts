"use client";

/**
 * useClearing — the Model C orchestration hook.
 *
 * When a cleared round has more than one distinct payer, no single key can move
 * everyone's funds. This hook drives the trustless path:
 *   - each payer `authorize()`s: signs an EIP-2612 permit per token + one
 *     EIP-712 Authorization binding them to the exact leg set, then publishes it;
 *   - the organiser `clear()`s: once every payer has signed, submits one atomic
 *     clear() that pulls every leg debtor→creditor.
 *
 * Nothing touches the chain and no funds move until that single clear() call.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useSignTypedData, useSendTransaction, useSwitchChain, useChainId, usePublicClient } from "wagmi";
import type { ClearingResult } from "./types";
import type { Circle } from "./circle";
import { useNetwork } from "./useNetwork";
import { useIdentity } from "./useIdentity";
import { formatAmount } from "./money";
import {
  buildLegs,
  distinctPayers,
  roundIdFor,
  legsHashFor,
  clearingAddress,
  authorizationTypedData,
  permitTypedData,
  splitSignature,
  encodeClearCall,
  type Leg,
  type Permit,
} from "./clearing";
import {
  storedKey,
  signTypedDataWithKey,
  readPermitContext,
  readPermitContextPublic,
  accountSendCall,
} from "./cinchAccount";
import {
  postAuthorization,
  fetchAuthorizations,
  type StoredAuthorization,
  type SerialPermit,
} from "./roundSync";

export type ClearStatus = "idle" | "signing" | "submitting" | "sent" | "error";

const DAY = 24 * 60 * 60;

function deserializePermit(p: SerialPermit): Permit {
  return {
    token: p.token,
    owner: p.owner,
    value: BigInt(p.value),
    deadline: BigInt(p.deadline),
    v: p.v,
    r: p.r,
    s: p.s,
  };
}

export function useClearing(circle: Circle, result: ClearingResult) {
  const network = useNetwork();
  const { address: me, kind } = useIdentity();
  const clearing = clearingAddress(network);

  // wagmi transport for the connect-wallet path.
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: network.chainId });

  const legs = useMemo(() => buildLegs(result.transfers), [result.transfers]);
  const payers = useMemo(() => distinctPayers(legs), [legs]);
  const roundId = useMemo(() => roundIdFor(circle.id, legs), [circle.id, legs]);
  const legsHash = useMemo(() => legsHashFor(roundId, legs), [roundId, legs]);

  /** Multi-party means ≥2 distinct payers — otherwise the single-signer path handles it. */
  const isMultiParty = payers.length > 1;
  const iAmPayer = !!me && payers.some((p) => p.toLowerCase() === me.toLowerCase());

  const [collected, setCollected] = useState<StoredAuthorization[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ClearStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txRef, setTxRef] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!isMultiParty || !clearing) return;
    const auths = await fetchAuthorizations(roundId);
    if (auths === null) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    setCollected(auths);
  }, [isMultiParty, clearing, roundId]);

  // Keep the collected set fresh while a round is open.
  useEffect(() => {
    if (!isMultiParty || !clearing) return;
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [isMultiParty, clearing, refresh]);

  const authorizedPayers = useMemo(
    () => new Set(collected.map((a) => a.payer.toLowerCase())),
    [collected]
  );
  const iHaveAuthorized = !!me && authorizedPayers.has(me.toLowerCase());
  const allAuthorized = payers.every((p) => authorizedPayers.has(p.toLowerCase()));

  /** My net debit, formatted per token (a payer may owe in several stablecoins). */
  const myDebitLabel = useMemo(() => {
    if (!me) return "";
    const byToken = new Map<string, bigint>();
    for (const l of legs) {
      if (l.from.toLowerCase() !== me.toLowerCase()) continue;
      byToken.set(l.token.toLowerCase(), (byToken.get(l.token.toLowerCase()) ?? 0n) + l.amount);
    }
    const parts: string[] = [];
    for (const [addr, amount] of byToken) {
      const t = network.tokens.find((x) => x.address.toLowerCase() === addr);
      parts.push(t ? `${formatAmount(amount, t.decimals)} ${t.symbol}` : amount.toString());
    }
    return parts.join(" + ");
  }, [me, legs, network.tokens]);

  /** The payer signs a permit per token + the Authorization, then publishes it. */
  const authorize = useCallback(async () => {
    if (!me || !clearing) {
      setError("Connect a wallet or create a Cinch account to authorize.");
      setStatus("error");
      return;
    }
    const key = kind === "cinch" ? storedKey() : null;
    if (kind === "cinch" && !key) {
      setError("Create your Cinch account to authorize.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("signing");
    try {
      // One permit per distinct token this payer owes into.
      const myLegs = legs.filter((l) => l.from.toLowerCase() === me.toLowerCase());
      const byToken = new Map<string, { token: Hex; value: bigint }>();
      for (const l of myLegs) {
        const k = l.token.toLowerCase();
        const prev = byToken.get(k);
        byToken.set(k, { token: l.token, value: (prev?.value ?? 0n) + l.amount });
      }

      // Sign with the connected wallet (EIP-712) or the local Cinch key.
      const sign = (td: Parameters<typeof signTypedDataWithKey>[1]) =>
        key ? signTypedDataWithKey(key, td) : signTypedDataAsync(td as never);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + DAY);
      const permits: SerialPermit[] = [];
      for (const { token, value } of byToken.values()) {
        const ctx = key
          ? await readPermitContext(network, key, token, me)
          : await readPermitContextPublic(network, token, me);
        const td = permitTypedData(network, token, ctx, me, clearing, value, deadline);
        const { v, r, s } = splitSignature((await sign(td)) as Hex);
        permits.push({ token, owner: me, value: value.toString(), deadline: deadline.toString(), v, r, s });
      }

      // Bind this payer to the exact leg set.
      const authTd = authorizationTypedData(network, clearing, roundId, legsHash);
      const auth = (await sign(authTd)) as Hex;

      const payload: StoredAuthorization = { payer: me, auth, permits };
      const ok = await postAuthorization(roundId, payload);
      if (!ok) throw new Error("Couldn't publish your authorization — the shared store may be unavailable.");

      // Reflect it locally at once, then re-sync.
      setCollected((prev) => [...prev.filter((a) => a.payer.toLowerCase() !== me.toLowerCase()), payload]);
      setStatus("idle");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0].slice(0, 180) : "Authorization failed.");
      setStatus("error");
    }
  }, [me, kind, clearing, legs, network, roundId, legsHash, refresh, signTypedDataAsync]);

  /** The organiser submits the single atomic clear() once everyone has signed. */
  const clear = useCallback(async (): Promise<string | null> => {
    if (!me || !clearing) {
      setError("Connect a wallet or create a Cinch account to clear.");
      setStatus("error");
      return null;
    }
    if (!allAuthorized) {
      setError("Not every payer has authorized yet.");
      setStatus("error");
      return null;
    }
    setError(null);
    setStatus("submitting");
    try {
      const permits: Permit[] = [];
      const auths: Hex[] = [];
      for (const a of collected) {
        auths.push(a.auth);
        for (const p of a.permits) permits.push(deserializePermit(p));
      }
      const data = encodeClearCall(roundId, legs, permits, auths);

      let ref: string;
      if (kind === "cinch") {
        const key = storedKey();
        if (!key) throw new Error("Create your Cinch account to clear.");
        ref = await accountSendCall(network, key, clearing, data);
      } else {
        // Connect-wallet path: ensure the wallet is on Tempo, send, confirm.
        if (chainId !== network.chainId) {
          await switchChainAsync({ chainId: network.chainId });
        }
        const hash = await sendTransactionAsync({ to: clearing, data, chainId: network.chainId } as never);
        const receipt = await publicClient!.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (receipt.status !== "success") throw new Error("The clearing transaction reverted on-chain — nothing moved.");
        ref = hash;
      }
      setTxRef(ref);
      setStatus("sent");
      return ref;
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0].slice(0, 180) : "Clearing failed.");
      setStatus("error");
      return null;
    }
  }, [me, kind, clearing, allAuthorized, collected, roundId, legs, network, chainId, switchChainAsync, sendTransactionAsync, publicClient]);

  return {
    isMultiParty,
    configured: !!clearing,
    available,
    me,
    kind,
    payers,
    iAmPayer,
    iHaveAuthorized,
    authorizedPayers,
    allAuthorized,
    myDebitLabel,
    roundId,
    status,
    error,
    txRef,
    authorize,
    clear,
    refresh,
  };
}
