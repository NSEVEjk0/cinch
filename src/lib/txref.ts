/**
 * Normalise whatever a Tempo send resolves to into a transaction reference.
 *
 * A Tempo sync send returns a transaction *receipt* (an object with
 * `transactionHash`), not a bare hash. `sendCalls` returns an id or a
 * calls-status object with a `receipts[]` array. Earlier code that assumed a
 * string reported successful settlements as failures, so every send path runs
 * through here.
 */
export function resolveRefFromResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as {
      id?: string;
      hash?: string;
      transactionHash?: string;
      receipts?: { transactionHash?: string }[];
    };
    if (r.transactionHash) return r.transactionHash;
    if (r.hash) return r.hash;
    const fromReceipts = r.receipts?.find((x) => x?.transactionHash)?.transactionHash;
    if (fromReceipts) return fromReceipts;
    if (r.id) return r.id;
  }
  return "";
}
