import { describe, expect, it } from 'vitest';
import {
  ACA_OOP_MAX_2026_SELF_ONLY,
  DEFAULT_PARAMS,
  computeDetection,
  computeDetectionTable,
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

  it('keeps filling post-deductible at coinsurance rate (1000/fill) until the OOP max', () => {
    const expectedCumulativeOOP = [0, 0, 0, 5000, 6000, 7000, 8000, 9000, 10000, 10600, 10600, 10600];
    rows.forEach((row, i) => {
      expect(row.cumulativePatientOOP).toBe(expectedCumulativeOOP[i]);
    });
  });

  it('manufacturer capture is flat at 15000 from fill 3 onward, identical to abandonment ON', () => {
    for (let i = 2; i < 12; i++) {
      expect(rows[i].cumulativeManufacturerCaptured).toBe(15000);
    }
  });

  it('fill 4 is the deductible cliff (5000), fills 5-9 cost 1000, fill 10 hits the OOP max at 600, fills 11-12 cost 0', () => {
    expect(rows[3]).toMatchObject({ costShare: 5000, cardPays: 0, patientOOP: 5000 });
    for (let i = 4; i < 9; i++) {
      expect(rows[i]).toMatchObject({ costShare: 1000, cardPays: 0, patientOOP: 1000 });
    }
    expect(rows[9]).toMatchObject({ costShare: 600, cardPays: 0, patientOOP: 600 });
    for (let i = 10; i < 12; i++) {
      expect(rows[i]).toMatchObject({ costShare: 0, cardPays: 0, patientOOP: 0 });
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

describe('out-of-pocket max', () => {
  it('defaults to the 2026 ACA self-only ceiling', () => {
    expect(ACA_OOP_MAX_2026_SELF_ONLY).toBe(10600);
    expect(DEFAULT_PARAMS.oopMax).toBe(10600);
  });

  it('cumulative patient OOP never exceeds oopMax across a parameter sweep', () => {
    for (const oopMax of [1000, 3000, 6000, 10600, 20000]) {
      for (const patientDeductible of [0, 2000, 5000, 9000]) {
        for (const cardAnnualMax of [0, 2000, 15000, 40000]) {
          const params = { ...DEFAULT_PARAMS, oopMax, patientDeductible, cardAnnualMax };
          for (const abandonAtCliff of [true, false]) {
            const rows = simulateAccumulator(params, { abandonAtCliff });
            rows.forEach((row) => {
              expect(row.cumulativePatientOOP).toBeLessThanOrEqual(oopMax);
            });
          }
        }
      }
    }
  });

  it('a plan OOP max of 6000 stops patient payments at 6000 (abandonment OFF)', () => {
    const rows = simulateAccumulator({ ...DEFAULT_PARAMS, oopMax: 6000 }, { abandonAtCliff: false });
    expect(rows[3].patientOOP).toBe(5000);
    expect(rows[4].patientOOP).toBe(1000);
    for (let i = 5; i < 12; i++) {
      expect(rows[i].patientOOP).toBe(0);
    }
    expect(rows[11].cumulativePatientOOP).toBe(6000);
  });

  it('card dollars do not count toward OOP: fills 1-3 charge 15000 of cost-share, yet patient OOP is 0', () => {
    const rows = simulateAccumulator(DEFAULT_PARAMS, { abandonAtCliff: false });
    const firstThree = rows.slice(0, 3);
    const costShareCharged = firstThree.reduce((sum, r) => sum + r.costShare, 0);
    expect(costShareCharged).toBe(15000);
    expect(costShareCharged).toBeGreaterThan(DEFAULT_PARAMS.oopMax);
    expect(firstThree.reduce((sum, r) => sum + r.patientOOP, 0)).toBe(0);
    expect(rows[2].cumulativePatientOOP).toBe(0);
  });

  it('accumulator manufacturer capture is invariant to oopMax (card dollars never count toward the cap)', () => {
    const capture = (rows: ReturnType<typeof simulateAccumulator>) =>
      rows.map((r) => r.cumulativeManufacturerCaptured);
    for (const abandonAtCliff of [true, false]) {
      const baseline = simulateAccumulator(DEFAULT_PARAMS, { abandonAtCliff });
      expect(baseline[11].cumulativeManufacturerCaptured).toBe(15000);
      for (const oopMax of [500, 1000]) {
        const rows = simulateAccumulator({ ...DEFAULT_PARAMS, oopMax }, { abandonAtCliff });
        expect(rows[11].cumulativeManufacturerCaptured).toBe(15000);
        expect(capture(rows)).toEqual(capture(baseline));
        expect(rows.map((r) => r.cardPays)).toEqual(baseline.map((r) => r.cardPays));
      }
    }
    // Off-defaults: capture still matches the default-oopMax run across the sweep grid.
    for (const patientDeductible of [0, 2000, 5000, 9000]) {
      for (const cardAnnualMax of [0, 2000, 15000, 40000]) {
        const base = { ...DEFAULT_PARAMS, patientDeductible, cardAnnualMax };
        const baseline = simulateAccumulator(base, { abandonAtCliff: false });
        for (const oopMax of [500, 1000, 3000, 6000, 20000]) {
          const rows = simulateAccumulator({ ...base, oopMax }, { abandonAtCliff: false });
          expect(capture(rows)).toEqual(capture(baseline));
        }
      }
    }
  });

  it('maximizer ignores oopMax (non-EHB designation takes the drug outside the cap)', () => {
    expect(simulateMaximizer({ ...DEFAULT_PARAMS, oopMax: 1000 })).toEqual(
      simulateMaximizer(DEFAULT_PARAMS)
    );
  });
});

describe('detection layer', () => {
  it('matches the 8 default detection values', () => {
    const table = computeDetectionTable(DEFAULT_PARAMS);
    const summary = table.map(({ method, accumulator, maximizer }) => ({
      method,
      acc: [accumulator.flagFill, accumulator.fillsPaidBeforeCatch, accumulator.recoverable],
      max: [maximizer.flagFill, maximizer.fillsPaidBeforeCatch, maximizer.recoverable],
    }));
    expect(summary).toEqual([
      { method: 'bvBeforeFirstFill', acc: [null, 0, 15000], max: [null, 0, 15000] },
      { method: 'realtimeClaimsWithPlanDesign', acc: [2, 1, 10000], max: [2, 1, 13750] },
      { method: 'realtimeClaimsOnly', acc: [3, 2, 5000], max: [2, 1, 13750] },
      { method: 'quarterlyReview', acc: [null, 3, 0], max: [null, 3, 11250] },
    ]);
    const pcts = table.map(({ accumulator, maximizer }) => [
      Math.round(accumulator.recoverablePct * 100),
      Math.round(maximizer.recoverablePct * 100),
    ]);
    expect(pcts).toEqual([
      [100, 100],
      [67, 92],
      [33, 92],
      [0, 75],
    ]);
    table.forEach(({ accumulator, maximizer }) => {
      expect(accumulator.caughtInYear).toBe(true);
      expect(maximizer.caughtInYear).toBe(true);
    });
  });

  it('agrees with the recoverable curve at matching catch-points (accumulator)', () => {
    const curve = computeRecoverableCurve(DEFAULT_PARAMS, 'accumulator');
    const at = (cp: string) => curve.find((p) => p.catchPoint === cp)!;
    const detect = (m: Parameters<typeof computeDetection>[2]) =>
      computeDetection(DEFAULT_PARAMS, 'accumulator', m);
    const pairs = [
      [detect('bvBeforeFirstFill'), at('enrollment')],
      [detect('realtimeClaimsWithPlanDesign'), at('afterFill1')],
      [detect('realtimeClaimsOnly'), at('afterFill2')],
      [detect('quarterlyReview'), at('afterFill3')],
    ] as const;
    for (const [d, p] of pairs) {
      expect(d.alreadyLeaked).toBe(p.alreadyLeaked);
      expect(d.recoverable).toBe(p.recoverable);
      expect(d.recoverablePct).toBe(p.recoverablePct);
    }
  });

  it('plan design catches an accumulator that claims alone never can (drug 500, deductible 2000)', () => {
    const params = { ...DEFAULT_PARAMS, drugCostPerFill: 500, patientDeductible: 2000 };
    const rows = simulateAccumulator(params, { abandonAtCliff: false });
    expect(rows.every((r) => r.costShare === 500)).toBe(true);
    expect(rows[11].cumulativeManufacturerCaptured).toBe(6000);

    const claimsOnly = computeDetection(params, 'accumulator', 'realtimeClaimsOnly');
    expect(claimsOnly).toMatchObject({
      flagFill: null,
      caughtInYear: false,
      fillsPaidBeforeCatch: 12,
      recoverable: 0,
    });

    const planDesign = computeDetection(params, 'accumulator', 'realtimeClaimsWithPlanDesign');
    expect(planDesign).toMatchObject({
      flagFill: 5,
      caughtInYear: true,
      fillsPaidBeforeCatch: 4,
      alreadyLeaked: 2000,
      recoverable: 4000,
    });
  });

  it('with plan oopMax at or below the ACA ceiling, plan design never pays more fills than claims alone', () => {
    for (const oopMax of [3000, 6000, 10600]) {
      for (const patientDeductible of [0, 1500, 5000]) {
        for (const drugCostPerFill of [800, 3000, 5000, 12000]) {
          const params = {
            ...DEFAULT_PARAMS,
            oopMax,
            patientDeductible,
            drugCostPerFill,
            cardAnnualMax: 40000,
          };
          const planDesign = computeDetection(params, 'accumulator', 'realtimeClaimsWithPlanDesign');
          const claimsOnly = computeDetection(params, 'accumulator', 'realtimeClaimsOnly');
          expect(planDesign.fillsPaidBeforeCatch).toBeLessThanOrEqual(
            claimsOnly.fillsPaidBeforeCatch
          );
        }
      }
    }
  });

  it('a single-fill maximizer cannot be confirmed by a repeat in-year', () => {
    const params = { ...DEFAULT_PARAMS, fillsPerYear: 1 };
    for (const method of ['realtimeClaimsWithPlanDesign', 'realtimeClaimsOnly'] as const) {
      expect(computeDetection(params, 'maximizer', method)).toMatchObject({
        flagFill: null,
        caughtInYear: false,
        recoverable: 0,
      });
    }
  });

  it('quarterly review at 6 fills catches after fill 2, leaving 10000 of the maximizer card', () => {
    const result = computeDetection({ ...DEFAULT_PARAMS, fillsPerYear: 6 }, 'maximizer', 'quarterlyReview');
    expect(result.fillsPaidBeforeCatch).toBe(2);
    expect(result.recoverable).toBe(10000);
  });

  it('maximizer fingerprint tolerates uneven division (card 10000 over 12 fills)', () => {
    const result = computeDetection(
      { ...DEFAULT_PARAMS, cardAnnualMax: 10000 },
      'maximizer',
      'realtimeClaimsOnly'
    );
    expect(result.flagFill).toBe(2);
    expect(result.recoverable).toBeCloseTo(10000 - 10000 / 12, 10);
  });
});
