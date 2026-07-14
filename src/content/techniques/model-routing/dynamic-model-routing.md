---
title: "Dynamic Model Routing"
category: model-routing
maturityLevel: 3
maturityProvisional: false
shortDescription: "Route each request at runtime to the cheapest model that can handle *this* input by predicting its difficulty before generating, so the easy majority pays cheap-model prices instead of flagship prices for all traffic."
effort: High
gain: Very High
riskToQuality: Medium
detectionSignals:
  - "One flagship model serves all traffic regardless of per-request difficulty."
  - "There is no per-request difficulty or complexity signal computed before the call."
  - "A large share of traffic is trivially easy (FAQs, formatting, short lookups) yet pays frontier prices."
  - "Blended $/request is high and roughly flat across obviously easy and obviously hard queries."
measurementMethods:
  - "Blended $/request before vs. after routing."
  - "% of traffic routed to the cheap tier."
  - "Quality held at a fixed bar on an eval set (accuracy/win-rate must not drop below threshold)."
  - "Router misroute rate: hard queries sent to the cheap model, measured on a labeled slice."
  - "Router overhead: added latency and per-request classifier/judge cost."
status: published
lastUpdated: "2026-07-03"
related:
  - "model-routing/model-right-sizing"
  - "model-routing/llm-cascades"
  - "model-routing/provider-routing"
  - "visibility-measurement/quality-cost-evaluation-suite"
  - "fine-tuning/router-training-from-traffic"
sources:
  - id: routellm-paper
    title: "RouteLLM: Learning to Route LLMs with Preference Data"
    publisher: "arXiv (ICLR 2025)"
    authors: "Ong, Almahairi, Wu, Chiang, Wu, Gonzalez, Kadous, Stoica"
    year: 2024
    url: "https://arxiv.org/abs/2406.18665"
    accessed: "2026-07-03"
    kind: paper
    note: "Routers trained on human preference data + data augmentation cut cost by >2x in cases without compromising quality; transfer to new model pairs at test time."
  - id: routellm-blog
    title: "RouteLLM: An Open-Source Framework for Cost-Effective LLM Routing"
    publisher: "LMSYS Org"
    year: 2024
    url: "https://www.lmsys.org/blog/2024-07-01-routellm/"
    accessed: "2026-07-03"
    kind: blog
    note: "Matrix-factorization router reaches 95% of GPT-4 quality at 26% strong-model calls (~48% cheaper); with LLM-judge augmentation, 14% strong-model calls (75% cheaper) on MT Bench. Matches commercial routers while >40% cheaper."
  - id: routellm-repo
    title: "RouteLLM: A framework for serving and evaluating LLM routers"
    publisher: "GitHub — lm-sys/RouteLLM"
    year: 2026
    url: "https://github.com/lm-sys/RouteLLM"
    accessed: "2026-07-03"
    kind: repo
    note: "Four router types: matrix factorization (recommended), similarity-weighted ranking, BERT classifier, causal-LLM classifier. Headline: up to 85% cheaper at 95% GPT-4 performance on MT Bench."
  - id: openai-gpt5
    title: "Introducing GPT-5"
    publisher: "OpenAI"
    year: 2026
    url: "https://openai.com/index/introducing-gpt-5/"
    accessed: "2026-07-03"
    kind: blog
    note: "GPT-5 is a unified system: a fast model, a deeper reasoning model (GPT-5 thinking), and a real-time router that decides which to use based on conversation type, complexity, tool needs, and explicit intent; mini variants handle overflow. Router continuously trained on switch signals, preference rates, and measured correctness."
  - id: openai-gpt5-dev
    title: "Introducing GPT-5 for developers"
    publisher: "OpenAI"
    year: 2026
    url: "https://openai.com/index/introducing-gpt-5-for-developers/"
    accessed: "2026-07-03"
    kind: docs
    note: "API exposes gpt-5, gpt-5-mini, gpt-5-nano plus a reasoning_effort parameter (minimal, low, medium, high) so developers can trade off performance, cost, and latency explicitly."
  - id: notdiamond
    title: "What is Model Routing?"
    publisher: "Not Diamond — Docs"
    year: 2026
    url: "https://docs.notdiamond.ai/docs/what-is-model-routing"
    accessed: "2026-07-03"
    kind: docs
    note: "Managed router predicts the best model per query; optimization modes Quality (default), Cost, Latency, plus a cost_quality_tradeoff parameter (0–10). Pre-trained and custom (train-on-your-evals) routers."
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/html/2510.00202v1"
    accessed: "2026-07-03"
    kind: benchmark
    note: "~8,000 queries, 9 domains, 3 Bloom difficulty levels; five scores. Finding: all routers fall short of the oracle because they are inefficient at recognizing when a cheap model suffices; open-source routers hit ~35% lower cost at <2% accuracy loss."
---

## Overview

Most products send **every** request to a single model — usually a capable, expensive
flagship — regardless of how hard the individual request actually is. But real traffic is
wildly uneven: a large fraction of it is trivially easy (a greeting, a reformat, a short
lookup, a simple classification) and would be answered identically by a model that costs a
fraction as much, while only a minority genuinely needs frontier reasoning. Paying flagship
prices for the easy majority is pure waste.

**Dynamic model routing** puts a decision layer *in front of* the model: for each request it
predicts how difficult the input is and dispatches it to the **cheapest model that can still
meet the quality bar for that input** — a small classifier, an embedding-similarity router,
or a lightweight LLM judge decides *before* any answer is generated.[^routellm-paper] The
easy majority flows to a cheap model; the hard residual is escalated to the flagship.

Two boundaries matter and are easy to blur:

- **Not provider-routing (L2).** Provider routing picks the *cheapest host for the same model
  tier* (e.g. the cheapest place to run one open-weight model). Dynamic routing instead moves
  *across capability tiers by per-request difficulty*.
- **Not LLM cascades (L3, sibling).** A cascade decides *after* generating — it runs the cheap
  model, checks the output, and escalates on failure. A router decides *before* generating,
  from the input alone, so it never pays for a wasted cheap-model attempt on hard queries but
  must predict difficulty without seeing the answer.

It sits at **Level 3** because doing it well is real engineering: you need a trained or tuned
router, a held-quality eval harness to set the escalation threshold, and monitoring for
misroutes. The payoff is large — RouteLLM-style routers report **up to ~85% cost reduction
while retaining 95% of GPT-4 quality** on MT Bench.[^routellm-repo]

## Detailed Approach & Techniques

### Router mechanisms

A router is a cheap function `f(prompt) → model`. The main families:

- **Trained preference/classifier routers.** RouteLLM trains routers on human preference data
  (which of two models "won" on a prompt) to predict whether the weak model will suffice. It
  ships four variants — **matrix factorization** (the recommended default), **similarity-
  weighted ranking** (a prompt-similarity-weighted Elo), a **BERT classifier**, and a
  **causal-LLM classifier**.[^routellm-repo] On MT Bench, the matrix-factorization router
  trained on Arena data alone reaches **95% of GPT-4 performance while calling the strong model
  only 26% of the time (~48% cheaper than random routing)**; adding LLM-judge-augmented data
  halves that to **14% strong-model calls — 75% cheaper**.[^routellm-blog] Crucially, the paper
  shows these routers **transfer to new model pairs at test time** without retraining, so the
  same router generalizes as you swap the underlying strong/weak models.[^routellm-paper]

- **Embedding / kNN routers.** Embed the incoming prompt and route by similarity to a labeled
  bank of past prompts with known "which model was needed" outcomes — cheap to run and easy to
  update from traffic.

- **LLM-judge routers.** A small, fast model reads the prompt and outputs a difficulty class or
  a target-model choice. More flexible than a fixed classifier but adds a real per-request call,
  so the judge must be much cheaper than the models it routes between or it eats the savings.

### Managed / provider-native routers (the buy option)

You do not always have to build this.

- **GPT-5's built-in router** is the zero-config end of the spectrum. OpenAI ships GPT-5 as a
  *unified system*: "a smart, efficient model that answers most questions, a deeper reasoning
  model (GPT-5 thinking) for harder problems, and a real-time router that quickly decides which
  to use based on conversation type, complexity, tool needs, and your explicit intent," with
  `mini` variants absorbing overflow once limits are hit.[^openai-gpt5] The router is
  "continuously trained on real signals, including when users switch models, preference rates
  for responses, and measured correctness."[^openai-gpt5] In the API you also get the explicit
  levers directly — `gpt-5`, `gpt-5-mini`, `gpt-5-nano` and a `reasoning_effort` parameter
  (`minimal | low | medium | high`) to trade performance against cost and latency per
  call.[^openai-gpt5-dev]
- **Third-party managed routers** (Not Diamond, Martian, Unify) expose a drop-in endpoint that
  "predicts which model will provide the highest quality response at the lowest cost for that
  specific query," with **Quality / Cost / Latency** optimization modes and a tunable
  `cost_quality_tradeoff` (0–10); they offer both a general pre-trained router and custom
  routers trained on your own eval data.[^notdiamond]

**Buy vs. build:** a managed auto-router is the right first move — it captures most of the win
with near-zero engineering. Build your own only when your task distribution is narrow and
unusual (the general router misjudges it), you need models outside the provider's pool, or you
want to close the gap between a generic router and your specific quality bar. Independent
benchmarking shows this gap is real: on **RouterArena** (~8,000 queries, 9 domains, 3 difficulty
levels), *every* router falls short of the oracle "primarily because they are inefficient at
recognizing when smaller, cheaper models are sufficient," and commercial routers can score
poorly — GPT-5 was penalized for a restricted model pool and Not Diamond for over-selecting
expensive models — while well-tuned open-source routers reached "~35% lower cost with under 2%
accuracy degradation."[^routerarena]

### Signals a router can use

The predictive signals available before generation include: **input length and structure**
(short lookups vs. long multi-part reasoning), **task type** (classify/format vs. code/plan),
**required tools** (tool-use often implies a stronger model), **explicit user intent** ("think
hard about this"),[^openai-gpt5] and **historical difficulty** of similar prompts from logged
traffic (the basis of preference/embedding routers).[^routellm-paper]

### Tuning the threshold with an eval harness

A router is only as good as the difficulty threshold that decides cheap-vs-strong. That
threshold is set *empirically* against a **quality-cost evaluation suite**: sweep the cutoff,
measure quality retention and cheap-tier share at each point, and pick the operating point that
holds quality at the bar for the most savings — exactly the cost-vs-quality frontier RouteLLM
and RouterArena plot.[^routellm-blog][^routerarena] Without that harness you cannot know whether
you are safely on the frontier or silently degrading quality.

### Failure modes

- **Misroute → quality drop.** The core risk: the router sends a genuinely hard query to the
  cheap model and ships a worse answer. Because routing decides *before* generating, there is no
  output check to catch it (that is what cascades add). Track a **misroute rate** on a labeled
  slice and keep it under an SLA.[^routerarena]
- **The router is itself a dependency and a cost.** An LLM-judge router adds latency and a per-
  request call; if it is not dramatically cheaper than the models it routes, it erodes the
  savings. Trained classifiers are cheaper but need retraining as your task mix drifts.
- **Restricted pool / miscalibration.** Benchmarks show routers that over-prefer expensive models
  save little, and those with a narrow pool leave savings on the table — pick a router (or tune
  one) whose calibration matches *your* traffic.[^routerarena]

## Example Where It Works

A B2B support assistant handles ~2M requests/month with a fat long tail of trivial queries
("what are your hours?", "reset my password", short FAQ paraphrases) and a minority of genuine
multi-step troubleshooting. Today all of it hits a flagship model.

Routing the easy majority to a small model (or GPT-5's `main`/`mini` tier) while escalating only
the hard troubleshooting to the reasoning tier follows the RouteLLM result directly: if ~75% of
traffic is answerable by the cheap model at the quality bar, blended cost falls toward the
RouteLLM operating points — **on the order of 50–75% cheaper at ~95% quality retention**, with
the exact figure set by where the threshold lands on the frontier for this
traffic.[^routellm-blog][^routellm-repo] Because the task distribution is stable and heavily
skewed toward easy, a trained-on-traffic router is both accurate and cheap to run, and the eval
suite makes the quality-hold auditable.

## Example Where It Would NOT Work

- **Uniformly hard traffic.** A workload where nearly every request genuinely needs frontier
  reasoning (complex legal analysis, hard code generation) has almost no easy majority to
  divert. The router rarely picks the cheap model, so it adds latency and its own cost for
  negligible savings — and each misroute is expensive because the query really was hard.[^routerarena]
- **Low volume / no eval foundation.** Routing's ROI is at scale. Below meaningful volume, the
  engineering and the router's own inference cost dominate the savings, and without a
  quality-cost eval suite you cannot set a safe threshold — you would be gambling on quality.
  Start with static **model right-sizing** and a managed auto-router instead.[^routellm-blog]
- **High-stakes single-shot answers with no tolerance for a wrong tier.** When a misrouted hard
  query causes real harm and you cannot sample-audit after the fact, a pre-generation router is
  riskier than an **LLM cascade**, which verifies the cheap output before committing and
  escalates on failure.[^routerarena]

[^routellm-paper]: Ong et al., "RouteLLM: Learning to Route LLMs with Preference Data," arXiv (ICLR 2025) — <https://arxiv.org/abs/2406.18665>
[^routellm-blog]: LMSYS Org, "RouteLLM: An Open-Source Framework for Cost-Effective LLM Routing" — <https://www.lmsys.org/blog/2024-07-01-routellm/>
[^routellm-repo]: lm-sys/RouteLLM, "A framework for serving and evaluating LLM routers," GitHub — <https://github.com/lm-sys/RouteLLM>
[^openai-gpt5]: OpenAI, "Introducing GPT-5" — <https://openai.com/index/introducing-gpt-5/>
[^openai-gpt5-dev]: OpenAI, "Introducing GPT-5 for developers" — <https://openai.com/index/introducing-gpt-5-for-developers/>
[^notdiamond]: Not Diamond Docs, "What is Model Routing?" — <https://docs.notdiamond.ai/docs/what-is-model-routing>
[^routerarena]: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers," arXiv — <https://arxiv.org/html/2510.00202v1>
