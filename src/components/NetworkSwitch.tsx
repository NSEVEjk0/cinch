"use client";

/**
 * NetworkSwitch — pick which Tempo chain Cinch targets.
 *
 * Changing it updates the active-network store the whole app reads from. The
 * self-custodial Cinch account signs directly against the chosen network's RPC,
 * so there is no wallet chain to keep in sync.
 */

import { useNetwork, setActiveNetwork } from "@/lib/useNetwork";
import { NETWORKS } from "@/lib/tempo";

export function NetworkSwitch({ compact = false }: { compact?: boolean }) {
  const network = useNetwork();

  function choose(key: "mainnet" | "testnet") {
    setActiveNetwork(key);
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
