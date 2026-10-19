/**
 * crossCurrency.ts — the enshrined stablecoin DEX bridge.
 *
 * Tempo predeploys an orderbook DEX (`STABLECOIN_DEX`) that swaps its native
 * stablecoins (pathUSD, AlphaUSD, BetaUSD, ThetaUSD) against each other. This
 * module wraps it so a payer who owes in one stablecoin but holds another can
 * convert before settling — the "different stablecoins net together" claim,
 * made real. Quotes are read-only; the conversion itself is one sponsored
 * atomic batch (approve + swap) from the Cinch account.
 *
 * Design rules (same as netting.ts):
 *  - Money is always bigint in the token's smallest unit. Floats never touch it.
 *  - Quotes come from the chain, never from memory. If a pair has no liquidity,
 *    the quote reverts and we report the pair as unavailable — the payer falls
 *    back to funding their debit in its own token.
 */

import { encodeFunctionData, createPublicClient, type Hex } from "viem";
import { Actions, http } from "viem/tempo";
import { tempo, tempoModerato } from "viem/chains";
import type { TempoNetwork } from "./tempo";
import { STABLECOIN_DEX } from "./tempo";
import type { Token } from "./types";

function chainForNetwork(network: TempoNetwork) {
  return network.chainId === tempo.id ? tempo : tempoModerato;
}

/** Slippage guard for conversions, in basis points (50 = 0.5%). */
export const DEFAULT_SLIPPAGE_BPS = 50;

/** TIP-20 approve — the DEX pulls the sold token via transferFrom. */
const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** The enshrined DEX's market-sell entry point. */
const SWAP_EXACT_AMOUNT_IN_ABI = [
  {
    type: "function",
    name: "swapExactAmountIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint128" },
      { name: "minAmountOut", type: "uint128" },
    ],
    outputs: [{ name: "amountOut", type: "uint128" }],
  },
] as const;

/**
 * Live DEX quote: how much `tokenOut` you receive for `amountIn` of
 * `tokenIn`. Throws if the pair has no liquidity (the caller should treat that
 * as "conversion unavailable", not an app error).
 */
export async function getSellQuote(
  network: TempoNetwork,
  tokenIn: Hex,
  tokenOut: Hex,
  amountIn: bigint
): Promise<bigint> {
  const client = createPublicClient({
    chain: chainForNetwork(network),
    transport: http(network.rpcUrl, { retryCount: 6, retryDelay: 400 }),
  });
  const amountOut = await Actions.dex.getSellQuote(client, {
    tokenIn,
    tokenOut,
    amountIn,
  });
  return amountOut as bigint;
}

/** The minimum acceptable output for a quote at a given slippage. */
export function withSlippage(
  quote: bigint,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS
): bigint {
  return (quote * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * A proposed conversion for a payer: sell `amountIn` of `from` to receive
 * ~`expectedOut` of `to` (the DEX quote, before slippage).
 */
export interface Conversion {
  id: string;
  from: Token;
  to: Token;
  amountIn: bigint;
  expectedOut: bigint;
}

/** A payer's net debit in one token (from the clearing result). */
export interface Debit {
  token: Token;
  amount: bigint;
}

/** A payer's on-chain balance of one token. */
export interface Holding {
  token: Token;
  balance: bigint;
}

export type QuoteFn = (from: Token, to: Token, amountIn: bigint) => Promise<bigint>;

/**
 * Plan the minimal set of DEX conversions that fund a payer's shortfalls.
 *
 * A shortfall is a debit a payer can't cover from their balance of that same
 * token. Surplus is any balance left after covering the payer's own-token
 * debits. We greedily sell the largest surplus source into each shortfall
 * token, quoting live rates (the injected `quote` function keeps this pure and
 * unit-testable). Returns an empty list when the payer is fully funded.
 */
export async function planFundingConversions(
  debits: Debit[],
  holdings: Holding[],
  quote: QuoteFn
): Promise<Conversion[]> {
  const balanceOf = new Map<string, bigint>(
    holdings.map((h) => [h.token.address.toLowerCase(), h.balance])
  );

  // Shortfall per token: debit minus what the payer already holds in that token.
  const shortfalls: { token: Token; amount: bigint }[] = [];
  for (const d of debits) {
    const held = balanceOf.get(d.token.address.toLowerCase()) ?? 0n;
    const short = d.amount - held;
    if (short > 0n) shortfalls.push({ token: d.token, amount: short });
  }
  if (shortfalls.length === 0) return [];

  // Surplus per token: balance beyond what the payer's own-token debits need.
  const surplus: { token: Token; amount: bigint }[] = [];
  for (const h of holdings) {
    const ownDebit =
      debits.find((d) => d.token.address.toLowerCase() === h.token.address.toLowerCase())
        ?.amount ?? 0n;
    const extra = h.balance - ownDebit;
    if (extra > 0n) surplus.push({ token: h.token, amount: extra });
  }
  if (surplus.length === 0) return [];

  // Biggest shortfalls first, funded from the biggest surplus sources first.
  shortfalls.sort((a, b) => (a.amount < b.amount ? 1 : -1));
  surplus.sort((a, b) => (a.amount < b.amount ? 1 : -1));

  const conversions: Conversion[] = [];
  let sourceIdx = 0;

  // Max re-quotes per conversion when the first quote falls short of the
  // shortfall (the DEX spread means amountIn yields slightly less than itself).
  const MAX_QUOTE_BUMPS = 3;

  // A shortfall counts as covered once the residual is below 0.01% of it —
  // chasing the last few wei of spread would loop forever.
  const COVERED_TOLERANCE = (need: { amount: bigint }) => need.amount / 10_000n;

  for (const need of shortfalls) {
    let remaining = need.amount;
    const tolerance = COVERED_TOLERANCE(need);
    while (remaining > tolerance && sourceIdx < surplus.length) {
      const src = surplus[sourceIdx];
      if (src.amount <= 0n) {
        sourceIdx += 1;
        continue;
      }
      if (src.token.address.toLowerCase() === need.token.address.toLowerCase()) {
        sourceIdx += 1;
        continue;
      }

      // Sell at most the surplus we have. If the quote yields less than the
      // shortfall, bump amountIn a bounded number of times so the payer ends
      // funded — but never chase a quote that doesn't improve, and never keep
      // converting the same need from the same source forever.
      let amountIn = remaining > src.amount ? src.amount : remaining;
      let expectedOut = await quote(src.token, need.token, amountIn);
      for (let i = 0; i < MAX_QUOTE_BUMPS && expectedOut < remaining && amountIn < src.amount; i += 1) {
        const next = amountIn + (remaining - expectedOut);
        if (next > src.amount) break;
        let q: bigint;
        try {
          q = await quote(src.token, need.token, next);
        } catch {
          break;
        }
        if (q <= expectedOut) break; // quote didn't improve — stop bumping
        amountIn = next;
        expectedOut = q;
      }

      if (expectedOut <= 0n) {
        sourceIdx += 1; // this source can't fund the need
        continue;
      }

      conversions.push({
        id: `${src.token.symbol}->${need.token.symbol}:${amountIn.toString()}`,
        from: src.token,
        to: need.token,
        amountIn,
        expectedOut,
      });
      src.amount -= amountIn;
      remaining -= expectedOut;

      // Move on from this source only when it's exhausted or couldn't cover the
      // need; a source with surplus left stays available for the next need.
      if (src.amount <= 0n || remaining > tolerance) sourceIdx += 1;
    }
  }

  return conversions;
}

/** Encode the approve call for the DEX (used inside the conversion batch). */
export function encodeDexApprove(token: Hex, amount: bigint): Hex {
  return encodeFunctionData({
    abi: APPROVE_ABI,
    functionName: "approve",
    args: [STABLECOIN_DEX, amount],
  });
}

/** Encode the swap call for the DEX (used inside the conversion batch). */
export function encodeDexSwap(
  tokenIn: Hex,
  tokenOut: Hex,
  amountIn: bigint,
  minAmountOut: bigint
): Hex {
  return encodeFunctionData({
    abi: SWAP_EXACT_AMOUNT_IN_ABI,
    functionName: "swapExactAmountIn",
    args: [tokenIn, tokenOut, amountIn, minAmountOut],
  });
}
