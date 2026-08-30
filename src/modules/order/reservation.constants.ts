// How long a stock reservation (cart item, or a pending-payment order) is
// held before the background sweeper releases it back to available stock.
// 10 minutes gives slow bank-OTP flows and slow connections real headroom;
// the release-vs-confirm race is also closed structurally (see
// OrderReservationService.orderLockKey / confirmPaidAfterRelease), so this
// value is a stock-availability tradeoff, not the only safety net anymore.
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

/**
 * Advisory-lock key for serializing everything that can settle a single
 * order's PENDING state: the sweeper's release and both gateway callbacks
 * must acquire this same lock (keyed by orderId, not by trackId/authority)
 * before touching the order, so a release and a same-order confirm can never
 * interleave.
 */
export function orderSettleLockKey(orderId: string): string {
  return `order-settle:${orderId}`;
}
