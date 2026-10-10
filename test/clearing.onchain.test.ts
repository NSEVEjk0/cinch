import { describe, it, expect, beforeAll } from "vitest";
import {
  buildLegs,
  roundIdFor,
  legsHashFor,
  authorizationTypedData,
  permitTypedData,
  splitSignature,
  encodeClearCall,
  CLEARING_ABI,
  type Permit,
} from "@/lib/clearing";
import {
  signTypedDataWithKey,
  readPermitContext,
  accountSendCall,
} from "@/lib/cinchAccount";
import { clearRoom } from "@/lib/netting";
import { PATH_USD, MODERATO } from "@/lib/tempo";
import type { Obligation } from "@/lib/types";
import { createPublicClient, http, hashTypedData, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createClient, http as tempoHttp, Account, Actions } from "viem/tempo";
import { tempoModerato } from "viem/chains";

// Live integration against the deployed contract. Gated so `npm test` stays
// offline — run with: CINCH_ONCHAIN=1 npx vitest run test/clearing.onchain.test.ts
const RUN = process.env.CINCH_ONCHAIN === "1";
const CLEARING = (process.env.NEXT_PUBLIC_CINCH_CLEARING_ADDRESS ?? "") as Hex;
const d = RUN && CLEARING ? describe : describe.skip;

const pub = createPublicClient({
  chain: tempoModerato,
  transport: http(MODERATO.rpcUrl, { retryCount: 8, retryDelay: 500 }),
});

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

d("CinchClearing — on-chain cross-checks", () => {
  const A = privateKeyToAccount(generatePrivateKey());
  const B = privateKeyToAccount(generatePrivateKey());
  const legs = buildLegs([
    { from: A.address, to: B.address, amount: 3_000_000n, token: PATH_USD, references: ["inv-a"] },
    { from: B.address, to: A.address, amount: 1_000_000n, token: PATH_USD, references: ["inv-b"] },
  ]);
  const roundId = roundIdFor("onchain-xcheck", legs);
  const legsHash = legsHashFor(roundId, legs);

  it("TS legsHash matches the contract's computeLegsHash", async () => {
    const onchain = (await pub.readContract({
      address: CLEARING,
      abi: CLEARING_ABI,
      functionName: "computeLegsHash",
      args: [roundId, legs],
    })) as Hex;
    expect(onchain).toBe(legsHash);
  }, 60_000);

  it("TS EIP-712 digest matches the contract's authorizationDigest", async () => {
    const onchain = (await pub.readContract({
      address: CLEARING,
      abi: CLEARING_ABI,
      functionName: "authorizationDigest",
      args: [roundId, legsHash],
    })) as Hex;
    const local = hashTypedData(authorizationTypedData(MODERATO, CLEARING, roundId, legsHash));
    expect(onchain).toBe(local);
  }, 60_000);
});

d("CinchClearing — live multi-party clear()", () => {
  // A owes C 20, B owes C 15 → two distinct payers, both pay C.
  const aKey = generatePrivateKey();
  const bKey = generatePrivateKey();
  const cKey = generatePrivateKey();
  const A = privateKeyToAccount(aKey).address;
  const B = privateKeyToAccount(bKey).address;
  const C = privateKeyToAccount(cKey).address;

  beforeAll(async () => {
    // Serialize faucet calls — the public RPC rate-limits bursts.
    await faucet(A);
    await faucet(B);
    await faucet(C);
  }, 180_000);

  it("settles every payer's own funds in one atomic tx, and can't replay", async () => {
    const obligations: Obligation[] = [
      { id: "o1", debtor: A, creditor: C, amount: 20_000_000n, token: PATH_USD, reference: "trip-A" },
      { id: "o2", debtor: B, creditor: C, amount: 15_000_000n, token: PATH_USD, reference: "trip-B" },
    ];
    const result = clearRoom(obligations, { mode: "min-transfers" });
    const legs = buildLegs(result.transfers);
    const payers = new Set(legs.map((l) => l.from.toLowerCase()));
    expect(payers.size).toBe(2);

    const roundId = roundIdFor("live-demo-" + Date.now(), legs);
    const legsHash = legsHashFor(roundId, legs);

    // Each debtor signs an EIP-2612 permit + the Authorization. Nothing on-chain.
    const permits: Permit[] = [];
    const auths: Hex[] = [];
    for (const [payer, key] of [[A, aKey], [B, bKey]] as const) {
      const debit = legs.filter((l) => l.from.toLowerCase() === payer.toLowerCase()).reduce((s, l) => s + l.amount, 0n);
      const ctx = await readPermitContext(MODERATO, key, PATH_USD.address, payer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const td = permitTypedData(MODERATO, PATH_USD.address, ctx, payer, CLEARING, debit, deadline);
      const { v, r, s } = splitSignature(await signTypedDataWithKey(key, td));
      permits.push({ token: PATH_USD.address, owner: payer, value: debit, deadline, v, r, s });
      auths.push(await signTypedDataWithKey(key, authorizationTypedData(MODERATO, CLEARING, roundId, legsHash)));
    }

    const beforeA = await balance(A);
    const beforeB = await balance(B);
    const beforeC = await balance(C);

    // Organiser (C) submits the single atomic clear().
    const data = encodeClearCall(roundId, legs, permits, auths);
    const ref = await accountSendCall(MODERATO, cKey, CLEARING, data);
    expect(ref).toMatch(/^0x[0-9a-fA-F]{64}$/);
    const receipt = await pub.waitForTransactionReceipt({ hash: ref as Hex, timeout: 60_000 });
    expect(receipt.status).toBe("success");

    // Each payer's OWN funds moved, exactly as they authorized — payers pay no
    // fee (only the organiser's self-paid tx does). C receives the full netted
    // sum less the small clearing fee it paid in pathUSD.
    expect(beforeA - (await balance(A))).toBe(20_000_000n);
    expect(beforeB - (await balance(B))).toBe(15_000_000n);
    expect(await balance(C)).toBeGreaterThan(beforeC + 34_900_000n);

    // The round can't be replayed.
    await expect(accountSendCall(MODERATO, cKey, CLEARING, data)).rejects.toThrow();
  }, 180_000);
});
