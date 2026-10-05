// Pure calculation engine for the copay-assistance leakage model.
// No React, no UI, no side effects — every export here is a pure function.

export type Tactic = 'accumulator' | 'maximizer';

export type CatchPoint =
  | 'enrollment'
  | 'afterFill1'
  | 'afterFill2'
  | 'afterFill3'
  | 'retrospective';

export interface LeakageParams {
  drugCostPerFill: number;
  cardAnnualMax: number;
  patientDeductible: number;
  coinsuranceRate: number; // e.g. 0.20
  fillsPerYear: number; // e.g. 12
  oopMax: number; // plan out-of-pocket maximum, patient dollars only
}

export interface FillRow {
  fill: number;
  costShare: number;
  cardPays: number;
  patientOOP: number;
  cardBalanceAfter: number;
  deductibleRemainingAfter: number;
  cumulativeManufacturerCaptured: number;
  cumulativePatientOOP: number;
  isCliff: boolean;
}

export interface RecoverablePoint {
  catchPoint: CatchPoint;
  alreadyLeaked: number;
  recoverable: number;
  recoverablePct: number; // 0..1
}

// 2026 ACA maximum out-of-pocket limit for self-only coverage (HHS final
// rule, June 25, 2025). Applies to in-network essential health benefits on
// non-grandfathered plans. The family limit is $21,200.
export const ACA_OOP_MAX_2026_SELF_ONLY = 10600;

export const DEFAULT_PARAMS: LeakageParams = {
  drugCostPerFill: 5000,
  cardAnnualMax: 15000,
  patientDeductible: 5000,
  coinsuranceRate: 0.2,
  fillsPerYear: 12,
  oopMax: ACA_OOP_MAX_2026_SELF_ONLY,
};

/**
 * General cost-share rule (not a defaults-only shortcut): the deductible
 * portion is paid at 100% up to what remains, and coinsurance applies only
 * to the amount above the remaining deductible. This must hold for any
 * parameter values, including a deductible that straddles a single fill.
 */
function computeCostShare(
  remainingDeductible: number,
  drugCostPerFill: number,
  coinsuranceRate: number
): { costShare: number; deductiblePortion: number; coinsurancePortion: number } {
  const deductiblePortion = Math.min(remainingDeductible, drugCostPerFill);
  const coinsurancePortion = coinsuranceRate * Math.max(0, drugCostPerFill - remainingDeductible);
  return {
    costShare: deductiblePortion + coinsurancePortion,
    deductiblePortion,
    coinsurancePortion,
  };
}

/**
 * Copay Accumulator: the manufacturer card pays cost-share until it's
 * drained. Card dollars never advance the deductible — only patient
 * out-of-pocket dollars do. This is the mechanical heart of the accumulator.
 *
 * Card-allocation convention for mid-fill exhaustion (only reachable off
 * defaults, when cardBalance lands strictly between 0 and costShare): the
 * card pays what it has left (min(cardBalance, costShare)), the patient
 * covers the remainder out of pocket, and that patient remainder advances
 * the deductible up to the deductible-eligible portion of the fill.
 *
 * Out-of-pocket max: each fill's cost-share is capped at the OOP room left,
 * measured in patient dollars only. Card dollars never count toward the OOP
 * max, so the cap cannot bind while the card is paying. Once the patient
 * pays their own money, their cumulative OOP stops at oopMax. If the cap
 * binds within a fill, coinsurance is trimmed first, since deductible
 * dollars come first.
 */
export function simulateAccumulator(
  params: LeakageParams,
  opts?: { abandonAtCliff?: boolean }
): FillRow[] {
  const abandonAtCliff = opts?.abandonAtCliff ?? true;
  const {
    drugCostPerFill,
    cardAnnualMax,
    patientDeductible,
    coinsuranceRate,
    fillsPerYear,
    oopMax,
  } = params;

  const rows: FillRow[] = [];
  let cardBalance = cardAnnualMax;
  let remainingDeductible = patientDeductible;
  let cumulativeManufacturerCaptured = 0;
  let cumulativePatientOOP = 0;
  let hasHitCliff = false;

  for (let fill = 1; fill <= fillsPerYear; fill++) {
    if (hasHitCliff && abandonAtCliff) {
      // Patient has abandoned the drug: no further fills occur.
      rows.push({
        fill,
        costShare: 0,
        cardPays: 0,
        patientOOP: 0,
        cardBalanceAfter: cardBalance,
        deductibleRemainingAfter: remainingDeductible,
        cumulativeManufacturerCaptured,
        cumulativePatientOOP,
        isCliff: false,
      });
      continue;
    }

    const uncapped = computeCostShare(remainingDeductible, drugCostPerFill, coinsuranceRate);
    const oopRoom = Math.max(0, oopMax - cumulativePatientOOP);
    const costShare = Math.min(uncapped.costShare, oopRoom);
    const deductiblePortion = Math.min(uncapped.deductiblePortion, costShare);

    const cardPays = Math.min(cardBalance, costShare);
    const patientOOP = costShare - cardPays;

    const isCliff = !hasHitCliff && patientOOP > 0;
    if (isCliff) hasHitCliff = true;

    cardBalance -= cardPays;
    remainingDeductible -= Math.min(patientOOP, deductiblePortion);
    cumulativeManufacturerCaptured += cardPays;
    cumulativePatientOOP += patientOOP;

    rows.push({
      fill,
      costShare,
      cardPays,
      patientOOP,
      cardBalanceAfter: cardBalance,
      deductibleRemainingAfter: remainingDeductible,
      cumulativeManufacturerCaptured,
      cumulativePatientOOP,
      isCliff,
    });
  }

  return rows;
}

/**
 * Copay Maximizer: the drug is reclassified as a non-essential health
 * benefit and cost-share is engineered to extract the card evenly across
 * the year. Deductible, coinsurance, and oopMax are inert for this tactic:
 * the non-EHB designation is exactly what takes the drug outside the
 * out-of-pocket cap.
 *
 * Rounding convention: if cardAnnualMax doesn't divide evenly by
 * fillsPerYear, per-fill cost-share is computed precisely, and the final
 * fill absorbs the remainder so cumulative capture equals cardAnnualMax
 * exactly (no drift from repeated rounding).
 */
export function simulateMaximizer(params: LeakageParams): FillRow[] {
  const { cardAnnualMax, fillsPerYear } = params;
  const perFillCostShare = cardAnnualMax / fillsPerYear;

  const rows: FillRow[] = [];
  let cumulativeManufacturerCaptured = 0;

  for (let fill = 1; fill <= fillsPerYear; fill++) {
    const isFinalFill = fill === fillsPerYear;
    const costShare = isFinalFill
      ? cardAnnualMax - cumulativeManufacturerCaptured
      : perFillCostShare;

    cumulativeManufacturerCaptured += costShare;

    rows.push({
      fill,
      costShare,
      cardPays: costShare,
      patientOOP: 0,
      cardBalanceAfter: cardAnnualMax - cumulativeManufacturerCaptured,
      deductibleRemainingAfter: params.patientDeductible,
      cumulativeManufacturerCaptured,
      cumulativePatientOOP: 0,
      isCliff: false,
    });
  }

  return rows;
}

export function simulateFillSequence(
  params: LeakageParams,
  tactic: Tactic,
  opts?: { abandonAtCliff?: boolean }
): FillRow[] {
  return tactic === 'accumulator' ? simulateAccumulator(params, opts) : simulateMaximizer(params);
}

const CATCH_POINT_FILL: Record<CatchPoint, number> = {
  enrollment: 0,
  afterFill1: 1,
  afterFill2: 2,
  afterFill3: 3,
  retrospective: 12,
};

/**
 * Recoverable-vs-already-leaked curve. Always run against the
 * no-intervention (abandonAtCliff: false) fill sequence, since the
 * catch-point framing asks "what if we intervened at fill N" — abandonment
 * is a downstream consequence of NOT intervening, not itself a catch-point.
 * `recoverable` is the idealized upper bound: 100% of card dollars not yet
 * paid out as of that catch-point. It is derived from totalCaptured (the
 * final cumulative capture), not hardcoded to cardAnnualMax, so it stays
 * correct for any parameter values.
 */
export function computeRecoverableCurve(
  params: LeakageParams,
  tactic: Tactic
): RecoverablePoint[] {
  const rows = simulateFillSequence(params, tactic, { abandonAtCliff: false });
  const fillsPerYear = params.fillsPerYear;
  const totalCaptured = rows.length > 0 ? rows[rows.length - 1].cumulativeManufacturerCaptured : 0;

  const capturedThroughFill = (fillNumber: number): number => {
    if (fillNumber <= 0) return 0;
    const clamped = Math.min(fillNumber, fillsPerYear);
    return rows[clamped - 1].cumulativeManufacturerCaptured;
  };

  const catchPoints: CatchPoint[] = [
    'enrollment',
    'afterFill1',
    'afterFill2',
    'afterFill3',
    'retrospective',
  ];

  return catchPoints.map((catchPoint) => {
    const alreadyLeaked = capturedThroughFill(CATCH_POINT_FILL[catchPoint]);
    const recoverable = totalCaptured - alreadyLeaked;
    const recoverablePct = totalCaptured === 0 ? 0 : recoverable / totalCaptured;
    return { catchPoint, alreadyLeaked, recoverable, recoverablePct };
  });
}
