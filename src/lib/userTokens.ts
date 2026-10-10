"use client";

/**
 * User-added wallet assets.
 *
 * Beyond the network's faucet stablecoins, a person can add any TIP-20 token to
 * their wallet by contract address. These live per-network in localStorage (the
 * wallet is self-custodial and browser-local, like the key itself) and are
 * merged with the built-in token list wherever balances are shown.
 */

import type { Token } from "./types";

const KEY = (networkKey: string) => `cinch:tokens:${networkKey}`;

function read(networkKey: string): Token[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(networkKey));
    return raw ? (JSON.parse(raw) as Token[]) : [];
  } catch {
    return [];
  }
}

function write(networkKey: string, tokens: Token[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(networkKey), JSON.stringify(tokens));
  } catch {
    /* storage unavailable */
  }
}

/** Custom tokens the person added on this network. */
export function loadUserTokens(networkKey: string): Token[] {
  return read(networkKey);
}

/** Add a token (idempotent by address); returns the updated list. */
export function addUserToken(networkKey: string, token: Token): Token[] {
  const all = read(networkKey);
  if (all.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) return all;
  const next = [...all, token];
  write(networkKey, next);
  return next;
}

/** Remove a token by address; returns the updated list. */
export function removeUserToken(networkKey: string, address: string): Token[] {
  const next = read(networkKey).filter((t) => t.address.toLowerCase() !== address.toLowerCase());
  write(networkKey, next);
  return next;
}

/** The full asset list for a network: built-ins first, then user-added. */
export function allTokens(networkKey: string, builtins: Token[]): Token[] {
  const user = read(networkKey).filter(
    (t) => !builtins.some((b) => b.address.toLowerCase() === t.address.toLowerCase())
  );
  return [...builtins, ...user];
}
