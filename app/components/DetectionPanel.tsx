import type { DetectionMethod, DetectionResult, LeakageParams } from '@/lib/leakage';
import { computeDetectionTable } from '@/lib/leakage';
import { formatMoney, formatPct } from '@/lib/format';

interface DetectionPanelProps {
  params: LeakageParams;
}

const METHOD_LABELS: Record<DetectionMethod, { label: string; rule: string }> = {
  bvBeforeFirstFill: {
    label: 'Benefit verification before the first fill',
    rule: 'eBV plus plan outreach confirms the plan design, including whether assistance counts, before any claim is paid.',
  },
  realtimeClaimsWithPlanDesign: {
    label: 'Real-time claim rules, plan design known',
    rule: "Deductible, coinsurance, and out-of-pocket max come from the eBV. Accumulator: the claim charges more than the plan's own design allows if card dollars had counted. Maximizer: cost-share equals the card max divided by fills, confirmed when it repeats.",
  },
  realtimeClaimsOnly: {
    label: 'Real-time claim rules, claims alone',
    rule: "Accumulator: without the plan design, the only reliable bound is the 2026 ACA out-of-pocket ceiling ($10,600 self-only). A compliant plan can't charge past it for a covered drug unless assistance isn't counting. Maximizer: same fingerprint as above.",
  },
  quarterlyReview: {
    label: 'Quarterly claims review',
    rule: 'Claims reviewed at quarter-end, after the first quarter of fills has already been paid.',
  },
};

function caughtLabel(d: DetectionResult): string {
  if (d.method === 'bvBeforeFirstFill') return 'Before fill 1';
  if (d.method === 'quarterlyReview') return `After fill ${d.fillsPaidBeforeCatch}`;
  return d.flagFill === null ? 'Not caught in-year' : `On the fill ${d.flagFill} claim`;
}

function RecoverableCell({ d }: { d: DetectionResult }) {
  return (
    <td className="px-3 py-3 align-top whitespace-nowrap">
      <span className="font-semibold text-ink">{formatMoney(d.recoverable)}</span>{' '}
      <span className="text-ink/50">({formatPct(d.recoverablePct)})</span>
    </td>
  );
}

function buildTakeaway(table: ReturnType<typeof computeDetectionTable>): string {
  const byMethod = (m: DetectionMethod) => table.find((row) => row.method === m)!;
  const quarterly = byMethod('quarterlyReview');
  const planDesign = byMethod('realtimeClaimsWithPlanDesign').accumulator;
  const claimsOnly = byMethod('realtimeClaimsOnly').accumulator;

  const parts: string[] = [
    `At these inputs, a quarterly review (after fill ${quarterly.accumulator.fillsPaidBeforeCatch}) still keeps ${formatPct(quarterly.maximizer.recoverablePct)} of the maximizer card and ${formatPct(quarterly.accumulator.recoverablePct)} of the accumulator card.`,
  ];

  if (claimsOnly.flagFill === null) {
    parts.push(
      'Claims alone never catch the accumulator at these inputs, because its cost-share stays under the legal ceiling all year.'
    );
    if (planDesign.flagFill !== null) {
      parts.push(
        `Knowing the plan design catches it on the fill ${planDesign.flagFill} claim (${formatPct(planDesign.recoverablePct)} left).`
      );
    }
  } else {
    const claimsOnlySentence = `Claims alone catch the accumulator on the fill ${claimsOnly.flagFill} claim, with ${formatPct(claimsOnly.recoverablePct)} of the card left`;
    if (planDesign.flagFill !== null && planDesign.flagFill < claimsOnly.flagFill) {
      parts.push(
        `${claimsOnlySentence}; knowing the plan design moves that to the fill ${planDesign.flagFill} claim (${formatPct(planDesign.recoverablePct)} left).`
      );
    } else {
      parts.push(`${claimsOnlySentence}.`);
    }
  }

  parts.push(
    "Maximizers forgive slow detection. Accumulators don't: the money is kept only by knowing the plan design before the first fill or by acting on the claim in real time."
  );
  return parts.join(' ');
}

export function DetectionPanel({ params }: DetectionPanelProps) {
  const table = computeDetectionTable(params);

  return (
    <div className="rounded-lg border border-ink/10 bg-white/50 p-5">
      <h2 className="mb-1 text-base font-semibold text-ink">When can you actually catch it?</h2>
      <p className="mb-4 text-sm text-ink/60">
        The curve above lets you pick any catch-point. In practice, the catch-point is set by
        what the program knows before the first fill and what shows up on the claim. Each
        method below derives its catch-point from the same simulated claims.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 font-semibold text-ink/60">Detection method</th>
              <th className="px-3 py-2 font-semibold text-teal">Accumulator caught</th>
              <th className="px-3 py-2 font-semibold text-teal">Recoverable</th>
              <th className="px-3 py-2 font-semibold text-[#8a6d3b]">Maximizer caught</th>
              <th className="px-3 py-2 font-semibold text-[#8a6d3b]">Recoverable</th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ method, accumulator, maximizer }) => (
              <tr key={method} className="border-b border-ink/5 last:border-0">
                <td className="max-w-xs px-3 py-3 align-top">
                  <div className="font-medium text-ink">{METHOD_LABELS[method].label}</div>
                  <div className="mt-1 text-xs leading-snug text-ink/50">
                    {METHOD_LABELS[method].rule}
                  </div>
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap text-ink/80">
                  {caughtLabel(accumulator)}
                </td>
                <RecoverableCell d={accumulator} />
                <td className="px-3 py-3 align-top whitespace-nowrap text-ink/80">
                  {caughtLabel(maximizer)}
                </td>
                <RecoverableCell d={maximizer} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">{buildTakeaway(table)}</p>

      <p className="mt-3 text-xs italic text-ink/50">
        Recoverable uses the same idealized upper bound as the curve. The claims-only rule uses
        the ACA ceiling regardless of the plan out-of-pocket slider, since the program
        doesn&apos;t know the plan&apos;s own cap without a benefit verification. Rules are
        illustrative logic on hypothetical claims, not a production detector, and assume
        in-network, non-grandfathered coverage where the ACA cap applies.
      </p>
    </div>
  );
}
