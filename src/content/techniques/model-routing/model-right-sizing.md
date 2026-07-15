---
title: "Model Right-Sizing"
category: model-routing
maturityLevel: 1
maturityProvisional: false
shortDescription: "Statically map each task or feature to the smallest model that still passes its quality bar, instead of paying flagship prices for work a cheap tier handles just as well."
effort: Low
gain: Very High
riskToQuality: Medium
effortWhy: Low because once a quality bar exists, right-sizing is an eval sweep plus a static config change — a pure API swap with no infrastructure.
gainWhy: Very High because the cheapest tier costs 20-100×+ less than the flagship, and it serves the high-volume work where that spread compounds.
riskWhy: Medium because down-sizing ships silent regressions unless it is eval-gated, and an eval set rarely captures the dangerous failure tail.
detectionSignals:
  - "Flagship-by-default — a single premium model serves every call, so classification and routing run on the same tier as hard reasoning."
  - "No task-to-model map — the model id is hard-coded once and never revisited per task or feature."
  - "Cheap work on premium tier — spend is dominated by high-volume, low-difficulty calls like tagging, summarization, and intent detection on a flagship."
  - "Stale model choice — the model was picked at prototype time and never re-evaluated as cheaper, equally-capable tiers shipped."
measurementMethods:
  - "Blended cost per request — before vs. after, with the task quality score held at or above its bar."
  - "Cheap-tier traffic share — percentage of volume running on the cheapest model that still passes eval, targeting most volume on the cheapest-sufficient tier."
  - "Per-task quality delta — accuracy, pass-rate, or win-rate between the candidate cheap model and the incumbent on a frozen eval set."
  - "Post-downsize regression rate — share of tasks whose score dropped below the bar in production monitoring."
status: published
lastUpdated: "2026-06-29"
related:
  - "model-routing/dynamic-model-routing"
  - "model-routing/llm-cascades"
sources:
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Flagship vs. small-tier spread, e.g. GPT-5.5 $5/$30 per MTok input/output vs. GPT-5.4-nano $0.20/$1.25. Specific model names/prices churn quarterly."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 per MTok. Also the explicit guidance: Haiku for simple, Sonnet for most, Opus for complex reasoning."
  - id: gemini-pricing
    title: "Gemini Developer API pricing"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Gemini 3.5 Flash $1.50/$9, 3.1 Flash-Lite $0.25/$1.50, 2.5 Flash-Lite $0.10/$0.40, 3.1 Pro $2/$12 per MTok."
  - id: deepseek-pricing
    title: "Models & Pricing"
    publisher: "DeepSeek API Docs"
    year: 2026
    url: "https://api-docs.deepseek.com/quick_start/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Open-weight model served via managed API at $0.14/$0.28 per MTok (cache-miss input/output) for the flash tier."
  - id: together-pricing
    title: "Pricing — serverless open-model inference"
    publisher: "Together AI"
    year: 2026
    url: "https://www.together.ai/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Open-weight models via managed API: gpt-oss-20B $0.05/$0.20, gpt-oss-120B $0.15/$0.60, Llama 3 8B Lite $0.14/$0.14 per MTok — no GPU ops required."
  - id: artificialanalysis
    title: "LLM Leaderboard — Intelligence Index, Price & Speed"
    publisher: "Artificial Analysis"
    year: 2026
    url: "https://artificialanalysis.ai/models"
    accessed: "2026-06-29"
    kind: benchmark
    note: "Independent index combining 9 evaluations against per-MTok price; used to spot the cheapest tier on the quality frontier for a task class. Rankings churn as models ship."
---

## Overview

Most AI products start by wiring every call to one capable, expensive model — whatever
was best when the prototype shipped. That model then becomes the silent default for
*everything*: not just the genuinely hard reasoning, but also intent classification,
field extraction, short summaries, routing decisions, and tagging — tasks a much cheaper
tier handles at the same quality.

**Model right-sizing** is the discipline of statically mapping each task or feature to
the **smallest model that still clears that task's quality bar**, rather than paying
flagship prices across the board. It absorbs two adjacent practices: *static task-based
model selection* (pick the right tier per feature, fixed at config time) and *using
open-weight models via a managed API* (a cheap tier that happens to be an open model
someone else hosts).

The reason this is the single biggest cost lever in the pyramid is the **price spread**.
On every major provider the cheapest tier costs **20-100×+ less** than the flagship for
the same token. As of mid-2026, OpenAI's flagship sits at roughly **$5 / $30** per
million input/output tokens while its nano tier is about **$0.20 / $1.25** — a ~25×
input and ~24× output gap.[^openai-pricing] Anthropic spans **$5 / $25** (Opus) down to
**$1 / $5** (Haiku);[^anthropic-pricing] Google spans **$2 / $12** (Pro) down to
**$0.10 / $0.40** (a Flash-Lite tier).[^gemini-pricing] Because the *cheaper* tiers also
serve high-*volume* work, right-sizing a few hot endpoints often cuts a large fraction
of total spend with no user-visible change.

The catch — and why this sits at **Medium quality risk** rather than Low — is that
down-sizing is only safe when it is **eval-gated**. Swapping the model without a quality
bar to swap *against* is how teams ship silent regressions. The method, not any specific
"cheapest model," is the durable part: the model landscape churns every quarter, so this
page deliberately treats current prices as *illustrations of the spread*, not a
recommendation to use a named model.[^artificialanalysis]

## Detailed Approach & Techniques

### Step 1 — Inventory tasks, not features

Break the product into distinct **task types** by cognitive demand, not by UI surface:
short classification/extraction, retrieval-grounded Q&A, summarization, free-form
generation, multi-step reasoning, and tool-using agent loops. Each has a different
"floor" — the cheapest tier that still passes. A single feature may contain several task
types (e.g. an agent that classifies intent, then reasons): right-size each *step*, not
the feature as a whole.

### Step 2 — Define the quality bar first (the hard prerequisite)

You cannot down-size safely without a **frozen eval set and a pass threshold per task**.
This is why right-sizing *depends on* a quality-cost evaluation suite: a representative
set of inputs, a scoring method (exact-match / rubric / LLM-as-judge / human spot-check),
and a minimum acceptable score. Without it, "the cheaper model felt fine in a demo" is
the failure mode that ships regressions to production.

### Step 3 — Sweep the tiers cheapest-first

For each task, run the eval against candidate models **from cheapest upward** and pick
the first that clears the bar:

1. Start at the bottom tier (nano / mini / flash-lite / small open models).
2. If it passes, stop — you are done for that task.
3. If it fails, step up one tier and re-test. Only reach the flagship for tasks that
   genuinely need it.

An independent price/quality index is useful for *seeding* the candidate order — it shows
which models sit on the cost-vs-intelligence frontier for a task class — but the index is
a starting hypothesis, not a substitute for your own eval on your own data.[^artificialanalysis]
Providers themselves frame the heuristic the same way: use the small tier for simple
tasks, the mid tier for most production work, and the flagship only for the hardest
reasoning.[^anthropic-pricing]

### Step 4 — Consider open-weight models via a managed API

A major right-sizing option is a capable **open-weight** model (Llama, Qwen, DeepSeek,
gpt-oss, Mistral) served through a managed inference API — Together, Fireworks, Groq,
DeepSeek's own API, and others — so you get the low price **without running GPUs
yourself**. These land in the **$0.05-0.60 / M-token** range for small-to-mid open
models: e.g. gpt-oss-20B around **$0.05 / $0.20**, gpt-oss-120B around **$0.15 / $0.60**,
and an 8B Llama tier around **$0.14 / $0.14** on Together;[^together-pricing] DeepSeek's
hosted flash tier around **$0.14 / $0.28**.[^deepseek-pricing] For high-volume
classification/extraction this is frequently the cheapest sufficient option, while
remaining a pure API swap — no infra, no ops. (Self-hosting these models is a separate,
higher-effort lever and a different technique.)

### Step 5 — Pin it statically and re-test on a cadence

Right-sizing produces a **static task→model map** held in config — this is what
distinguishes it from *dynamic model routing* (per-request decisions) and *LLM cascades*
(escalate on a confidence/verification signal). Because the landscape churns, schedule a
periodic re-run of the eval sweep: a model that didn't pass last quarter — or a newly
launched cheaper tier — may pass now, and the savings compound.

### What right-sizing is *not*

- **Not** "always use the cheapest model" — it's "the cheapest model *that passes*."
- **Not** dynamic routing — the mapping is fixed per task, decided offline.
- **Not** prompt or token reduction — those are orthogonal levers that stack on top.

## Example Where It Works

A SaaS product runs an **inbound-email triage** feature: every incoming message is
classified into one of ~15 categories, has 4 fields extracted, and gets a one-line
summary. It launched on the flagship model because that's what the prototype used, and
now processes ~2,000,000 emails/month.

- **Before:** all three steps run on a flagship tier at roughly **$5 / $30** per million
  input/output tokens.[^openai-pricing] Classification and extraction are the bulk of
  the volume and tokens.
- **Right-sizing:** the team builds a 500-example labeled eval set and sweeps tiers
  cheapest-first. A nano/flash-lite tier at about **$0.20 / $1.25** (or an open-weight
  model via a managed API at **~$0.15 / $0.60**) **matches the flagship's label accuracy
  within the eval's margin** on the classification and extraction steps.[^openai-pricing][^together-pricing][^gemini-pricing]
  Only the rare "summarize a long, messy thread" path is kept on a mid tier.

Moving the two high-volume steps onto a tier ~20-25× cheaper cuts the feature's model
spend by **well over 90%** with **no measurable quality change** — the eval set is the
proof, and it took a day of work plus a config change. This is the canonical
right-sizing win: high volume, low difficulty, and a real quality bar to swap against.

## Example Where It Would NOT Work

- **Reasoning-heavy, low-volume tasks.** A legal-analysis feature that does multi-hop
  reasoning over contradictory clauses *needs* the flagship's reasoning; the cheap tier
  fails the eval outright. Because the volume is low, the flagship's cost is already
  small in absolute terms — down-sizing here trades a real quality drop for trivial
  savings. Right-sizing correctly *keeps* this on the top tier.
- **Long-tail / high-stakes correctness.** Tasks where failures are rare but expensive
  (medical, financial, safety-critical, or anything with regulatory exposure) resist
  down-sizing: an eval set rarely captures the dangerous tail, so a model that scores 99%
  in eval can still fail in ways the cheaper tier fails *more* — and the cost of a miss
  dwarfs the per-token savings.
- **No quality bar exists.** Without a frozen eval set, a "down-size" is a guess. Teams
  that swap models on vibes ship silent regressions; the cheaper model looks fine in a
  demo and quietly degrades a metric nobody is watching. Here the prerequisite — build
  the eval suite first — is the actual work, and right-sizing must wait on it.
- **The expensive part isn't the model tier.** If a workload's cost is dominated by huge
  repeated prompts or long outputs rather than model choice, prompt caching, context
  trimming, and output-length control are the right first levers; right-sizing on top of
  an un-optimized prompt leaves most of the money on the table.

[^openai-pricing]: OpenAI API Docs, "Pricing" — <https://developers.openai.com/api/docs/pricing>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^gemini-pricing]: Google, "Gemini Developer API pricing" — <https://ai.google.dev/gemini-api/docs/pricing>
[^deepseek-pricing]: DeepSeek API Docs, "Models & Pricing" — <https://api-docs.deepseek.com/quick_start/pricing>
[^together-pricing]: Together AI, "Pricing — serverless open-model inference" — <https://www.together.ai/pricing>
[^artificialanalysis]: Artificial Analysis, "LLM Leaderboard — Intelligence Index, Price & Speed" — <https://artificialanalysis.ai/models>
