import { CreditLedgerReason, IncentiveValueType } from '@prisma/client';
import {
  calculateCashbackAmount,
  computeAvailableCashback,
  qualifiesForCashback,
  resolveCashbackApplyAmount,
} from './cashback-rules';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const baseInput = {
  isActive: true,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-31T23:59:59.000Z'),
  targetSegmentId: null,
  customerCurrentSegmentId: null,
  minPurchaseAmount: null,
  orderAmount: 1_000_000,
  now: NOW,
};

describe('qualifiesForCashback', () => {
  it('qualifies when everything is valid', () => {
    expect(qualifiesForCashback(baseInput)).toEqual({ qualifies: true });
  });

  it('rejects an inactive incentive', () => {
    const result = qualifiesForCashback({ ...baseInput, isActive: false });
    expect(result).toEqual({ qualifies: false, reason: 'INACTIVE' });
  });

  it('rejects a cashback incentive that has not started yet', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(result).toEqual({ qualifies: false, reason: 'NOT_STARTED' });
  });

  it('rejects an expired cashback incentive', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      endsAt: new Date('2026-01-31T23:59:59.000Z'),
    });
    expect(result).toEqual({ qualifies: false, reason: 'EXPIRED' });
  });

  it('rejects when the customer is in the wrong segment', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-regular',
    });
    expect(result).toEqual({ qualifies: false, reason: 'WRONG_SEGMENT' });
  });

  it('rejects when the customer has no segment at all but one is required', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: null,
    });
    expect(result).toEqual({ qualifies: false, reason: 'WRONG_SEGMENT' });
  });

  it('qualifies when the customer is in the required segment', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-vip',
    });
    expect(result).toEqual({ qualifies: true });
  });

  it('rejects an order below the minimum purchase amount', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      minPurchaseAmount: 2_000_000,
      orderAmount: 1_000_000,
    });
    expect(result).toEqual({ qualifies: false, reason: 'BELOW_MINIMUM' });
  });

  it('qualifies when the order exactly equals the minimum purchase amount', () => {
    const result = qualifiesForCashback({
      ...baseInput,
      minPurchaseAmount: 1_000_000,
      orderAmount: 1_000_000,
    });
    expect(result).toEqual({ qualifies: true });
  });
});

describe('calculateCashbackAmount', () => {
  it('computes a percentage cashback', () => {
    const amount = calculateCashbackAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      value: 5,
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(50_000);
  });

  it('computes a fixed-amount cashback', () => {
    const amount = calculateCashbackAmount({
      valueType: IncentiveValueType.FIXED_AMOUNT,
      value: 30_000,
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(30_000);
  });

  it('clamps a fixed cashback larger than the order to the order amount', () => {
    const amount = calculateCashbackAmount({
      valueType: IncentiveValueType.FIXED_AMOUNT,
      value: 5_000_000,
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(1_000_000);
  });
});

describe('computeAvailableCashback (expiry logic)', () => {
  it('sums unexpired cashback grants', () => {
    const available = computeAvailableCashback(
      [
        {
          amount: 50_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: null,
        },
        {
          amount: 30_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        },
      ],
      NOW,
    );
    expect(available).toBe(80_000);
  });

  it('excludes a grant that has already expired', () => {
    const available = computeAvailableCashback(
      [
        {
          amount: 50_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: null,
        },
        {
          amount: 30_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: new Date('2026-01-01T00:00:00.000Z'), // در گذشته نسبت به NOW
        },
      ],
      NOW,
    );
    expect(available).toBe(50_000);
  });

  it('treats a grant expiring exactly now as expired (strictly greater-than required)', () => {
    const available = computeAvailableCashback(
      [{ amount: 50_000, reason: CreditLedgerReason.CASHBACK, expiresAt: NOW }],
      NOW,
    );
    expect(available).toBe(0);
  });

  it('subtracts already-used amounts from the unexpired total', () => {
    const available = computeAvailableCashback(
      [
        {
          amount: 100_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: null,
        },
        { amount: -40_000, reason: CreditLedgerReason.USED, expiresAt: null },
      ],
      NOW,
    );
    expect(available).toBe(60_000);
  });

  it('never returns a negative balance', () => {
    const available = computeAvailableCashback(
      [
        {
          amount: 20_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: null,
        },
        { amount: -20_000, reason: CreditLedgerReason.USED, expiresAt: null },
      ],
      NOW,
    );
    expect(available).toBe(0);
  });

  it('ignores ledger entries of other reasons (e.g. GIFT)', () => {
    const available = computeAvailableCashback(
      [
        { amount: 100_000, reason: CreditLedgerReason.GIFT, expiresAt: null },
        {
          amount: 20_000,
          reason: CreditLedgerReason.CASHBACK,
          expiresAt: null,
        },
      ],
      NOW,
    );
    expect(available).toBe(20_000);
  });
});

describe('resolveCashbackApplyAmount', () => {
  it('defaults to the smaller of available balance and order amount', () => {
    expect(
      resolveCashbackApplyAmount({
        available: 200_000,
        orderAmount: 1_000_000,
      }),
    ).toBe(200_000);
    expect(
      resolveCashbackApplyAmount({
        available: 2_000_000,
        orderAmount: 1_000_000,
      }),
    ).toBe(1_000_000);
  });

  it('honors an explicit requested amount within bounds', () => {
    expect(
      resolveCashbackApplyAmount({
        available: 200_000,
        orderAmount: 1_000_000,
        requestedAmount: 50_000,
      }),
    ).toBe(50_000);
  });

  it('clamps a requested amount above the available balance', () => {
    expect(
      resolveCashbackApplyAmount({
        available: 200_000,
        orderAmount: 1_000_000,
        requestedAmount: 500_000,
      }),
    ).toBe(200_000);
  });

  it('clamps a requested amount above the order amount', () => {
    expect(
      resolveCashbackApplyAmount({
        available: 2_000_000,
        orderAmount: 300_000,
        requestedAmount: 1_000_000,
      }),
    ).toBe(300_000);
  });

  it('returns zero when there is no available balance', () => {
    expect(
      resolveCashbackApplyAmount({ available: 0, orderAmount: 1_000_000 }),
    ).toBe(0);
  });
});
