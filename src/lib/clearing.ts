"use client";

/**
 * Model C — the on-chain clearing contract client.
 *
 * This is the trustless multi-party settlement path: when a cleared round has
 * more than one distinct payer, no single key can move everyone's funds. Each
 * net debtor instead *signs* two things (no gas, nothing on-chain, nothing
 * moves):
 *   1. an EIP-2612 `permit` granting the CinchClearing contract an allowance;
 *   2. an EIP-712 `Authorization` binding them to the exact cleared leg set.
 * The organiser then submits one `clear()` call that pulls every leg
 * debtor→creditor atomically.
 *
 * The byte-for-byte encoding here MUST match CinchClearing.sol — the contract
 * recomputes `legsHash = keccak256(abi.encode(roundId, legs))` and recovers
 * each signature against it. The `computeLegsHash` view on the deployed
 * contract exists so a test can prove this file agrees with the chain.
 */

import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  type Hex,
  type TypedDataDomain,
} from "viem";
import type { SettlementTransfer } from "./types";
import { encodeMemo } from "./batch";
import type { TempoNetwork } from "./tempo";
import artifact from "./clearingArtifact.json";

export const CLEARING_ABI = artifact.abi;

/** One cleared transfer, in the shape CinchClearing.Leg expects. */
export interface Leg {
  token: Hex;
  from: Hex;
  to: Hex;
  amount: bigint;
  memo: Hex;
}

/** A signed EIP-2612 permit, in the shape CinchClearing.Permit expects. */
export interface Permit {
  token: Hex;
  owner: Hex;
  value: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

/** ABI tuple for a Leg[] — kept in lockstep with the Solidity struct order. */
const LEG_COMPONENTS = [
  { name: "token", type: "address" },
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "memo", type: "bytes32" },
] as const;

const LEG_ARRAY_PARAM = { name: "legs", type: "tuple[]", components: LEG_COMPONENTS } as const;

/** The deployed clearing contract for a network, from the build-time env. */
export function clearingAddress(_network: TempoNetwork): Hex | null {
  const addr = process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS;
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Hex) : null;
}

/** Is Model C available (a clearing contract is configured)? */
export function clearingConfigured(network: TempoNetwork): boolean {
  return clearingAddress(network) !== null;
}

/** Encode the netting transfers into contract legs, stamping the obligation memo. */
export function buildLegs(transfers: SettlementTransfer[]): Leg[] {
  return transfers.map((t) => ({
    token: t.token.address,
    from: t.from,
    to: t.to,
    amount: t.amount,
    memo: encodeMemo(t.references),
  }));
}

/** The distinct payers in a leg set — exactly who must authorize. */
export function distinctPayers(legs: Leg[]): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const leg of legs) {
    const key = leg.from.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(leg.from);
    }
  }
  return out;
}

/** Each payer's total debit per token — the minimum permit `value` they must grant. */
export function debitByPayerToken(legs: Leg[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const leg of legs) {
    const key = `${leg.from.toLowerCase()}:${leg.token.toLowerCase()}`;
    m.set(key, (m.get(key) ?? 0n) + leg.amount);
  }
  return m;
}

/**
 * A content id for the round, independent of `roundId` itself (so there is no
 * circular hash): keccak(abi.encode(legs)). Combined with the circle id it
 * yields a stable, unique `roundId` while signatures are collected.
 */
export function roundIdFor(circleId: string, legs: Leg[]): Hex {
  const legsContent = keccak256(encodeAbiParameters([LEG_ARRAY_PARAM], [legs as never]));
  return keccak256(
    encodeAbiParameters(
      [
        { name: "circleId", type: "string" },
        { name: "legsContent", type: "bytes32" },
      ],
      [circleId, legsContent]
    )
  );
}

/** keccak256(abi.encode(roundId, legs)) — identical to the contract's computation. */
export function legsHashFor(roundId: Hex, legs: Leg[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ name: "roundId", type: "bytes32" }, LEG_ARRAY_PARAM],
      [roundId, legs as never]
    )
  );
}

/** EIP-712 domain for the clearing contract's Authorization signatures. */
export function clearingDomain(network: TempoNetwork, verifyingContract: Hex): TypedDataDomain {
  return {
    name: "Cinch",
    version: "1",
    chainId: network.chainId,
    verifyingContract,
  };
}

export const AUTHORIZATION_TYPES = {
  Authorization: [
    { name: "roundId", type: "bytes32" },
    { name: "legsHash", type: "bytes32" },
  ],
} as const;

/** Typed data a debtor signs to authorize a round's exact leg set. */
export function authorizationTypedData(
  network: TempoNetwork,
  verifyingContract: Hex,
  roundId: Hex,
  legsHash: Hex
) {
  return {
    domain: clearingDomain(network, verifyingContract),
    types: AUTHORIZATION_TYPES,
    primaryType: "Authorization" as const,
    message: { roundId, legsHash },
  };
}

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** The token-side EIP-712 domain for an EIP-2612 permit (read from the token). */
export interface PermitContext {
  tokenName: string;
  version: string;
  nonce: bigint;
}

/** Typed data a debtor signs to grant the clearing contract an allowance. */
export function permitTypedData(
  network: TempoNetwork,
  token: Hex,
  ctx: PermitContext,
  owner: Hex,
  spender: Hex,
  value: bigint,
  deadline: bigint
) {
  return {
    domain: {
      name: ctx.tokenName,
      version: ctx.version,
      chainId: network.chainId,
      verifyingContract: token,
    } as TypedDataDomain,
    types: PERMIT_TYPES,
    primaryType: "Permit" as const,
    message: { owner, spender, value, nonce: ctx.nonce, deadline },
  };
}

/** Split a 65-byte signature into the (v, r, s) a Permit struct needs. */
export function splitSignature(sig: Hex): { v: number; r: Hex; s: Hex } {
  const raw = sig.slice(2);
  const r = ("0x" + raw.slice(0, 64)) as Hex;
  const s = ("0x" + raw.slice(64, 128)) as Hex;
  let v = parseInt(raw.slice(128, 130), 16);
  if (v < 27) v += 27; // EIP-2612 on TIP-20 accepts only 27/28
  return { v, r, s };
}

/** Encode the `clear(roundId, legs, permits, auths)` call. */
export function encodeClearCall(
  roundId: Hex,
  legs: Leg[],
  permits: Permit[],
  auths: Hex[]
): Hex {
  return encodeFunctionData({
    abi: CLEARING_ABI,
    functionName: "clear",
    args: [roundId, legs, permits, auths],
  });
}
