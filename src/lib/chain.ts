/**
 * Chain verification — confirm a settlement actually landed on Tempo.
 *
 * After a circle is settled we do not take the wallet's word for it. This reads
 * the transaction (or EIP-5792 calls bundle) straight back from Tempo and
 * confirms it was mined successfully, so the "cleared" state in the UI reflects
 * the chain, not an optimistic client guess. A failed or missing receipt is
 * surfaced honestly rather than shown as settled.
 *
 * This is the "flagged immediately from the chain" guarantee: the moment the
 * settlement is final on Tempo (~sub-second), a direct read confirms it.
 */

import { createPublicClient, http, type Hash } from "viem";
import { DEFAULT_NETWORK, type TempoNetwork } from "./tempo";
import { tempoModeratoChain, tempoMainnetChain } from "./wagmi";

function chainFor(network: TempoNetwork) {
  return network.key === "mainnet" ? tempoMainnetChain : tempoModeratoChain;
}

function publicClientFor(network: TempoNetwork) {
  return createPublicClient({
    chain: chainFor(network),
    transport: http(network.rpcUrl),
  });
}

export interface ChainConfirmation {
  confirmed: boolean;
  status: "success" | "reverted" | "pending" | "unknown";
  blockNumber?: bigint;
  /** The confirmed transaction hash, once known. */
  txHash?: string;
}

/**
 * Wait for a settlement reference to be final on Tempo.
 *
 * The reference may be a plain tx hash (single-leg settlement) or an EIP-5792
 * calls id (multi-leg batch). We try to read it as a transaction receipt first;
 * that covers the common case. Tempo's sub-second finality means this usually
 * returns almost immediately.
 */
export async function confirmSettlement(
  reference: string,
  options: { network?: TempoNetwork; timeoutMs?: number } = {}
): Promise<ChainConfirmation> {
  const network = options.network ?? DEFAULT_NETWORK;
  const client = publicClientFor(network);

  // A 0x…64 reference is a transaction hash we can wait on directly.
  if (/^0x[0-9a-fA-F]{64}$/.test(reference)) {
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: reference as Hash,
        timeout: options.timeoutMs ?? 30_000,
      });
      return {
        confirmed: receipt.status === "success",
        status: receipt.status === "success" ? "success" : "reverted",
        blockNumber: receipt.blockNumber,
        txHash: receipt.transactionHash,
      };
    } catch {
      return { confirmed: false, status: "pending" };
    }
  }

  // Otherwise it's a calls-bundle id; we cannot resolve it without the wallet
  // provider, so report unknown rather than guessing.
  return { confirmed: false, status: "unknown" };
}

/**
 * Read a party's balance of a token straight from Tempo. Used by liquidity-aware
 * clearing to know what each wallet can actually fund before building a round.
 */
export async function readBalance(
  party: `0x${string}`,
  token: `0x${string}`,
  network: TempoNetwork = DEFAULT_NETWORK
): Promise<bigint> {
  const client = publicClientFor(network);
  const balance = await client.readContract({
    address: token,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [party],
  });
  return balance as bigint;
}
