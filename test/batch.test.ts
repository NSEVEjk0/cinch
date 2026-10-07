import { describe, it, expect } from "vitest";
import { encodeMemo, encodeTransfer, buildSettlementBatch } from "@/lib/batch";
import { decodeFunctionData, hexToString, isHex } from "viem";
import { TRANSFER_WITH_MEMO_ABI } from "@/lib/batch";
import { PATH_USD } from "@/lib/tempo";
import type { SettlementTransfer } from "@/lib/types";

const A = "0x000000000000000000000000000000000000000a" as const;
const B = "0x000000000000000000000000000000000000000b" as const;

function leg(refs: string[], amount = 40_000_000n): SettlementTransfer {
  return { from: A, to: B, amount, token: PATH_USD, references: refs };
}

describe("batch — encodeMemo", () => {
  it("stores a single short reference as readable right-padded bytes", () => {
    const memo = encodeMemo(["inv-42"]);
    expect(isHex(memo)).toBe(true);
    expect(memo.length).toBe(66); // 0x + 32 bytes
    // The leading bytes decode back to the reference (trailing NULs trimmed).
    const decoded = hexToString(memo).replace(/\u0000+$/, "");
    expect(decoded).toBe("inv-42");
  });

  it("hashes multi-reference legs to a stable digest", () => {
    const a = encodeMemo(["inv1", "inv2"]);
    const b = encodeMemo(["inv2", "inv1"]); // order-independent
    expect(a).toBe(b);
    expect(a.length).toBe(66);
  });

  it("hashes an over-long single reference", () => {
    const long = "x".repeat(40);
    const memo = encodeMemo([long]);
    expect(memo.length).toBe(66);
    // Not readable — it is a hash.
    expect(hexToString(memo).replace(/\u0000+$/, "")).not.toBe(long);
  });
});

describe("batch — encodeTransfer", () => {
  it("encodes a transferWithMemo call against the token contract", () => {
    const call = encodeTransfer(leg(["inv-42"]));
    expect(call.to).toBe(PATH_USD.address);
    expect(isHex(call.data)).toBe(true);

    const decoded = decodeFunctionData({ abi: TRANSFER_WITH_MEMO_ABI, data: call.data });
    expect(decoded.functionName).toBe("transferWithMemo");
    expect(decoded.args[0]).toBe(B);
    expect(decoded.args[1]).toBe(40_000_000n);
  });

  it("carries display meta", () => {
    const call = encodeTransfer(leg(["inv-42"]));
    expect(call.meta.recipient).toBe(B);
    expect(call.meta.amount).toBe(40_000_000n);
    expect(call.meta.tokenSymbol).toBe("pathUSD");
    expect(call.meta.references).toEqual(["inv-42"]);
  });
});

describe("batch — buildSettlementBatch", () => {
  it("builds one call per transfer, in order", () => {
    const transfers = [leg(["inv1"], 10_000_000n), leg(["inv2"], 20_000_000n)];
    const batch = buildSettlementBatch(transfers);
    expect(batch).toHaveLength(2);
    expect(batch[0].meta.amount).toBe(10_000_000n);
    expect(batch[1].meta.amount).toBe(20_000_000n);
  });

  it("produces an empty batch for a fully-cancelled circle", () => {
    expect(buildSettlementBatch([])).toHaveLength(0);
  });
});
