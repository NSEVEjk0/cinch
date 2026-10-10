/**
 * Tempo network configuration and token registry.
 *
 * Every value here is taken from Tempo's official docs
 * (tempo.xyz/developers/docs/quickstart/connection-details and /faucet):
 *   - Mainnet  chainId 4217,  rpc https://rpc.tempo.xyz
 *   - Moderato chainId 42431, rpc https://rpc.moderato.tempo.xyz
 * Tempo has no native gas token — fees are paid in a stablecoin — so the
 * "native currency" is only nominal (USD) and never actually held.
 */

import type { Token } from "./types";

export interface TempoNetwork {
  key: "mainnet" | "testnet";
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  explorerUrl: string;
  /** Public faucet URL (testnet only). */
  faucetUrl?: string;
  /**
   * Keyless fee-sponsor relay (testnet only). When set, the Cinch account's
   * atomic 0x76 batches are co-signed and broadcast by this relay, so the
   * account pays zero gas. It is a distinct service from `rpcUrl` — the plain
   * RPC does not implement the relay's co-sign methods.
   */
  sponsorUrl?: string;
  /** Faucet-funded stablecoins available on this network. */
  tokens: Token[];
}

/* ----------------------------- token registry ---------------------------- */
/*
 * Moderato testnet faucet assets, verbatim from the Tempo faucet docs.
 * All are 6-decimal stablecoins. pathUSD is the testnet's primary unit and the
 * mainnet production stablecoin, so Cinch defaults to it.
 */

export const PATH_USD: Token = {
  address: "0x20c0000000000000000000000000000000000000",
  symbol: "pathUSD",
  decimals: 6,
};
export const ALPHA_USD: Token = {
  address: "0x20c0000000000000000000000000000000000001",
  symbol: "AlphaUSD",
  decimals: 6,
};
export const BETA_USD: Token = {
  address: "0x20c0000000000000000000000000000000000002",
  symbol: "BetaUSD",
  decimals: 6,
};
export const THETA_USD: Token = {
  address: "0x20c0000000000000000000000000000000000003",
  symbol: "ThetaUSD",
  decimals: 6,
};

export const TESTNET_TOKENS: Token[] = [PATH_USD, ALPHA_USD, BETA_USD, THETA_USD];

/* On mainnet, pathUSD is the live production stablecoin. */
export const MAINNET_TOKENS: Token[] = [PATH_USD];

/* ------------------------------- networks -------------------------------- */

export const MAINNET: TempoNetwork = {
  key: "mainnet",
  name: "Tempo Mainnet",
  chainId: 4217,
  rpcUrl: "https://rpc.tempo.xyz",
  wsUrl: "wss://rpc.tempo.xyz",
  explorerUrl: "https://explore.tempo.xyz",
  tokens: MAINNET_TOKENS,
};

export const MODERATO: TempoNetwork = {
  key: "testnet",
  name: "Tempo Testnet (Moderato)",
  chainId: 42431,
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  wsUrl: "wss://rpc.moderato.tempo.xyz",
  explorerUrl: "https://explore.testnet.tempo.xyz",
  faucetUrl: "https://faucet.tempo.xyz",
  sponsorUrl: "https://sponsor.moderato.tempo.xyz",
  tokens: TESTNET_TOKENS,
};

/**
 * Cinch defaults to Moderato so nothing real moves while a judge explores.
 * Flip with NEXT_PUBLIC_CINCH_NETWORK=mainnet.
 */
export const DEFAULT_NETWORK: TempoNetwork =
  process.env.NEXT_PUBLIC_CINCH_NETWORK === "mainnet" ? MAINNET : MODERATO;

export const NETWORKS: Record<"mainnet" | "testnet", TempoNetwork> = {
  mainnet: MAINNET,
  testnet: MODERATO,
};

/** Enshrined stablecoin DEX predeploy — lets different stablecoins net together. */
export const STABLECOIN_DEX = "0xdec0000000000000000000000000000000000000" as const;

export function explorerTxUrl(network: TempoNetwork, hash: string): string {
  return `${network.explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(network: TempoNetwork, address: string): string {
  return `${network.explorerUrl}/address/${address}`;
}

export function tokenBySymbol(network: TempoNetwork, symbol: string): Token | undefined {
  return network.tokens.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
}
