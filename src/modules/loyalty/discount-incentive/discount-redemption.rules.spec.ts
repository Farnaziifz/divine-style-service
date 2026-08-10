import {
  IncentiveTierType,
  IncentiveUsageType,
  IncentiveValueType,
} from '@prisma/client';
import {
  calculateDiscountAmount,
  validateRedemption,
} from './discount-redemption.rules';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const baseInput = {
  isActive: true,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-12-31T23:59:59.000Z'),
  targetSegmentId: null,
  customerCurrentSegmentId: null,
  usageType: IncentiveUsageType.SINGLE_USE,
  alreadyUsedByCustomer: false,
  minPurchaseAmount: null,
  orderAmount: 1_000_000,
  now: NOW,
};

describe('validateRedemption', () => {
  it('passes when everything is valid', () => {
    expect(validateRedemption(baseInput)).toEqual({ valid: true });
  });

  it('rejects an inactive incentive', () => {
    const result = validateRedemption({ ...baseInput, isActive: false });
    expect(result).toEqual({ valid: false, reason: 'INACTIVE' });
  });

  it('rejects a code that has not started yet', () => {
    const result = validateRedemption({
      ...baseInput,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(result).toEqual({ valid: false, reason: 'NOT_STARTED' });
  });

  it('rejects an expired code', () => {
    const result = validateRedemption({
      ...baseInput,
      endsAt: new Date('2026-01-31T23:59:59.000Z'),
    });
    expect(result).toEqual({ valid: false, reason: 'EXPIRED' });
  });

  it('rejects when the customer is in the wrong segment', () => {
    const result = validateRedemption({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-regular',
    });
    expect(result).toEqual({ valid: false, reason: 'WRONG_SEGMENT' });
  });

  it('rejects when the customer has no segment at all but one is required', () => {
    const result = validateRedemption({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: null,
    });
    expect(result).toEqual({ valid: false, reason: 'WRONG_SEGMENT' });
  });

  it('passes when the customer is in the required segment', () => {
    const result = validateRedemption({
      ...baseInput,
      targetSegmentId: 'segment-vip',
      customerCurrentSegmentId: 'segment-vip',
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects a single-use code already used by this customer', () => {
    const result = validateRedemption({
      ...baseInput,
      usageType: IncentiveUsageType.SINGLE_USE,
      alreadyUsedByCustomer: true,
    });
    expect(result).toEqual({ valid: false, reason: 'ALREADY_USED' });
  });

  it('allows a multi-use code even if already used before', () => {
    const result = validateRedemption({
      ...baseInput,
      usageType: IncentiveUsageType.MULTI_USE,
      alreadyUsedByCustomer: true,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects an order below the minimum purchase amount', () => {
    const result = validateRedemption({
      ...baseInput,
      minPurchaseAmount: 2_000_000,
      orderAmount: 1_000_000,
    });
    expect(result).toEqual({ valid: false, reason: 'BELOW_MINIMUM' });
  });

  it('passes when the order exactly equals the minimum purchase amount', () => {
    const result = validateRedemption({
      ...baseInput,
      minPurchaseAmount: 1_000_000,
      orderAmount: 1_000_000,
    });
    expect(result).toEqual({ valid: true });
  });

  it('allows a usage-stepped code while under the tier count', () => {
    const result = validateRedemption({
      ...baseInput,
      usageType: IncentiveUsageType.MULTI_USE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      usageCount: 1,
      tierCount: 3,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects a usage-stepped code once the tier count is reached', () => {
    const result = validateRedemption({
      ...baseInput,
      usageType: IncentiveUsageType.MULTI_USE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      usageCount: 3,
      tierCount: 3,
    });
    expect(result).toEqual({ valid: false, reason: 'USAGE_LIMIT_REACHED' });
  });
});

describe('calculateDiscountAmount', () => {
  it('computes a flat percentage discount', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.FLAT,
      value: 10,
      tiers: [],
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(100_000);
  });

  it('computes a flat fixed-amount discount', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.FIXED_AMOUNT,
      tierType: IncentiveTierType.FLAT,
      value: 50_000,
      tiers: [],
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(50_000);
  });

  it('clamps a fixed-amount discount larger than the order to the order amount', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.FIXED_AMOUNT,
      tierType: IncentiveTierType.FLAT,
      value: 5_000_000,
      tiers: [],
      orderAmount: 1_000_000,
    });
    expect(amount).toBe(1_000_000);
  });

  it('applies the highest qualifying tier (flat-at-tier)', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.STEPPED,
      value: 0,
      tiers: [
        { minAmount: 0, value: 5 },
        { minAmount: 500_000, value: 10 },
        { minAmount: 1_000_000, value: 15 },
      ],
      orderAmount: 1_200_000,
    });
    // بالاترین پلهٔ واجد شرایط 1,000,000 است -> 15% روی کل مبلغ
    expect(amount).toBe(180_000);
  });

  it('does not skip ahead to a tier the order does not reach', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.STEPPED,
      value: 0,
      tiers: [
        { minAmount: 0, value: 5 },
        { minAmount: 500_000, value: 10 },
        { minAmount: 1_000_000, value: 15 },
      ],
      orderAmount: 700_000,
    });
    expect(amount).toBe(70_000);
  });

  it('returns zero when the order does not reach any tier', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.STEPPED,
      value: 0,
      tiers: [{ minAmount: 500_000, value: 10 }],
      orderAmount: 100_000,
    });
    expect(amount).toBe(0);
  });

  it('applies the first-use tier for a usage-stepped code (10/15/20)', () => {
    const tiers = [
      { usageIndex: 1, value: 10 },
      { usageIndex: 2, value: 15 },
      { usageIndex: 3, value: 20 },
    ];
    const first = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      value: 0,
      tiers,
      orderAmount: 1_000_000,
      usageCount: 0,
    });
    expect(first).toBe(100_000);

    const second = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      value: 0,
      tiers,
      orderAmount: 1_000_000,
      usageCount: 1,
    });
    expect(second).toBe(150_000);

    const third = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      value: 0,
      tiers,
      orderAmount: 1_000_000,
      usageCount: 2,
    });
    expect(third).toBe(200_000);
  });

  it('returns zero for a usage-stepped code past its last tier', () => {
    const amount = calculateDiscountAmount({
      valueType: IncentiveValueType.PERCENTAGE,
      tierType: IncentiveTierType.USAGE_STEPPED,
      value: 0,
      tiers: [{ usageIndex: 1, value: 10 }],
      orderAmount: 1_000_000,
      usageCount: 1,
    });
    expect(amount).toBe(0);
  });
});
