"use client";

/**
 * The Cinch account — an opt-in, self-custodial, Tempo-native signer.
 *
 * Why this exists: a cleared circle is at its best as ONE atomic Tempo
 * (type-0x76) transaction with the fee sponsored — all legs settle or none do,
 * and no party needs a gas balance. But a generic injected wallet cannot sign a
 * Tempo batch envelope: viem's formatter rewrites any request carrying
 * `calls`/`feePayer` into a 0x76 and the wallet drops the fields it doesn't
 * know, signing an empty transfer instead. Few wallets speak all of Tempo yet.
 *
 * So Cinch can hold its own secp256k1 account in the browser. Because it is a
 * local account, viem serialises the 0x76 itself and submits it raw — a real
 * atomic batch with sponsored fees lands on chain. Strictly opt-in, off by
 * default; when off, nothing about the injected-wallet path changes.
 *
 * Security: the key lives in localStorage, unencrypted — a testnet convenience,
 * not a vault. The UI says so, offers an export, and keeps it separate from any
 * wallet holding real funds.
 */

import { Account, createClient, http as tempoHttp, withRelay } from "viem/tempo";
import { tempo, tempoModerato } from "viem/chains";
import { generatePrivateKey } from "viem/accounts";
import type { TempoCall } from "./batch";
import type { TempoNetwork } from "./tempo";
import { resolveRefFromResult } from "./txref";

type Hex = `0x${string}`;

const KEY_STORE = "cinch:account:key";
const ON_STORE = "cinch:account:on";

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function subscribeAccount(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function isHexKey(v: string | null): v is Hex {
  return !!v && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function storedKey(): Hex | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY_STORE);
  return isHexKey(v) ? v : null;
}

export function accountOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ON_STORE) === "1";
}

export function addressForKey(key: Hex): Hex {
  return Account.fromSecp256k1(key).address as Hex;
}

export function accountAddress(): Hex | null {
  const key = storedKey();
  return key ? addressForKey(key) : null;
}

export function createAccount(): Hex {
  const key = generatePrivateKey();
  window.localStorage.setItem(KEY_STORE, key);
  emit();
  return key;
}

export function importAccount(raw: string): Hex {
  const key = raw.trim();
  if (!isHexKey(key)) {
    throw new Error("That is not a private key — expected 0x followed by 64 hex characters.");
  }
  window.localStorage.setItem(KEY_STORE, key);
  emit();
  return key;
}

export function setAccountOn(on: boolean): void {
  window.localStorage.setItem(ON_STORE, on ? "1" : "0");
  emit();
}

export function forgetAccount(): void {
  window.localStorage.removeItem(KEY_STORE);
  window.localStorage.removeItem(ON_STORE);
  emit();
}

/* --------------------------- the Tempo client --------------------------- */

function chainForNetwork(network: TempoNetwork) {
  return network.chainId === tempo.id ? tempo : tempoModerato;
}

/** Is a keyless fee sponsor configured for this network (so a send costs nothing extra)? */
export function accountSponsors(network: TempoNetwork): boolean {
  // The Moderato testnet runs a public keyless relay/sponsor.
  return network.key === "testnet";
}

function clientFor(network: TempoNetwork, key: Hex) {
  const base = tempoHttp(network.rpcUrl);
  const transport = accountSponsors(network) ? withRelay(base, base) : base;
  return createClient({
    account: Account.fromSecp256k1(key),
    chain: chainForNetwork(network),
    transport,
  });
}

/**
 * Settle a cleared circle as a single atomic Tempo transaction. Every call
 * settles or none does, it is one signature (the local account signs — no
 * popup), and the fee is sponsored where a sponsor exists. Returns the tx hash.
 */
export async function accountSettle(
  network: TempoNetwork,
  key: Hex,
  calls: TempoCall[]
): Promise<string> {
  const client = clientFor(network, key);
  const sponsored = accountSponsors(network);
  const result = await (client as unknown as {
    sendTransactionSync: (args: unknown) => Promise<unknown>;
  }).sendTransactionSync({
    calls: calls.map((c) => ({ to: c.to, data: c.data })),
    ...(sponsored ? { feePayer: true } : {}),
  });
  return resolveRefFromResult(result);
}

/** Read the account's balance of a token, formatted. */
export async function accountBalance(
  network: TempoNetwork,
  key: Hex,
  token: Hex
): Promise<bigint> {
  const client = clientFor(network, key);
  const bal = await (client as unknown as {
    readContract: (args: unknown) => Promise<unknown>;
  }).readContract({
    address: token,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "a", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [addressForKey(key)],
  });
  return bal as bigint;
}
