// Shared chart chrome (legend + tooltip) for Recharts line charts.
// Enforces the "text never wears the data color" rule: swatches carry
// series color, all text stays in ink tones.

interface LegendPayloadItem {
  value?: string;
  color?: string;
}

export function ChartLegend({ payload }: { payload?: readonly LegendPayloadItem[] }) {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-5 pb-2 pl-2 text-sm">
      {payload.map((entry, i) => (
        <div key={`legend-${i}`} className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-4 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-ink/80">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color: string;
}

export function ChartTooltipBody({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-md border border-ink/10 bg-cream px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-medium text-ink/60">{title}</div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2 py-0.5 text-sm">
          <span
            className="inline-block h-[2px] w-3 flex-shrink-0 rounded-full"
            style={{ backgroundColor: row.color }}
          />
          <span className="font-semibold text-ink">{row.value}</span>
          <span className="text-ink/60">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
