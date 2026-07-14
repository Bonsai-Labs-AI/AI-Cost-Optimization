---
title: "Quality–Cost Evaluation Suite"
category: visibility-measurement
maturityLevel: 2
maturityProvisional: false
shortDescription: "An automated eval harness that scores quality AND cost together on a fixed test set, so every cost optimization can be checked for quality regression before it ships instead of being guessed at."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Model or prompt changes ship 'on vibes' with no regression gate."
  - "\"We tried a cheaper model but couldn't tell if quality dropped, so we reverted.\""
  - "No golden/reference test set exists for the product's real task types."
  - "Cost and quality are tracked in separate places (dashboards vs. spot-checks) and never compared per change."
measurementMethods:
  - "Eval coverage: fraction of real task types represented in the golden set."
  - "Cost captured per eval case (tokens and $) alongside the quality score — a 'quality per dollar' / cost-per-correct-answer number per candidate."
  - "Regressions caught pre-ship vs. discovered in production."
  - "Judge–human agreement (Cohen's kappa) on a spot-checked sample, to confirm the automated scorer is trustworthy."
status: published
lastUpdated: "2026-07-02"
related:
  - "visibility-measurement/cost-regression-tests"
  - "model-routing/model-right-sizing"
  - "model-routing/reasoning-token-budgeting"
  - "prompt-context/few-shot-example-pruning"
sources:
  - id: openai-eval-best
    title: "Evaluation best practices"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/evaluation-best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "Build the golden set from production data + expert-written correct answers + logs. Start with a strong LLM judge, validate agreement against human labels before optimizing for cost/latency, then scale."
  - id: openai-graders
    title: "Graders"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/graders"
    accessed: "2026-07-02"
    kind: docs
    note: "Model/score-model and text-similarity graders return a grade in 0–1. Model grading has an error rate; validate against human evaluation before running at scale. LLM graders incur their own token charges."
  - id: promptfoo-asserts
    title: "Assertions and Metrics — LLM Output Validation"
    publisher: "promptfoo Docs"
    year: 2026
    url: "https://www.promptfoo.dev/docs/configuration/expected-outputs/"
    accessed: "2026-07-02"
    kind: docs
    note: "Deterministic assertions (contains/regex/cost/latency) are free and instant; model-assisted assertions (llm-rubric, answer-relevance) send output to a judge model. 'cost' and 'latency' assertions each take a threshold."
  - id: promptfoo-ref
    title: "Configuration Reference"
    publisher: "promptfoo Docs"
    year: 2026
    url: "https://www.promptfoo.dev/docs/configuration/reference/"
    accessed: "2026-07-02"
    kind: docs
    note: "'cost' is a first-class assertion type with a threshold field — assert that $/response stays below a bound in the same run as quality assertions."
  - id: langfuse-cost
    title: "Token & Cost Tracking"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/token-and-cost-tracking"
    accessed: "2026-07-02"
    kind: docs
    note: "Cost is computed at ingestion from usage + a model price definition; supports tiered pricing and per-user/per-workflow cost attribution."
  - id: langfuse-exp
    title: "Experiments via SDK"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk"
    accessed: "2026-07-02"
    kind: docs
    note: "An experiment loops a task over each dataset item, traces every execution, and attaches item-level + run-level evaluator scores to the dataset run for side-by-side comparison."
  - id: braintrust-eval
    title: "Evaluate systematically"
    publisher: "Braintrust Docs"
    year: 2026
    url: "https://www.braintrust.dev/docs/evaluate"
    accessed: "2026-07-02"
    kind: docs
    note: "An Eval = data (test cases with inputs/expected/metadata) + task (the function under test) + scorers/classifiers. Token and cost data are attached to every span, so quality and cost sit on the same trace."
  - id: autoevals
    title: "Autoevals — evaluating AI model outputs using best practices"
    publisher: "Braintrust (GitHub)"
    year: 2026
    url: "https://github.com/braintrustdata/autoevals"
    accessed: "2026-07-02"
    kind: repo
    note: "Off-the-shelf scorers: LLM-as-judge (Factuality, ClosedQA, Summarization), RAG (faithfulness, answer relevancy/correctness), and heuristic (Levenshtein, exact match, BLEU)."
  - id: reliability
    title: "Reliability without Validity: A Systematic, Large-Scale Evaluation of LLM-as-a-Judge Models Across Agreement, Consistency, and Bias"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/abs/2606.19544"
    accessed: "2026-07-02"
    kind: paper
    note: "Exact-match agreement overstates judge quality by 33–41 pp vs. Cohen's kappa on MT-Bench; judge rankings shift up to 14 positions across benchmarks; some judges are highly consistent (>0.95 test-retest) yet strongly position-biased (>0.10)."
---

## Overview

Almost every other cost technique in this catalog — swapping to a cheaper model,
shortening a prompt, dropping few-shot examples, retrieving fewer chunks, lowering
reasoning effort — trades *some* quality for *some* savings. The only way to know whether
that trade is a win or a silent regression is to **measure quality and cost together on a
fixed set of representative tasks, before the change ships.** A Quality–Cost Evaluation
Suite is that measurement instrument: a golden test set, one or more automated scorers,
and per-case token/cost capture, run on every candidate change.

Without it, "we tried a cheaper model but couldn't tell if quality dropped" is the default
outcome — teams either revert good savings out of fear, or ship a regression they discover
weeks later from support tickets. This is why the suite is the **Level-2-defining
investment**: it is the gate that makes right-sizing, routing, prompt pruning, and
compression *safe* rather than guesses. It sits at L2 (not L1) because it is real
engineering — you have to curate a representative dataset and define a defensible quality
bar, which is not a config toggle.[^openai-eval-best]

The cost payoff is indirect but large: the suite itself saves nothing, but it *unlocks*
every downstream saving by letting you push each optimization to the point where quality
just starts to slip — and stop there with evidence, not nerves.

## Detailed Approach & Techniques

### The four parts of a minimal suite

A defensible quality-cost suite has four components. Off-the-shelf tooling now provides all
four; the leading eval frameworks converge on the same shape — **data + task + scorers** —
with cost attached.[^braintrust-eval][^langfuse-exp]

1. **A golden/reference set.** A curated collection of representative task inputs, ideally
   built from a mix of real **production data**, **expert-written correct answers**, and
   **historical logs** — chosen to cover the product's actual task types (not toy prompts).[^openai-eval-best]
   Both Langfuse and Braintrust let you promote real production traces straight into a
   dataset, which is the cheapest way to make the set representative.[^langfuse-exp][^braintrust-eval]

2. **Task metrics / scorers.** How each output is judged. Prefer cheap, deterministic
   scorers where the task allows — exact match, JSON diff, regex, numeric difference,
   BLEU/ROUGE, Levenshtein — because they are free, instant, and unbiased.[^autoevals][^promptfoo-asserts]
   Where the answer is open-ended, fall back to a reference-based scorer or an
   **LLM-as-a-judge** rubric (e.g. Autoevals' `Factuality`, or promptfoo's `llm-rubric`).[^autoevals][^promptfoo-asserts]

3. **A per-run cost/token capture on the *same* record as the quality score.** This is the
   axis that turns a plain eval into a *quality-cost* eval. Observability platforms compute
   $ per call from token usage plus a model price table and attach it to every trace/span,
   so a dataset run carries both the score and the spend for each candidate side by side.[^langfuse-cost][^braintrust-eval]
   promptfoo goes further and exposes **`cost` and `latency` as first-class assertions with
   a `threshold`** — you can fail a candidate that answers correctly but costs more than a
   set bound, in the same run as the quality checks.[^promptfoo-asserts][^promptfoo-ref]

4. **A quality bar + comparison.** Run the suite on the current production config
   (baseline) and each candidate, then compare. An experiment loops the task over every
   dataset item, traces each execution, and reports item-level and run-level scores so
   candidates can be diffed directly.[^langfuse-exp]

### Wiring in the cost axis: "quality per dollar"

The metric that matters is not quality alone and not cost alone but **cost-adjusted
quality** — most usefully expressed as **cost-per-correct-answer** (total $ ÷ number of
cases that met the bar). A candidate that is 10% cheaper but drops from 92% to 78% correct
is often *more* expensive per correct answer, and only a joint measurement reveals it.
Because platforms attach token/cost to the same record as the score, this is a division
over two columns you already have, not new instrumentation.[^langfuse-cost][^braintrust-eval]
Graders themselves return a normalized grade in 0–1, which makes the arithmetic
clean.[^openai-graders]

### LLM-as-a-judge: powerful, but calibrate it

An LLM judge is now the standard scorer for open-ended output, but treating its verdicts as
ground truth is the main way this technique misleads. The honest caveats:

- **Judges are biased by surface features** — position, verbosity, and style — rather than
  content. A large-scale study found some production judges were highly *consistent*
  (>0.95 test-retest) yet strongly *position-biased* (>0.10): stable but systematically
  wrong.[^reliability]
- **Simple agreement overstates skill.** Exact-match agreement with humans overstated real
  discriminative power by **33–41 percentage points versus Cohen's kappa** on MT-Bench, and
  judge rankings shifted by up to **14 positions** across benchmarks — so a judge validated
  on one task type does not automatically transfer.[^reliability]
- **The mitigation is a rubric + human calibration.** Providers are explicit: use a strong
  model as the judge, give it a written rubric and room to reason, and **validate its
  agreement against human labels before optimizing for cost or latency**, because model
  grading always has an error rate.[^openai-eval-best][^openai-graders] In practice: keep a
  small human-labeled slice, measure judge–human kappa on it periodically (judges drift as
  underlying models change), and re-anchor. And remember the judge itself burns tokens —
  its cost belongs in the budget too.[^openai-graders]

### Build vs. buy

You rarely build this from scratch in 2026. promptfoo (YAML test cases + deterministic and
`llm-rubric` assertions + a `cost` assertion, CI-friendly), Langfuse (production traces →
datasets → SDK experiments with cost attached), and Braintrust (Eval = data + task +
scorers, token/cost on every span) all ship the harness; Autoevals gives ready-made
scorers.[^promptfoo-asserts][^langfuse-exp][^braintrust-eval][^autoevals] The engineering
effort is in curating the golden set and defining the bar — the tooling is off-the-shelf,
which is exactly why this is L2 and not L3.

## Example Where It Works

A B2B support-automation product wants to move its answer-generation step from a flagship
model to a mid-tier one to cut per-answer cost by roughly 5×. Before the suite, this change
was reverted twice because "it felt worse."

The team curates **200 golden cases** from real tickets, each with an expert-approved
answer, tagged by task type (policy lookup, troubleshooting, refund reasoning). They score
with a deterministic check on the structured fields plus an `llm-rubric` judge for the free
text, calibrated against **40 human-labeled cases** (judge–human kappa 0.71 — good enough to
trust with spot-checks).[^openai-eval-best][^promptfoo-asserts] Every case captures $ and
tokens from the trace.[^langfuse-cost]

Running baseline vs. candidate, they see the mid-tier model holds **90% → 88%** correct
while cost-per-correct-answer falls from **$0.041 to $0.009** — and, critically, the 2-point
drop is concentrated entirely in the "refund reasoning" task type. So they ship the cheap
model everywhere *except* refund reasoning, which they route to the flagship. The suite
turned a fear-driven revert into a targeted, evidence-backed 4× saving — and became the
golden set that their [cost-regression tests](/techniques/visibility-measurement/cost-regression-tests/)
now run against on every PR.

## Example Where It Would NOT Work

- **No stable notion of "correct."** For a creative brainstorming or open-ended companion
  chatbot with no reference answer and no agreed rubric, the judge is scoring taste. Given
  that judges are swayed by verbosity and style over substance, the eval can produce a
  confident cost-vs-quality number that is largely noise — and optimizing against it can
  actively steer the product toward whatever the judge happens to prefer.[^reliability]
- **The golden set isn't representative.** A suite built from 30 easy hand-picked prompts
  will happily green-light a cheaper model that fails on the long tail of real traffic the
  set never covered. Coverage of real task types is the whole game; a small unrepresentative
  set gives false confidence, which is worse than no suite.[^openai-eval-best]
- **Throwaway or pre-PMF prototypes.** For a one-off script or a product still changing its
  core task weekly, the cost of curating and maintaining a golden set (and re-calibrating the
  judge as the task shifts) can exceed the spend it protects. Here a couple of manual
  spot-checks per change are the right-sized answer; the full suite is premature — it earns
  its keep once the workload is stable and volume makes downstream savings material enough to
  be worth gating.
- **Uncalibrated judge as ground truth.** If the team skips the human-agreement check and
  trusts raw judge scores, a position- or verbosity-biased judge can rank a *worse, cheaper*
  candidate above the incumbent, and the suite becomes a machine for shipping regressions
  with a number attached.[^reliability][^openai-graders]

[^openai-eval-best]: OpenAI API Docs, "Evaluation best practices" — <https://developers.openai.com/api/docs/guides/evaluation-best-practices>
[^openai-graders]: OpenAI API Docs, "Graders" — <https://developers.openai.com/api/docs/guides/graders>
[^promptfoo-asserts]: promptfoo Docs, "Assertions and Metrics — LLM Output Validation" — <https://www.promptfoo.dev/docs/configuration/expected-outputs/>
[^promptfoo-ref]: promptfoo Docs, "Configuration Reference" — <https://www.promptfoo.dev/docs/configuration/reference/>
[^langfuse-cost]: Langfuse Docs, "Token & Cost Tracking" — <https://langfuse.com/docs/observability/features/token-and-cost-tracking>
[^langfuse-exp]: Langfuse Docs, "Experiments via SDK" — <https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk>
[^braintrust-eval]: Braintrust Docs, "Evaluate systematically" — <https://www.braintrust.dev/docs/evaluate>
[^autoevals]: Braintrust, "Autoevals" (GitHub) — <https://github.com/braintrustdata/autoevals>
[^reliability]: Norman, Rivera & Hughes, "Reliability without Validity: A Systematic, Large-Scale Evaluation of LLM-as-a-Judge Models Across Agreement, Consistency, and Bias," arXiv — <https://arxiv.org/abs/2606.19544>
