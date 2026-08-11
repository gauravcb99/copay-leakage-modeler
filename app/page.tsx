'use client';

import { useState } from 'react';
import type { LeakageParams, Tactic } from '@/lib/leakage';
import { DEFAULT_PARAMS } from '@/lib/leakage';
import { Disclaimer } from './components/Disclaimer';
import { ControlsPanel } from './components/ControlsPanel';
import { FillChart } from './components/FillChart';
import { RecoverableChart } from './components/RecoverableChart';
import { SoWhatPanel } from './components/SoWhatPanel';

export default function Home() {
  const [tactic, setTactic] = useState<Tactic>('accumulator');
  const [params, setParams] = useState<LeakageParams>(DEFAULT_PARAMS);
  const [abandonAtCliff, setAbandonAtCliff] = useState(true);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-teal">
          Copay-Assistance Leakage Modeler
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Modeling how much manufacturer copay-card money is captured by payer/PBM
          diversion tactics — and how much is still recoverable, depending on when the
          manufacturer catches it.
        </p>
      </header>

      <div className="mb-6">
        <Disclaimer />
      </div>

      <div className="mb-6">
        <ControlsPanel
          tactic={tactic}
          onTacticChange={setTactic}
          params={params}
          onParamsChange={setParams}
          abandonAtCliff={abandonAtCliff}
          onAbandonAtCliffChange={setAbandonAtCliff}
        />
      </div>

      <div className="mb-6">
        <FillChart params={params} tactic={tactic} abandonAtCliff={abandonAtCliff} />
      </div>

      <div className="mb-6">
        <RecoverableChart params={params} />
      </div>

      <div className="mb-6">
        <SoWhatPanel params={params} />
      </div>

      <footer className="border-t border-ink/10 pt-4 text-xs text-ink/45">
        <p>
          This model labels the modeled quantity precisely as{' '}
          <span className="italic">&ldquo;card dollars captured by the tactic,&rdquo;</span>{' '}
          not &ldquo;waste&rdquo; or &ldquo;pure leakage.&rdquo; Scope is deliberately
          narrow: one patient, one drug, two tactics, twelve monthly fills — no
          hybrid maximizer, no patient cohorts, no out-of-pocket maximum modeling.
        </p>
        <p className="mt-2">
          Planned v2 refinements (not implemented here): leakage measured as excess
          over a clean-adjudication counterfactual, a hybrid maximizer model, and
          out-of-pocket-maximum modeling.
        </p>
      </footer>
    </main>
  );
}
