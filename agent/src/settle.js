/**
 * Cinch Agent — shared settlement under standing policy.
 *
 * Given a circle's netting output and the stored standing policies for its
 * participants, this builds the clearWithStanding call and submits it
 * atomically. Used by both the watcher loop (tick) and the demo.
 */

import { createPublicClient, http as viemHttp, encodeFunctionData, keccak256, encodeAbiParameters } from "viem";
import { tempoModerato } from "viem/chains";
import { createClient as createTempoClient, http as tempoHttp, Account } from "viem/tempo";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const RPC_URL = process.env.CINCH_RPC ?? "https://rpc.moderato.tempo.xyz";
const CLEARING_ADDRESS =
  process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS ??
  (() => {
    const m = readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^NEXT_PUBLIC_CINCH_CLEARING_ADDRESS=(.+)$/m);
    return m ? m[1].trim() : "0x94aa11d3f8b4b4f4b9058b7e671eb09a2bb93d5f";
  })();
const PATH_USD = "0x20c0000000000000000000000000000000000000";
const CLEARING_ABI = JSON.parse(readFileSync(path.join(ROOT, "src/lib/clearingArtifact.json"), "utf8")).abi;

const pub = createPublicClient({ chain: tempoModerato, transport: viemHttp(RPC_URL) });

export function encodeMemo(references) {
  const joined = references.slice().sort().join("\n");
  return keccak256(new TextEncoder().encode(`cinch:${joined}`));
}

export function buildLegs(transfers) {
  return transfers.map((t) => ({
    token: PATH_USD,
    from: t.from,
    to: t.to,
    amount: BigInt(Math.round(Number(t.amount) * 1e6)),
    memo: encodeMemo(t.references ?? [t.reference ?? "service"]),
  }));
}

export function roundContentId(circleId, legs) {
  const legsContent = keccak256(encodeAbiParameters(
    [{ name: "legs", type: "tuple[]", components: [
      { name: "token", type: "address" }, { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "amount", type: "uint256" }, { name: "memo", type: "bytes32" },
    ] }],
    [legs]
  ));
  return keccak256(encodeAbiParameters(
    [{ name: "circleId", type: "bytes32" }, { name: "legsContent", type: "bytes32" }],
    [circleId, legsContent]
  ));
}

export function standingPolicyHash(policy) {
  return keccak256(encodeAbiParameters(
    [{ name: "token", type: "address" }, { name: "maxNetDebitPerRound", type: "uint256" }, { name: "validUntil", type: "uint256" }],
    [policy.token, policy.maxNetDebitPerRound, policy.validUntil]
  ));
}

export function standingTypedData(chainId, verifyingContract, circleId, policyHash) {
  return {
    domain: { name: "Cinch", version: "1", chainId, verifyingContract },
    types: { StandingAuthorization: [
      { name: "circleId", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
    ] },
    primaryType: "StandingAuthorization",
    message: { circleId, policyHash },
  };
}

export function permitTypedData(chainId, token, ctx, owner, spender, value, deadline) {
  return {
    domain: { name: ctx.tokenName, version: ctx.version, chainId, verifyingContract: token },
    types: { Permit: [
      { name: "owner", type: "address" }, { name: "spender", type: "address" },
      { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    ] },
    primaryType: "Permit",
    message: { owner, spender, value, nonce: ctx.nonce, deadline },
  };
}

export function splitSignature(sig) {
  const raw = sig.slice(2);
  const r = "0x" + raw.slice(0, 64);
  const s = "0x" + raw.slice(64, 128);
  let v = parseInt(raw.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

export async function readPermitContext(owner) {
  const nonce = await pub.readContract({
    address: PATH_USD,
    abi: [{ type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "nonces",
    args: [owner],
  });
  let tokenName = "PathUSD";
  let version = "1";
  try {
    const domain = await pub.readContract({
      address: PATH_USD,
      abi: [{ type: "function", name: "eip712Domain", stateMutability: "view", inputs: [], outputs: [
        { name: "fields", type: "bytes1" }, { name: "name", type: "string" }, { name: "version", type: "string" },
        { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }, { name: "salt", type: "bytes32" },
        { name: "extensions", type: "uint256[]" },
      ] }],
      functionName: "eip712Domain",
    });
    tokenName = String(domain[1]);
    version = String(domain[2]) || "1";
  } catch {
    try {
      tokenName = String(await pub.readContract({
        address: PATH_USD,
        abi: [{ type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] }],
        functionName: "name",
      }));
    } catch {}
  }
  return { tokenName, version, nonce };
}

function encodeClearWithStandingCall(roundId, legs, permits, standingAuths, auths) {
  return encodeFunctionData({
    abi: CLEARING_ABI,
    functionName: "clearWithStanding",
    args: [roundId, legs, permits, standingAuths, auths],
  });
}

/**
 * Settle a round under standing policy.
 *
 * @param {object} opts
 * @param {string} opts.circleId - hex circleId (EIP-712 binding)
 * @param {Array}  opts.legs    - built legs
 * @param {Array}  opts.permits  - EIP-2612 permits (one per payer)
 * @param {Array}  opts.standingAuths - standing authorizations (one per payer)
 * @param {string} opts.organiserKey - private key of the agent (pays gas)
 * @returns {Promise<{txHash: string, status: string}>}
 */
export async function submitClearWithStanding({ circleId, legs, permits, standingAuths, organiserKey }) {
  const roundId = roundContentId(circleId, legs);
  const data = encodeClearWithStandingCall(roundId, legs, permits, standingAuths, []);
  const wallet = createTempoClient({
    account: Account.fromSecp256k1(organiserKey),
    chain: tempoModerato,
    transport: tempoHttp(RPC_URL),
  });
  const hash = await wallet.sendTransaction({ to: CLEARING_ADDRESS, data });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("settlement reverted");
  return { txHash: hash, status: "success", roundId };
}

/**
 * Prepare a settlement from netting output + stored policies.
 *
 * Returns either { ok: true, legs, permits, standingAuths, roundId } or
 * { ok: false, reason } — reason explains why the agent can't settle yet.
 */
export function prepareSettlement({ circleId, transfers, policies }) {
  if (!transfers || transfers.length === 0) {
    return { ok: false, reason: "no transfers" };
  }

  const legs = buildLegs(transfers);

  // Distinct payers and their total debit per payer.
  const debitByPayer = new Map();
  for (const t of transfers) {
    const key = t.from.toLowerCase();
    debitByPayer.set(key, (debitByPayer.get(key) ?? 0n) + BigInt(Math.round(Number(t.amount) * 1e6)));
  }

  const permits = [];
  const standingAuths = [];
  const missing = [];

  for (const [payer, debit] of debitByPayer) {
    const pol = policies[payer];
    if (!pol) {
      missing.push(payer);
      continue;
    }
    // Permit must cover the debit.
    const permitValue = BigInt(pol.permit.value ?? 0);
    if (permitValue < debit) {
      missing.push(`${payer} (permit ${permitValue} < debit ${debit})`);
      continue;
    }
    permits.push(pol.permit);
    standingAuths.push(pol.standingAuth);
  }

  if (missing.length > 0) {
    return { ok: false, reason: `missing/inadequate standing policy for ${missing.join(", ")}` };
  }

  return {
    ok: true,
    legs,
    permits,
    standingAuths,
    roundId: roundContentId(circleId, legs),
  };
}
