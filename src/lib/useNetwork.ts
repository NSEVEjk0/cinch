"use client";

/**
 * Active-network store.
 *
 * The chain Cinch targets is a runtime choice (mainnet or Moderato testnet),
 * persisted in localStorage so it survives reloads and is shared across every
 * component via a tiny external store. Defaults to the build-time
 * DEFAULT_NETWORK (testnet unless configured otherwise).
 */

import { useSyncExternalStore } from "react";
import { DEFAULT_NETWORK, NETWORKS, type TempoNetwork } from "./tempo";

const STORE_KEY = "cinch:network";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function readKey(): "mainnet" | "testnet" {
  if (typeof window === "undefined") return DEFAULT_NETWORK.key;
  const v = window.localStorage.getItem(STORE_KEY);
  return v === "mainnet" || v === "testnet" ? v : DEFAULT_NETWORK.key;
}

export function activeNetwork(): TempoNetwork {
  return NETWORKS[readKey()];
}

export function setActiveNetwork(key: "mainnet" | "testnet"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, key);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

/** Live active network; re-renders when the choice changes (incl. other tabs). */
export function useNetwork(): TempoNetwork {
  const key = useSyncExternalStore(subscribe, readKey, () => DEFAULT_NETWORK.key);
  return NETWORKS[key];
}
