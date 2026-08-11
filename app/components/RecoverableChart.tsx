'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LeakageParams } from '@/lib/leakage';
import { computeRecoverableCurve } from '@/lib/leakage';
import { formatMoney, CATCH_POINT_LABELS } from '@/lib/format';
import { ChartLegend, ChartTooltipBody } from './ChartChrome';

const TEAL = '#0A4747';
const GOLD = '#C9A86A';

interface RecoverableChartProps {
  params: LeakageParams;
}

export function RecoverableChart({ params }: RecoverableChartProps) {
  const [showPercent, setShowPercent] = useState(false);

  const accCurve = computeRecoverableCurve(params, 'accumulator');
  const maxCurve = computeRecoverableCurve(params, 'maximizer');

  const data = accCurve.map((point, i) => ({
    label: CATCH_POINT_LABELS[point.catchPoint],
    accumulator: showPercent ? point.recoverablePct * 100 : point.recoverable,
    maximizer: showPercent ? maxCurve[i].recoverablePct * 100 : maxCurve[i].recoverable,
  }));

  return (
    <div className="rounded-lg border border-ink/10 bg-white/50 p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Delayed-leakage curve</h2>
          <p className="text-sm text-ink/60">
            Recoverable dollars by intervention catch-point — an{' '}
            <span className="font-medium text-ink/80">idealized upper bound</span> (100%
            of the card balance not yet paid out). Real-world recovery is imperfect.
          </p>
        </div>
        <div className="flex gap-1 rounded-md bg-ink/5 p-1 text-xs font-semibold">
          <button
            onClick={() => setShowPercent(false)}
            className={`rounded px-3 py-1.5 transition-colors ${
              !showPercent ? 'bg-teal text-cream' : 'text-ink/60 hover:text-ink'
            }`}
          >
            Dollars
          </button>
          <button
            onClick={() => setShowPercent(true)}
            className={`rounded px-3 py-1.5 transition-colors ${
              showPercent ? 'bg-teal text-cream' : 'text-ink/60 hover:text-ink'
            }`}
          >
            % of total
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#e5e0d8" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#e5e0d8' }}
            tick={{ fill: '#1A1A1A99', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#1A1A1A99', fontSize: 12 }}
            tickFormatter={(v: number) => (showPercent ? `${v}%` : formatMoney(v))}
            width={80}
            domain={showPercent ? [0, 100] : [0, 'auto']}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <ChartTooltipBody
                  title={String(label)}
                  rows={payload.map((p) => ({
                    key: String(p.dataKey),
                    label: p.dataKey === 'accumulator' ? 'accumulator' : 'maximizer',
                    value: showPercent
                      ? `${Math.round(Number(p.value))}%`
                      : formatMoney(Number(p.value)),
                    color: p.dataKey === 'accumulator' ? TEAL : GOLD,
                  }))}
                />
              );
            }}
          />
          <Legend content={({ payload }) => <ChartLegend payload={payload} />} />
          <Line
            type="linear"
            dataKey="accumulator"
            name="Accumulator"
            stroke={TEAL}
            strokeWidth={2}
            dot={{ r: 4, fill: TEAL, stroke: '#FAF7F2', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: TEAL, stroke: '#FAF7F2', strokeWidth: 2 }}
          />
          <Line
            type="linear"
            dataKey="maximizer"
            name="Maximizer"
            stroke={GOLD}
            strokeWidth={2}
            dot={{ r: 4, fill: GOLD, stroke: '#FAF7F2', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: GOLD, stroke: '#FAF7F2', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-2 text-xs italic text-ink/50">
        X-axis is intervention catch-points, not linear time. The maximizer continues
        bleeding evenly between fill 3 and year-end; only these five catch-points are
        sampled.
      </p>
    </div>
  );
}
