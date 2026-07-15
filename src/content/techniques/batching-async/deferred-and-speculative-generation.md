---
title: "Deferred & Speculative Generation"
category: batching-async
maturityLevel: 2
maturityProvisional: false
shortDescription: "Decouple LLM cost from user-facing latency by either deferring reactive work to a cheaper async tier (latency-tiered processing) or getting ahead of demand by generating likely content before users ask (pre-generation) — both strategies let you stop paying interactive prices for work that does not need to happen in real time."
effort: High
gain: High
riskToQuality: Low
effortWhy: "Latency tiering requires a scheduler/queue with per-class SLA logic and fallback handling; pre-generation requires a durable pipeline with triggers, workers, a store, and an invalidation policy — each is real engineering, and combining them is additive."
gainWhy: "The non-urgent majority of most workloads — enrichment, digests, eval runs, precomputed descriptions — pays full synchronous price by default; moving it to 50%-off tiers or serving it from pre-built storage cuts those costs substantially."
riskWhy: "Output quality is unchanged: tiers produce identical model outputs at different prices/latencies, and pre-generation serves the same content produced offline. The failure modes are latency misses (mis-tiered request) and staleness (stale pre-generated item), neither of which is a wrong answer."
detectionSignals:
  - "Every request hits the synchronous standard tier with no SLA classification — enrichment, evals, and digests pay interactive prices."
  - "The same or near-identical generation runs live on the request path for content whose inputs change far less often than it is read."
  - "No queue, scheduler, or batch pipeline exists between the app and the model API."
  - "Async-tolerant work (background summarize, moderation sweeps, nightly reports) is fired synchronously and the user waits for it."
  - "Traffic is read-heavy but every read triggers a fresh synchronous LLM call for content that could have been precomputed."
  - "The priority or standard tier is set as a project-wide default and applied indiscriminately."
measurementMethods:
  - "% of traffic by tier (sync/standard vs flex vs batch vs priority) before and after classification."
  - "Blended $/request before vs. after downshifting the non-urgent majority."
  - "SLA-miss rate per tier (share of requests that breached their latency budget)."
  - "Pre-generation hit rate: share of served content coming from the pre-generated store vs. live generation."
  - "Cost per item generated via batch vs. live synchronous call."
  - "Staleness: age distribution of served pre-generated items and rate of serving out-of-date content."
  - "Unused-precompute waste: fraction of pre-generated items never read before they expire or refresh."
  - "Flex 429 (resource-unavailable) rate and the resulting retry/upgrade cost."
status: published
lastUpdated: "2026-07-14"
related:
  - "batching-async/batch-api-usage"
  - "batching-async/bulk-extraction-classification"
  - "product-ux/precomputed-content-surfacing"
  - "product-ux/user-controlled-quality-mode"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/cache-invalidation-strategies"
sources:
  - id: openai-flex
    title: "Flex processing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/flex-processing"
    accessed: "2026-07-03"
    kind: docs
    note: "service_tier:\"flex\" trades slower/variable latency for lower cost; tokens priced at Batch API rates. On resource unavailability it returns 429 Resource Unavailable and you are NOT charged — retry with backoff or fall back to service_tier:\"auto\" (standard)."
  - id: openai-priority
    title: "Priority processing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/priority-processing"
    accessed: "2026-07-03"
    kind: docs
    note: "service_tier:\"priority\" is billed at a PREMIUM to standard for lower/more consistent latency. Set per-request or as a project default. A ramp rate limit can downgrade to standard if TPM rises >50% within 15 min at high volume."
  - id: openai-priority-announce
    title: "Priority Processing for API Customers"
    publisher: "OpenAI"
    year: 2026
    url: "https://openai.com/api-priority-processing/"
    accessed: "2026-07-03"
    kind: blog
    note: "Priority SLAs (Enterprise): 99.9% uptime and p50 latency guarantees (e.g. 99% > 50 tokens/sec). Cached inputs still get the standard 50/75/90% cache discounts."
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-03"
    kind: docs
    note: "Asynchronous batch: 50% cost discount vs synchronous, completes within 24 hours (often faster), with substantially more rate-limit headroom. Up to 50,000 requests per batch, 200 MB per file, 2,000 batches/hour. Separate rate-limit pool."
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "GPT-5.5 per 1M tokens: Standard $5/$30; Batch $2.50/$15; Flex $2.50/$15 (both = 50% off standard); Priority $12.50/$75 (2.5× input, 2.5× output premium). Batch discount applies to input, cached input, and output."
  - id: anthropic-batch
    title: "Batch processing (Message Batches API)"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-07-03"
    kind: docs
    note: "50% discount on ALL usage (input, output, special tokens) vs standard. Up to 100,000 requests or 256 MB per batch; results within 24h (most finish <1h) or the request expires unbilled. Prompt caching works inside a batch (best-effort hits); use the 1-hour cache duration for shared context. Canonical use cases include bulk content generation, evaluations, moderation, and data analysis."
  - id: vllm-sla-tier
    title: "[RFC]: SLA-Tiered Scheduling for Latency/Throughput Optimization (#30256)"
    publisher: "vLLM (GitHub)"
    year: 2026
    url: "https://github.com/vllm-project/vllm/issues/30256"
    accessed: "2026-07-03"
    kind: repo
    note: "Per-request sla_tier (interactive > batch > background) drives queue ordering, batch formation, and preemption order — the self-hosted analogue of provider service tiers."
  - id: openrouter-tiers
    title: "Service Tiers"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/features/service-tiers"
    accessed: "2026-07-03"
    kind: docs
    note: "Gateway abstraction over provider service tiers (flex/standard/priority) — the buy-not-build path for tier selection and fallback."
  - id: celery-docs
    title: "Introduction to Celery — Distributed Task Queue"
    publisher: "Celery Documentation"
    year: 2026
    url: "https://docs.celeryq.dev/en/main/getting-started/introduction.html"
    accessed: "2026-07-03"
    kind: docs
    note: "Reference job-queue/worker architecture: clients enqueue tasks via a broker (Redis/RabbitMQ); dedicated worker processes consume and execute them; Celery beat schedules periodic tasks via intervals or crontab. Horizontally scalable across multiple workers/brokers."
  - id: spheron-batch
    title: "Batch LLM Inference on GPU Cloud: Offline Processing Pipelines for 10x Lower Cost vs Real-Time Serving"
    publisher: "Spheron Blog"
    year: 2026
    url: "https://www.spheron.network/blog/batch-llm-inference-gpu-cloud/"
    accessed: "2026-07-03"
    kind: blog
    note: "Online serving runs at 20-40% average utilization; offline batch sustains 70-90%. Online endpoints at 20-30% utilization cost 5-10x more per processed token than a well-structured offline batch job. Describes resilient pipeline shape: input sharding (10k-50k docs/shard), worker pool (one per GPU/node), checkpoint storage for fault-recovery, and shard-file output storage."
---

## Overview

Real-time LLM inference is expensive — and most products pay those real-time prices for work
that is not, in any meaningful sense, real-time. An eval run, a nightly data-enrichment sweep,
a background summarization job, the precomputed description on a product page, or tomorrow's
personalized digest can all be produced ahead of demand or deferred to off-peak processing —
and served to users at a fraction of the live synchronous cost.

**Deferred & Speculative Generation** is a toolkit of two complementary strategies that
decouple LLM spend from user-facing latency:

- **Latency-tiered processing** is the *reactive* half: you classify each incoming request by
  its true latency SLA and route it to the cheapest tier that still meets that SLA. Most
  production traffic is async-tolerable — enrichment, digests, evals, background suggestions —
  yet it typically lands on the synchronous standard tier by default, paying an interactive
  premium for latency headroom it never needs. The major providers now expose an explicit tier
  menu at markedly different prices, and the non-urgent majority can be moved to tiers that
  cost **~50% less** than standard.[^openai-flex][^openai-batch][^openai-pricing]

- **Pre-generation** is the *proactive* half: for content whose inputs change far less often
  than it is read — product descriptions, daily digests, document summaries, embeddings — you
  build a pipeline that generates it **ahead of demand** and serves it instantly from storage.
  Generation moves off the request path entirely, runs as an offline batch job at **50% off**,
  and a read becomes a cheap key-value lookup instead of a model call.[^openai-batch][^anthropic-batch]

Both strategies share a single underlying principle: **stop paying interactive prices for work
that does not need to happen interactively.** They sit at **Level 2** because neither is a
single-flag change — each requires real engineering (a scheduler or queue, fallback logic,
a durable store, a freshness policy) — but they operate at different points in a request's
lifecycle and are strongest when used together.

## Detailed Approach & Techniques

### Strategy 1: Latency-tiered processing

#### The 2026 tier menu

Think of provider tiers as a spectrum from cheapest/slowest to premium/fastest. Using OpenAI's
GPT-5.5 published rates as a concrete anchor (standard: **$5 in / $30 out** per 1M
tokens):[^openai-pricing]

- **Batch (async, ~24 h).** Submit a bundle of requests; results return within **24 hours**
  (often much sooner) at a flat **50% discount** on input *and* output. GPT-5.5 batch is
  **$2.50 / $15**. Anthropic's Message Batches API is the direct equivalent — **50% off all
  usage**, up to **100,000 requests** (or 256 MB) per batch, results within 24 h or the
  request expires *unbilled*.[^openai-batch][^anthropic-batch] This is the floor tier: deepest
  discount, loosest SLA.
- **Flex (`service_tier:"flex"`, ~50% off).** Runs **synchronously** but at a lower priority:
  variable latency, and under load it can return **429 Resource Unavailable** (you are *not*
  charged when it does). Tokens are priced at **Batch API rates — the same ~50% discount** —
  but you keep a request/response shape instead of a file job. Ideal for background tasks that
  want an answer "soon" but tolerate the occasional slow or refused call.[^openai-flex]
- **Standard (sync).** The default: predictable, moderate latency at base price. The tier
  everything falls into if you never classify.
- **Priority (`service_tier:"priority"`, a PREMIUM).** The *spend-up* end — you pay **more**
  than standard for lower and more consistent latency, with uptime/latency SLAs for Enterprise
  (e.g. 99.9% uptime, p50 token-rate guarantees). GPT-5.5 priority is **$12.50 / $75** — a
  **2.5× premium**. Reserved for the latency-critical, user-facing slice where speed is the
  product.[^openai-priority][^openai-priority-announce]

The key mental model: **most tiers move you *down* in cost; priority is the only one that
moves you *up*.** The win comes from moving the non-urgent majority down, and being
disciplined about the small minority that justifies priority.

#### Mapping request classes to tiers

| Request class | Latency need | Tier |
|---|---|---|
| Interactive chat turn; live user waiting | Sub-second | Standard, or Priority if latency is the product |
| Fire-and-forget soon (async enrichment, background summarize, non-blocking suggestions) | Seconds–minutes, best-effort | **Flex** |
| Offline/bulk (evals, moderation sweeps, nightly digests, precompute, backfills) | Up to a day | **Batch** |
| Revenue-critical, SLA-bound, latency-sensitive | Tightest, guaranteed | **Priority (premium)** |

#### The engineering: a tiering scheduler with fallbacks

A production implementation is a small scheduler in front of the model API:

1. **Classify.** Tag each request with an SLA class — from the endpoint, a header, a user
   tier, or a heuristic. Default to the *cheapest* tier the class allows; the common
   anti-pattern is defaulting the entire project to priority or standard.
2. **Dispatch.** Set `service_tier` (flex/priority) for synchronous calls, or enqueue into a
   batch job for the async class.
3. **Fall back.** The cheap tiers fail differently and must be handled: a **flex 429** should
   trigger exponential-backoff retry and — if the request is now approaching its SLA deadline
   — an **upgrade to standard** (`service_tier:"auto"`).[^openai-flex] A batch request that
   risks the 24-hour expiry can be re-submitted or promoted to a synchronous tier.
4. **Observe.** Track SLA-miss rate per tier so you can tighten or relax the mapping.

Self-hosted stacks are getting the same primitive natively: a proposed vLLM **`sla_tier`**
(`interactive` > `batch` > `background`) drives queue ordering, batch formation, and
preemption order on a shared cluster — the on-prem analogue of provider service
tiers.[^vllm-sla-tier] If you would rather buy than build, an LLM gateway such as OpenRouter
abstracts provider tiers and fallback behind one configuration.[^openrouter-tiers]

#### Quantifying blended savings — and stacking with caching

Suppose 70% of a workload is async-tolerable and 30% is interactive. Moving that 70% from
standard to a 50%-off tier (batch or flex) cuts the *total* bill by roughly **35%** (0.70 ×
50%) with no model or quality change.[^openai-pricing][^openai-flex] The more skewed your
traffic is toward "not actually urgent," the larger the cut.

Tiers also **stack with prompt caching** — the discounts do not cancel each other. Cache reads
still receive their normal discount inside batch and priority
requests.[^anthropic-batch][^openai-priority-announce] A batch job over shared context that is
also cache-friendly combines the **50% batch discount** with a **~90% cache-read discount on
the cached input tokens**, so the cacheable input portion lands around **~5%** of its full
synchronous price and the blended effect on an input-heavy batch approaches
**~75% off**.[^anthropic-batch][^openai-pricing] Anthropic recommends the **1-hour cache
duration** for batches so shared prefixes survive the longer processing window.[^anthropic-batch]

---

### Strategy 2: Pre-generation

#### The pipeline shape

A pre-generation system has four moving parts, mapping cleanly onto a standard distributed
task-queue architecture:[^celery-docs]

1. **A trigger.** Either **scheduled** (a nightly/hourly cron that regenerates digests,
   refreshes summaries for changed documents, re-embeds new content) or **event-triggered** (a
   new product is created → enqueue "generate description"; a document is edited → enqueue
   "re-summarize"). A scheduler like **Celery beat** fires periodic jobs on an interval or
   crontab; application events enqueue jobs directly.[^celery-docs]

2. **A queue + worker pool.** Jobs land on a broker (Redis/RabbitMQ/SQS); **dedicated worker
   processes** pull and execute them, calling the model and writing the result. The queue
   absorbs spikes so generation runs at the pace of your capacity, not the pace of user
   traffic. Workers are horizontally scalable.[^celery-docs]

3. **An output store.** The generated artifact is written to a durable store keyed for instant
   lookup — a database column, an object-store blob, a cache, or a vector index for embeddings.
   At read time the request path does a lookup, **not** an LLM call.

4. **A freshness / refresh policy + backfill.** A version or TTL on each item, re-generation
   on source-change events, and a **backfill** job to (re)populate the store for a new field
   or after a prompt/model change. This is the same discipline as *Cache Invalidation
   Strategies* — a pre-generated store without invalidation is a stale-answer generator.

#### Run generation as offline batch, not a live loop

The generation step should use the provider **Batch API** rather than the synchronous endpoint.
You assemble pending items into a batch file, submit, poll, and write results back to the store:

- **OpenAI Batch API:** prepare a `.jsonl` of requests → upload via the Files API → create the
  batch → poll status → download results. **50% discount** vs synchronous, completes **within
  24 hours** (often much faster), **up to 50,000 requests per batch / 200 MB per file**, with a
  **separate rate-limit pool** so it doesn't compete with live traffic.[^openai-batch]
- **Anthropic Message Batches API:** submit a batch, process asynchronously, poll, retrieve —
  **50% lower cost**, with most batches finishing in **under an hour** (guaranteed within 24h).
  Anthropic lists **bulk content generation** as a canonical use case.[^anthropic-batch]

Because a pre-generated item doesn't need to exist until it's read, the 24-hour batch window is
a non-issue — you are producing tomorrow's (or next hour's) content, not this request's.

#### Why the cost drops so much

The saving stacks two independent effects:

- **The batch discount** halves the per-item generation price directly — e.g. GPT-5.5 batch
  input is **$2.50/MTok vs. $5.00/MTok synchronous**, and the 50% cut applies to output
  too.[^openai-pricing]
- **Utilization.** Live/interactive serving runs at **~20–40% average utilization** because it
  must hold headroom for latency SLAs; a well-structured **offline batch job sustains
  70–90%**. Per one analysis, an online endpoint at ~20–30% utilization costs **5–10× more per
  processed token** than the equivalent offline batch.[^spheron-batch] The same analysis
  describes the resilient pipeline shape: **input sharding** (10k–50k items per shard), a
  **worker pool** (one per GPU/node), **checkpoint storage** so an interrupted job resumes
  without full reprocessing, and **shard-file output storage**.[^spheron-batch]
- **Amortization.** An item read *N* times costs **one** generation, not *N*. The break-even is
  a reads-per-generation ratio — precompute pays when content is read many times between
  refreshes, and is pure waste when it's read zero or one time.

#### Backfill and re-generation

Two operations dominate maintenance. **Backfill** populates the store when you add a new
pre-generated field or change the prompt or model — a one-shot mass batch over the whole corpus.
**Refresh** keeps items current: schedule-based (re-run the digest every night), event-based
(re-summarize on edit), or bounded-staleness (TTL, then re-enqueue). Getting the refresh
granularity right is the crux — too coarse and you serve stale content; too fine and you have
recreated per-request generation with extra steps.

---

### When to use each, and when to combine

| Pattern | When it fits |
|---|---|
| **Latency-tiered only** | Mixed traffic with identifiable async-tolerant requests; you need a routing layer, not a precompute store |
| **Pre-generation only** | High-reuse, predictable content (catalog, digests, embeddings); staleness is acceptable within a refresh window |
| **Both together** | Precomputed items are generated offline (using the batch tier at 50% off) AND incoming user requests are classified so non-urgent work hits the cheap tier rather than standard |

The two techniques are natural complements: pre-generation produces the output store *using*
batch-tier pricing; latency-tiered processing routes the remaining live traffic to the right
tier. Together, they push the maximum share of your token spend off the synchronous full-price
endpoint.

## Example Where It Works

**Latency-tiered: B2B analytics product with three workload classes.**

A B2B analytics product runs three AI workloads: (1) an **interactive "ask your data" chat**
(live users, ~10% of tokens), (2) **nightly account-health summaries** for every customer
(~50% of tokens, needed by 8am), and (3) **continuous document enrichment** as files upload
(~40% of tokens, must finish "within a few minutes," not instantly).

Before: everything runs on the standard sync tier at GPT-5.5's $5/$30. After introducing a
tiering scheduler:

- The **nightly summaries** move to the **Batch API** — submitted at midnight, back well before
  8am, at **50% off** ($2.50/$15).[^openai-batch][^openai-pricing]
- The **enrichment** moves to **flex** (`service_tier:"flex"`) at Batch rates, with a 429 →
  retry, then upgrade-to-standard fallback if a file is still unprocessed after its
  budget.[^openai-flex]
- Only the **interactive chat** stays on standard.

With 90% of tokens now on 50%-off tiers, the blended model bill drops by roughly **45%**
(0.90 × 50%), and the shared system-prompt prefix on the batch job is additionally
prompt-cached at the 1-hour duration for a further cut on input.[^anthropic-batch][^openai-pricing]
No output changed; only latency SLAs and price did.

**Pre-generation: marketplace with 2 million product listings.**

A marketplace shows an AI-written description and a set of embeddings on each product page.
Descriptions change only when a seller edits the listing (a few percent of catalog per day);
pages are viewed tens of millions of times per day.

- **Live generation:** every product-page view triggers a synchronous LLM call — full price,
  full latency, on content that is identical view-to-view.
- **Pre-generation:** an **event-triggered** job enqueues "generate description + embedding"
  whenever a listing is created or edited; a **backfill** batch seeds the existing 2M listings
  once. Generation runs through the **Batch API at 50% off**[^openai-pricing] on a worker
  pool, and results are written to a DB column + vector index.[^celery-docs] Page views become
  instant key-value lookups.

The reads-per-generation ratio is enormous (millions of reads per description, one generation
per edit), so the effective per-view cost collapses toward zero, and the batch discount plus
high offline utilization cuts the remaining generation spend several-fold versus the same work
done live.[^spheron-batch][^anthropic-batch]

## Example Where It Would NOT Work

- **Truly interactive, latency-is-the-product workloads.** A live voice agent or a synchronous
  coding-assistant completion cannot tolerate flex's variable latency or batch's 24-hour window.
  Here the correct move is often the *opposite* — pay the **priority premium** for tighter
  latency SLAs — so tiering *raises* cost by design, not lowers
  it.[^openai-priority][^openai-priority-announce]
- **Long-tail, low-reuse content.** A "chat with your document" feature where each user asks a
  **unique** question about their **own** document has almost no reuse — precomputing answers
  means generating for questions nobody will ask again. There is no read-many-times
  amortization, so the pipeline is pure overhead; serve it live and reach for *Prompt Caching*
  and *Semantic Caching* instead.
- **High-churn / time-sensitive data.** Precomputing "today's personalized market briefing" the
  night before fails if prices moved at 9am — the pre-generated item is **stale before it's
  read**. When underlying data changes faster than you can refresh, the batch window works
  against you and the invalidation cost swamps the savings.[^openai-batch]
- **When "everything is urgent" by default.** If the product genuinely has no async-tolerant
  traffic — every request has a user waiting — there is no non-urgent majority to downshift,
  and the tiering scheduler is pure overhead. The technique's ROI is proportional to the share
  of traffic that can tolerate deferred execution.
- **Tight-SLA work mis-classified as cheap.** The core risk in latency tiering is *mis-tiering*:
  sending a latency-critical request to flex or batch and blowing its deadline. Flex's 429s and
  batch's 24-hour expiry make this a real failure mode, so the classifier must be conservative
  and the fallback path must exist.[^openai-flex][^anthropic-batch]
- **Unpredictable demand → wasted precompute.** If you can't predict *which* items will be read,
  you pre-generate a large fraction that is never viewed. The batch discount doesn't help if half
  the generated items expire unread — measured as **unused-precompute waste**, this can make
  pre-generation *more* expensive than lazy live generation with caching.
- **Low volume.** Below a meaningful scale the engineering (scheduler, queue, fallback handling,
  store, refresh logic, per-tier observability) exceeds any per-token savings. A small app is
  better served by live calls with prompt/response caching until reuse volume and workload
  diversity justify the infrastructure.[^openai-batch]

[^openai-flex]: OpenAI API Docs, "Flex processing" — <https://developers.openai.com/api/docs/guides/flex-processing>
[^openai-priority]: OpenAI API Docs, "Priority processing" — <https://developers.openai.com/api/docs/guides/priority-processing>
[^openai-priority-announce]: OpenAI, "Priority Processing for API Customers" — <https://openai.com/api-priority-processing/>
[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^openai-pricing]: OpenAI API Docs, "Pricing" — <https://developers.openai.com/api/docs/pricing>
[^anthropic-batch]: Anthropic, "Batch processing (Message Batches API)," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^vllm-sla-tier]: vLLM (GitHub), "[RFC]: SLA-Tiered Scheduling for Latency/Throughput Optimization (#30256)" — <https://github.com/vllm-project/vllm/issues/30256>
[^openrouter-tiers]: OpenRouter Documentation, "Service Tiers" — <https://openrouter.ai/docs/guides/features/service-tiers>
[^celery-docs]: Celery Documentation, "Introduction to Celery — Distributed Task Queue" — <https://docs.celeryq.dev/en/main/getting-started/introduction.html>
[^spheron-batch]: Spheron Blog, "Batch LLM Inference on GPU Cloud: Offline Processing Pipelines for 10x Lower Cost vs Real-Time Serving" — <https://www.spheron.network/blog/batch-llm-inference-gpu-cloud/>
