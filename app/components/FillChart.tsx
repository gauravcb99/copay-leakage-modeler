'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LeakageParams, Tactic } from '@/lib/leakage';
import { simulateFillSequence } from '@/lib/leakage';
import { formatMoney } from '@/lib/format';
import { ChartLegend, ChartTooltipBody } from './ChartChrome';

const TEAL = '#0A4747';
const GOLD = '#C9A86A';

interface FillChartProps {
  params: LeakageParams;
  tactic: Tactic;
  abandonAtCliff: boolean;
}

export function FillChart({ params, tactic, abandonAtCliff }: FillChartProps) {
  const rows = simulateFillSequence(params, tactic, { abandonAtCliff });
  const cliffRow = rows.find((r) => r.isCliff);

  const data = rows.map((r) => ({
    fill: r.fill,
    mfr: r.cumulativeManufacturerCaptured,
    patientOOP: r.cumulativePatientOOP,
  }));

  return (
    <div className="rounded-lg border border-ink/10 bg-white/50 p-5">
      <h2 className="text-base font-semibold text-ink">Per-fill cumulative view</h2>
      <p className="mb-2 text-sm text-ink/60">
        Cumulative manufacturer dollars captured vs. cumulative patient out-of-pocket,
        fill by fill.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 48, right: 20, left: 10, bottom: 32 }}>
          <CartesianGrid stroke="#e5e0d8" vertical={false} />
          <XAxis
            dataKey="fill"
            tickLine={false}
            axisLine={{ stroke: '#e5e0d8' }}
            tick={{ fill: '#1A1A1A99', fontSize: 12 }}
            label={{ value: 'Fill', position: 'bottom', offset: 6, fill: '#1A1A1A99', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#1A1A1A99', fontSize: 12 }}
            tickFormatter={(v: number) => formatMoney(v)}
            width={80}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <ChartTooltipBody
                  title={`Fill ${label}`}
                  rows={payload.map((p) => ({
                    key: String(p.dataKey),
                    label:
                      p.dataKey === 'mfr' ? 'manufacturer captured' : 'patient out-of-pocket',
                    value: formatMoney(Number(p.value)),
                    color: p.dataKey === 'mfr' ? TEAL : GOLD,
                  }))}
                />
              );
            }}
          />
          {cliffRow && (
            <ReferenceLine
              x={cliffRow.fill}
              stroke={GOLD}
              strokeWidth={1}
              label={(props: { viewBox?: { x?: number; y?: number } }) => {
                const x = props.viewBox?.x ?? 0;
                const y = props.viewBox?.y ?? 0;
                // Rendered in the top margin (above the plot area), left-anchored off
                // the cliff line, so it never crosses the mfr line or a data point.
                return (
                  <text x={x + 6} y={y - 16} fill="#1A1A1A99" fontSize={11} textAnchor="start">
                    patient likely abandons here
                  </text>
                );
              }}
            />
          )}
          <Line
            type="linear"
            dataKey="mfr"
            name="Manufacturer captured (cumulative)"
            stroke={TEAL}
            strokeWidth={2}
            dot={{ r: 4, fill: TEAL, stroke: '#FAF7F2', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: TEAL, stroke: '#FAF7F2', strokeWidth: 2 }}
          />
          <Line
            type="linear"
            dataKey="patientOOP"
            name="Patient out-of-pocket (cumulative)"
            stroke={GOLD}
            strokeWidth={2}
            dot={{ r: 4, fill: GOLD, stroke: '#FAF7F2', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: GOLD, stroke: '#FAF7F2', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 border-t border-ink/5 pt-3">
        <ChartLegend
          payload={[
            { value: 'Manufacturer captured (cumulative)', color: TEAL },
            { value: 'Patient out-of-pocket (cumulative)', color: GOLD },
          ]}
        />
      </div>
    </div>
  );
}
