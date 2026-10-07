/**
 * wagmi + viem configuration for Tempo.
 *
 * Tempo is EVM-compatible, so a standard wagmi config with injected connectors
 * works for connecting a wallet and reading balances. The two Tempo chains are
 * declared from the verified connection details in `tempo.ts`.
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
  connectors: [injected()],
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
