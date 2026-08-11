import type { LeakageParams } from '@/lib/leakage';
import { computeRecoverableCurve } from '@/lib/leakage';
import { formatMoney, formatPct } from '@/lib/format';

interface SoWhatPanelProps {
  params: LeakageParams;
}

export function SoWhatPanel({ params }: SoWhatPanelProps) {
  const accCurve = computeRecoverableCurve(params, 'accumulator');
  const maxCurve = computeRecoverableCurve(params, 'maximizer');
  const accAtFill3 = accCurve.find((p) => p.catchPoint === 'afterFill3')!;
  const maxAtFill3 = maxCurve.find((p) => p.catchPoint === 'afterFill3')!;
  const accTotal = accCurve[0].recoverable;
  const maxTotal = maxCurve[0].recoverable;

  return (
    <div className="rounded-lg border border-teal/20 bg-teal/5 p-5">
      <h2 className="mb-2 text-base font-semibold text-ink">So what</h2>
      <p className="text-sm leading-relaxed text-ink/80">
        At a real quarter-end (≈ fill 3), the accumulator has already captured{' '}
        {formatPct(1 - accAtFill3.recoverablePct)} of its {formatMoney(accTotal)} card —
        only {formatPct(accAtFill3.recoverablePct)} is still recoverable. The maximizer,
        by contrast, still has {formatPct(maxAtFill3.recoverablePct)} of its{' '}
        {formatMoney(maxTotal)} card on the table at the same catch-point: it bleeds
        evenly across the year instead of front-loading in the first quarter. The
        divergence is the point — timing, not just tactic, determines how much of the
        leak is still recoverable, and by year-end (retrospective) both are effectively
        gone. Recoverable figures shown here are an{' '}
        <span className="font-medium">idealized upper bound</span> — 100% of the card
        balance not yet paid out at the catch-point — and real-world recovery is
        imperfect.
      </p>
    </div>
  );
}
