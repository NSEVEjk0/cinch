/**
 * Turn a cleared settlement into Tempo transaction calls.
 *
 * Each settlement leg becomes a `transferWithMemo(address to, uint256 amount,
 * bytes32 memo)` call against the token contract. The memo is a 32-byte digest
 * of the obligation references the leg discharges, so the on-chain record
 * carries *what the payment was for* — Tempo's own docs pitch exactly this
 * ("attach invoice ids and reconcile onchain").
 *
 * The whole set of calls is submitted as ONE atomic Tempo transaction: every
 * leg settles or none does. That atomicity is the thing that makes multilateral
 * clearing trust-free — no party pays their leg while another's fails.
 */

import { encodeFunctionData, keccak256, toHex, stringToBytes } from "viem";
import type { SettlementTransfer } from "./types";

/** ABI for the TIP-20 memo transfer every Cinch leg uses. */
export const TRANSFER_WITH_MEMO_ABI = [
  {
    type: "function",
    name: "transferWithMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** One encoded call in a Tempo batch. */
export interface TempoCall {
  to: `0x${string}`;
  data: `0x${string}`;
  /** For display/debugging; not sent on chain. */
  meta: {
    recipient: `0x${string}`;
    amount: bigint;
    tokenSymbol: string;
    references: string[];
  };
}

/**
 * Encode a reference set into a 32-byte memo.
 *
 * A single reference short enough to fit is stored as right-padded UTF-8 so it
 * is human-readable on the explorer; anything longer (or a multi-reference leg)
 * is hashed with keccak256 so the memo is a stable digest the parties can
 * recompute from their own obligation lists.
 */
export function encodeMemo(references: string[]): `0x${string}` {
  if (references.length === 1) {
    const bytes = stringToBytes(references[0]);
    if (bytes.length <= 32) {
      const padded = new Uint8Array(32);
      padded.set(bytes);
      return toHex(padded);
    }
  }
  const joined = references.slice().sort().join("\n");
  return keccak256(stringToBytes(`cinch:${joined}`));
}

/** Encode one settlement leg as a `transferWithMemo` call on its token. */
export function encodeTransfer(leg: SettlementTransfer): TempoCall {
  const memo = encodeMemo(leg.references);
  const data = encodeFunctionData({
    abi: TRANSFER_WITH_MEMO_ABI,
    functionName: "transferWithMemo",
    args: [leg.to, leg.amount, memo],
  });
  return {
    to: leg.token.address,
    data,
    meta: {
      recipient: leg.to,
      amount: leg.amount,
      tokenSymbol: leg.token.symbol,
      references: leg.references,
    },
  };
}

/**
 * Build the full atomic batch from a cleared settlement.
 *
 * The order is deterministic (callers already produce deterministic transfers),
 * so the batch a user previews is byte-for-byte the batch they sign.
 */
export function buildSettlementBatch(transfers: SettlementTransfer[]): TempoCall[] {
  return transfers.map(encodeTransfer);
}
