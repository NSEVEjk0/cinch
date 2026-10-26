/**
 * Cinch Agent — scripted demo commerce.
 *
 * Creates a small circle of agents, funds them from the Tempo faucet, has them
 * deliver services to each other (billing on-chain via the app's /api/clear
 * netting), signs standing authorizations, and settles the whole round
 * atomically via clearWithStanding — the autonomous agent path.
 */

import { createPublicClient, http as viemHttp, encodeFunctionData, keccak256, encodeAbiParameters } from "viem";
import { tempoModerato } from "viem/chains";
import { createClient as createTempoClient, http as tempoHttp, Account, Actions } from "viem/tempo";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
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

async function faucet(address) {
  const client = createTempoClient({ chain: tempoModerato, transport: tempoHttp(RPC_URL) });
  await Actions.faucet.fundSync(client, { account: address });
}

async function balance(owner) {
  return pub.readContract({
    address: PATH_USD,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "balanceOf",
    args: [owner],
  });
}

const TRANSFER_WITH_MEMO_ABI = [
  { type: "function", name: "transferWithMemo", stateMutability: "nonpayable", inputs: [
    { name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "memo", type: "bytes32" },
  ], outputs: [{ name: "", type: "bool" }] },
];

function encodeMemo(references) {
  const joined = references.slice().sort().join("\n");
  return keccak256(new TextEncoder().encode(`cinch:${joined}`));
}

function buildLegs(transfers) {
  return transfers.map((t) => ({
    token: PATH_USD,
    from: t.from,
    to: t.to,
    amount: BigInt(Math.round(Number(t.amount) * 1e6)),
    memo: encodeMemo(t.references ?? [t.reference ?? "service"]),
  }));
}

function roundContentId(circleId, legs) {
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

function standingPolicyHash(policy) {
  return keccak256(encodeAbiParameters(
    [{ name: "token", type: "address" }, { name: "maxNetDebitPerRound", type: "uint256" }, { name: "validUntil", type: "uint256" }],
    [policy.token, policy.maxNetDebitPerRound, policy.validUntil]
  ));
}

function standingTypedData(chainId, verifyingContract, circleId, policyHash) {
  return {
    domain: { name: "Cinch", version: "1", chainId, verifyingContract },
    types: { StandingAuthorization: [
      { name: "circleId", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
    ] },
    primaryType: "StandingAuthorization",
    message: { circleId, policyHash },
  };
}

function permitTypedData(chainId, token, ctx, owner, spender, value, deadline) {
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

function splitSignature(sig) {
  const raw = sig.slice(2);
  const r = "0x" + raw.slice(0, 64);
  const s = "0x" + raw.slice(64, 128);
  let v = parseInt(raw.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

async function readPermitContext(owner) {
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
    // Token doesn't implement eip712Domain — read name() directly.
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

const SERVICES = ["data feed", "compute", "subtask", "API access", "referral", "hosting"];
const AMOUNTS = [20, 15, 10, 6, 9, 12, 25, 18]; // in 1e-6 units (pathUSD micro-units)

export async function runDemo({ rounds = 1 } = {}) {
  // 4 demo agents, each a real funded key.
  const agents = [];
  for (let i = 0; i < 4; i++) {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    agents.push({ name: `agent-${i + 1}`, key, address: account.address });
  }

  // Fund them (serialize to avoid faucet rate limits).
  for (const a of agents) await faucet(a.address);

  const circleId = keccak256(new TextEncoder().encode("cinch-demo-circle")) ;

  // Standing policies: each agent allows up to 100 pathUSD net debit per round, no expiry.
  const standingAuths = [];
  for (const a of agents) {
    const policy = { token: PATH_USD, maxNetDebitPerRound: 100_000_000n, validUntil: 0n };
    const policyHash = standingPolicyHash(policy);
    const td = standingTypedData(tempoModerato.id, CLEARING_ADDRESS, circleId, policyHash);
    const sig = await privateKeyToAccount(a.key).signTypedData(td);
    const { v, r, s } = splitSignature(sig);
    standingAuths.push({ circleId, policy, v, r, s });
  }

  // Generate obligations: random services between agents.
  const obligations = [];
  for (let r = 0; r < rounds; r++) {
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      let debtor = agents[Math.floor(Math.random() * agents.length)];
      let creditor = agents[Math.floor(Math.random() * agents.length)];
      while (creditor.address === debtor.address) creditor = agents[Math.floor(Math.random() * agents.length)];
      const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
      const memo = SERVICES[Math.floor(Math.random() * SERVICES.length)];
      obligations.push({
        id: `obl-${r}-${i}`,
        debtor: debtor.address,
        creditor: creditor.address,
        amount: (amount * 1e6).toString(), // micro-units as string for the API
        token: { address: PATH_USD, symbol: "pathUSD", decimals: 6 },
        reference: `${memo}-${r}-${i}`,
        disputed: false,
      });
    }
  }

  // Compute netting via the app's engine.
  const res = await fetch("http://127.0.0.1:3000/api/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ obligations }),
  });
  if (!res.ok) throw new Error(`clear API ${res.status}`);
  const net = await res.json();

  if (net.transfers.length === 0) {
    return { bills: obligations.length, grossVolume: "0", netVolume: "0", compression: 0, cleared: null, note: "already nets to zero" };
  }

  const legs = buildLegs(net.transfers);
  const roundId = roundContentId(circleId, legs);

  // Permits: each payer grants allowance for its total debit.
  const debitByPayer = new Map();
  for (const t of net.transfers) {
    const key = t.from.toLowerCase();
    debitByPayer.set(key, (debitByPayer.get(key) ?? 0n) + BigInt(Math.round(Number(t.amount) * 1e6)));
  }

  const permits = [];
  for (const a of agents) {
    const debit = debitByPayer.get(a.address.toLowerCase());
    if (!debit) continue;
    const ctx = await readPermitContext(a.address);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const td = permitTypedData(tempoModerato.id, PATH_USD, ctx, a.address, CLEARING_ADDRESS, debit, deadline);
    const sig = await privateKeyToAccount(a.key).signTypedData(td);
    const { v, r, s } = splitSignature(sig);
    permits.push({ token: PATH_USD, owner: a.address, value: debit, deadline, v, r, s });
  }

  // Settle via clearWithStanding — NO per-round auths, standing policies only.
  const data = encodeClearWithStandingCall(roundId, legs, permits, standingAuths, []);
  const wallet = createTempoClient({ account: Account.fromSecp256k1(agents[0].key), chain: tempoModerato, transport: tempoHttp(RPC_URL) });
  const hash = await wallet.sendTransaction({ to: CLEARING_ADDRESS, data });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("settlement reverted");

  return {
    bills: obligations.length,
    grossVolume: net.stats.grossByToken?.pathUSD ?? "0",
    netVolume: net.stats.nettedByToken?.pathUSD ?? "0",
    compression: net.stats.compressionRatio ?? 0,
    cleared: { roundId, txHash: hash, transfers: net.transfers.length, legs: legs.length },
  };
}
