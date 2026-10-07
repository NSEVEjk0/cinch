"use client";

/**
 * NetworkSwitch — pick which Tempo chain Cinch targets.
 *
 * Changing it updates the active-network store the whole app reads from, and
 * (when a wallet is connected) asks the wallet to switch chains too, so the
 * next settlement signs on the right network.
 */

import { useSwitchChain, useAccount } from "wagmi";
import { useNetwork, setActiveNetwork } from "@/lib/useNetwork";
import { NETWORKS } from "@/lib/tempo";
import { tempoMainnetChain, tempoModeratoChain } from "@/lib/wagmi";

export function NetworkSwitch({ compact = false }: { compact?: boolean }) {
  const network = useNetwork();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  function choose(key: "mainnet" | "testnet") {
    setActiveNetwork(key);
    if (isConnected) {
      const chainId = key === "mainnet" ? tempoMainnetChain.id : tempoModeratoChain.id;
      // Best-effort: ask the wallet to match. Ignore rejection — the store is
      // the source of truth and the settlement flow re-checks before signing.
      try {
        switchChain({ chainId });
      } catch {
        /* no-op */
      }
    }
  }

  return (
    <div className="segment" title="Choose the Tempo network">
      <button
        data-active={network.key === "testnet"}
        onClick={() => choose("testnet")}
      >
        {compact ? "Test" : "Testnet"}
      </button>
      <button
        data-active={network.key === "mainnet"}
        onClick={() => choose("mainnet")}
      >
        {compact ? "Main" : "Mainnet"}
      </button>
    </div>
  );
}

export { NETWORKS };
