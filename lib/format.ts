// UI-side formatting helpers. No calculation logic lives here — see lib/leakage.ts.
import type { CatchPoint } from './leakage';

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export const CATCH_POINT_LABELS: Record<CatchPoint, string> = {
  enrollment: 'Enrollment',
  afterFill1: 'After fill 1',
  afterFill2: 'After fill 2',
  afterFill3: 'After fill 3',
  retrospective: 'Retrospective (year-end)',
};
