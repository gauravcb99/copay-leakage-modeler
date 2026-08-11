'use client';

import type { LeakageParams, Tactic } from '@/lib/leakage';
import { formatMoney } from '@/lib/format';

interface ControlsPanelProps {
  tactic: Tactic;
  onTacticChange: (tactic: Tactic) => void;
  params: LeakageParams;
  onParamsChange: (params: LeakageParams) => void;
  abandonAtCliff: boolean;
  onAbandonAtCliffChange: (value: boolean) => void;
}

function SliderRow({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={disabled ? 'opacity-40' : undefined}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <label className="text-ink/70">{label}</label>
        <span className="font-semibold text-ink">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full disabled:cursor-not-allowed"
      />
    </div>
  );
}

export function ControlsPanel({
  tactic,
  onTacticChange,
  params,
  onParamsChange,
  abandonAtCliff,
  onAbandonAtCliffChange,
}: ControlsPanelProps) {
  const isMaximizer = tactic === 'maximizer';

  function updateParam<K extends keyof LeakageParams>(key: K, value: LeakageParams[K]) {
    onParamsChange({ ...params, [key]: value });
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white/50 p-5">
      <div className="mb-5 flex gap-2">
        {(['accumulator', 'maximizer'] as Tactic[]).map((t) => (
          <button
            key={t}
            onClick={() => onTacticChange(t)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              tactic === t
                ? 'bg-teal text-cream'
                : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SliderRow
          label="Drug cost per fill"
          value={params.drugCostPerFill}
          displayValue={formatMoney(params.drugCostPerFill)}
          min={500}
          max={20000}
          step={100}
          onChange={(v) => updateParam('drugCostPerFill', v)}
        />
        <SliderRow
          label="Copay-card annual max"
          value={params.cardAnnualMax}
          displayValue={formatMoney(params.cardAnnualMax)}
          min={0}
          max={50000}
          step={500}
          onChange={(v) => updateParam('cardAnnualMax', v)}
        />
        <SliderRow
          label="Patient deductible"
          value={params.patientDeductible}
          displayValue={formatMoney(params.patientDeductible)}
          min={0}
          max={20000}
          step={100}
          disabled={isMaximizer}
          onChange={(v) => updateParam('patientDeductible', v)}
        />
        <SliderRow
          label="Coinsurance rate"
          value={params.coinsuranceRate}
          displayValue={`${Math.round(params.coinsuranceRate * 100)}%`}
          min={0}
          max={1}
          step={0.01}
          disabled={isMaximizer}
          onChange={(v) => updateParam('coinsuranceRate', v)}
        />
        <SliderRow
          label="Fills per year"
          value={params.fillsPerYear}
          displayValue={String(params.fillsPerYear)}
          min={1}
          max={12}
          step={1}
          onChange={(v) => updateParam('fillsPerYear', v)}
        />
      </div>

      {isMaximizer && (
        <p className="mt-3 text-xs text-ink/50">
          Deductible and coinsurance are inert under the maximizer tactic — cost-share
          is engineered to extract the card evenly across fills, independent of plan
          design.
        </p>
      )}

      {tactic === 'accumulator' && (
        <label className="mt-5 flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={abandonAtCliff}
            onChange={(e) => onAbandonAtCliffChange(e.target.checked)}
            className="h-4 w-4 accent-teal"
          />
          Patient abandons the drug at the cliff fill
        </label>
      )}
    </div>
  );
}
