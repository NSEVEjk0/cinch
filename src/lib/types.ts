/**
 * Core domain types for Cinch.
 *
 * Everything monetary is a bigint in the token's smallest unit (e.g. 6-decimal
 * USDC: 1_000_000n === $1.00). Floats never touch money in this codebase.
 */

/** How the engine chooses the transfer set. */
export type NettingMode = "min-transfers" | "preserve-relationships";

/** A stablecoin an obligation can be denominated in. */
export interface Token {
  /** On-chain address of the ERC-20. */
  address: `0x${string}`;
  /** Display symbol, e.g. "USDC". */
  symbol: string;
  /** Decimal places in the smallest unit. */
  decimals: number;
}

/**
 * One debt: `debtor` owes `creditor` `amount` of `token`. The `reference` is
 * the human-meaningful reason (invoice no., bill id) that will be stamped into
 * the on-chain memo of whichever settlement leg discharges it.
 */
export interface Obligation {
  id: string;
  debtor: `0x${string}`;
  creditor: `0x${string}`;
  amount: bigint;
  token: Token;
  reference: string;
  /** When excluded, the obligation is held out of the clearing round. */
  disputed?: boolean;
  /** Why it was disputed — shown in the audit trail. */
  disputeReason?: string;
  createdAt?: string;

  /* ---- invoice fields (optional; a bare obligation stays a plain IOU) ---- */
  /** ISO date the invoice is due. Powers overdue flags and scheduled netting. */
  dueDate?: string;
  /**
   * Early-payment discount in basis points (100 = 1%). If the circle clears on
   * or before `earlyPayBy`, the debtor owes `amount` less this discount.
   */
  earlyPayDiscountBps?: number;
  /** ISO date the early-pay discount applies up to (inclusive). */
  earlyPayBy?: string;
}

/** A party's standing in one token after netting the whole room. */
export interface NetPosition {
  party: `0x${string}`;
  token: Token;
  /** Positive: net creditor (receives). Negative: net debtor (pays). */
  net: bigint;
  /** Gross owed to this party before netting. */
  grossIn: bigint;
  /** Gross this party owes before netting. */
  grossOut: bigint;
}

/** One transfer in the cleared settlement: `from` pays `to`. */
export interface SettlementTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  token: Token;
  /** Obligation references this transfer discharges, for the on-chain memo. */
  references: string[];
}

/** A party's wallet balance in a token, used for liquidity-aware clearing. */
export interface Balance {
  party: `0x${string}`;
  token: Token;
  available: bigint;
}

/** The full outcome of clearing a room. */
export interface ClearingResult {
  /** Minimal set of transfers that discharges every included obligation. */
  transfers: SettlementTransfer[];
  /** Net position per party per token. */
  positions: NetPosition[];
  /** Obligations held out: disputed, or dropped by liquidity constraints. */
  excluded: Obligation[];
  /** Headline stats for the UI. */
  stats: ClearingStats;
}

export interface ClearingStats {
  /** Obligations included in the round. */
  obligationCount: number;
  /** Transfers after netting. */
  transferCount: number;
  /** Gross sum of included obligations, per token symbol. */
  grossByToken: Record<string, bigint>;
  /** Sum actually moved after netting, per token symbol. */
  nettedByToken: Record<string, bigint>;
  /** 0..1 fraction of value removed by netting, across all tokens (weighted). */
  compressionRatio: number;
}
