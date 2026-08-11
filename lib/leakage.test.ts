import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  computeRecoverableCurve,
  simulateAccumulator,
  simulateMaximizer,
} from './leakage';

describe('simulateAccumulator — abandonment ON (default)', () => {
  const rows = simulateAccumulator(DEFAULT_PARAMS);

  it('drains the card evenly across fills 1-3, then hits a cliff at fill 4', () => {
    expect(rows[0]).toMatchObject({
      fill: 1,
      costShare: 5000,
      cardPays: 5000,
      patientOOP: 0,
      cardBalanceAfter: 10000,
      deductibleRemainingAfter: 5000,
      cumulativeManufacturerCaptured: 5000,
      cumulativePatientOOP: 0,
      isCliff: false,
    });
    expect(rows[1]).toMatchObject({
      fill: 2,
      costShare: 5000,
      cardPays: 5000,
      patientOOP: 0,
      cardBalanceAfter: 5000,
      cumulativeManufacturerCaptured: 10000,
    });
    expect(rows[2]).toMatchObject({
      fill: 3,
      costShare: 5000,
      cardPays: 5000,
      patientOOP: 0,
      cardBalanceAfter: 0,
      cumulativeManufacturerCaptured: 15000,
    });
    expect(rows[3]).toMatchObject({
      fill: 4,
      costShare: 5000,
      cardPays: 0,
      patientOOP: 5000,
      cardBalanceAfter: 0,
      deductibleRemainingAfter: 0,
      cumulativeManufacturerCaptured: 15000,
      cumulativePatientOOP: 5000,
      isCliff: true,
    });
  });

  it('holds flat after abandonment (fills 5-12)', () => {
    for (let i = 4; i < 12; i++) {
      expect(rows[i]).toMatchObject({
        patientOOP: 0,
        cumulativeManufacturerCaptured: 15000,
        cumulativePatientOOP: 5000,
        isCliff: false,
      });
    }
    expect(rows).toHaveLength(12);
  });
});

describe('simulateAccumulator — abandonment OFF', () => {
  const rows = simulateAccumulator(DEFAULT_PARAMS, { abandonAtCliff: false });

  it('keeps filling post-deductible at coinsurance rate (1000/fill)', () => {
    const expectedCumulativeOOP = [0, 0, 0, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000];
    rows.forEach((row, i) => {
      expect(row.cumulativePatientOOP).toBe(expectedCumulativeOOP[i]);
    });
  });

  it('manufacturer capture is flat at 15000 from fill 3 onward, identical to abandonment ON', () => {
    for (let i = 2; i < 12; i++) {
      expect(rows[i].cumulativeManufacturerCaptured).toBe(15000);
    }
  });

  it('fill 4 is the deductible cliff (5000), then fill 5 onward costs coinsuranceRate * drugCostPerFill', () => {
    expect(rows[3]).toMatchObject({ costShare: 5000, cardPays: 0, patientOOP: 5000 });
    for (let i = 4; i < 12; i++) {
      expect(rows[i].costShare).toBe(1000);
      expect(rows[i].cardPays).toBe(0);
      expect(rows[i].patientOOP).toBe(1000);
    }
  });
});

describe('simulateMaximizer', () => {
  const rows = simulateMaximizer(DEFAULT_PARAMS);

  it('extracts cardAnnualMax / fillsPerYear evenly, with zero patient OOP', () => {
    rows.forEach((row) => {
      expect(row.costShare).toBe(1250);
      expect(row.cardPays).toBe(1250);
      expect(row.patientOOP).toBe(0);
      expect(row.isCliff).toBe(false);
    });
  });

  it('cumulative capture reaches exactly cardAnnualMax at the final fill', () => {
    expect(rows[11].cumulativeManufacturerCaptured).toBe(15000);
    expect(rows[11].cardBalanceAfter).toBe(0);
  });

  it('cumulative capture matches expected running total', () => {
    const expected = [1250, 2500, 3750, 5000, 6250, 7500, 8750, 10000, 11250, 12500, 13750, 15000];
    rows.forEach((row, i) => {
      expect(row.cumulativeManufacturerCaptured).toBe(expected[i]);
    });
  });

  it('final fill absorbs the rounding remainder when cardAnnualMax does not divide evenly', () => {
    const oddRows = simulateMaximizer({ ...DEFAULT_PARAMS, cardAnnualMax: 10000, fillsPerYear: 12 });
    const total = oddRows.reduce((sum, r) => sum + r.cardPays, 0);
    expect(total).toBeCloseTo(10000, 10);
    expect(oddRows[11].cumulativeManufacturerCaptured).toBeCloseTo(10000, 10);
  });
});

describe('computeRecoverableCurve', () => {
  it('matches the worked-example accumulator recoverable curve', () => {
    const curve = computeRecoverableCurve(DEFAULT_PARAMS, 'accumulator');
    expect(curve).toEqual([
      { catchPoint: 'enrollment', alreadyLeaked: 0, recoverable: 15000, recoverablePct: 1 },
      { catchPoint: 'afterFill1', alreadyLeaked: 5000, recoverable: 10000, recoverablePct: 10000 / 15000 },
      { catchPoint: 'afterFill2', alreadyLeaked: 10000, recoverable: 5000, recoverablePct: 5000 / 15000 },
      { catchPoint: 'afterFill3', alreadyLeaked: 15000, recoverable: 0, recoverablePct: 0 },
      { catchPoint: 'retrospective', alreadyLeaked: 15000, recoverable: 0, recoverablePct: 0 },
    ]);
  });

  it('matches the worked-example maximizer recoverable curve', () => {
    const curve = computeRecoverableCurve(DEFAULT_PARAMS, 'maximizer');
    expect(curve[0]).toMatchObject({ recoverable: 15000, recoverablePct: 1 });
    expect(curve[1]).toMatchObject({ recoverable: 13750 });
    expect(curve[1].recoverablePct).toBeCloseTo(0.9167, 3);
    expect(curve[2]).toMatchObject({ recoverable: 12500 });
    expect(curve[2].recoverablePct).toBeCloseTo(0.8333, 3);
    expect(curve[3]).toMatchObject({ recoverable: 11250, recoverablePct: 0.75 });
    expect(curve[4]).toMatchObject({ recoverable: 0, recoverablePct: 0 });
  });

  it('accumulator is fully unrecoverable by fill 3 while maximizer still has runway (the core divergence)', () => {
    const accCurve = computeRecoverableCurve(DEFAULT_PARAMS, 'accumulator');
    const maxCurve = computeRecoverableCurve(DEFAULT_PARAMS, 'maximizer');
    const accAtFill3 = accCurve.find((p) => p.catchPoint === 'afterFill3')!;
    const maxAtFill3 = maxCurve.find((p) => p.catchPoint === 'afterFill3')!;
    expect(accAtFill3.recoverablePct).toBe(0);
    expect(maxAtFill3.recoverablePct).toBeGreaterThan(0.7);
  });
});

describe('general cost-share rule — deductible straddle (off-defaults)', () => {
  it('blends deductible and coinsurance dollars within a single fill when deductible < drugCostPerFill', () => {
    const params = { ...DEFAULT_PARAMS, patientDeductible: 2000, cardAnnualMax: 100000 };
    const rows = simulateAccumulator(params);
    // deductiblePortion = min(2000, 5000) = 2000; coinsurancePortion = 0.2 * (5000-2000) = 600
    expect(rows[0].costShare).toBe(2600);
  });

  it('card dollars never advance the deductible, even when they fully cover cost-share', () => {
    const params = { ...DEFAULT_PARAMS, patientDeductible: 2000, cardAnnualMax: 100000 };
    const rows = simulateAccumulator(params);
    // Card has ample balance and pays the full 2600 cost-share every fill, so the
    // patient never pays out of pocket and the deductible never moves — cost-share
    // therefore stays flat at 2600 all year instead of stepping up after 2000 "clears".
    expect(rows[0].patientOOP).toBe(0);
    expect(rows[0].deductibleRemainingAfter).toBe(2000);
    expect(rows[1].costShare).toBe(2600);
    expect(rows[11].deductibleRemainingAfter).toBe(2000);
  });

  it('deductible only advances once the card is exhausted and the patient pays OOP', () => {
    // Card covers exactly one fill's cost-share (2600), then drains.
    const params = { ...DEFAULT_PARAMS, patientDeductible: 2000, cardAnnualMax: 2600 };
    const rows = simulateAccumulator(params, { abandonAtCliff: false });
    expect(rows[0]).toMatchObject({ costShare: 2600, cardPays: 2600, patientOOP: 0 });
    expect(rows[0].deductibleRemainingAfter).toBe(2000); // untouched — card paid it all
    // Fill 2: card is empty, patient pays the full 2600 OOP themselves.
    expect(rows[1]).toMatchObject({ costShare: 2600, cardPays: 0, patientOOP: 2600, isCliff: true });
    expect(rows[1].deductibleRemainingAfter).toBe(0); // 2000 deductible-eligible portion consumed
    // Fill 3: deductible now exhausted, coinsurance-only cost-share.
    expect(rows[2]).toMatchObject({ costShare: 1000, cardPays: 0, patientOOP: 1000 });
  });
});

describe('edge case — card smaller than a single fill cost-share', () => {
  it('hits the cliff on fill 1 when cardAnnualMax < first cost-share', () => {
    const params = { ...DEFAULT_PARAMS, cardAnnualMax: 2000 };
    const rows = simulateAccumulator(params);
    expect(rows[0]).toMatchObject({ costShare: 5000, cardPays: 2000, patientOOP: 3000, isCliff: true });
    expect(rows[0].deductibleRemainingAfter).toBe(2000); // 5000 - 3000 patient OOP
  });
});
