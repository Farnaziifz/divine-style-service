import { IncentiveValueType } from '@prisma/client';
import {
  calculateCouponRewardAmount,
  extractCategoryIdFromConfig,
  extractMinAmountFromConfig,
  matchesCategoryPurchaseTrigger,
  matchesFirstPurchaseTrigger,
  matchesPurchaseAboveAmountTrigger,
  matchesReferralTrigger,
  qualifiesCouponWindow,
} from './coupon-rules';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const baseWindow = {
  isActive: true,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-31T23:59:59.000Z'),
  targetSegmentId: null,
  customerCurrentSegmentId: null,
  now: NOW,
};

describe('qualifiesCouponWindow (shared prerequisite for every trigger type)', () => {
  it('qualifies when everything is valid', () => {
    expect(qualifiesCouponWindow(baseWindow)).toEqual({ qualifies: true });
  });

  it('rejects an inactive incentive', () => {
    expect(qualifiesCouponWindow({ ...baseWindow, isActive: false })).toEqual({
      qualifies: false,
      reason: 'INACTIVE',
    });
  });

  it('rejects a coupon that has not started yet', () => {
    const result = qualifiesCouponWindow({
      ...baseWindow,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(result).toEqual({ qualifies: false, reason: 'NOT_STARTED' });
  });

  it('rejects an expired coupon', () => {
    const result = qualifiesCouponWindow({
      ...baseWindow,
      endsAt: new Date('2026-01-31T23:59:59.000Z'),
    });
    expect(result).toEqual({ qualifies: false, reason: 'EXPIRED' });
  });

  it('rejects when the customer is in the wrong segment', () => {
    const result = qualifiesCouponWindow({
      ...baseWindow,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-regular',
    });
    expect(result).toEqual({ qualifies: false, reason: 'WRONG_SEGMENT' });
  });

  it('qualifies when the customer is in the required segment', () => {
    const result = qualifiesCouponWindow({
      ...baseWindow,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-vip',
    });
    expect(result).toEqual({ qualifies: true });
  });
});

describe('extractMinAmountFromConfig / extractCategoryIdFromConfig', () => {
  it('extracts a valid minAmount', () => {
    expect(extractMinAmountFromConfig({ minAmount: 500000 })).toBe(500000);
  });

  it('returns null for a missing or malformed minAmount', () => {
    expect(extractMinAmountFromConfig({})).toBeNull();
    expect(extractMinAmountFromConfig(null)).toBeNull();
    expect(
      extractMinAmountFromConfig({ minAmount: 'not-a-number' }),
    ).toBeNull();
  });

  it('extracts a valid categoryId', () => {
    expect(extractCategoryIdFromConfig({ categoryId: 'cat-1' })).toBe('cat-1');
  });

  it('returns null for a missing or malformed categoryId', () => {
    expect(extractCategoryIdFromConfig({})).toBeNull();
    expect(extractCategoryIdFromConfig({ categoryId: '' })).toBeNull();
    expect(extractCategoryIdFromConfig({ categoryId: 42 })).toBeNull();
  });
});

describe('trigger: FIRST_PURCHASE', () => {
  it('matches when this is the customer’s first paid order', () => {
    expect(matchesFirstPurchaseTrigger({ isFirstPaidOrder: true })).toBe(true);
  });

  it('does not match when the customer has ordered before', () => {
    expect(matchesFirstPurchaseTrigger({ isFirstPaidOrder: false })).toBe(
      false,
    );
  });
});

describe('trigger: PURCHASE_ABOVE_AMOUNT', () => {
  it('matches when the order is at or above the configured minAmount', () => {
    expect(
      matchesPurchaseAboveAmountTrigger({
        orderAmount: 1_000_000,
        triggerConfig: { minAmount: 1_000_000 },
      }),
    ).toBe(true);
    expect(
      matchesPurchaseAboveAmountTrigger({
        orderAmount: 1_500_000,
        triggerConfig: { minAmount: 1_000_000 },
      }),
    ).toBe(true);
  });

  it('does not match when the order is below the configured minAmount', () => {
    expect(
      matchesPurchaseAboveAmountTrigger({
        orderAmount: 500_000,
        triggerConfig: { minAmount: 1_000_000 },
      }),
    ).toBe(false);
  });

  it('does not match when triggerConfig is missing/malformed', () => {
    expect(
      matchesPurchaseAboveAmountTrigger({
        orderAmount: 5_000_000,
        triggerConfig: {},
      }),
    ).toBe(false);
  });
});

describe('trigger: CATEGORY_PURCHASE', () => {
  it('matches when the order contains an item from the configured category', () => {
    expect(
      matchesCategoryPurchaseTrigger({
        purchasedCategoryIds: ['cat-1', 'cat-2'],
        triggerConfig: { categoryId: 'cat-2' },
      }),
    ).toBe(true);
  });

  it('does not match when the order has no item from the configured category', () => {
    expect(
      matchesCategoryPurchaseTrigger({
        purchasedCategoryIds: ['cat-1', 'cat-3'],
        triggerConfig: { categoryId: 'cat-2' },
      }),
    ).toBe(false);
  });

  it('does not match when triggerConfig is missing/malformed', () => {
    expect(
      matchesCategoryPurchaseTrigger({
        purchasedCategoryIds: ['cat-1'],
        triggerConfig: {},
      }),
    ).toBe(false);
  });
});

describe('trigger: REFERRAL', () => {
  it('always matches — the event itself is the confirmation', () => {
    expect(matchesReferralTrigger()).toBe(true);
  });
});

describe('calculateCouponRewardAmount', () => {
  it('computes a fixed reward independent of any order (REFERRAL case)', () => {
    const amount = calculateCouponRewardAmount({
      rewardValueType: IncentiveValueType.FIXED_AMOUNT,
      rewardValue: 50_000,
    });
    expect(amount).toBe(50_000);
  });

  it('clamps a fixed reward to the triggering order amount when one exists', () => {
    const amount = calculateCouponRewardAmount({
      rewardValueType: IncentiveValueType.FIXED_AMOUNT,
      rewardValue: 5_000_000,
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(1_000_000);
  });

  it('computes a percentage reward against the triggering order amount', () => {
    const amount = calculateCouponRewardAmount({
      rewardValueType: IncentiveValueType.PERCENTAGE,
      rewardValue: 10,
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(100_000);
  });

  it('returns zero for a percentage reward with no order to compute it against', () => {
    const amount = calculateCouponRewardAmount({
      rewardValueType: IncentiveValueType.PERCENTAGE,
      rewardValue: 10,
    });
    expect(amount).toBe(0);
  });
});
