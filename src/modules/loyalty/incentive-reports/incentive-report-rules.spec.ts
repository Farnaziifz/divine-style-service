import {
  computeSuccessRatePercent,
  resolveReportRange,
} from './incentive-report-rules';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('resolveReportRange', () => {
  it('defaults to the trailing 30 days ending now when nothing is given', () => {
    const { start, end } = resolveReportRange({ now: NOW });
    expect(end).toEqual(NOW);
    expect(start).toEqual(new Date('2026-05-16T12:00:00.000Z'));
  });

  it('honors explicit from/to', () => {
    const { start, end } = resolveReportRange({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      now: NOW,
    });
    expect(start).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(end).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('defaults "from" to 30 days before "to" when only "to" is given', () => {
    const { start, end } = resolveReportRange({
      to: '2026-03-01T00:00:00.000Z',
      now: NOW,
    });
    expect(end).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(start).toEqual(new Date('2026-01-30T00:00:00.000Z'));
  });

  it('period=week overrides from/to with a trailing 7-day window ending now', () => {
    const { start, end } = resolveReportRange({
      period: 'week',
      from: '2026-01-01T00:00:00.000Z',
      now: NOW,
    });
    expect(end).toEqual(NOW);
    expect(start).toEqual(new Date('2026-06-08T12:00:00.000Z'));
  });

  it('period=month uses a trailing 30-day window', () => {
    const { start, end } = resolveReportRange({ period: 'month', now: NOW });
    expect(end).toEqual(NOW);
    expect(start).toEqual(new Date('2026-05-16T12:00:00.000Z'));
  });

  it('period=year uses a trailing 365-day window', () => {
    const { start, end } = resolveReportRange({ period: 'year', now: NOW });
    expect(end).toEqual(NOW);
    expect(start).toEqual(new Date('2025-06-15T12:00:00.000Z'));
  });
});

describe('computeSuccessRatePercent', () => {
  it('computes redemptions over the eligible pool size', () => {
    expect(
      computeSuccessRatePercent({
        redemptionsCount: 25,
        eligiblePoolSize: 100,
      }),
    ).toBe(25);
  });

  it('rounds to 2 decimal places', () => {
    expect(
      computeSuccessRatePercent({ redemptionsCount: 1, eligiblePoolSize: 3 }),
    ).toBe(33.33);
  });

  it('returns 0 when the eligible pool is empty (avoids divide-by-zero)', () => {
    expect(
      computeSuccessRatePercent({ redemptionsCount: 0, eligiblePoolSize: 0 }),
    ).toBe(0);
  });

  it('can exceed 100% when redemptions outnumber the pool (e.g. multi-use codes)', () => {
    expect(
      computeSuccessRatePercent({ redemptionsCount: 15, eligiblePoolSize: 10 }),
    ).toBe(150);
  });
});
