# Copay-Assistance Leakage Modeler

An illustrative model of how manufacturer copay-assistance dollars leak across a commercially-insured patient's fill sequence over a plan year, and how much of that leakage stays recoverable depending on when the manufacturer intervenes.

The central idea the tool demonstrates in numbers: timing is the leak. Catching diversion early preserves manufacturer dollars; catching it late recovers almost nothing.

**This is a demonstration piece using hypothetical assumptions. It does not use real client data and is not a product.**

## What it models

The tool covers one patient, one specialty drug, and twelve monthly fills under two payer/PBM diversion tactics.

**Copay accumulator.** The manufacturer's assistance does not count toward the patient's deductible or out-of-pocket maximum. The card pays down the patient's cost-share each fill and drains at its normal pace, but because those dollars never advance the deductible, the patient hits a cost cliff when the card empties mid-year. Manufacturer dollars are consumed without moving the patient through the deductible, which is the outcome the assistance was meant to buy.

**Copay maximizer.** The drug is reclassified as a non-essential health benefit and the cost-share is engineered to extract the full annual card value evenly across the year. The patient usually faces no cliff, but the manufacturer loses the maximum possible amount.

## The core insight

The tool models an intervention-timing lever: enrollment, after fill 1, after fill 2, after fill 3, and retrospective (year-end). For each catch-point it computes the dollars already leaked (unrecoverable) and the dollars still recoverable if intervention happens at that point.

Under the default parameters, the two tactics diverge sharply. At a real quarter-end (around fill 3) the accumulator is already fully unrecoverable while the maximizer still has about 75% of the card on the table. That divergence, front-loaded loss versus a slower even bleed, is the point of the delayed-leakage curve.

Recoverable dollars are modeled as an idealized upper bound: 100% of the card balance not yet paid out at the catch-point. Real-world recovery is imperfect. The modeled quantity is labeled precisely as "card dollars captured by the tactic," not "waste."

## Default parameters

| Parameter | Default |
| --- | --- |
| Drug cost per fill | $5,000 |
| Copay-card annual max | $15,000 |
| Patient deductible | $5,000 |
| Coinsurance after deductible | 20% |
| Fills per year | 12 |

All parameters are adjustable in the interface. The calculation engine handles the general case, including deductible-straddle fills and mid-fill card exhaustion, so the numbers stay consistent across the full parameter range rather than only at the defaults.

## Scope

Deliberately narrow: one patient, two tactics, twelve monthly fills. No hybrid maximizer, no patient cohorts, no multiple drugs, no out-of-pocket-maximum modeling.

Planned extensions, not implemented here: leakage measured as excess over a clean-adjudication counterfactual, a hybrid maximizer model, and out-of-pocket-maximum modeling.

## Architecture

The calculation logic lives in `lib/leakage.ts` as pure functions, fully decoupled from the interface. Every mechanic is unit-tested, and a worked-example script prints the full fill-by-fill tables to the console for hand-verification.

- `lib/leakage.ts` — pure calculation engine (both tactics, intervention-timing logic)
- `lib/leakage.test.ts` — unit tests covering the worked example and edge cases
- `scripts/worked-example.ts` — prints the worked-example tables to the console

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Recharts

State is held in React with no database, no persistence, and no backend.

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To run the tests and print the worked example:

```bash
npm test
npm run worked-example
```
