import { describe, it, expect, beforeAll } from "vitest";
import {
  buildLegs,
  roundIdFor,
  legsHashFor,
  authorizationTypedData,
  permitTypedData,
  splitSignature,
  encodeClearCall,
  type Permit,
} from "@/lib/clearing";
import { signTypedDataWithKey, readPermitContext, accountSendCall } from "@/lib/cinchAccount";
import { clearRoom } from "@/lib/netting";
import { PATH_USD, MODERATO } from "@/lib/tempo";
import type { Obligation } from "@/lib/types";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createClient, http as tempoHttp, Actions } from "viem/tempo";
import { tempoModerato } from "viem/chains";

// End-to-end walkthrough through the RUNNING app: authorization collection goes
// over the real /api/round + Turso, settlement over the live contract.
// Run with: WALKTHROUGH=1 CINCH_ONCHAIN=1 npx vitest run test/walkthrough.onchain.test.ts
const RUN = process.env.WALKTHROUGH === "1" && process.env.CINCH_ONCHAIN === "1";
const CLEARING = (process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS ?? "") as Hex;
const BASE = process.env.WALKTHROUGH_BASE ?? "http://localhost:3000";
const d = RUN && CLEARING ? describe : describe.skip;

const pub = createPublicClient({ chain: tempoModerato, transport: http(MODERATO.rpcUrl, { retryCount: 8, retryDelay: 500 }) });

async function faucet(address: Hex) {
  const client = createClient({ chain: tempoModerato, transport: tempoHttp(MODERATO.rpcUrl, { retryCount: 8, retryDelay: 500 }) });
  await Actions.faucet.fundSync(client, { account: address });
}
async function balance(owner: Hex): Promise<bigint> {
  return (await pub.readContract({
    address: PATH_USD.address,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

d("walkthrough — collect over the app, settle on-chain", () => {
  const aKey = generatePrivateKey();
  const bKey = generatePrivateKey();
  const cKey = generatePrivateKey();
  const A = privateKeyToAccount(aKey).address;
  const B = privateKeyToAccount(bKey).address;
  const C = privateKeyToAccount(cKey).address;

  beforeAll(async () => {
    await faucet(A); await faucet(B); await faucet(C);
  }, 180_000);

  it("each payer posts authorization to /api/round; organiser clears", async () => {
    // 1. Netting (the same engine the UI uses).
    const obligations: Obligation[] = [
      { id: "o1", debtor: A, creditor: C, amount: 20_000_000n, token: PATH_USD, reference: "trip-A" },
      { id: "o2", debtor: B, creditor: C, amount: 15_000_000n, token: PATH_USD, reference: "trip-B" },
    ];
    const legs = buildLegs(clearRoom(obligations, { mode: "min-transfers" }).transfers);
    const roundId = roundIdFor("walkthrough-" + Date.now(), legs);
    const legsHash = legsHashFor(roundId, legs);

    // 2. Each payer signs + posts to the running app's round store (as the browser does).
    for (const [payer, key] of [[A, aKey], [B, bKey]] as const) {
      const debit = legs.filter((l) => l.from.toLowerCase() === payer.toLowerCase()).reduce((s, l) => s + l.amount, 0n);
      const ctx = await readPermitContext(MODERATO, key, PATH_USD.address, payer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const { v, r, s } = splitSignature(await signTypedDataWithKey(key, permitTypedData(MODERATO, PATH_USD.address, ctx, payer, CLEARING, debit, deadline)));
      const auth = await signTypedDataWithKey(key, authorizationTypedData(MODERATO, CLEARING, roundId, legsHash));
      const payload = { payer, auth, permits: [{ token: PATH_USD.address, owner: payer, value: debit.toString(), deadline: deadline.toString(), v, r, s }] };
      const res = await fetch(`${BASE}/api/round`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId, payer, payload: JSON.stringify(payload) }),
      });
      expect(res.ok, `POST /api/round for ${payer} (Turso configured?)`).toBe(true);
    }

    // 3. Organiser reads them back from the app — both payers present.
    const got = await fetch(`${BASE}/api/round?roundId=${encodeURIComponent(roundId)}`, { cache: "no-store" });
    expect(got.ok).toBe(true);
    const body = (await got.json()) as { authorizations: { payload: string }[] };
    expect(body.authorizations.length).toBe(2);
    const stored = body.authorizations.map((x) => JSON.parse(x.payload) as { auth: Hex; permits: { token: Hex; owner: Hex; value: string; deadline: string; v: number; r: Hex; s: Hex }[] });

    // 4. Assemble + submit the single atomic clear().
    const permits: Permit[] = [];
    const auths: Hex[] = [];
    for (const a of stored) {
      auths.push(a.auth);
      for (const p of a.permits) permits.push({ token: p.token, owner: p.owner, value: BigInt(p.value), deadline: BigInt(p.deadline), v: p.v, r: p.r, s: p.s });
    }
    const beforeA = await balance(A), beforeB = await balance(B);
    const ref = await accountSendCall(MODERATO, cKey, CLEARING, encodeClearCall(roundId, legs, permits, auths));
    const receipt = await pub.waitForTransactionReceipt({ hash: ref as Hex, timeout: 60_000 });
    expect(receipt.status).toBe("success");
    expect(beforeA - (await balance(A))).toBe(20_000_000n);
    expect(beforeB - (await balance(B))).toBe(15_000_000n);
  }, 180_000);
});
