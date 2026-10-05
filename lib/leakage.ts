// Pure calculation engine for the copay-assistance leakage model.
// No React, no UI, no side effects: every export here is a pure function.

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
 * drained. Card dollars never advance the deductible: only patient
 * out-of-pocket dollars do. This is the mechanical heart of the accumulator.
 *
 * Card-allocation convention for mid-fill exhaustion (only reachable off
 * defaults, when cardBalance lands strictly between 0 and costShare): the
 * card pays what it has left (min(cardBalance, costShare)), the patient
 * covers the remainder out of pocket, and that patient remainder advances
 * the deductible up to the deductible-eligible portion of the fill.
 *
 * Out-of-pocket max: the cap applies to the patient's own dollars only,
 * never to the card's. The card pays from the uncapped cost-share first, so
 * oopMax can never reduce manufacturer capture. The patient's remaining
 * portion is then capped at the OOP room left (oopMax minus cumulative
 * patient OOP), so cumulative patient OOP stops at oopMax. The reported
 * costShare is what was actually charged: card payment plus capped patient
 * payment. The deductible advances only by the deductible-eligible part of
 * what the patient actually paid.
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

    const { costShare: uncappedCostShare, deductiblePortion } = computeCostShare(
      remainingDeductible,
      drugCostPerFill,
      coinsuranceRate
    );

    const cardPays = Math.min(cardBalance, uncappedCostShare);
    const oopRoom = Math.max(0, oopMax - cumulativePatientOOP);
    const patientOOP = Math.min(uncappedCostShare - cardPays, oopRoom);
    const costShare = cardPays + patientOOP;

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
 * catch-point framing asks "what if we intervened at fill N": abandonment
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

/**
 * Detection layer: when can you actually catch it?
 *
 * The recoverable curve lets you pick any catch-point. In practice the
 * catch-point is set by what the program knows before the first fill and
 * what shows up on the claim. Each detection method below derives its
 * catch-point from the same no-intervention claims that computeRecoverableCurve
 * uses, then applies the same recoverable math.
 *
 * There are two distinct claim signals:
 *
 * Accumulator = overcharge. The plan charges more cost-share than a compliant
 * plan could, given what the program knows. With the plan design known from
 * a benefit verification, the bound is the plan's own deductible, coinsurance,
 * and OOP max, applied as if the card dollars had counted. With claims alone,
 * an accumulator looks like a legitimately high-deductible plan, so the only
 * reliable bound is the legal OOP ceiling: a compliant plan can't keep
 * charging past it for a covered drug unless the assistance isn't counted.
 *
 * Maximizer = fingerprint. Cost-share equals the card's annual max divided by
 * fills, confirmed when the same amount repeats. A maximizer never
 * overcharges, so the overcharge test can't see it. The fingerprint test can.
 *
 * Real-time rules act on the flagged claim itself, so fills paid before the
 * catch = flagFill - 1. A real-time rule that never flags in-year leaves the
 * whole year paid and nothing recoverable.
 */

export type DetectionMethod =
  | 'bvBeforeFirstFill'
  | 'realtimeClaimsWithPlanDesign'
  | 'realtimeClaimsOnly'
  | 'quarterlyReview';

export const DETECTION_METHODS: DetectionMethod[] = [
  'bvBeforeFirstFill',
  'realtimeClaimsWithPlanDesign',
  'realtimeClaimsOnly',
  'quarterlyReview',
];

export interface DetectionResult {
  method: DetectionMethod;
  tactic: Tactic;
  flagFill: number | null; // claim that trips a real-time rule; null for BV and quarterly review
  fillsPaidBeforeCatch: number;
  caughtInYear: boolean;
  alreadyLeaked: number;
  recoverable: number;
  recoverablePct: number; // 0..1
}

// Tolerance for comparing dollar amounts computed in floating point.
const DETECTION_EPSILON = 0.005;

/** Quarter-end review: the first quarter of fills has already been paid. */
export function quarterlyReviewFill(fillsPerYear: number): number {
  return Math.min(fillsPerYear, Math.ceil(fillsPerYear / 4));
}

// Accumulator, plan design known: first fill whose charged cost-share (card
// plus patient) exceeds what the plan's own design allows if every prior
// charged dollar had counted toward the deductible and OOP max.
function planDesignOverchargeFill(params: LeakageParams, rows: FillRow[]): number | null {
  let chargedBefore = 0;
  for (const row of rows) {
    const { costShare: designCostShare } = computeCostShare(
      Math.max(0, params.patientDeductible - chargedBefore),
      params.drugCostPerFill,
      params.coinsuranceRate
    );
    const expected = Math.min(designCostShare, Math.max(0, params.oopMax - chargedBefore));
    if (row.costShare > expected + DETECTION_EPSILON) return row.fill;
    chargedBefore += row.costShare;
  }
  return null;
}

// Accumulator, claims alone: first fill that pushes cumulative charged
// cost-share past the ACA ceiling. Uses the ACA constant, not params.oopMax,
// since the plan's own cap is unknown without a benefit verification.
function acaCeilingOverchargeFill(rows: FillRow[]): number | null {
  let charged = 0;
  for (const row of rows) {
    charged += row.costShare;
    if (charged > ACA_OOP_MAX_2026_SELF_ONLY + DETECTION_EPSILON) return row.fill;
  }
  return null;
}

// Maximizer fingerprint: second fill whose cost-share matches card max / fills.
function maximizerFingerprintFill(params: LeakageParams, rows: FillRow[]): number | null {
  const perFill = params.cardAnnualMax / params.fillsPerYear;
  let matches = 0;
  for (const row of rows) {
    if (Math.abs(row.costShare - perFill) <= DETECTION_EPSILON) {
      matches++;
      if (matches === 2) return row.fill;
    }
  }
  return null;
}

export function computeDetection(
  params: LeakageParams,
  tactic: Tactic,
  method: DetectionMethod
): DetectionResult {
  const rows = simulateFillSequence(params, tactic, { abandonAtCliff: false });
  const fillsPerYear = params.fillsPerYear;
  const totalCaptured = rows.length > 0 ? rows[rows.length - 1].cumulativeManufacturerCaptured : 0;

  let flagFill: number | null = null;
  let fillsPaidBeforeCatch: number;
  let caughtInYear = true;

  if (method === 'bvBeforeFirstFill') {
    fillsPaidBeforeCatch = 0;
  } else if (method === 'quarterlyReview') {
    fillsPaidBeforeCatch = quarterlyReviewFill(fillsPerYear);
  } else {
    if (tactic === 'maximizer') {
      flagFill = maximizerFingerprintFill(params, rows);
    } else if (method === 'realtimeClaimsWithPlanDesign') {
      flagFill = planDesignOverchargeFill(params, rows);
    } else {
      flagFill = acaCeilingOverchargeFill(rows);
    }
    caughtInYear = flagFill !== null;
    fillsPaidBeforeCatch = flagFill !== null ? flagFill - 1 : fillsPerYear;
  }

  const alreadyLeaked =
    fillsPaidBeforeCatch > 0 ? rows[fillsPaidBeforeCatch - 1].cumulativeManufacturerCaptured : 0;
  const recoverable = caughtInYear ? totalCaptured - alreadyLeaked : 0;
  const recoverablePct = totalCaptured === 0 ? 0 : recoverable / totalCaptured;

  return {
    method,
    tactic,
    flagFill,
    fillsPaidBeforeCatch,
    caughtInYear,
    alreadyLeaked,
    recoverable,
    recoverablePct,
  };
}

export function computeDetectionTable(
  params: LeakageParams
): { method: DetectionMethod; accumulator: DetectionResult; maximizer: DetectionResult }[] {
  return DETECTION_METHODS.map((method) => ({
    method,
    accumulator: computeDetection(params, 'accumulator', method),
    maximizer: computeDetection(params, 'maximizer', method),
  }));
}
