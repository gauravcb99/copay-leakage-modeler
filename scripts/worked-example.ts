// Runnable via `npx tsx scripts/worked-example.ts`.
// Prints the Section 6 worked-example tables to the console for hand
// verification against the build spec before any UI is built.

import {
  DEFAULT_PARAMS,
  computeRecoverableCurve,
  simulateAccumulator,
  simulateMaximizer,
} from '../lib/leakage';

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

console.log('='.repeat(100));
console.log('DEFAULT_PARAMS:', DEFAULT_PARAMS);
console.log('='.repeat(100));

console.log('\n--- Accumulator — abandonment ON (default) ---\n');
const accOn = simulateAccumulator(DEFAULT_PARAMS);
console.table(
  accOn.map((r) => ({
    Fill: r.fill,
    CostShare: fmtMoney(r.costShare),
    CardPays: fmtMoney(r.cardPays),
    PatientOOP: fmtMoney(r.patientOOP),
    CardBalAfter: fmtMoney(r.cardBalanceAfter),
    DeductRemAfter: fmtMoney(r.deductibleRemainingAfter),
    CumMfr: fmtMoney(r.cumulativeManufacturerCaptured),
    CumPatientOOP: fmtMoney(r.cumulativePatientOOP),
    Cliff: r.isCliff ? 'CLIFF' : '',
  }))
);

console.log('\n--- Accumulator — abandonment OFF (patient continues) ---\n');
const accOff = simulateAccumulator(DEFAULT_PARAMS, { abandonAtCliff: false });
console.log('Cumulative patient OOP by fill:', accOff.map((r) => r.cumulativePatientOOP).join(', '));
console.log(
  'Cumulative manufacturer captured by fill:',
  accOff.map((r) => r.cumulativeManufacturerCaptured).join(', ')
);

console.log('\n--- Maximizer ---\n');
const max = simulateMaximizer(DEFAULT_PARAMS);
console.table(
  max.map((r) => ({
    Fill: r.fill,
    CostShare: fmtMoney(r.costShare),
    CardPays: fmtMoney(r.cardPays),
    PatientOOP: fmtMoney(r.patientOOP),
    CardBalAfter: fmtMoney(r.cardBalanceAfter),
    CumMfr: fmtMoney(r.cumulativeManufacturerCaptured),
    CumPatientOOP: fmtMoney(r.cumulativePatientOOP),
  }))
);

console.log('\n--- Recoverable curve (showpiece) ---\n');
const accCurve = computeRecoverableCurve(DEFAULT_PARAMS, 'accumulator');
const maxCurve = computeRecoverableCurve(DEFAULT_PARAMS, 'maximizer');
console.table(
  accCurve.map((row, i) => ({
    CatchPoint: row.catchPoint,
    'Accumulator Recoverable': fmtMoney(row.recoverable),
    'Accum %': fmtPct(row.recoverablePct),
    'Maximizer Recoverable': fmtMoney(maxCurve[i].recoverable),
    'Maxim %': fmtPct(maxCurve[i].recoverablePct),
  }))
);
