---
title: "Automated Prompt Optimization (DSPy / GEPA)"
category: prompt-context
maturityLevel: 4
maturityProvisional: false
shortDescription: "Use an optimizer (DSPy MIPROv2 / GEPA) to search for prompts and few-shot sets that maximize a metric — including a token/cost term — so prompts become compiled artifacts that are shorter and let a cheaper model still pass the bar, instead of hand-tuned by trial and error."
effort: High
gain: High
riskToQuality: Medium
detectionSignals:
  - "Prompts are hand-tuned by trial-and-error with no metric-driven search behind them."
  - "A stable, high-volume task where a shorter optimized prompt would compound savings across millions of calls."
  - "A good eval set already exists (or is cheap to build) but is only used for grading, never for optimization."
  - "You are paying frontier-model prices on a narrow task a smaller model might handle if its prompt were properly optimized."
measurementMethods:
  - "Metric score at fixed cost, or cost at fixed metric, optimized vs. hand-tuned prompt."
  - "Input tokens per call after optimization (shorter instructions / fewer demonstrations)."
  - "Cheapest model that still clears the metric bar before vs. after optimization (blended $/call)."
  - "Optimizer compute cost (rollouts × token price) and re-optimization cadence when models or tasks change."
  - "Generalization gap: held-out metric vs. training metric, to catch overfitting to the eval set."
status: published
lastUpdated: "2026-07-03"
related:
  - "visibility-measurement/quality-cost-evaluation-suite"
  - "prompt-context/few-shot-example-pruning"
  - "prompt-context/dynamic-few-shot-selection"
  - "prompt-context/learned-prompt-compression"
  - "fine-tuning/fine-tuning-cheaper-models"
sources:
  - id: dspy-paper
    title: "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines"
    publisher: "arXiv (ICLR 2024)"
    authors: "Khattab, Singhvi, Maheshwari, Zhang, Santhanam, et al."
    year: 2023
    url: "https://arxiv.org/abs/2310.03714"
    accessed: "2026-07-03"
    kind: paper
    note: "Compiled DSPy programs beat standard few-shot prompting generally by over 25% (GPT-3.5) and 65% (Llama2-13b-chat), and beat expert-written few-shot by 5–46%. Programs compiled to small LMs (770M T5, Llama2-13b) become competitive with expert-written prompt chains for GPT-3.5 — i.e., optimization lets a cheaper model reach a frontier-prompt result."
  - id: dspy-miprov2
    title: "MIPROv2 Optimizer"
    publisher: "DSPy Documentation"
    year: 2026
    url: "https://dspy.ai/api/optimizers/MIPROv2/"
    accessed: "2026-07-03"
    kind: docs
    note: "MIPROv2 bootstraps few-shot demonstration candidates by running the program on training inputs and keeping successful traces, proposes grounded instruction candidates, then uses Bayesian optimization over num_trials to pick the best instruction+demo combination against the validation metric."
  - id: dspy-metrics
    title: "Metrics — DSPy"
    publisher: "DSPy Documentation"
    year: 2026
    url: "https://dspy.ai/learn/evaluation/metrics/"
    accessed: "2026-07-03"
    kind: docs
    note: "A DSPy metric is arbitrary Python: metric(example, prediction, trace=None) returning a float. It can be a simple boolean, a rule-based check, an LLM judge, or a combination of multiple properties — so a length/cost penalty can be folded straight into the objective the optimizer maximizes."
  - id: gepa-paper
    title: "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning"
    publisher: "arXiv (ICLR 2026, oral)"
    authors: "Agrawal, Tan, Soylu, Ziems, Khare, Opsahl-Ong, et al."
    year: 2025
    url: "https://arxiv.org/abs/2507.19457"
    accessed: "2026-07-03"
    kind: paper
    note: "Genetic-Pareto optimizer: samples trajectories, reflects on execution traces in natural language, mutates prompts, and combines complementary lessons from a Pareto frontier. Outperforms GRPO (RL) by 6% on average and up to 20% while using up to 35x fewer rollouts; beats MIPROv2 by over 10% (+12% on AIME-2025)."
  - id: gepa-site
    title: "GEPA — Optimize Anything with LLMs"
    publisher: "gepa-ai.github.io"
    year: 2026
    url: "https://gepa-ai.github.io/gepa/"
    accessed: "2026-07-03"
    kind: docs
    note: "Reports gpt-oss-120b + GEPA beating Claude Opus 4.1 while being 90x cheaper; a GEPA-discovered cloud scheduling policy giving 40.2% cost savings; 50+ production use cases across Shopify, Databricks, Dropbox, Google, Microsoft, OpenAI and others."
  - id: kmad-ner
    title: "Achieving a 22-point improvement in structured extraction using DSPy and GEPA"
    publisher: "kmad.ai (Kevin Madura)"
    year: 2026
    url: "https://kmad.ai/DSPy-Optimization"
    accessed: "2026-07-03"
    kind: blog
    note: "Financial NER with gpt-4.1-mini (extraction) + gpt-4.1 (GEPA reflection): 32.07% → 54.43% exact match (~22 points). ~1,200 rollouts, roughly $2–3 in API cost for the whole optimization run."
  - id: decagon-gepa
    title: "Optimizing GEPA for production: A test-driven approach to prompt engineering"
    publisher: "Decagon Blog"
    year: 2026
    url: "https://decagon.ai/blog/optimizing-gepa-for-production"
    accessed: "2026-07-03"
    kind: blog
    note: "Production GEPA on a supervisor classifier: 4× prompt compression (5,000 → 1,000 chars) for only 0.8% accuracy loss; 20–100 examples beat 500 (scaling to 500 ballooned prompt length 75% while performance dropped — overfitting); reflection model must be a frontier model but is only 5–10% of total cost."
---

## Overview

Most teams write prompts by hand: try a wording, eyeball a few outputs, tweak, repeat.
That process has no objective, no search, and no guarantee the prompt you shipped is
anywhere near the cheapest one that clears your quality bar. **Automated prompt
optimization** replaces trial-and-error with a compiler: you define a **metric** and a
small **training/validation set**, and an optimizer *searches* the space of instructions
and few-shot demonstrations for the prompt that maximizes that metric.[^dspy-paper]

The cost angle is what makes this a cost-optimization technique rather than only a quality
one. Because the objective is a metric you control, you can make the optimizer prefer
**shorter** prompts (fewer input tokens on every call, forever) and — critically — you can
run the search *against a cheaper model* and keep whichever model still passes. DSPy's
original paper showed programs compiled to small open models (a 770M-parameter T5,
Llama2-13B) becoming **competitive with expert-written prompt chains for GPT-3.5**;[^dspy-paper]
GEPA's maintainers report an open `gpt-oss-120b` optimized with GEPA **beating Claude Opus
4.1 while being 90× cheaper** on their task.[^gepa-site] The prompt stops being a
hand-written string and becomes a **compiled artifact** that is re-derived when the metric,
the data, or the model changes.

This sits at **Level 4** because it is a real optimization loop, not prompt editing. It
needs three things a hand-tuning workflow does not: a **metric / eval harness** (the same
asset an L2 quality-cost evaluation suite provides), a **training set**, and **optimizer
compute** to run the search. It also carries L4 failure modes — overfitting to the eval
set, opaque machine-written prompts, and brittleness across model swaps that forces
**re-optimization**. It pays off on **stable, high-volume tasks** where a shorter prompt or
a cheaper model compounds across millions of calls; below that volume, the L2 evaluation
suite plus manual few-shot pruning is the cheaper win.

## Detailed Approach & Techniques

### The metric is the whole game

Everything downstream depends on a **metric function**. In DSPy a metric is arbitrary
Python with the signature `metric(example, prediction, trace=None)` returning a float — it
can be a boolean exact-match, a rule-based check, an LLM judge, or **a combination of
multiple properties**.[^dspy-metrics] That flexibility is exactly where the **cost term**
enters: you fold a token/length or price penalty directly into the objective, e.g.

> `score = quality(pred) − λ · (input_tokens + output_tokens) / budget`

so the optimizer is rewarded for *cheaper* prompts that still answer correctly, not just
*better* ones. Because the same function is what gets maximized, "make it accurate" and
"make it cheap" become a single, tunable objective rather than two competing hand-edits.

### DSPy / MIPROv2 — compile a program against a metric

MIPROv2 optimizes **instructions and few-shot demonstrations jointly** in three stages:[^dspy-miprov2]

1. **Bootstrap demonstrations.** Run the program on training inputs; keep the traces where
   the metric passes as candidate few-shot examples ("bootstrapping" — the demos are
   generated, not hand-labeled).
2. **Propose instructions.** A `prompt_model` proposes alternative instruction wordings
   grounded in the data, program structure, and the bootstrapped demos.
3. **Bayesian search.** Over `num_trials`, evaluate instruction × demonstration
   combinations on the validation set (minibatched), and return the combination that scores
   best. Compiled DSPy programs beat standard few-shot prompting **generally by over 25%
   (GPT-3.5)** and **65% (Llama2-13B)**, and beat *expert-written* few-shot by **5–46%** —
   "within minutes of compiling."[^dspy-paper]

### GEPA — reflective/evolutionary prompt search

GEPA (Genetic-Pareto) takes a different route that is often far more **sample-efficient**.
Instead of numeric-reward search, it: samples trajectories (reasoning, tool calls,
outputs); **reflects on the execution traces in natural language** to diagnose what went
wrong; mutates the prompt accordingly; and combines complementary lessons from a **Pareto
frontier** of candidates.[^gepa-paper] Feeding the model rich textual feedback — error
messages, judge rationales — rather than a single scalar lets it learn *why* it failed and
fix it directly. Reported results: GEPA **outperforms GRPO (reinforcement learning) by 6%
on average and up to 20% while using up to 35× fewer rollouts**, and beats **MIPROv2 by
over 10% (+12% on AIME-2025)**.[^gepa-paper] Fewer rollouts is itself a cost story — the
optimization run is cheap enough that one practitioner reports GEPA finding a
**22-percentage-point** accuracy gain (32.07% → 54.43% exact match on financial entity
extraction) in **~1,200 rollouts for roughly $2–3 of API spend**.[^kmad-ner]

### How this cuts inference cost (not just optimizer cost)

Two compounding levers, both realized on *every production call* after the one-time search:

- **Shorter prompts.** An optimizer will happily converge on a terse, instruction-led
  prompt over a demonstration-heavy one if the metric rewards it. Decagon reports GEPA
  **compressing a production prompt 4× (5,000 → 1,000 characters) for only 0.8% accuracy
  loss** — a direct, permanent input-token reduction on a high-volume classifier.[^decagon-gepa]
- **Cheaper model, same bar.** Run the search against a smaller model; if the optimized
  prompt clears the metric, you ship the smaller model. This is the mechanism behind the
  "small model matches frontier prompt-chain" result[^dspy-paper] and the "gpt-oss-120b +
  GEPA beats Opus 4.1 at 90× cheaper" claim.[^gepa-site] Optimization "allows transferring a
  capability to cheaper models while retaining acceptable accuracy."[^kmad-ner]

### Why this is genuinely L4 (the costs and the overfit trap)

- **Optimizer compute.** Every trial is one or more full model calls over your data; large
  searches cost real money and time (the RL alternatives GEPA beats cost far more).[^gepa-paper]
- **Re-optimization.** When you swap the base model or the task shifts, the compiled prompt
  can go stale and must be re-run — the artifact is coupled to the model it was compiled
  against. (Notably, this is the caveat practitioner writeups tend to *under*-discuss.)[^decagon-gepa]
- **Overfitting to the eval set.** The optimizer maximizes *your* metric on *your* set, so a
  weak metric or too much data can teach it the training minutiae. Decagon found **20–100
  examples consistently beat 500** — scaling to 500 **ballooned prompt length by 75% while
  performance dropped**, and GEPA had to be explicitly regularized with length constraints
  to stop it accreting detail.[^decagon-gepa] Machine-written prompts are also **opaque**,
  which complicates debugging and review.
- **Frontier reflection model required.** GEPA's *reflection* step needs a strong model
  (smaller models "completely fail at prompt optimization"), but it is only **5–10% of total
  optimization cost**, so this is a competence requirement more than a budget one.[^decagon-gepa]

## Example Where It Works

A fintech runs a **document-classification / entity-extraction** service: one narrow,
well-specified task, a clean labeled eval set, and **millions of calls per month** on a
frontier model with a long hand-tuned prompt full of few-shot examples.

- Define a metric that combines exact-match quality with a token penalty, then run GEPA
  against a **smaller/cheaper model**.
- The optimizer both **shortens the prompt** (Decagon's 4×-compression, ~1% quality
  cost)[^decagon-gepa] and finds instructions good enough that the smaller model clears the
  bar — the DSPy/GEPA "small model matches the frontier prompt-chain" outcome.[^dspy-paper][^gepa-site]
- Payoff arithmetic: the search is a **one-time ~$2–3–to–low-hundreds** cost;[^kmad-ner] the
  per-call savings (fewer input tokens **and** a cheaper model, potentially the reported
  order-of-magnitude gap)[^gepa-site] recur on every one of the millions of monthly calls.
  At that volume the optimizer compute is rounding error and the compounded inference
  savings are the win — a textbook L4 fit: stable, high-volume, metric-gradeable.

## Example Where It Would NOT Work

- **No metric, or a bad one.** The optimizer maximizes exactly what you measure. Open-ended
  generation (marketing copy, brainstorming, chat) with no reliable automatic metric gives
  the search nothing to climb; you would be optimizing against a noisy LLM judge and risk
  overfitting to *its* quirks.[^dspy-metrics][^decagon-gepa]
- **Low or one-off volume.** The optimizer compute and eval-harness build are fixed costs
  that only amortize at scale. For a task run a few thousand times, hand-tuning plus **L2
  few-shot example pruning** and an evaluation suite recovers most of the win at a fraction
  of the setup — reach for the compiler only when the per-call savings compound.
- **Fast-moving prompts or models.** If the task, schema, or base model changes weekly, the
  compiled prompt keeps going stale and you re-pay the optimization cost each time; the
  artifact's coupling to its target model turns re-optimization into a treadmill.[^decagon-gepa]
- **Tiny data / high overfit risk.** With only a handful of examples, the optimizer memorizes
  them and the held-out metric collapses — and the opaque machine-written prompt makes the
  regression hard to diagnose. Decagon's "20–100 beats 500, but you still need careful
  regularization" finding cuts both ways: too little data overfits, too much bloats.[^decagon-gepa]

[^dspy-paper]: Khattab et al., "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines," arXiv 2310.03714 — <https://arxiv.org/abs/2310.03714>
[^dspy-miprov2]: DSPy Documentation, "MIPROv2 Optimizer" — <https://dspy.ai/api/optimizers/MIPROv2/>
[^dspy-metrics]: DSPy Documentation, "Metrics" — <https://dspy.ai/learn/evaluation/metrics/>
[^gepa-paper]: Agrawal et al., "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning," arXiv 2507.19457 — <https://arxiv.org/abs/2507.19457>
[^gepa-site]: GEPA, "Optimize Anything with LLMs" — <https://gepa-ai.github.io/gepa/>
[^kmad-ner]: Kevin Madura, "Achieving a 22-point improvement in structured extraction using DSPy and GEPA" — <https://kmad.ai/DSPy-Optimization>
[^decagon-gepa]: Decagon, "Optimizing GEPA for production: A test-driven approach to prompt engineering" — <https://decagon.ai/blog/optimizing-gepa-for-production>
