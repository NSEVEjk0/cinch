"use client";

/**
 * The Cinch account — a self-custodial, Tempo-native wallet that lives in the
 * browser.
 *
 * Cinch is its own wallet. On sign-up a person gets a 12-word recovery phrase
 * (and the underlying private key) that they can use to log back in on any
 * device — exactly like a normal non-custodial wallet, no extension required.
 *
 * Why Cinch holds its own account rather than leaning on an injected wallet: a
 * cleared circle is at its best as ONE atomic Tempo (type-0x76) transaction
 * with the fee sponsored — all legs settle or none do, and no party needs a gas
 * balance. But a generic injected wallet cannot sign a Tempo batch envelope:
 * viem's formatter rewrites any request carrying `calls`/`feePayer` into a 0x76
 * and the wallet drops the fields it doesn't know, signing an empty transfer.
 * Because the Cinch account is a *local* account, viem serialises the 0x76
 * itself and submits it raw — a real atomic batch with sponsored fees, and with
 * Tempo's `validAfter` time-lock for scheduled clearing.
 *
 * Security: the key lives in localStorage, unencrypted — a testnet convenience,
 * not a hardware vault. The UI says so and lets the person export the phrase and
 * key to a safer place.
 */

import { Account, createClient, http as tempoHttp, withRelay } from "viem/tempo";
import { tempo, tempoModerato } from "viem/chains";
import { generateMnemonic, mnemonicToAccount, english, privateKeyToAccount } from "viem/accounts";
import { toHex, createWalletClient, createPublicClient, http as viemHttp } from "viem";
import type { TempoCall } from "./batch";
import type { TempoNetwork } from "./tempo";
import { resolveRefFromResult } from "./txref";

type Hex = `0x${string}`;

const KEY_STORE = "cinch:account:key";
const ON_STORE = "cinch:account:on";
const MNEMONIC_STORE = "cinch:account:mnemonic";

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

/** The recovery phrase for the current account, if it was created from one. */
export function storedMnemonic(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MNEMONIC_STORE);
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

/** Derive the secp256k1 private key for a BIP-39 phrase (standard m/44'/60'/0'/0/0). */
function keyFromMnemonic(phrase: string): Hex {
  const hd = mnemonicToAccount(phrase.trim());
  const pk = hd.getHdKey().privateKey;
  if (!pk) throw new Error("Could not derive a key from that phrase.");
  return toHex(pk) as Hex;
}

/**
 * Create a brand-new account from a fresh 12-word recovery phrase. Both the
 * phrase and the derived key are stored so the person can log back in with
 * either. Returns both so the UI can show them once, for the user to save.
 */
export function createAccount(): { key: Hex; mnemonic: string } {
  const mnemonic = generateMnemonic(english);
  const key = keyFromMnemonic(mnemonic);
  window.localStorage.setItem(MNEMONIC_STORE, mnemonic);
  window.localStorage.setItem(KEY_STORE, key);
  window.localStorage.setItem(ON_STORE, "1");
  emit();
  return { key, mnemonic };
}

/** Log in with a recovery phrase, deriving (and storing) the account's key. */
export function importMnemonic(phrase: string): Hex {
  const clean = phrase.trim().replace(/\s+/g, " ");
  const words = clean.split(" ").length;
  if (words !== 12 && words !== 24) {
    throw new Error("A recovery phrase is 12 or 24 words. Check what you pasted.");
  }
  let key: Hex;
  try {
    key = keyFromMnemonic(clean);
  } catch {
    throw new Error("That recovery phrase isn't valid. Check the words and their order.");
  }
  window.localStorage.setItem(MNEMONIC_STORE, clean);
  window.localStorage.setItem(KEY_STORE, key);
  window.localStorage.setItem(ON_STORE, "1");
  emit();
  return key;
}

/** Log in with a raw private key (no recovery phrase is available for these). */
export function importAccount(raw: string): Hex {
  const key = raw.trim();
  if (!isHexKey(key)) {
    throw new Error("That is not a private key — expected 0x followed by 64 hex characters.");
  }
  window.localStorage.setItem(KEY_STORE, key);
  window.localStorage.removeItem(MNEMONIC_STORE);
  window.localStorage.setItem(ON_STORE, "1");
  emit();
  return key;
}

export function setAccountOn(on: boolean): void {
  window.localStorage.setItem(ON_STORE, on ? "1" : "0");
  emit();
}

export function forgetAccount(): void {
  window.localStorage.removeItem(KEY_STORE);
  window.localStorage.removeItem(MNEMONIC_STORE);
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
 * popup), and the fee is sponsored where a sponsor exists.
 *
 * `validAfter` (unix seconds) time-locks the batch: Tempo will not include it
 * before that moment, which is how a scheduled circle is "cleared now, executes
 * Friday". Returns the tx reference.
 */
export async function accountSettle(
  network: TempoNetwork,
  key: Hex,
  calls: TempoCall[],
  schedule?: { validAfter?: number; validBefore?: number }
): Promise<string> {
  const client = clientFor(network, key);
  const sponsored = accountSponsors(network);
  const result = await (client as unknown as {
    sendTransactionSync: (args: unknown) => Promise<unknown>;
  }).sendTransactionSync({
    calls: calls.map((c) => ({ to: c.to, data: c.data })),
    ...(sponsored ? { feePayer: true } : {}),
    ...(schedule?.validAfter ? { validAfter: BigInt(schedule.validAfter) } : {}),
    ...(schedule?.validBefore ? { validBefore: BigInt(schedule.validBefore) } : {}),
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

/* ------------------------- Model C: multi-party clearing ------------------------- */

/**
 * Sign EIP-712 typed data with the account's key. Used for the two things a
 * net debtor signs in a trustless clearing round — the EIP-2612 permit and the
 * Authorization — neither of which touches the chain or costs gas.
 */
export async function signTypedDataWithKey(
  key: Hex,
  typedData: Parameters<ReturnType<typeof privateKeyToAccount>["signTypedData"]>[0]
): Promise<Hex> {
  const account = privateKeyToAccount(key);
  return (await account.signTypedData(typedData)) as Hex;
}

/** The token-side context an EIP-2612 permit needs: domain name, version, owner nonce. */
export interface PermitReadContext {
  tokenName: string;
  version: string;
  nonce: bigint;
}

/**
 * Read a token's EIP-2612 context for `owner`. Prefers EIP-5267 `eip712Domain()`
 * for the exact name/version; falls back to `name()` + version "1".
 */
export async function readPermitContext(
  network: TempoNetwork,
  key: Hex,
  token: Hex,
  owner: Hex
): Promise<PermitReadContext> {
  const client = clientFor(network, key) as unknown as {
    readContract: (args: unknown) => Promise<unknown>;
  };
  return permitContextFrom(client, token, owner);
}

/**
 * Keyless variant for the connect-wallet path: the payer signs with their own
 * wallet, so there is no local key — read the permit context over a plain public
 * client instead.
 */
export async function readPermitContextPublic(
  network: TempoNetwork,
  token: Hex,
  owner: Hex
): Promise<PermitReadContext> {
  const client = createPublicClient({
    chain: chainForNetwork(network),
    transport: viemHttp(network.rpcUrl, { retryCount: 6, retryDelay: 400 }),
  }) as unknown as { readContract: (args: unknown) => Promise<unknown> };
  return permitContextFrom(client, token, owner);
}

async function permitContextFrom(
  client: { readContract: (args: unknown) => Promise<unknown> },
  token: Hex,
  owner: Hex
): Promise<PermitReadContext> {
  const nonce = (await client.readContract({
    address: token,
    abi: [
      {
        type: "function",
        name: "nonces",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "nonces",
    args: [owner],
  })) as bigint;

  let tokenName = "";
  let version = "1";
  try {
    const domain = (await client.readContract({
      address: token,
      abi: [
        {
          type: "function",
          name: "eip712Domain",
          stateMutability: "view",
          inputs: [],
          outputs: [
            { name: "fields", type: "bytes1" },
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
            { name: "salt", type: "bytes32" },
            { name: "extensions", type: "uint256[]" },
          ],
        },
      ],
      functionName: "eip712Domain",
    })) as unknown[];
    tokenName = String(domain[1]);
    version = String(domain[2]) || "1";
  } catch {
    tokenName = (await client.readContract({
      address: token,
      abi: [
        {
          type: "function",
          name: "name",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "string" }],
        },
      ],
      functionName: "name",
    })) as string;
  }

  return { tokenName, version, nonce };
}

/**
 * Send a single arbitrary contract call from the account — used by the organiser
 * to submit the atomic `clear()`.
 *
 * This goes out as a plain self-paid transaction (not the sponsored 0x76 relay
 * path): the organiser pays the small fee, which Tempo cascades to pathUSD for a
 * non-TIP-20 contract, so no gas token is held. The payers never send a
 * transaction at all — they only signed — so the "nobody pays to play" property
 * is preserved where it matters. Returns the transaction hash.
 */
export async function accountSendCall(
  network: TempoNetwork,
  key: Hex,
  to: Hex,
  data: Hex
): Promise<string> {
  const chain = chainForNetwork(network);
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport: viemHttp(network.rpcUrl) });
  const pub = createPublicClient({ chain, transport: viemHttp(network.rpcUrl, { retryCount: 6, retryDelay: 400 }) });
  const hash = await wallet.sendTransaction({ to, data } as never);
  // Surface an on-chain revert as a thrown error, so callers don't record a
  // settlement that didn't happen.
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("The clearing transaction reverted on-chain — nothing moved.");
  return hash;
}
