/**
 * Cinch Agent — scripted demo commerce.
 *
 * Creates a small circle of agents, funds them from the Tempo faucet, has them
 * deliver services to each other (billing on-chain), signs standing policies
 * and permits, and stores them in the shared store. The watcher loop then
 * settles the round autonomously via clearWithStanding.
 */

import { createPublicClient, http as viemHttp, keccak256 } from "viem";
import { tempoModerato } from "viem/chains";
import { createClient as createTempoClient, http as tempoHttp, Account, Actions } from "viem/tempo";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { savePolicy, saveCircle } from "./store.js";
import {
  standingTypedData,
  standingPolicyHash,
  permitTypedData,
  splitSignature,
  readPermitContext,
} from "./settle.js";

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

const pub = createPublicClient({ chain: tempoModerato, transport: viemHttp(RPC_URL) });

async function faucet(address) {
  const client = createTempoClient({ chain: tempoModerato, transport: tempoHttp(RPC_URL) });
  await Actions.faucet.fundSync(client, { account: address });
}

const SERVICES = ["data feed", "compute", "subtask", "API access", "referral", "hosting"];
const AMOUNTS = [20, 15, 10, 6, 9, 12, 25, 18]; // pathUSD micro-units

/**
 * Set up the guided demo circle: "The DAO month-end".
 *
 * A fixed, believable scenario: four contributors traded services for a
 * month. Each gets a standing policy + permit; the watcher then settles the
 * web atomically via clearWithStanding. Returns the circle + story data.
 */
export async function setupDemo() {
  // 4 demo agents, each a real funded key.
  const agents = [];
  for (let i = 0; i < 4; i++) {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    agents.push({ name: `agent-${i + 1}`, key, address: account.address });
  }
  for (const a of agents) await faucet(a.address);

  const circleId = `demo_${Date.now().toString(36)}`;
  const circleKey = keccak256(new TextEncoder().encode(`cinch:${circleId}`));

  // Fixed scenario — deterministic, believable amounts (pathUSD micro-units).
  const scenario = [
    [0, 1, 20, "data feed"],
    [1, 2, 15, "compute"],
    [2, 0, 10, "subtask"],
    [3, 1, 6, "hosting"],
    [0, 3, 9, "referral"],
    [1, 0, 12, "scheduled invoice"],
  ];

  const obligations = scenario.map(([d, c, amount, memo], i) => ({
    id: `obl-${i}`,
    debtor: agents[d].address,
    creditor: agents[c].address,
    amount: BigInt(amount * 1e6),
    token: { address: PATH_USD, symbol: "pathUSD", decimals: 6 },
    reference: `${memo}-${i}`,
    disputed: false,
  }));

  // Sign a standing policy + permit for each agent, store them.
  for (const a of agents) {
    const cap = 100_000_000n; // 100 pathUSD per round
    const policy = { token: PATH_USD, maxNetDebitPerRound: cap, validUntil: 0n };
    const policyHash = standingPolicyHash(policy);
    const td = standingTypedData(tempoModerato.id, CLEARING_ADDRESS, circleKey, policyHash);
    const sig = await privateKeyToAccount(a.key).signTypedData(td);
    const { v, r, s } = splitSignature(sig);
    const standingAuth = { circleId: circleKey, policy, v, r, s };

    const ctx = await readPermitContext(a.address);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600 * 24 * 30);
    const ptd = permitTypedData(tempoModerato.id, PATH_USD, ctx, a.address, CLEARING_ADDRESS, cap, deadline);
    const psig = await privateKeyToAccount(a.key).signTypedData(ptd);
    const p = splitSignature(psig);
    const permit = { token: PATH_USD, owner: a.address, value: cap, deadline, v: p.v, r: p.r, s: p.s };

    await savePolicy({ circleId, payer: a.address, standingAuth, permit });
  }

  // Save the circle to the shared store (the watcher picks up the latest).
  const circle = {
    id: circleId,
    name: "Demo agent circle",
    cadence: "once",
    createdAt: new Date().toISOString(),
    parties: agents.map((a) => ({ id: `m_${a.address.toLowerCase()}`, name: a.name, address: a.address })),
    obligations,
  };
  await saveCircle(circle);

  return {
    circleId,
    circleKey,
    agents,
    obligations,
    scenario: "The DAO month-end",
    bills: obligations.length,
  };
}
