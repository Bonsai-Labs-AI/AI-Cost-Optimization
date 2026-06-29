---
title: "Batch API Usage"
category: batching-async
maturityLevel: 1
maturityProvisional: false
shortDescription: "Run non-urgent work (enrichment, evals, backfills, reports) through the provider's asynchronous Batch API — or the batch-priced Flex sync tier — for a flat ~50% discount in exchange for a relaxed turnaround."
effort: Low
gain: High
riskToQuality: Low
effortWhy: "The managed batch endpoint is the durable queue, so the work is mostly routing — a code path that sends non-urgent traffic to the cheaper lane."
gainWhy: "A flat ~50% discount on both input and output tokens on all eligible volume, stackable with caching to ~75% off a shared prefix."
riskWhy: "The model, prompt, and outputs are identical to the synchronous path, so there is essentially no quality risk."
detectionSignals:
  - "Non-urgent work on sync tier — data enrichment, classification, evals, backfills, scheduled reports, and re-indexing run on the synchronous standard tier."
  - "Bulk jobs at full price — bulk work is throttled by your standard per-model rate limits and runs for hours at full price."
  - "No traffic split — no code path distinguishes 'user is waiting' traffic from 'can finish overnight' traffic; everything hits the real-time endpoint."
  - "Overpaying for latency — you pay the premium priority or default standard tier where a few hours of latency would be perfectly acceptable."
measurementMethods:
  - "Batch coverage — share of eligible (non-interactive) token volume submitted via batch or flex vs. the synchronous standard tier."
  - "Blended $/token — cost on the workload before vs. after moving it to batch (~50% drop on eligible volume)."
  - "Completion-time distribution — batch job turnaround vs. the 24h SLA (confirm it is acceptable for the use case)."
  - "Stacked effective price — price when batch is combined with prompt caching (target ~75% off the cached prefix)."
status: published
lastUpdated: "2026-06-29"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "batching-async/latency-tiered-processing"
  - "batching-async/bulk-extraction-classification"
sources:
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-06-29"
    kind: docs
    note: "50% cost discount vs synchronous; each batch completes within 24h; up to 50,000 requests and a 200 MB input file per batch; separate rate-limit pool (enqueued-token cap per model)."
  - id: openai-flex
    title: "Flex processing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/flex-processing"
    accessed: "2026-06-29"
    kind: docs
    note: "service_tier:'flex' is priced at Batch API rates over the synchronous endpoint; slower and may return 429 resource-unavailable (no charge); recommend raising client timeout to 15 min and using exponential backoff. Beta, limited models."
  - id: openai-priority
    title: "Priority processing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/priority-processing"
    accessed: "2026-06-29"
    kind: docs
    note: "Priority tier is billed at a PREMIUM above standard for lower, more consistent latency — it is not a discount. Not for batch/data jobs."
  - id: anthropic-batch
    title: "Batch processing (Message Batches API)"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-06-29"
    kind: docs
    note: "All usage charged at 50% of standard prices; up to 100,000 requests or 256 MB per batch (whichever first); most batches finish in <1h, expire at 24h; results retained 29 days. Recommends the 1-hour prompt-cache TTL for shared context across a batch."
  - id: gemini-batch
    title: "Batch Mode (Gemini API)"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/batch-mode"
    accessed: "2026-06-29"
    kind: docs
    note: "50% of standard cost; target 24h turnaround (often faster); 2 GB input file / <20 MB inline; supports the Embeddings model; usable via the OpenAI-compatibility layer."
  - id: vertex-batch
    title: "Batch prediction for Gemini (Vertex AI)"
    publisher: "Google Cloud — Vertex AI Docs"
    year: 2026
    url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini"
    accessed: "2026-06-29"
    kind: docs
    note: "Vertex AI submits batch jobs from Cloud Storage or BigQuery; the enterprise path to the same Gemini batch discount."
  - id: bedrock-batch
    title: "Process multiple prompts with batch inference"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html"
    accessed: "2026-06-29"
    kind: docs
    note: "Asynchronous batch inference via JSONL files on S3; results returned to S3. No tool-calling or structured-output support inside a batch."
  - id: bedrock-batch-price
    title: "Amazon Bedrock offers select FMs for batch inference at 50% of on-demand price"
    publisher: "AWS — What's New"
    year: 2024
    url: "https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-bedrock-fms-batch-inference-50-price/"
    accessed: "2026-06-29"
    kind: pricing
    note: "Bedrock batch inference is 50% of on-demand price for supported models (Anthropic, Meta, Mistral, Amazon)."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Standard per-token rates the 50% batch discount is applied against; basis for the batch×caching stacking math."
---

## Overview

Most products serve a mix of traffic. Some calls have a human waiting on the other end —
a chat reply, an autocomplete, a search result — and latency is part of the experience.
But a large share of LLM work is **not** interactive: nightly data enrichment, classifying
a backlog of documents, generating embeddings for a re-index, running an eval suite over
thousands of test cases, producing a weekly report. For that work, whether it finishes in
two seconds or two hours is irrelevant to anyone.

Every major provider sells exactly this trade. Their **Batch API** accepts a file of
requests, processes them asynchronously, and returns the results within a relaxed window
(typically **≤24 hours**) — in exchange for a **flat ~50% discount on both input and
output tokens**.[^openai-batch][^anthropic-batch][^gemini-batch][^bedrock-batch-price]
The discount is not a volume deal you negotiate or a model you have to downgrade to; it is
the *same model* at *half price*, available to anyone, gated only on your willingness to
wait. That is why it sits at **Level 1 (Basic Optimization)**: the effort is low, the gain
is a clean 50% on eligible volume, and there is essentially **no quality risk** — the model,
prompt, and outputs are identical to the synchronous path.

The discipline this technique demands is mostly *routing*: building a code path that
recognizes "this work can finish later" and sends it to the cheaper lane instead of the
real-time endpoint by default.

## Detailed Approach & Techniques

### The asynchronous Batch API (the core 50% lever)

The canonical pattern is the same across providers: assemble your requests into a file
(usually JSONL, one request per line with a custom id), submit the job, poll for status,
then download the results when the job completes.

- **OpenAI Batch** — 50% off vs. synchronous, completes within 24h (often sooner). A
  single batch holds up to **50,000 requests** and a **200 MB** input file, and runs
  against a **separate enqueued-token rate-limit pool**, so it never competes with your
  real-time traffic's limits.[^openai-batch]
- **Anthropic Message Batches** — charged at **50% of standard** prices. A batch holds up
  to **100,000 requests or 256 MB**, whichever comes first; most finish in under an hour
  and expire at 24h, and results stay downloadable for **29 days**.[^anthropic-batch]
- **Google Gemini Batch Mode** — **50% of standard cost**, target 24h turnaround, up to a
  **2 GB** input file. It covers the **Embeddings** model (the ideal batch workload) and is
  reachable through Google's **OpenAI-compatibility layer**, so an existing OpenAI-SDK batch
  integration can target Gemini with minimal change.[^gemini-batch] On the enterprise side,
  **Vertex AI** runs the same batch jobs sourced from **Cloud Storage or BigQuery**.[^vertex-batch]
- **Amazon Bedrock batch inference** — **50% of on-demand** price for supported models
  (Anthropic, Meta, Mistral, Amazon). You drop a JSONL file in **S3** and read results back
  from S3. Note the constraint: **tool-calling and structured-output `response_format` are
  not supported inside a batch**, so reshape those jobs before batching.[^bedrock-batch][^bedrock-batch-price]

"Offline queueing" is not a separate technique to build — **the managed batch endpoint *is*
the durable queue.** It handles retries, persistence, and result collection for you, which
is why hand-rolling your own background-job system for non-urgent LLM work is usually wasted
effort.

### Flex: batch pricing over the synchronous API

True batch trades away *interactivity* — you submit a file and come back later. Sometimes
you want the **batch price** but still want to issue ordinary, per-request synchronous calls
(e.g. a worker processing a queue item at a time, where you can tolerate seconds-to-minutes
but not a 24h file round-trip). OpenAI's **Flex processing** (`service_tier: "flex"`) covers
this: requests go through the normal synchronous endpoint but are **priced at Batch API
rates**, in exchange for **slower responses and occasional unavailability**.[^openai-flex]

The cost of that flexibility is operational: a flex request can return a **429
"resource unavailable"** when capacity is tight (you are **not charged** for it), and
responses are slow enough that OpenAI recommends raising the client timeout to **15
minutes**. The handling pattern is **exponential backoff** on 429s, optionally falling back
to the standard tier when a result is needed and the higher price is acceptable.[^openai-flex]
Flex is in beta with limited model availability.

### The four service tiers (one is a *premium*, not a discount)

It helps to see the whole ladder, cheapest to most expensive:

1. **Batch** — ~50% off, asynchronous, ≤24h. Cheapest; for non-interactive bulk work.
2. **Flex** — ~50% off (batch rate), synchronous but slow/best-effort, may 429.[^openai-flex]
3. **Standard** — full price, normal real-time latency (the default).
4. **Priority** — billed at a **premium *above* standard** for lower, more consistent
   latency on user-facing, latency-sensitive traffic.[^openai-priority]

The common mistake is treating "service tier" as a synonym for "discount." **Priority is
the opposite** — you pay *more* for tighter latency. Match the tier to the work: batch/flex
for anything that can wait, standard for interactive, and priority only where a few hundred
milliseconds of tail latency genuinely costs you a user.

### Stacking batch with prompt caching (~75% off)

The batch discount and the prompt-caching discount are **independent and multiplicative**.
On a provider where caching already gives 50% off a repeated prefix, applying it inside a
batch that is itself 50% off yields **~75% off** the cached portion (0.5 × 0.5 = 0.25 of
the original price).[^anthropic-pricing] This is the single best move for a bulk job over a
**shared prefix** — e.g. classifying 200k documents that all share the same long
instruction + schema block.

One caveat: because a batch can take well over five minutes to drain, the default short
cache TTL may expire mid-job. Anthropic explicitly recommends using the **1-hour cache
duration** with prompt caching when a batch shares context, so the prefix stays warm across
the whole run.[^anthropic-batch] (See *Prompt Caching / Prefix Caching* for the caching
mechanics.)

## Example Where It Works

A B2B product enriches every newly-ingested company record: it extracts a structured
profile, classifies the industry, and writes a one-paragraph summary. Roughly **300,000
records/day** flow in, and the enriched data is only surfaced in dashboards the next
morning — **nobody is waiting on any individual call**.

- **On the standard synchronous tier**, this is a steady, full-price stream that also eats
  into the app's real-time rate limits.
- **Moved to the Batch API**, the same model and prompts run at **50% off**, on a
  **separate rate-limit pool**, finishing comfortably inside the 24h window.[^openai-batch]
- Because all 300k requests share the **same instruction + JSON-schema prefix**, adding
  prompt caching with a **1-hour TTL** stacks on top, pushing the cached-prefix portion to
  roughly **75% off**.[^anthropic-batch][^anthropic-pricing]

The net effect is a halving (or better) of the enrichment bill for one routing change and a
caching flag — no model downgrade, no quality regression.

For embeddings specifically the case is even cleaner: a re-index that re-embeds a corpus is
a textbook batch job, and Gemini Batch Mode covers the Embeddings model directly.[^gemini-batch]

## Example Where It Would NOT Work

- **A human is waiting.** Anything in the interactive request path — chat turns, live
  autocomplete, search-as-you-type, an agent acting on a user's behalf in-session — cannot
  tolerate a 24h (or even a flex best-effort) window. Batch/flex is the wrong lane;
  standard, or for the most latency-critical surfaces *priority* (at a premium), is correct.[^openai-priority]
- **Tiny or one-off volume.** The Batch API's overhead — file assembly, submission, polling,
  result download — only pays off at scale. For a handful of non-urgent calls the
  engineering and operational overhead outweighs the ~50% saving on a few requests; just use
  the standard endpoint.
- **Hard real-time deadlines dressed up as "async."** A "report" that a user clicks
  *Generate* on and expects within seconds is interactive, not batch — moving it to a 24h
  lane breaks the product even though the work *looks* batchable.
- **Features the batch path doesn't support.** Bedrock batch inference, for instance, does
  **not** support tool-calling or structured-output `response_format`; a job that depends on
  those must run synchronously or be restructured before it can be batched.[^bedrock-batch]
- **Latency-sensitive flex misuse.** Flex gives the batch price but can 429 and is slow;
  pointing user-facing traffic at it to "save money" produces timeouts and a degraded
  experience. Flex is for non-production / lower-priority async work, not the hot path.[^openai-flex]

[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^openai-flex]: OpenAI API Docs, "Flex processing" — <https://developers.openai.com/api/docs/guides/flex-processing>
[^openai-priority]: OpenAI API Docs, "Priority processing" — <https://developers.openai.com/api/docs/guides/priority-processing>
[^anthropic-batch]: Anthropic, "Batch processing (Message Batches API)," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^gemini-batch]: Google, "Batch Mode," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/batch-mode>
[^vertex-batch]: Google Cloud, "Batch prediction for Gemini," Vertex AI Docs — <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini>
[^bedrock-batch]: Amazon Bedrock User Guide, "Process multiple prompts with batch inference" — <https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html>
[^bedrock-batch-price]: AWS, "Amazon Bedrock offers select FMs for batch inference at 50% of on-demand price," 2024 — <https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-bedrock-fms-batch-inference-50-price/>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
