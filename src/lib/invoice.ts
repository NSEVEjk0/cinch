/**
 * Invoice pricing — due dates and early-pay discounts.
 *
 * An obligation can carry invoice terms: a due date and an optional early-pay
 * discount ("2% off if cleared by the 10th"). These are the proto-invoice
 * fields a real accounts-payable flow needs, and they feed scheduled netting —
 * a standing circle clears while the discount window is still open.
 *
 * Money stays bigint in the token's smallest unit. The discount is applied as a
 * basis-point reduction, floored to the unit, so no rounding ever creates value.
 */

import type { Obligation } from "./types";

/** Parse an ISO date (date-only or full) to a Date, or null if absent/invalid. */
function asDate(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T23:59:59` : iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Is the early-pay discount still live as of `asOf`? */
export function discountActive(o: Obligation, asOf: Date = new Date()): boolean {
  if (!o.earlyPayDiscountBps || o.earlyPayDiscountBps <= 0) return false;
  const by = asDate(o.earlyPayBy);
  if (!by) return false;
  return asOf.getTime() <= by.getTime();
}

/** Is this obligation past its due date and still unpaid as of `asOf`? */
export function isOverdue(o: Obligation, asOf: Date = new Date()): boolean {
  const due = asDate(o.dueDate);
  if (!due) return false;
  return asOf.getTime() > due.getTime();
}

/**
 * What the debtor actually owes right now: the face amount, less the early-pay
 * discount if the window is still open. A plain obligation (no terms) is
 * unchanged.
 */
export function effectiveAmount(o: Obligation, asOf: Date = new Date()): bigint {
  if (!discountActive(o, asOf)) return o.amount;
  const bps = BigInt(Math.round(o.earlyPayDiscountBps!));
  const discount = (o.amount * bps) / 10_000n;
  return o.amount - discount;
}

/** The discount amount currently applied (0 when inactive). */
export function discountAmount(o: Obligation, asOf: Date = new Date()): bigint {
  return o.amount - effectiveAmount(o, asOf);
}

/**
 * Price a list of obligations for clearing: each gets its effective amount as
 * of `asOf`, so the netting engine (which reads `amount`) nets the real,
 * post-discount sums. The original face amount is preserved on `.amount` of the
 * stored obligation — this returns copies for the engine only.
 */
export function applyInvoicePricing(
  obligations: Obligation[],
  asOf: Date = new Date()
): Obligation[] {
  return obligations.map((o) => {
    const eff = effectiveAmount(o, asOf);
    return eff === o.amount ? o : { ...o, amount: eff };
  });
}

/** Total discounts currently live across a set of obligations. */
export function totalActiveDiscount(
  obligations: Obligation[],
  asOf: Date = new Date()
): bigint {
  return obligations.reduce((sum, o) => sum + discountAmount(o, asOf), 0n);
}
