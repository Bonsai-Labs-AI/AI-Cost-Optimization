---
title: "Precomputed Content Surfacing"
category: product-ux
maturityLevel: 2
maturityProvisional: false
shortDescription: "Generate expensive AI outputs offline (in batch) for the predictable, popular requests everyone hits, then serve the stored result at request time — so you pay to generate once instead of once per user."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "The same popular content (top products, category pages, trending queries, a daily digest) is generated live and separately for every user who views it."
  - "A small fraction of requests accounts for a large share of AI spend because everyone asks for the same predictable things."
  - "Predictable, schedulable content (daily/weekly summaries, seasonal copy, homepage blurbs) is produced on-demand at peak instead of ahead of time."
  - "Synchronous, full-price generation is used for content whose inputs are known well before anyone requests it."
measurementMethods:
  - "Share of requests served from the precomputed store vs. generated live (precompute hit rate)."
  - "Blended $/request before vs. after precomputing the popular head of the distribution."
  - "Precompute yield: fraction of precomputed items actually served at least once (waste = generated-but-never-viewed)."
  - "Cost per precomputed item (batch-discounted generation ÷ number of serves) vs. live per-request cost."
  - "Content staleness: age of served precomputed items and rate of serving invalidated/outdated content."
status: published
lastUpdated: "2026-07-02"
related:
  - "batching-async/batch-api-usage"
  - "caching-reuse/exact-response-caching"
  - "product-ux/ai-non-ai-hybrid-ux"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-02"
    kind: docs
    note: "Batch API is 50% cheaper than synchronous requests; completes within 24h; up to 50,000 requests and 200 MB per batch. The mechanism for cheap offline pregeneration."
  - id: anthropic-batch
    title: "Batch processing / Message Batches API"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-07-02"
    kind: docs
    note: "50% discount on all usage (input + output); most batches finish in <1h (within 24h). Batch discount stacks with prompt caching. Canonical use cases include bulk content generation."
  - id: together-batch
    title: "Introducing the Together AI Batch API: Process Thousands of LLM Requests at 50% Lower Cost"
    publisher: "Together AI"
    year: 2025
    url: "https://www.together.ai/blog/batch-api"
    accessed: "2026-07-02"
    kind: blog
    note: "50% lower cost than real-time; lists 'generating marketing content' and 'offline summarization' as batch use cases — i.e. content pregeneration."
  - id: breslau-zipf
    title: "Web Caching and Zipf-like Distributions: Evidence and Implications"
    publisher: "Proceedings of IEEE INFOCOM"
    authors: "L. Breslau, P. Cao, L. Fan, G. Phillips, S. Shenker"
    year: 1999
    url: "https://www.researchgate.net/publication/2555555_Web_Caching_and_Zipf-like_Distributions_Evidence_and_Implications"
    accessed: "2026-07-02"
    kind: paper
    note: "Web requests follow a Zipf-like distribution (exponent 0.64–0.83): a small set of popular items receives a disproportionate share of requests. The formal basis for 'precompute the head, skip the tail.'"
  - id: nng-zipf
    title: "Zipf Curves and Website Popularity"
    publisher: "Nielsen Norman Group"
    authors: "Jakob Nielsen"
    year: 1997
    url: "https://www.nngroup.com/articles/zipf-curves-and-website-popularity/"
    accessed: "2026-07-02"
    kind: blog
    note: "Concrete popularity skew: on a 10,000-page site the top page drew thousands of requests/month while page 10,000 was requested once. 'A few pages that everybody looks at and a large number seen only once.'"
  - id: predictive-caching
    title: "Predictive Edge Caching through Deep Mining of Sequential Patterns in User Content Retrievals"
    publisher: "arXiv"
    year: 2022
    url: "https://arxiv.org/abs/2210.02657"
    accessed: "2026-07-02"
    kind: paper
    note: "Distinguishes reactive caching (populate on a miss, after a request) from proactive/predictive caching (prefetch popular content before it is requested). Precompute is the proactive pattern."
---

## Overview

Most AI products generate the same expensive output over and over for different users.
The homepage recommends the same "top products of the week" to thousands of visitors; a
news app writes the same daily digest for everyone; an e-commerce catalog needs one AI
description per SKU, viewed by many shoppers; a search box answers the same handful of
common queries hundreds of times a day. If each of those is produced with a **live,
synchronous, full-price model call per view**, you are paying to regenerate identical (or
near-identical) content on every request.

**Precomputed content surfacing** breaks the coupling between *who requests* and *when it
is generated*. For requests that are **predictable and popular**, you generate the output
**once, ahead of time, offline** — ideally as a batch job at a discount — store the
result, and then **surface the stored result** at request time with no model call. The
cost of generation is amortized across every serve: generate once, serve N times.

The reason this works is that request traffic is not uniform — it is heavily concentrated.
Web request popularity follows a **Zipf-like distribution**: a small fraction of items
receives a disproportionately large share of requests.[^breslau-zipf] Nielsen's classic
analysis of a 10,000-page site found the most popular page drew thousands of requests per
month while the 10,000th page was requested only once — "a few pages that everybody looks
at and a large number of pages that are seen only once."[^nng-zipf] Precomputing the
**head** of that distribution captures most of the traffic (and most of the AI cost) for a
tiny, bounded amount of offline generation; the long **tail** is left to be generated
live. This is why it sits at **Level 2**: getting the concentration analysis,
batch pipeline, and freshness policy right is deliberate engineering, not a config toggle.

### How it differs from caching

Caching (see *Exact Response Caching*, *Prompt Caching*) is **reactive**: the first user to
request something pays full price, the result is stored on that miss, and later identical
requests are served from the store. Precompute is **proactive / predictive**: you decide
*in advance* what will be popular, generate it *before anyone asks*, and no user ever pays
the live-generation cost — not even the first.[^predictive-caching] Caching populates on
demand; precompute populates on a schedule. The two compose well: precompute the known
head, cache the emergent tail.

## Detailed Approach & Techniques

### 1. Identify the precomputable head

Precompute only pays for content that is both **predictable** (you know the input before a
user requests it) and **popular / concentrated** (many serves per generated item). Good
candidates:

- **Popular, shared entities** — top/trending products, best-seller descriptions, featured
  category pages, "most-viewed" article summaries.
- **Scheduled content** — daily/weekly digests, morning briefings, end-of-day reports,
  seasonal or campaign copy whose inputs are known ahead of the publish time.
- **Common queries** — the head of your query log (the same FAQs, the same "what is X"
  lookups) answered thousands of times.
- **Catalog enrichment** — one AI-generated description/tag/summary per item in a catalog
  that many users browse.

The analysis is a Zipf/Pareto cut: rank content by expected request volume and precompute
down to the point where an item's expected serves no longer justify generating it.[^breslau-zipf][^nng-zipf]

### 2. Generate offline, in batch, at a discount

Because precompute is not on the user's critical path, it should run **asynchronously**,
which unlocks the provider **Batch APIs** — the same content produced at **50% of the
synchronous price** on OpenAI, Anthropic, and Together, with results returned within (and
often well inside) a 24-hour window.[^openai-batch][^anthropic-batch][^together-batch] A
single batch can carry tens of thousands of items (OpenAI: up to 50,000 requests / 200 MB;
Anthropic: up to 100,000).[^openai-batch][^anthropic-batch] Batch use cases the providers
name explicitly include **bulk content generation** and **offline summarization** — exactly
this pattern.[^anthropic-batch][^together-batch] The discounts also **stack**: on Anthropic
the batch discount composes with prompt caching on the shared instruction prefix, so a
catalog-enrichment run pays 50% batch × ~0.1× cached input on the repeated
system/instructions block.[^anthropic-batch] (See *Batch API Usage*.)

### 3. Store and surface

Persist outputs in whatever store the read path already uses — a database column, a KV/CDN
edge cache, or the CMS. At request time the app performs a **lookup, not a generation**: if
a precomputed result exists, serve it directly (zero model cost, near-zero latency); if not
(a tail request), fall back to live generation or a reactive cache. This is the "CDN for AI
output" shape — proactively push popular results to the edge instead of computing them on
the miss.[^predictive-caching]

### 4. Freshness and invalidation (the part that makes it L2)

Precomputed content is **stale by construction** — it reflects the world at generation
time. You need an explicit policy:

- **Time-based refresh** — regenerate on a schedule matched to how fast the content decays
  (a daily digest is regenerated nightly; an evergreen product blurb monthly).
- **Event-based invalidation** — regenerate when an underlying input changes (price change,
  product edit, source-document update). Version the stored key by input hash + prompt
  version + model version so a prompt or model upgrade forces regeneration.
- **Serve-stale-while-revalidating** — serve the old precomputed result instantly and
  enqueue a background batch refresh, so users never wait on generation.

Skipping this is how precompute goes wrong: serving outdated recommendations, wrong prices,
or copy generated by a since-replaced prompt.

### 5. The break-even

Precompute pays when the amortized generation cost beats live generation:

> **precompute wins when** `serves × live_cost_per_request > precompute_cost_per_item`,
> where `precompute_cost_per_item ≈ batch_generation_cost` (≈ 0.5× the sync cost).[^openai-batch][^anthropic-batch]

Equivalently, precompute an item once its **expected serve count exceeds ~0.5** over its
freshness lifetime (because batch generation is half-price, even content viewed roughly
once can break even, and anything viewed many times is a landslide win). The failure mode
is the mirror image: precomputing **rarely-viewed tail** content means generating thousands
of items that are served zero or one times — you pay generation cost for content nobody
sees, which is *worse* than lazy live generation. The whole skill is drawing the head/tail
line correctly.[^breslau-zipf][^nng-zipf]

## Example Where It Works

An e-commerce marketplace shows an AI-written **product summary and a "why you might like
this"** blurb on every product page. It has **200,000 active SKUs**, but traffic is
sharply Zipf-distributed — the top **10,000 products** account for the large majority of
page views.[^breslau-zipf][^nng-zipf]

- **Live per-view generation:** the same blurb for a best-seller is regenerated on every
  one of its (say) 50,000 monthly views — 50,000 full-price calls for one product's worth
  of actual content, repeated across the whole popular head. Cost scales with **views**.
- **Precompute the head:** run a nightly **Batch API** job that (re)generates one blurb per
  product for the top 10,000 SKUs — **10,000 items at 50% off**, with prompt caching on the
  shared instruction prefix stacking further on Anthropic.[^openai-batch][^anthropic-batch]
  Store each blurb on the product record; product pages do a **lookup, not a call**. Cost
  now scales with **catalog size (10,000 items/night)**, not with the millions of views —
  a change of cost *dimension*, not just a discount. Event-based invalidation regenerates a
  blurb when its price or attributes change; the long tail of rarely-viewed SKUs is
  generated live on first view and reactively cached.[^predictive-caching]

Generate-once-serve-many plus the batch discount plus caching on the shared prefix compound
into an order-of-magnitude cut on the popular head, which is where the spend was.

## Example Where It Would NOT Work

- **No request concentration (flat long tail).** A tool that generates a **personalized,
  one-off** artifact per user — a custom cover letter, a bespoke trip itinerary, an answer
  about the user's own private data — has almost no shared/popular content to precompute.
  Every request is unique and viewed once, so precomputing anything means generating items
  that are each served ≤1 time — you pay generation cost with no amortization, worse than
  lazy generation. Here the levers are *right-sizing*, *prompt caching* on the shared prefix,
  and reactive *exact/semantic caching*, not precompute.[^breslau-zipf]

- **Fast-changing or unpredictable inputs.** Content whose correct answer depends on
  **live state** (current inventory, a live scoreboard, this user's cart, real-time prices)
  cannot be precomputed without serving stale/wrong results. If the freshness window is
  shorter than the time it takes to detect the change and re-run a batch, precompute
  actively harms quality.[^predictive-caching]

- **Tiny volume or one-shot content.** If a given piece of content is genuinely viewed
  **once** and its inputs weren't knowable earlier, the batch job's own generation cost
  isn't amortized by any reuse; the offline pipeline (and its 24-hour latency) is pure
  overhead versus just generating it live on demand.[^openai-batch][^anthropic-batch]

[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^anthropic-batch]: Anthropic, "Batch processing / Message Batches API," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^together-batch]: Together AI, "Introducing the Together AI Batch API," 2025 — <https://www.together.ai/blog/batch-api>
[^breslau-zipf]: L. Breslau, P. Cao, L. Fan, G. Phillips, S. Shenker, "Web Caching and Zipf-like Distributions: Evidence and Implications," IEEE INFOCOM 1999 — <https://www.researchgate.net/publication/2555555_Web_Caching_and_Zipf-like_Distributions_Evidence_and_Implications>
[^nng-zipf]: J. Nielsen, "Zipf Curves and Website Popularity," Nielsen Norman Group, 1997 — <https://www.nngroup.com/articles/zipf-curves-and-website-popularity/>
[^predictive-caching]: "Predictive Edge Caching through Deep Mining of Sequential Patterns in User Content Retrievals," arXiv 2210.02657, 2022 — <https://arxiv.org/abs/2210.02657>
