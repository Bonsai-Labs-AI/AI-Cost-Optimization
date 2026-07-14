---
title: "Pre-Generation (Infra)"
category: batching-async
maturityLevel: 3
maturityProvisional: false
shortDescription: "Build the backend pipeline that generates reusable content ahead of demand — scheduled/triggered batch jobs, a queue/worker system, an output store, and a refresh policy — so requests are served instantly from storage at amortized offline batch cost instead of paying full price for a live generation on every hit."
effort: High
gain: High
riskToQuality: Medium
detectionSignals:
  - "Predictable, reusable content (summaries, descriptions, digests, embeddings, landing-page copy) is generated live on the request path, once per view."
  - "The same or near-same generation runs repeatedly for content that changes far less often than it is read."
  - "Request-time latency and cost spike on content that could have been produced ahead of time."
  - "No batch/precompute pipeline exists; every generatable item is a synchronous LLM call at read time."
  - "Traffic is read-heavy with a high read-to-write ratio on generated fields."
measurementMethods:
  - "Share of served content coming from the pre-generated store vs. live generation (hit rate)."
  - "Cost per item generated via batch vs. live synchronous call."
  - "Staleness: age distribution of served items and rate of serving out-of-date content."
  - "Unused-precompute waste: fraction of pre-generated items never read before they expire/refresh."
  - "Request-path p95 latency and per-request LLM cost on precomputed surfaces before vs. after."
status: published
lastUpdated: "2026-07-03"
related:
  - "product-ux/precomputed-content-surfacing"
  - "batching-async/batch-api-usage"
  - "batching-async/latency-tiered-processing"
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/cache-invalidation-strategies"
sources:
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-03"
    kind: docs
    note: "50% cost discount vs synchronous APIs; each batch completes within 24 hours (often faster); up to 50,000 requests per batch; input file up to 200 MB; up to 2,000 batches/hour. Workflow: prepare .jsonl of requests → upload via Files API → create batch → poll status → download results. Separate rate-limit pool."
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "Batch is a distinct pricing column at ~50% off standard across models — e.g. GPT-5.5 standard input $5.00/MTok vs batch input $2.50/MTok; the 50% cut applies to input, cached input, and output."
  - id: anthropic-batch
    title: "Batch processing (Message Batches API)"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-07-03"
    kind: docs
    note: "Asynchronous bulk processing at 50% lower cost with most batches finishing in under 1 hour (results guaranteed within 24h). Create batch → process asynchronously & independently → poll → retrieve. Canonical use cases include bulk content generation, large-scale evaluations, moderation, and data analysis."
  - id: spheron-batch
    title: "Batch LLM Inference on GPU Cloud: Offline Processing Pipelines for 10x Lower Cost vs Real-Time Serving"
    publisher: "Spheron Blog"
    year: 2026
    url: "https://www.spheron.network/blog/batch-llm-inference-gpu-cloud/"
    accessed: "2026-07-03"
    kind: blog
    note: "Online serving runs at 20-40% average utilization; offline batch sustains 70-90%. Online endpoints at 20-30% utilization cost 5-10x more per processed token than a well-structured offline batch job. Architecture: input sharding (10k-50k docs/shard), a worker pool (one per GPU/node), checkpoint storage for fault-recovery, and shard-file output storage."
  - id: celery-docs
    title: "Introduction to Celery — Distributed Task Queue"
    publisher: "Celery Documentation"
    year: 2026
    url: "https://docs.celeryq.dev/en/main/getting-started/introduction.html"
    accessed: "2026-07-03"
    kind: docs
    note: "Reference job-queue/worker architecture: clients enqueue tasks via a broker (Redis/RabbitMQ); dedicated worker processes consume and execute them; Celery beat schedules periodic tasks via intervals or crontab. Horizontally scalable across multiple workers/brokers."
---

## Overview

Some AI-generated content is read **far more often than the inputs that produce it
change**: the plain-language summary of a document, the SEO description of a catalog
product, a daily news digest, the "explain this" blurb on a dashboard tile, embeddings for
a corpus, or the hero copy on a marketing page. If each of these is generated *live on the
request path*, you pay full synchronous price for a fresh LLM call on **every view** — and
the user waits for a full generation — even though the output would have been identical had
you produced it an hour, or a day, earlier.

**Pre-generation** is the infrastructure that produces this reusable content **ahead of
demand** and serves it instantly from storage. It is the backend engine — scheduled or
event-triggered batch jobs, a queue/worker system, a durable output store, and a
freshness/refresh policy — behind the product-level decision to *surface* precomputed
content (see *Precomputed Content Surfacing*, which is the UX/decision layer; **this page is
the pipeline**). The cost win has two parts: generation moves from expensive synchronous
calls to **amortized offline batch** (the major providers give a **50% discount** for
async batch jobs[^openai-batch][^anthropic-batch]), and generation is **decoupled from
request-time load**, so a read is a cheap key-value lookup instead of a model invocation.

This is **Level 3** because it is real engineering: a durable pipeline with queues, workers,
a store, backfill, and — the genuinely hard part — an invalidation/refresh policy that keeps
served content from going stale. It pays off on **predictable, high-reuse** content and
**loses** on long-tail or fast-churning data, where you either precompute things nobody reads
or serve stale answers.

## Detailed Approach & Techniques

### The pipeline shape

A pre-generation system has four moving parts, and they map cleanly onto a standard
distributed task-queue architecture:[^celery-docs]

1. **A trigger.** Either **scheduled** (a nightly/hourly cron that regenerates the digest,
   refreshes summaries for changed docs, re-embeds new content) or **event-triggered** (a
   new product is created → enqueue "generate description"; a document is edited → enqueue
   "re-summarize"). A scheduler like **Celery beat** fires periodic jobs on an interval or
   crontab expression; application events enqueue jobs directly.[^celery-docs]

2. **A queue + worker pool.** Jobs land on a broker (Redis/RabbitMQ/SQS); **dedicated worker
   processes** pull and execute them, calling the model and writing the result. This is the
   canonical broker→worker pattern — horizontally scalable by adding workers, with the queue
   absorbing spikes so generation runs at the pace of your capacity, not the pace of user
   traffic.[^celery-docs]

3. **An output store.** The generated artifact is written to a durable store keyed for
   instant lookup — a database column, an object-store blob, a cache, or a vector index for
   embeddings. At read time the request path does a lookup, **not** an LLM call.

4. **A freshness / refresh policy + backfill.** A version/TTL on each item, re-generation on
   the source-change event, and a **backfill** job to (re)populate the store for a new field
   or after a prompt/model change. This is the same discipline as *Cache Invalidation
   Strategies* — a pre-generated store without invalidation is a stale-answer generator.

### Run generation as offline batch, not a live loop

The generation step should use the provider **Batch API** rather than the synchronous
endpoint. You assemble the pending items into a batch file, submit it, poll, and write
results back to the store:

- **OpenAI Batch API:** prepare a `.jsonl` of requests → upload via the Files API → create
  the batch → poll status → download results. It gives a **50% discount** vs synchronous,
  completes **within 24 hours** (often much faster), allows **up to 50,000 requests per batch
  / 200 MB per file**, and uses a **separate rate-limit pool** so it doesn't compete with your
  live traffic's quota.[^openai-batch]
- **Anthropic Message Batches API:** submit a batch, process asynchronously, poll, retrieve —
  **50% lower cost**, with most batches finishing in **under an hour** (guaranteed within
  24h). Anthropic lists **bulk content generation** as a canonical use case.[^anthropic-batch]

Because a pre-generated item doesn't need to exist until it's read, the 24-hour batch window
is a non-issue — you are producing tomorrow's (or next hour's) content, not this request's.

### Why the cost drops so much

The saving stacks two independent effects:

- **The batch discount** halves the per-item generation price directly — e.g. GPT-5.5 batch
  input is **$2.50/MTok vs. $5.00/MTok synchronous** (and the 50% cut applies to output
  too).[^openai-pricing]
- **Utilization.** Live/interactive serving runs at low, spiky utilization (**~20-40%
  average**) because it must hold headroom for latency SLAs; a well-structured **offline batch
  job sustains 70-90%** and, per one analysis, an online endpoint at ~20-30% utilization costs
  **5-10x more per processed token** than the equivalent offline batch.[^spheron-batch] The
  same analysis describes the resilient pipeline shape: **input sharding** (10k-50k items per
  shard), a **worker pool** (one per GPU/node), **checkpoint storage** so an interrupted job
  resumes without full re-processing, and **shard-file output storage**.[^spheron-batch]

The third saving is structural: an item read *N* times costs **one** generation, not *N*.
The break-even is a **reads-per-generation** ratio — precompute pays when content is read
many times between refreshes, and is pure waste when it's read zero or one time.

### Backfill and re-generation

Two operations dominate maintenance. **Backfill** populates the store when you add a new
pre-generated field or change the prompt/model — a one-shot mass batch over the whole corpus.
**Refresh** keeps items current: schedule-based (re-run the digest every night), event-based
(re-summarize on edit), or bounded-staleness (TTL, then re-enqueue). Getting the refresh
granularity right is the crux — too coarse and you serve stale content; too fine and you've
recreated per-request generation with extra steps.

## Example Where It Works

A marketplace with **2 million product listings** shows an AI-written description and a set
of embeddings on each product page. Descriptions change only when a seller edits the listing
(a few percent of catalog per day); pages are viewed **tens of millions of times per day**.

- **Live generation:** every product-page view triggers a synchronous LLM call — full price,
  full latency, on content that is identical view-to-view.
- **Pre-generation:** an **event-triggered** job enqueues "generate description + embedding"
  whenever a listing is created or edited; a **backfill** batch seeds the existing 2M
  listings once. Generation runs through the **Batch API at 50% off**[^openai-pricing] on a
  worker pool, and results are written to a DB column + vector index.[^celery-docs] Page views
  become instant key-value lookups.

The reads-per-generation ratio is enormous (millions of reads per description, one generation
per edit), so the effective per-view cost collapses toward zero and the batch discount plus
high offline utilization cuts the remaining generation spend several-fold versus the same
work done live.[^spheron-batch][^anthropic-batch] Anthropic explicitly calls out **bulk
content generation** as a batch use case.[^anthropic-batch]

## Example Where It Would NOT Work

- **Long-tail, low-reuse content.** A "chat with your document" feature where each user asks
  a **unique** question about their **own** document has almost no reuse — precomputing
  answers means generating for questions nobody will ask again. There's no read-many-times
  amortization, so the batch pipeline is pure overhead; serve it live (and reach for *Prompt
  Caching* and *Semantic Caching* instead).
- **High-churn / time-sensitive data.** Precomputing "today's personalized market briefing"
  the night before fails if prices moved at 9am; the pre-generated item is **stale before it's
  read**. When the underlying data changes faster than you can refresh, the batch window (up
  to 24h) works against you, and the invalidation cost swamps the savings.[^openai-batch]
- **Unpredictable demand → wasted precompute.** If you can't predict *which* items will be
  read, you pre-generate a large fraction that is never viewed. The batch discount doesn't
  help if half the generated items expire unread — measured as **unused-precompute waste**,
  this can make pre-generation *more* expensive than lazy live generation with caching.
- **Low volume.** Below a meaningful scale the pipeline's build and operational cost (queue,
  workers, store, refresh logic) exceeds any per-token savings; a small app is better served
  by live calls with prompt/response caching until reuse volume justifies the infrastructure.

[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^openai-pricing]: OpenAI API Docs, "Pricing" (Batch column) — <https://developers.openai.com/api/docs/pricing>
[^anthropic-batch]: Anthropic, "Batch processing (Message Batches API)," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^spheron-batch]: Spheron Blog, "Batch LLM Inference on GPU Cloud: Offline Processing Pipelines for 10x Lower Cost vs Real-Time Serving" — <https://www.spheron.network/blog/batch-llm-inference-gpu-cloud/>
[^celery-docs]: Celery Documentation, "Introduction to Celery — Distributed Task Queue" — <https://docs.celeryq.dev/en/main/getting-started/introduction.html>
