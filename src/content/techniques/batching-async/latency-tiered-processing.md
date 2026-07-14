---
title: "Latency-Tiered Processing"
category: batching-async
maturityLevel: 3
maturityProvisional: false
shortDescription: "Classify each request by how fast it truly needs to be and route non-urgent work to a cheaper/slower service tier (batch, flex, off-peak), so only latency-critical traffic pays interactive prices."
effort: Medium
gain: High
riskToQuality: Low
effortWhy: "Needs a scheduler/queue that tags each request with an SLA class and picks a tier, plus fallback logic (flex 429 → retry or upgrade)."
gainWhy: "Most production traffic tolerates seconds-to-hours of latency; moving that majority to 50%-off tiers cuts blended cost substantially."
riskWhy: "The failure mode is a mis-tiered latency-critical request served slowly, not a wrong answer — outputs are identical across tiers."
detectionSignals:
  - "Every request goes to the sync/standard tier with no SLA classification."
  - "Async-tolerant work (enrichment, evals, offline generation, digests) pays interactive prices."
  - "The priority/premium tier is set as a project-wide default and used indiscriminately."
  - "No queue or scheduler between the app and the model API — requests are fired synchronously."
measurementMethods:
  - "% of traffic by tier (sync/standard vs flex vs batch vs priority)."
  - "Blended $/request before vs after downshifting the non-urgent majority."
  - "SLA-miss rate per tier (share of requests that breached their latency budget)."
  - "Flex 429 (resource-unavailable) rate and the resulting retry/upgrade cost."
status: published
lastUpdated: "2026-07-03"
related:
  - "batching-async/batch-api-usage"
  - "batching-async/bulk-extraction-classification"
  - "batching-async/pre-generation"
  - "product-ux/user-controlled-quality-mode"
  - "caching-reuse/prompt-caching-prefix-caching"
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
    note: "Asynchronous batch: 50% cost discount vs synchronous, completes within 24 hours (often faster), with substantially more rate-limit headroom."
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "GPT-5.5 per 1M tokens: Standard $5/$30; Batch $2.50/$15; Flex $2.50/$15 (both = 50% off); Priority $12.50/$75 (2.5× input, 2.5× output premium)."
  - id: anthropic-batch
    title: "Batch processing (Message Batches API)"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-07-03"
    kind: docs
    note: "50% discount on ALL usage (input, output, special tokens) vs standard. Up to 100,000 requests or 256 MB per batch; results within 24h (most finish <1h) or the request expires unbilled. Prompt caching works inside a batch (best-effort hits); use the 1-hour cache duration for shared context."
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
---

## Overview

Not every request needs to be fast. An interactive chat turn must return in a second or two,
but a nightly data-enrichment job, an eval run, a batch of moderation checks, or a
precomputed daily digest can tolerate minutes — or even a full day — of latency with no user
ever noticing. Yet most products send **all** of that traffic through the same synchronous,
full-price endpoint, effectively paying an interactive-latency premium on work that is not
interactive at all.

**Latency-tiered processing** is the routing layer that fixes this. You classify each request
by its *true* latency SLA, then dispatch it to the cheapest tier that still meets that SLA.
The major providers now expose an explicit menu of tiers at very different prices, so the
lever is real money: the non-urgent majority of a workload can move to tiers that cost **~50%
less** than standard, while only the genuinely latency-critical slice pays standard — or the
**premium priority** — price.[^openai-flex][^openai-batch][^openai-pricing]

This sits at **Level 3** because it is more than flipping one flag. Getting real savings
requires an engineering layer — a scheduler or queue that assigns a tier per request class,
handles the failure modes of the cheap tiers (a flex request can be refused mid-flight), and
falls back gracefully. It is the *routing* generalization of single-tier batch usage: instead
of "use batch for this one offline job," it is "assign every request the right tier,
automatically, by SLA."

## Detailed Approach & Techniques

### The 2026 tier menu

Think of the tiers as a spectrum from "cheapest/slowest" to "premium/fastest." Using OpenAI's
GPT-5.5 published rates as a concrete anchor (per 1M tokens: standard **$5 in / $30 out**):[^openai-pricing]

- **Batch (async, ~24 h).** Submit a bundle of requests; results return within **24 hours**
  (often much sooner), at a flat **50% discount** on input *and* output. GPT-5.5 batch is
  **$2.50 / $15**. Anthropic's Message Batches API is the direct equivalent: **50% off all
  usage**, up to **100,000 requests** (or 256 MB) per batch, results within 24 h or the
  request expires *unbilled*.[^openai-batch][^openai-pricing][^anthropic-batch] This is the
  floor tier — the deepest discount, the loosest SLA.
- **Flex (`service_tier:"flex"`, ~50% off).** Runs **synchronously** but at a lower priority:
  variable latency, and under load it can return **429 Resource Unavailable** (you are *not*
  charged when it does). Tokens are priced at **Batch API rates — the same ~50% discount** —
  but you keep a request/response shape instead of a file job. Ideal for background tasks that
  want an answer "soon" but tolerate the occasional slow or refused call.[^openai-flex][^openai-pricing]
- **Standard (sync).** The default: predictable, moderate latency at base price. The tier
  everything falls into if you never classify.
- **Priority (`service_tier:"priority"`, a PREMIUM).** The *spend-up* end — you pay **more**
  than standard for lower and more consistent latency, with uptime/latency SLAs for Enterprise
  (e.g. 99.9% uptime, p50 token-rate guarantees). GPT-5.5 priority is **$12.50 / $75** — a
  **2.5×** premium. Reserved for the latency-critical, user-facing slice where speed is the
  product.[^openai-priority][^openai-priority-announce][^openai-pricing]

The key mental model: **most tiers move you *down* in cost; priority is the only one that
moves you *up*.** The win comes from moving the non-urgent majority down, and being
disciplined about the small minority that justifies priority.

### Mapping request classes → tiers

The design work is a policy that maps each request to a tier by its SLA:

| Request class | Latency need | Tier |
|---|---|---|
| Interactive chat turn; live user waiting | sub-second | Standard, or Priority if latency is the product |
| "Fire-and-forget soon" (async enrichment, background summarize, non-blocking suggestions) | seconds–minutes, best-effort | **Flex** |
| Offline/bulk (evals, moderation sweeps, nightly digests, precompute, backfills) | up to a day | **Batch** |
| Revenue-critical, SLA-bound, latency-sensitive | tightest, guaranteed | **Priority (premium)** |

### The engineering: a tiering scheduler with fallbacks

A production implementation is a small scheduler in front of the model API:

1. **Classify.** Tag each request with an SLA class (from the endpoint, a header, a user
   tier, or a heuristic). Default to the *cheapest* tier the class allows — the opposite of
   the common anti-pattern of defaulting the whole project to priority.
2. **Dispatch.** Set `service_tier` (flex/priority) for synchronous calls, or enqueue into a
   batch job for the async class.
3. **Fall back.** The cheap tiers fail differently and must be handled: a **flex 429** should
   trigger exponential-backoff retry, and — if the request is now approaching its SLA
   deadline — an **upgrade to standard** (`service_tier:"auto"`).[^openai-flex] A batch
   request that risks 24-hour expiry can be re-submitted or promoted to a synchronous tier.
4. **Observe.** Track SLA-miss rate per tier so you can tighten or relax the mapping.

Self-hosted stacks are getting the same primitive natively: a proposed vLLM **`sla_tier`**
(`interactive` > `batch` > `background`) drives queue ordering, batch formation, and
preemption order on a shared cluster — the on-prem analogue of provider service
tiers.[^vllm-sla-tier] And if you would rather **buy** than build, an LLM gateway such as
OpenRouter abstracts the provider tiers (flex/standard/priority) and fallback behind one
config.[^openrouter-tiers]

### Quantifying blended savings (and stacking with caching)

Suppose 70% of a workload is async-tolerable and 30% is interactive. Moving that 70% from
standard to a 50%-off tier (batch or flex) cuts the *total* bill by ~35% (0.70 × 50%) with no
model or quality change.[^openai-pricing][^openai-flex] The more skewed your traffic is toward
"not actually urgent," the larger the cut.

The tiers also **stack with prompt caching**, which the discounts do *not* cancel. Cache
reads still get their normal discount inside batch and priority requests.[^anthropic-batch][^openai-priority-announce]
A batch job over shared context that is also cache-friendly combines the **50% batch discount**
with a **~90% cache-read discount on the cached input tokens** — so the cacheable input portion
lands around **~5%** of its full sync price, and the overall blended effect on an
input-heavy batch approaches **~75% off**.[^anthropic-batch][^openai-pricing] (Anthropic even
recommends the **1-hour cache duration** for batches so shared prefixes survive the longer
processing window.)[^anthropic-batch]

## Example Where It Works

A B2B analytics product runs three AI workloads: (1) an **interactive "ask your data" chat**
(live users, ~10% of tokens), (2) **nightly account-health summaries** for every customer
(~50% of tokens, needed by 8am), and (3) **continuous document enrichment** as files upload
(~40% of tokens, must finish "within a few minutes," not instantly).

Before: everything runs on the standard sync tier at GPT-5.5's $5/$30. After introducing a
tiering scheduler:

- The **nightly summaries** move to the **Batch API** — submitted at midnight, back well
  before 8am, at **50% off** ($2.50/$15).[^openai-batch][^openai-pricing]
- The **enrichment** moves to **flex** (`service_tier:"flex"`) at Batch rates, with a 429 →
  retry, then upgrade-to-standard fallback if a file is still unprocessed after its
  budget.[^openai-flex]
- Only the **interactive chat** stays on standard.

With 90% of tokens now on 50%-off tiers, the blended model bill drops by roughly **45%**
(0.90 × 50%), and the shared system-prompt prefix on the batch job is additionally
prompt-cached at the 1-hour duration for a further cut on input.[^anthropic-batch][^openai-pricing]
No output changed; only latency SLAs and price did.

## Example Where It Would NOT Work

- **Truly interactive, latency-is-the-product workloads.** A live voice agent or a
  synchronous coding-assistant completion cannot tolerate flex's variable latency or batch's
  24-hour window. Here the correct move is often the *opposite* — pay the **priority
  premium** for tighter latency SLAs — so tiering *raises* cost by design, not lowers
  it.[^openai-priority][^openai-priority-announce]
- **When "everything is urgent" by default.** If the product genuinely has no async-tolerant
  traffic — every request has a user waiting — there is no non-urgent majority to downshift,
  and the scheduler is pure overhead. The technique's ROI is proportional to the share of
  traffic that can move down a tier; a 100%-interactive workload gets ~nothing.
- **Low volume.** The engineering (scheduler, queue, fallback handling, per-tier
  observability) only pays off at scale. Below meaningful volume, a single call to the batch
  endpoint for the one obvious offline job — plain *Batch API usage* — captures most of the
  benefit without building a routing layer.[^openai-batch]
- **Tight-SLA work mis-classified as cheap.** The core risk is *mis-tiering*: sending a
  latency-critical request to flex or batch and blowing its deadline. Flex's 429s and batch's
  24-hour expiry make this a real failure mode, so the classifier must be conservative and the
  fallback path must exist.[^openai-flex][^anthropic-batch]

[^openai-flex]: OpenAI API Docs, "Flex processing" — <https://developers.openai.com/api/docs/guides/flex-processing>
[^openai-priority]: OpenAI API Docs, "Priority processing" — <https://developers.openai.com/api/docs/guides/priority-processing>
[^openai-priority-announce]: OpenAI, "Priority Processing for API Customers" — <https://openai.com/api-priority-processing/>
[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^openai-pricing]: OpenAI API Docs, "Pricing" — <https://developers.openai.com/api/docs/pricing>
[^anthropic-batch]: Anthropic, "Batch processing (Message Batches API)," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^vllm-sla-tier]: vLLM (GitHub), "[RFC]: SLA-Tiered Scheduling for Latency/Throughput Optimization (#30256)" — <https://github.com/vllm-project/vllm/issues/30256>
[^openrouter-tiers]: OpenRouter Documentation, "Service Tiers" — <https://openrouter.ai/docs/guides/features/service-tiers>
