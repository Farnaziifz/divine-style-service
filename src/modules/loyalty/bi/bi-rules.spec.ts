import {
  computeChurnRatePercent,
  computeLoyaltyRatePercent,
  isPromisingCustomer,
  tally,
} from './bi-rules';

describe('computeChurnRatePercent', () => {
  it('computes the percentage of at_risk + lost out of total', () => {
    expect(
      computeChurnRatePercent({
        atRiskCount: 10,
        lostCount: 5,
        totalCustomers: 100,
      }),
    ).toBe(15);
  });

  it('rounds to 2 decimal places', () => {
    expect(
      computeChurnRatePercent({
        atRiskCount: 1,
        lostCount: 1,
        totalCustomers: 3,
      }),
    ).toBe(66.67);
  });

  it('returns 0 when there are no customers (avoids divide-by-zero)', () => {
    expect(
      computeChurnRatePercent({
        atRiskCount: 0,
        lostCount: 0,
        totalCustomers: 0,
      }),
    ).toBe(0);
  });

  it('returns 100 when every customer is at_risk or lost', () => {
    expect(
      computeChurnRatePercent({
        atRiskCount: 4,
        lostCount: 6,
        totalCustomers: 10,
      }),
    ).toBe(100);
  });
});

describe('computeLoyaltyRatePercent', () => {
  it('computes the percentage of vip customers out of total', () => {
    expect(
      computeLoyaltyRatePercent({ loyalCount: 20, totalCustomers: 100 }),
    ).toBe(20);
  });

  it('rounds to 2 decimal places', () => {
    expect(
      computeLoyaltyRatePercent({ loyalCount: 1, totalCustomers: 3 }),
    ).toBe(33.33);
  });

  it('returns 0 when there are no customers', () => {
    expect(
      computeLoyaltyRatePercent({ loyalCount: 0, totalCustomers: 0 }),
    ).toBe(0);
  });
});

describe('isPromisingCustomer', () => {
  it('is never promising if already vip', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'vip',
        latestFrequency: 10,
        previousFrequency: 5,
      }),
    ).toBe(false);
  });

  it('is not promising without a previous snapshot to compare against', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'regular',
        latestFrequency: 3,
        previousFrequency: null,
      }),
    ).toBe(false);
  });

  it('is promising when frequency increased since the last snapshot', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'regular',
        latestFrequency: 4,
        previousFrequency: 2,
      }),
    ).toBe(true);
  });

  it('is not promising when frequency stayed flat', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'regular',
        latestFrequency: 3,
        previousFrequency: 3,
      }),
    ).toBe(false);
  });

  it('is not promising when frequency dropped', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'new',
        latestFrequency: 1,
        previousFrequency: 3,
      }),
    ).toBe(false);
  });

  it('can apply to any non-vip segment, not just regular (e.g. an at_risk customer recovering)', () => {
    expect(
      isPromisingCustomer({
        segmentKey: 'at_risk',
        latestFrequency: 5,
        previousFrequency: 2,
      }),
    ).toBe(true);
  });
});

describe('tally', () => {
  it('counts occurrences of each value', () => {
    expect(
      tally(['vip', 'regular', 'vip', 'lost', 'regular', 'regular']),
    ).toEqual({
      vip: 2,
      regular: 3,
      lost: 1,
    });
  });

  it('returns an empty object for an empty list', () => {
    expect(tally([])).toEqual({});
  });
});
