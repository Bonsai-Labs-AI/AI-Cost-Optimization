---
title: "Bulk Extraction / Classification Pipelines"
category: batching-async
maturityLevel: 2
maturityProvisional: false
shortDescription: "Run high-volume structured tasks (extraction, classification, tagging, enrichment) as an offline pipeline that stacks Batch-API discounts, multi-item prompt batching, a small right-sized model, and structured outputs — the archetypal 'cheap at scale' workload."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "One synchronous API call per item across a large corpus (one call per row/document/record)."
  - "A flagship model doing simple classification, tagging, or field extraction."
  - "No Batch API usage on offline work where a few hours of latency is acceptable."
  - "Free-text JSON parsing with retries instead of schema-constrained structured outputs."
  - "The shared instruction/system prompt is re-sent, uncached, on every single item."
measurementMethods:
  - "Cost per 1,000 items processed, before vs. after."
  - "Items per call (multi-item batch size) and API calls per 1,000 items."
  - "Per-item accuracy on a labeled sample, held at the quality bar across batch sizes."
  - "Blended $/token after Batch discount + prompt-cache reads (effective price vs. list)."
  - "Schema-validation failure rate and retry-only-failures re-run cost."
status: published
lastUpdated: "2026-07-02"
related:
  - "batching-async/batch-api-usage"
  - "model-routing/model-right-sizing"
  - "output/structured-outputs"
  - "fine-tuning/task-specific-lightweight-models"
  - "fine-tuning/task-specific-lightweight-models"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: anthropic-batch
    title: "Batch processing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-07-02"
    kind: docs
    note: "50% discount on all usage (input, output, special tokens); ≤100,000 requests or 256 MB per batch; most finish <1 hour, hard 24-hour window; results kept 29 days. Prompt caching stacks with batch pricing; users see 30–98% cache hit rates. Use the 1-hour cache TTL for batches."
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-02"
    kind: docs
    note: "50% cost discount vs synchronous API on input and output tokens; ≤50,000 requests and ≤200 MB per batch; 24-hour completion window; .jsonl request format with custom_id; batch usage does not consume standard rate limits."
  - id: pipal-batching
    title: "Researchers waste 80% of LLM annotation costs by classifying one text at a time"
    publisher: "arXiv"
    authors: "Pipal, Vogel, Wack, Esser"
    year: 2026
    url: "https://arxiv.org/abs/2604.03684"
    accessed: "2026-07-02"
    kind: paper
    note: "Batching 25 items and stacking up to 10 coding dimensions per prompt cut 400,000 calls to 4,000 (>80% token-cost reduction). 6 of 8 production models held accuracy within 2pp of the single-item baseline through batch size 100; within the safe range the batching error is smaller than typical inter-coder disagreement."
  - id: multitask-degradation
    title: "Degradation of Multi-Task Prompting Across Six NLP Tasks and LLM Families"
    publisher: "Electronics (MDPI)"
    year: 2025
    url: "https://www.mdpi.com/2079-9292/14/21/4349"
    accessed: "2026-07-02"
    kind: paper
    note: "Corroborates that packing multiple tasks/items into one prompt degrades quality as complexity rises; structural/deterministic tasks (JSON, binary sentiment) are more resilient than fine-grained semantic ones; degradation is driven by task complexity, not raw prompt length."
  - id: anthropic-structured
    title: "Structured outputs"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
    accessed: "2026-07-02"
    kind: docs
    note: "Grammar-constrained decoding guarantees the model's output matches a JSON schema (output_config.format) — no JSON.parse errors, required fields enforced, no schema-violation retries. GA on Opus 4.8 / Sonnet 4.6 / Haiku 4.5 and newer. strict:true does the same for tool inputs."
  - id: openai-structured
    title: "Structured Outputs"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/structured-outputs"
    accessed: "2026-07-02"
    kind: docs
    note: "response_format json_schema with strict:true guarantees schema-conformant output for extraction/classification."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Per-model list prices used to compute the stacked-discount worked example (e.g. Haiku 4.5 at $1/$5 per M tokens)."
---

## Overview

A huge share of production AI spend is not chat or agents — it is **bulk structured
work**: classifying support tickets, extracting fields from invoices, tagging a product
catalog, enriching a CRM, labeling a corpus for training or analytics. These tasks share
three properties that make them the archetypal Level-2 cost target: they are
**high-volume**, they are **offline** (a few hours of latency is fine), and each item's
output is **small and structured** (a label, a few fields, a JSON object).

The naive implementation — one synchronous, full-price call to a flagship model per item,
parsing free-text JSON with retries — is often **5–20× more expensive than it needs to
be**, and no more accurate. A bulk pipeline attacks the cost from four directions at once
and *multiplies* the savings:

1. **The Batch API** cuts the per-token price in half.[^anthropic-batch][^openai-batch]
2. **Multi-item prompt batching** processes N items per call, amortizing the shared
   instruction/schema overhead across all of them.[^pipal-batching]
3. **A small, right-sized model** handles what does not need a frontier model.[^anthropic-pricing]
4. **Structured outputs** guarantee parseable results, deleting the retry/repair tax.[^anthropic-structured]

Because these are multiplicative, the combined effect is an order-of-magnitude reduction,
which is why this sits at **Level 2** — it is deliberate, measured engineering (you must
pick the batch size, validate accuracy, and handle failures at scale), not a config toggle.

## Detailed Approach & Techniques

### 1. Multi-item prompt batching (the folded-in mechanism)

Every call carries fixed overhead: the system prompt, the task instructions, the output
schema, few-shot examples. If you send **one item per call**, you pay for that whole
preamble once *per item*. If you send **N items per call**, you pay for it **once per N
items** — the per-item overhead is divided by N.

The empirical result is strong. A 2026 study processing 100,000 texts across four coding
variables found that the one-item-at-a-time approach requires **400,000 API calls**;
**batching 25 items** and **stacking all four variables** into a single prompt reduces that
to **4,000 calls — an over-80% token-cost reduction**.[^pipal-batching] The paper's title is
blunt about the default: *"Researchers waste 80% of LLM annotation costs by classifying one
text at a time."*

**But there is a ceiling.** As items-per-call grows, the concatenated prompt eventually
overwhelms the model's ability to track many parallel sub-tasks and accuracy falls off. The
evidence gives a usable operating envelope:

- **Safe range:** in the study, **6 of 8 production models held accuracy within 2
  percentage points** of the single-item baseline through **batch size 100**, and combining
  **up to 10 coding dimensions** per prompt stayed comparable to single-variable
  runs.[^pipal-batching] Within that range, the measurement error introduced by batching was
  *smaller than the typical disagreement between human coders* on the same data.[^pipal-batching]
- **Degradation is driven by task complexity, not prompt length.** Structural/deterministic
  tasks (JSON shaping, binary sentiment) are far more resilient to large batches than
  fine-grained semantic tasks; two of the eight models degraded earlier than the
  rest.[^pipal-batching][^multitask-degradation] So the right batch size is **task- and
  model-specific and must be found by evaluation**, not assumed — this is exactly why the
  technique is L2, not L1.

Practical rules: keep the output **strictly keyed to input IDs** (emit an array of
`{id, label}` objects) so a mis-count or dropped item is detectable; start conservative
(10–25 items) and raise the batch size only while a labeled sample holds the quality bar;
prefer more items per call for structural tasks, fewer for nuanced semantic ones.

### 2. Stacking the discounts

The Batch API and prompt caching **compound**, and both apply to a small model's already-low
list price:

- **Batch API — 50% off.** Anthropic's Message Batches API charges **50% of standard prices
  on all tokens** (input, output, and special tokens), fits **≤100,000 requests or 256 MB**
  per batch, finishes **most batches in under an hour** (hard 24-hour window), and keeps
  results for **29 days**.[^anthropic-batch] OpenAI's Batch API is likewise a **50% discount
  vs. the synchronous API** on input and output tokens, up to **50,000 requests / 200 MB**
  per `.jsonl` file, within a **24-hour** window — and batch usage **does not draw down your
  standard rate limits**, which matters at corpus scale.[^openai-batch]
- **Prompt caching on the shared prefix — stacks on top.** Multi-item batching still repeats
  the *instruction/schema prefix* across calls; caching that prefix serves it at ~0.1× on a
  hit. Anthropic explicitly documents that **prompt-caching discounts and batch pricing
  stack**, with users seeing **30–98% cache hit rates** on batch traffic; because batches can
  take longer than the 5-minute cache window, use the **1-hour cache TTL**.[^anthropic-batch]
- **A cheap model as the base rate.** Right-sizing to e.g. Haiku 4.5 (**$1 / $5 per M
  tokens** list) instead of a flagship is the largest single lever; the Batch and cache
  discounts then apply *to that lower base*.[^anthropic-pricing]

The multiplication is the point: `small model × 0.5 (batch) × ~0.1 (cached prefix on hits) ×
1/N (amortized instructions)` turns a flagship-per-item bill into a fraction of itself.

### 3. Structured outputs + a right-sized model

Extraction and classification want **guaranteed-parseable** output. Grammar-constrained
structured outputs compile your JSON schema into a decoding grammar so the model **cannot
emit non-conforming output** — no `JSON.parse` errors, all required fields present, correct
types, and **no retries for schema violations**.[^anthropic-structured] On OpenAI the
equivalent is `response_format: json_schema` with `strict: true`.[^openai-structured] Deleting
the parse-fail → repair → re-call loop removes a real, silent cost multiplier at scale.

Structured outputs also make **model right-sizing safe**: once the *shape* is guaranteed by
the decoder, a small model only has to get the *content* right, and small models are strong
at bounded classification/extraction.[^multitask-degradation] When even a small general model
is overkill or under-accurate at volume, this pipeline is the on-ramp to the L3 tier —
**task-specific classifiers/extractors** (a fine-tuned or distilled small model) — which
trade one-time training cost for the lowest possible per-item price.

### 4. Failure & validation handling at scale

At 100k items, a 1% failure rate is 1,000 broken outputs — handle it as a pipeline, not
per-call:

- **Validate every result against the schema** (structured outputs make most failures
  impossible, but network errors, `expired` batch requests, and truncation still occur — the
  Batch APIs return per-request `succeeded`/`errored`/`expired` statuses keyed by
  `custom_id`).[^anthropic-batch][^openai-batch]
- **Match results by ID, never by position** — batch results return in arbitrary order, and
  multi-item calls must be reconciled against their input IDs.[^openai-batch]
- **Retry only the failures**, ideally in a small synchronous pass, so one bad item does not
  force re-running a 100k batch.
- **Sample and score** a labeled subset each run to confirm the chosen batch size still holds
  the accuracy bar as data drifts.

## Example Where It Works

A marketplace must classify **2,000,000 product listings/month** into a taxonomy and extract
three attributes (brand, category, condition) — a nightly job, latency-insensitive.

- **Naive:** 2M synchronous calls to a flagship model, full price, free-text JSON with a
  ~3% parse-retry rate.
- **Bulk pipeline:**
  - **Multi-item batching at 25 items/call** → 80,000 calls instead of 2,000,000, amortizing
    the taxonomy instructions and schema across each batch.[^pipal-batching]
  - **Batch API** → **50% off** every token.[^anthropic-batch]
  - **1-hour prompt cache** on the (identical) instruction+schema prefix → served at ~0.1× on
    hits, and Anthropic documents batch+cache stacking with 30–98% hit rates.[^anthropic-batch]
  - **Right-sized to Haiku 4.5** (**$1/$5** list) instead of a flagship.[^anthropic-pricing]
  - **Structured outputs** guarantee the `{id, category, brand, condition}` shape → the 3%
    retry tax disappears.[^anthropic-structured]

  Each lever is independently multiplicative; together they take the job from a flagship,
  full-price, one-call-per-item bill to a small fraction of it, at accuracy within ~2pp of
  the single-item baseline for a structural task like this.[^pipal-batching] If per-item cost
  still dominates, the same pipeline feeds a fine-tuned **task-specific classifier** (L3).

## Example Where It Would NOT Work

- **Latency-sensitive / interactive work.** The Batch API's whole premise is asynchronous
  processing with up to a **24-hour** window; anything a user is waiting on (live chat, an
  interactive tagging UI, real-time moderation gating a post) cannot use it.[^anthropic-batch][^openai-batch]
  Use synchronous calls (and prompt caching) there instead.
- **Low volume.** The engineering — building the batch job, tuning the multi-item size,
  wiring schema validation and failure retries — only pays back at scale. For a few hundred
  items, a plain synchronous small-model call is simpler and the discount is rounding error.
- **Hard, nuanced items that break the multi-item ceiling.** For fine-grained semantic
  judgments (subtle intent, legal/medical nuance, long-document reasoning), packing many
  items per call degrades accuracy well before batch size 100, and two of eight models
  degraded even on ordinary tasks.[^pipal-batching][^multitask-degradation] Here you keep the
  Batch discount and small-model right-sizing where you can, but **drop the batch size toward
  1** — the amortization savings evaporate, and the honest move is a more capable model or a
  purpose-trained one, not more items per prompt.
- **Genuinely unique, one-off long inputs with a tiny shared instruction.** If each item is a
  large unique document with almost no shared prefix, there is little to amortize and little
  to cache — the win narrows to just the Batch discount plus right-sizing.

[^anthropic-batch]: Anthropic, "Batch processing," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^pipal-batching]: Pipal, Vogel, Wack & Esser, "Researchers waste 80% of LLM annotation costs by classifying one text at a time," arXiv (2026) — <https://arxiv.org/abs/2604.03684>
[^multitask-degradation]: "Degradation of Multi-Task Prompting Across Six NLP Tasks and LLM Families," Electronics / MDPI (2025) — <https://www.mdpi.com/2079-9292/14/21/4349>
[^anthropic-structured]: Anthropic, "Structured outputs," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
[^openai-structured]: OpenAI API Docs, "Structured Outputs" — <https://developers.openai.com/api/docs/guides/structured-outputs>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
