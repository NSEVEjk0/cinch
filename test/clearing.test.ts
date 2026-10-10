import { describe, it, expect } from "vitest";
import {
  buildLegs,
  distinctPayers,
  debitByPayerToken,
  roundIdFor,
  legsHashFor,
  authorizationTypedData,
  permitTypedData,
  splitSignature,
  encodeClearCall,
  CLEARING_ABI,
  type Leg,
} from "@/lib/clearing";
import { encodeMemo } from "@/lib/batch";
import { PATH_USD, ALPHA_USD, MODERATO } from "@/lib/tempo";
import type { SettlementTransfer } from "@/lib/types";
import {
  decodeFunctionData,
  hashTypedData,
  recoverTypedDataAddress,
  isHex,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;
const C = "0x000000000000000000000000000000000000000c" as const;
const CLEARING = "0x1111111111111111111111111111111111111111" as const;

function transfer(from: Hex, to: Hex, amount: bigint, refs: string[], token = PATH_USD): SettlementTransfer {
  return { from, to, amount, token, references: refs };
}

describe("clearing — buildLegs", () => {
  it("maps transfers to legs and stamps the obligation memo", () => {
    const legs = buildLegs([transfer(A, B, 40_000_000n, ["inv-1"])]);
    expect(legs).toHaveLength(1);
    expect(legs[0].from).toBe(A);
    expect(legs[0].to).toBe(B);
    expect(legs[0].amount).toBe(40_000_000n);
    expect(legs[0].token).toBe(PATH_USD.address);
    expect(legs[0].memo).toBe(encodeMemo(["inv-1"]));
  });
});

describe("clearing — payers and debits", () => {
  const legs: Leg[] = buildLegs([
    transfer(A, C, 30_000_000n, ["x"]),
    transfer(A, B, 10_000_000n, ["y"]),
    transfer(B, C, 20_000_000n, ["z"]),
  ]);

  it("finds the distinct payers, deduplicated and in first-seen order", () => {
    expect(distinctPayers(legs)).toEqual([A, B]);
  });

  it("sums each payer's debit per token (A pays two legs)", () => {
    const d = debitByPayerToken(legs);
    expect(d.get(`${A.toLowerCase()}:${PATH_USD.address.toLowerCase()}`)).toBe(40_000_000n);
    expect(d.get(`${B.toLowerCase()}:${PATH_USD.address.toLowerCase()}`)).toBe(20_000_000n);
  });
});

describe("clearing — roundId and legsHash", () => {
  const legs = buildLegs([transfer(A, B, 10_000_000n, ["a"]), transfer(C, B, 5_000_000n, ["b"])]);

  it("roundId is stable for the same circle + legs", () => {
    expect(roundIdFor("circle-1", legs)).toBe(roundIdFor("circle-1", legs));
  });

  it("roundId changes with the circle id", () => {
    expect(roundIdFor("circle-1", legs)).not.toBe(roundIdFor("circle-2", legs));
  });

  it("roundId changes when a leg changes", () => {
    const other = buildLegs([transfer(A, B, 10_000_001n, ["a"]), transfer(C, B, 5_000_000n, ["b"])]);
    expect(roundIdFor("circle-1", legs)).not.toBe(roundIdFor("circle-1", other));
  });

  it("legsHash is bytes32, deterministic, and order-sensitive", () => {
    const round = roundIdFor("circle-1", legs);
    const h1 = legsHashFor(round, legs);
    expect(isHex(h1)).toBe(true);
    expect(h1.length).toBe(66);
    expect(legsHashFor(round, legs)).toBe(h1);
    const reordered = [legs[1], legs[0]];
    expect(legsHashFor(round, reordered)).not.toBe(h1);
  });

  it("legsHash is bound to the roundId (changing it changes the hash)", () => {
    const r1 = roundIdFor("circle-1", legs);
    const r2 = roundIdFor("circle-2", legs);
    expect(legsHashFor(r1, legs)).not.toBe(legsHashFor(r2, legs));
  });
});

describe("clearing — Authorization EIP-712", () => {
  it("round-trips: signing recovers the debtor's address", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const legs = buildLegs([transfer(account.address, B, 10_000_000n, ["r"])]);
    const roundId = roundIdFor("circle-xyz", legs);
    const legsHash = legsHashFor(roundId, legs);
    const td = authorizationTypedData(MODERATO, CLEARING, roundId, legsHash);

    const sig = await account.signTypedData(td);
    const recovered = await recoverTypedDataAddress({ ...td, signature: sig });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("digest is specific to the verifying contract", () => {
    const legs = buildLegs([transfer(A, B, 1n, ["r"])]);
    const roundId = roundIdFor("c", legs);
    const legsHash = legsHashFor(roundId, legs);
    const d1 = hashTypedData(authorizationTypedData(MODERATO, CLEARING, roundId, legsHash));
    const other = "0x2222222222222222222222222222222222222222" as const;
    const d2 = hashTypedData(authorizationTypedData(MODERATO, other, roundId, legsHash));
    expect(d1).not.toBe(d2);
  });
});

describe("clearing — Permit EIP-712", () => {
  it("round-trips to the owner and encodes nonce + value", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const ctx = { tokenName: "pathUSD", version: "1", nonce: 7n };
    const td = permitTypedData(
      MODERATO,
      ALPHA_USD.address,
      ctx,
      account.address,
      CLEARING,
      25_000_000n,
      9999999999n
    );
    expect(td.message.nonce).toBe(7n);
    expect(td.message.value).toBe(25_000_000n);
    const sig = await account.signTypedData(td);
    const recovered = await recoverTypedDataAddress({ ...td, signature: sig });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});

describe("clearing — splitSignature", () => {
  it("splits a 65-byte signature and normalises v to 27/28", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const legs = buildLegs([transfer(account.address, B, 1n, ["r"])]);
    const roundId = roundIdFor("c", legs);
    const legsHash = legsHashFor(roundId, legs);
    const sig = await account.signTypedData(authorizationTypedData(MODERATO, CLEARING, roundId, legsHash));
    const { v, r, s } = splitSignature(sig);
    expect([27, 28]).toContain(v);
    expect(r.length).toBe(66);
    expect(s.length).toBe(66);
  });
});

describe("clearing — encodeClearCall", () => {
  it("encodes a decodable clear() call with legs, permits and auths", () => {
    const legs = buildLegs([transfer(A, B, 10_000_000n, ["a"]), transfer(C, B, 5_000_000n, ["b"])]);
    const roundId = roundIdFor("circle-1", legs);
    const permits = [
      { token: PATH_USD.address, owner: A, value: 10_000_000n, deadline: 1n, v: 27, r: ("0x" + "11".repeat(32)) as Hex, s: ("0x" + "22".repeat(32)) as Hex },
    ];
    const auths = [("0x" + "ab".repeat(65)) as Hex, ("0x" + "cd".repeat(65)) as Hex];
    const data = encodeClearCall(roundId, legs, permits, auths);
    expect(isHex(data)).toBe(true);

    const decoded = decodeFunctionData({ abi: CLEARING_ABI, data });
    expect(decoded.functionName).toBe("clear");
    const [dRound, dLegs, dPermits, dAuths] = decoded.args as unknown as [Hex, Leg[], unknown[], Hex[]];
    expect(dRound).toBe(roundId);
    expect(dLegs).toHaveLength(2);
    expect(dLegs[0].amount).toBe(10_000_000n);
    expect(dPermits).toHaveLength(1);
    expect(dAuths).toEqual(auths);
  });
});
