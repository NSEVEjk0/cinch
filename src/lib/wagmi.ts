/**
 * wagmi + viem configuration for Tempo.
 *
 * Tempo is EVM-compatible. We enable EIP-6963 multi-injected-provider
 * discovery so every installed browser wallet (MetaMask, Rabby, Coinbase,
 * Frame, …) is offered — not just whichever one claimed `window.ethereum`.
 * This is what fixes "I switched browser and Rabby didn't show up".
 */

import { http, createConfig, injected } from "wagmi";
import type { Chain } from "viem";
import { MAINNET, MODERATO } from "./tempo";

function toViemChain(net: typeof MAINNET): Chain {
  return {
    id: net.chainId,
    name: net.name,
    // Nominal only — Tempo pays fees in a stablecoin, never a native gas token.
    nativeCurrency: { name: "US Dollar", symbol: "USD", decimals: 18 },
    rpcUrls: {
      default: { http: [net.rpcUrl], webSocket: [net.wsUrl] },
      public: { http: [net.rpcUrl], webSocket: [net.wsUrl] },
    },
    blockExplorers: {
      default: { name: "Tempo Explorer", url: net.explorerUrl },
    },
    testnet: net.key === "testnet",
  };
}

export const tempoMainnetChain = toViemChain(MAINNET);
export const tempoModeratoChain = toViemChain(MODERATO);

export const wagmiConfig = createConfig({
  chains: [tempoModeratoChain, tempoMainnetChain],
  // `multiInjectedProviderDiscovery` (EIP-6963) is on by default and surfaces
  // each wallet as its own connector. We also add a generic injected()
  // fallback for wallets that don't yet announce via 6963.
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [tempoModeratoChain.id]: http(MODERATO.rpcUrl),
    [tempoMainnetChain.id]: http(MAINNET.rpcUrl),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
