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
  accountConvert,
} from "./cinchAccount";
import {
  getSellQuote,
  planFundingConversions,
  withSlippage,
  encodeDexApprove,
  encodeDexSwap,
  type Conversion,
  type Debit,
  type Holding,
} from "./crossCurrency";
import { readBalance } from "./chain";
import { STABLECOIN_DEX } from "./tempo";
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

  // Cross-currency funding: my balances per token, the DEX conversion plan
  // that covers any shortfall, and conversion execution state.
  const [balances, setBalances] = useState<Record<string, bigint> | null>(null);
  const [conversions, setConversions] = useState<Conversion[] | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertDone, setConvertDone] = useState<string[]>([]);

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

  /** My net debit per token (a payer may owe in several stablecoins). */
  const myDebitByToken = useMemo(() => {
    if (!me) return new Map<string, bigint>();
    const byToken = new Map<string, bigint>();
    for (const l of legs) {
      if (l.from.toLowerCase() !== me.toLowerCase()) continue;
      byToken.set(l.token.toLowerCase(), (byToken.get(l.token.toLowerCase()) ?? 0n) + l.amount);
    }
    return byToken;
  }, [me, legs]);

  /** My net debit, formatted per token. */
  const myDebitLabel = useMemo(() => {
    const parts: string[] = [];
    for (const [addr, amount] of myDebitByToken) {
      const t = network.tokens.find((x) => x.address.toLowerCase() === addr);
      parts.push(t ? `${formatAmount(amount, t.decimals)} ${t.symbol}` : amount.toString());
    }
    return parts.join(" + ");
  }, [myDebitByToken, network.tokens]);

  // Load my balances across the network's stablecoins when I'm a payer, so the
  // conversion planner can see what I hold vs. what I owe.
  useEffect(() => {
    if (!me || !iAmPayer) {
      setBalances(null);
      setConversions(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          network.tokens.map(async (t) => {
            try {
              const bal = await readBalance(me as Hex, t.address, network);
              return [t.address.toLowerCase(), bal] as const;
            } catch {
              return [t.address.toLowerCase(), -1n] as const;
            }
          })
        );
        if (!cancelled) setBalances(Object.fromEntries(entries));
      } catch {
        if (!cancelled) setBalances(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, iAmPayer, network]);

  // Plan conversions that fund any shortfall: what I owe in a token beyond what
  // I hold of it, covered by selling surplus I hold in other stablecoins.
  useEffect(() => {
    if (!iAmPayer || !me || !balances) {
      setConversions(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const debits: Debit[] = [];
        for (const [addr, amount] of myDebitByToken) {
          const t = network.tokens.find((x) => x.address.toLowerCase() === addr);
          if (!t) continue;
          const prev = debits.find((d) => d.token.address.toLowerCase() === t.address.toLowerCase());
          if (prev) prev.amount += amount;
          else debits.push({ token: t, amount });
        }
        const holdings: Holding[] = network.tokens
          .filter((t) => (balances[t.address.toLowerCase()] ?? 0n) > 0n)
          .map((t) => ({ token: t, balance: balances[t.address.toLowerCase()] }));
        const plan = await planFundingConversions(debits, holdings, (from, to, amt) =>
          getSellQuote(network, from.address, to.address, amt)
        );
        if (!cancelled) setConversions(plan);
      } catch {
        if (!cancelled) setConversions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [iAmPayer, me, myDebitByToken, balances, network]);

  /** Execute one planned conversion (approve + swap via the DEX). */
  const doConvert = useCallback(
    async (conv: Conversion) => {
      if (!me) return;
      setConvertError(null);
      setConvertingId(conv.id);
      try {
        const minOut = withSlippage(conv.expectedOut);
        if (kind === "cinch") {
          const key = storedKey();
          if (!key) throw new Error("Create your Cinch account to convert.");
          await accountConvert(network, key, conv.from, conv.to, conv.amountIn, minOut);
        } else {
          if (chainId !== network.chainId) {
            await switchChainAsync({ chainId: network.chainId });
          }
          const approveHash = await sendTransactionAsync({
            to: conv.from.address,
            data: encodeDexApprove(conv.from.address, conv.amountIn),
            chainId: network.chainId,
          } as never);
          await publicClient!.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
          const swapHash = await sendTransactionAsync({
            to: STABLECOIN_DEX,
            data: encodeDexSwap(conv.from.address, conv.to.address, conv.amountIn, minOut),
            chainId: network.chainId,
          } as never);
          await publicClient!.waitForTransactionReceipt({ hash: swapHash, timeout: 60_000 });
        }
        setConvertDone((d) => [...d, conv.id]);
        // Refresh balances so the plan reflects the new funding.
        try {
          const entries = await Promise.all(
            network.tokens.map(async (t) => {
              try {
                const bal = await readBalance(me as Hex, t.address, network);
                return [t.address.toLowerCase(), bal] as const;
              } catch {
                return [t.address.toLowerCase(), -1n] as const;
              }
            })
          );
          setBalances(Object.fromEntries(entries));
        } catch {
          // Keep the previous balances; the next plan pass will re-read.
        }
      } catch (err) {
        setConvertError(
          err instanceof Error ? err.message.split("\n")[0].slice(0, 180) : "Conversion failed."
        );
      } finally {
        setConvertingId(null);
      }
    },
    [me, kind, network, chainId, switchChainAsync, sendTransactionAsync, publicClient]
  );

  /** Any planned conversions not yet executed. */
  const pendingConversions = useMemo(
    () => (conversions ?? []).filter((c) => !convertDone.includes(c.id)),
    [conversions, convertDone]
  );

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
    conversions,
    pendingConversions,
    convertingId,
    convertError,
    doConvert,
    roundId,
    status,
    error,
    txRef,
    authorize,
    clear,
    refresh,
  };
}
