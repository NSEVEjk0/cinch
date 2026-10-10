"use client";

/**
 * useIdentity — the unified signer identity for Cinch.
 *
 * Businesses connect their existing wallet (MetaMask/Rabby/EIP-6963); anyone
 * without one can fall back to the self-custodial Cinch account. A connected
 * wallet always wins. Consumers read only `address`/`enabled`; `kind` tells the
 * clearing flow which signing path to use.
 */

import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { useCinchAccount } from "./useSettlement";

export type IdentityKind = "wallet" | "cinch";

export interface Identity {
  address: Hex | null;
  enabled: boolean;
  kind: IdentityKind | null;
}

export function useIdentity(): Identity {
  const { address: walletAddress, isConnected } = useAccount();
  const cinch = useCinchAccount();

  if (isConnected && walletAddress) {
    return { address: walletAddress as Hex, enabled: true, kind: "wallet" };
  }
  if (cinch.address) {
    return { address: cinch.address as Hex, enabled: true, kind: "cinch" };
  }
  return { address: null, enabled: false, kind: null };
}
