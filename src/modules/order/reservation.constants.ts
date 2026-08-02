// How long a stock reservation (cart item, or a pending-payment order) is
// held before the background sweeper releases it back to available stock.
export const RESERVATION_TTL_MS = 5 * 60 * 1000;
