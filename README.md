# Copay-Assistance Leakage Modeler

An illustrative model of how manufacturer copay-assistance dollars leak across a commercially-insured patient's fill sequence over a plan year, and how much of that leakage stays recoverable depending on when the manufacturer intervenes.

The central idea the tool demonstrates in numbers: timing is the leak. Catching diversion early preserves manufacturer dollars; catching it late recovers almost nothing.

**This is a demonstration piece using hypothetical assumptions. It does not use real client data and is not a product.**

## What it models

The tool covers one patient, one specialty drug, and twelve monthly fills under two payer/PBM diversion tactics.

**Copay accumulator.** The manufacturer's assistance does not count toward the patient's deductible or out-of-pocket maximum. The card pays down the patient's cost-share each fill and drains at its normal pace, but because those dollars never advance the deductible, the patient hits a cost cliff when the card empties mid-year. Manufacturer dollars are consumed without moving the patient through the deductible, which is the outcome the assistance was meant to buy. The patient's own dollars do count, so once the card is gone the patient's spending stops at the plan's out-of-pocket max.

**Copay maximizer.** The drug is reclassified as a non-essential health benefit and the cost-share is engineered to extract the full annual card value evenly across the year. The patient usually faces no cliff, but the manufacturer loses the maximum possible amount.

## The core insight

The tool models an intervention-timing lever: enrollment, after fill 1, after fill 2, after fill 3, and retrospective (year-end). For each catch-point it computes the dollars already leaked (unrecoverable) and the dollars still recoverable if intervention happens at that point.

Under the default parameters, the two tactics diverge sharply. At a real quarter-end (around fill 3) the accumulator is already fully unrecoverable while the maximizer still has about 75% of the card on the table. That divergence, front-loaded loss versus a slower even bleed, is the point of the delayed-leakage curve.

Recoverable dollars are modeled as an idealized upper bound: 100% of the card balance not yet paid out at the catch-point. Real-world recovery is imperfect. The modeled quantity is labeled precisely as "card dollars captured by the tactic," not "waste."

## The detection layer: when can you actually catch it?

The recoverable curve lets you pick any catch-point freely. In practice, the catch-point is set by what the program knows before the first fill and what shows up on the claim. The detection layer derives each catch-point from the simulated claims, then reuses the same recoverable math.

There are two distinct claim signals:

- **Accumulator: overcharge.** The plan charges more cost-share than a compliant plan could, given what the program knows. If the plan design is known from a benefit verification, the bound is the plan's own deductible, coinsurance, and out-of-pocket max, applied as if the card dollars had counted. With claims alone, a copay program can't tell an accumulator from a legitimately high-deductible plan, so the only reliable bound is the legal out-of-pocket ceiling ($10,600 self-only in 2026). A compliant plan can't keep charging a patient past it for a covered drug unless the assistance isn't being counted.
- **Maximizer: fingerprint.** Cost-share equals the card's annual max divided by fills, confirmed when the same amount repeats. A maximizer never overcharges, so the overcharge test can't see it. The fingerprint test can.

Four detection methods are compared. Real-time rules act on the flagged claim itself, so the fills paid before the catch are the fills before the flagged one. Under the default parameters:

| Method | Accumulator | Maximizer |
| --- | --- | --- |
| Benefit verification before first fill | 0 fills paid, $15,000 (100%) | 0 fills paid, $15,000 (100%) |
| Real-time claim rules, plan design known | flag fill 2, $10,000 (67%) | flag fill 2, $13,750 (92%) |
| Real-time claim rules, claims alone | flag fill 3, $5,000 (33%) | flag fill 2, $13,750 (92%) |
| Quarterly claims review | after fill 3, $0 (0%) | after fill 3, $11,250 (75%) |

Maximizers forgive slow detection. Accumulators don't: the money is kept only by knowing the plan design before the first fill or by acting on the claim in real time. The rules are illustrative logic on hypothetical claims, not a production detector.

## Default parameters

| Parameter | Default |
| --- | --- |
| Drug cost per fill | $5,000 |
| Copay-card annual max | $15,000 |
| Patient deductible | $5,000 |
| Coinsurance after deductible | 20% |
| Fills per year | 12 |
| Plan out-of-pocket max | $10,600 (2026 ACA self-only ceiling) |

All parameters are adjustable in the interface. The calculation engine handles the general case, including deductible-straddle fills and mid-fill card exhaustion, so the numbers stay consistent across the full parameter range rather than only at the defaults.

## Scope

Deliberately narrow: one patient, two tactics, twelve monthly fills. No hybrid maximizer, no patient cohorts, no multiple drugs. Assumes in-network, non-grandfathered coverage where the ACA out-of-pocket cap applies.

Planned extensions, not implemented here: leakage measured as excess over a clean-adjudication counterfactual, a hybrid maximizer model, and program-level roll-ups across patient cohorts.

## Architecture

The calculation logic lives in `lib/leakage.ts` as pure functions, fully decoupled from the interface. Every mechanic is unit-tested, and a worked-example script prints the full fill-by-fill tables to the console for hand-verification.

- `lib/leakage.ts`: pure calculation engine (both tactics, intervention-timing logic, detection layer)
- `lib/leakage.test.ts`: unit tests covering the worked example and edge cases
- `scripts/worked-example.ts`: prints the worked-example tables to the console

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
