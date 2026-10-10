/**
 * Per-member claim codes.
 *
 * When the creator adds a member, Cinch mints a secret code and keeps only its
 * SHA-256 hash on the (shared, world-readable) circle. The raw code travels only
 * in that member's private invite link — in the URL *fragment*, which browsers
 * never send to the server. Opening the link and proving the code (hash matches)
 * is what lets a wallet bind to that member slot, so a claim is provably from
 * someone the creator handed the link to — not just an address the creator typed.
 *
 * Crypto discipline mirrors pinna/src/lib/cloud.ts: CSPRNG for the code,
 * SHA-256 for the hash. Never Math.random().
 */

const CODE_BYTES = 16;

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh random claim code (unguessable bearer secret). */
export function randomCode(): string {
  const bytes = new Uint8Array(CODE_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Mint a member's secret code + the hash to store on the circle. */
export async function generateClaim(): Promise<{ code: string; tokenHash: string }> {
  const code = randomCode();
  return { code, tokenHash: await sha256Hex(code) };
}

/** True iff `code` is the preimage of `tokenHash`. */
export async function verifyClaim(code: string, tokenHash: string): Promise<boolean> {
  if (!code || !tokenHash) return false;
  return (await sha256Hex(code)) === tokenHash;
}

/** The private invite link for a member — code lives in the fragment only. */
export function buildClaimLink(origin: string, circleId: string, slotId: string, code: string): string {
  return `${origin}/circle/${circleId}#m=${slotId}.${code}`;
}

/** Parse a `#m=<slotId>.<code>` fragment, or null if it isn't one. */
export function parseClaimFragment(hash: string): { slotId: string; code: string } | null {
  const m = hash.match(/[#&]m=([^.&]+)\.([^&]+)/);
  if (!m) return null;
  return { slotId: decodeURIComponent(m[1]), code: decodeURIComponent(m[2]) };
}

/* ----------------------- creator-side code vault ------------------------ */
/*
 * The raw codes live only on the creator's device, so a member's invite link
 * can be re-copied later without ever putting the secret into the shared circle
 * payload. One bucket per circle, keyed by slot id. Only the SHA-256 hash of a
 * code ever travels on the circle itself (see Party.claimTokenHash).
 */

const VAULT_KEY = "cinch:claim-codes";

type Vault = Record<string, Record<string, string>>; // circleId -> slotId -> code

function readVault(): Vault {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(VAULT_KEY) || "{}") as Vault;
  } catch {
    return {};
  }
}

function writeVault(v: Vault): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  } catch {
    /* storage full or unavailable — the link was still copyable at mint time */
  }
}

/** Keep a member's raw code on this device so the creator can re-copy the link. */
export function rememberCode(circleId: string, slotId: string, code: string): void {
  const v = readVault();
  (v[circleId] ??= {})[slotId] = code;
  writeVault(v);
}

/** The raw code for a member slot, if this device minted it. */
export function recallCode(circleId: string, slotId: string): string | null {
  return readVault()[circleId]?.[slotId] ?? null;
}
