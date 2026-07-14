---
title: "Cache-Hit-Rate Instrumentation"
category: visibility-measurement
maturityLevel: 2
maturityProvisional: false
shortDescription: "Measure the hit rate and dollars saved for every cache in the stack (prompt/prefix, exact, semantic, retrieval) so caching becomes a tuned system instead of an unverified hope — a 'cache' at 5% hit rate is theater."
effort: Low
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Caches are deployed but their hit rate is unknown — 'we added caching' with no before/after number."
  - "Dashboards show total tokens and cost but no cached-token line item."
  - "A cache is assumed to be working because it exists, not because it was measured."
  - "Prompt-caching is enabled but volatile data (timestamps, IDs, working memory) may be corrupting the prefix without anyone noticing."
measurementMethods:
  - "Cache hit rate per cache type: cached input tokens ÷ total input tokens (prefix cache), or cache-hit responses ÷ total requests (exact/semantic cache)."
  - "Cached-token share of input tokens, tracked as a trend over time."
  - "Dollars saved per cache = cached tokens × (base input price − cached read price), aggregated per feature/model/key."
  - "Alert on a hit-rate collapse (a sudden drop is a top-signal cost anomaly)."
status: published
lastUpdated: "2026-07-02"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/cache-aware-agent-design"
  - "caching-reuse/semantic-caching"
  - "visibility-measurement/cost-anomaly-detection"
sources:
  - id: anthropic-usage
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "usage reports cache_creation_input_tokens (writes), cache_read_input_tokens (reads), and input_tokens (uncached, after last breakpoint). Cache read = 0.1× base input; 5-min write = 1.25×. If both cache fields are 0, the prompt was not cached."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Cached tokens reported in usage.prompt_tokens_details.cached_tokens. Automatic on prompts ≥1,024 tokens. OpenAI recommends monitoring cache hit rate, latency, and proportion of tokens cached."
  - id: projectdiscovery
    title: "How We Cut LLM Costs by 59% With Prompt Caching"
    publisher: "ProjectDiscovery Blog"
    year: 2026
    url: "https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching"
    accessed: "2026-07-02"
    kind: blog
    note: "Instrumentation surfaced a 7% prefix-cache hit rate on a 20K-token system prompt agent (26 steps, 40 tool calls); moving volatile working memory to the message tail lifted it to 74% then 84%, cutting overall LLM cost 59% (9.8B tokens served from cache)."
  - id: langfuse-cost
    title: "Token & Cost Tracking"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/token-and-cost-tracking"
    accessed: "2026-07-02"
    kind: docs
    note: "Tracks cached tokens as a distinct usage type (cache_read_input_tokens / prompt_tokens_details.cached_tokens), with a separate per-token price so cached reads are costed at the discounted rate."
  - id: helicone-cache
    title: "LLM Caching"
    publisher: "Helicone Docs"
    year: 2026
    url: "https://docs.helicone.ai/features/advanced-usage/caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Dashboard view of cache hits, cost and time saved; per-request cache status via the Helicone-Cache response header; hit rate and savings trackable per user/application."
---

## Overview

Caching is the single most cited way to cut LLM cost — but a cache only saves money to
the extent that requests actually **hit** it. A prompt-cache that everyone believes is
"on" can silently run at a 7% hit rate because one volatile value corrupted the prefix; a
semantic cache tuned too strictly can hit near 0%. In both cases the team is paying to
maintain a cache that returns almost nothing, and the monthly invoice looks exactly like
having no cache at all. **You cannot tune a cache you do not measure**, and a cache whose
hit rate is unknown is, for cost-accounting purposes, theater.

Cache-hit-rate instrumentation is the measurement layer for the entire caching category:
for every cache in the stack — provider prompt/prefix caching, exact-response caching,
semantic caching, retrieval/embedding caching — capture the **hit rate** and the **dollars
saved**, per call and in aggregate, and watch the trend. The good news in 2026 is that for
the dominant cache (provider prefix caching) instrumentation is mostly *reading a field the
provider already returns*: both Anthropic and OpenAI now split cached tokens natively in
the `usage` object.[^anthropic-usage][^openai-pc-docs] The work is turning those fields
into a metric, a dashboard line, and an alert — which is why this sits at **Level 2**
(deliberate, measured engineering) rather than L1: it requires wiring per-cache accounting
and defining targets, not flipping a switch.

## Detailed Approach & Techniques

### Where the numbers come from (provider prefix caches)

The raw signal is already in every API response.

- **Anthropic** returns three fields on `usage`: `cache_creation_input_tokens` (tokens
  written to the cache on this call), `cache_read_input_tokens` (tokens served *from* the
  cache), and `input_tokens` (tokens after the last cache breakpoint, never cached). Total
  input processed = the sum of the three. A useful tell: if **both** cache fields are `0`,
  the prompt was not cached at all (usually because it fell below the minimum length).[^anthropic-usage]
- **OpenAI** reports cached tokens in `usage.prompt_tokens_details.cached_tokens`, the count
  of prompt tokens that were a cache hit. Caching is automatic on prompts ≥ 1,024 tokens,
  and OpenAI explicitly recommends monitoring "cache hit rates, latency, and the proportion
  of tokens cached."[^openai-pc-docs]

From these you derive two token-level rates:

```text
# Anthropic (per call)
prefix_hit_rate = cache_read_input_tokens
                / (cache_read_input_tokens + cache_creation_input_tokens)

# OpenAI (per call)
prefix_hit_rate = cached_tokens / prompt_tokens
```

Aggregate the numerators and denominators across a window (per feature, per model, per API
key) rather than averaging per-call rates — a few huge requests should not be weighted the
same as many tiny ones.

### Turning hit rate into dollars saved

Hit rate alone does not tell a stakeholder anything; **cost saved** does. Because cached
reads are billed at a known discount (Anthropic cache reads cost `0.1×` base input; OpenAI
cached input is discounted automatically), the saving is a direct calculation:[^anthropic-usage]

```text
dollars_saved = cached_tokens × (base_input_price − cached_read_price)
```

Track that per cache and roll it up. This is the number that justifies the caching work and
that regresses visibly when a cache breaks.

### Instrument the caches the provider does *not* see

Prefix caching is only one layer. For caches you own, emit your own hit/miss metric:

- **Exact-response and semantic caches** are request-level: log `hit`/`miss` per lookup and
  compute `hits ÷ total_requests`; on a hit the saving is the *entire* avoided call, not a
  token discount. For a semantic cache also log the similarity score of the match so you can
  see whether the threshold is too loose (wrong answers) or too tight (near-zero hits).
- **Retrieval / embedding caches** save embedding-API calls or vector lookups; count avoided
  re-embeddings against total.

### Buy the dashboard or build it

Off-the-shelf LLM-observability tools already parse the provider usage objects. **Langfuse**
tracks cached tokens as a distinct usage type — it recognizes both the Anthropic
(`cache_read_input_tokens`) and OpenAI (`prompt_tokens_details.cached_tokens`) shapes and
costs them at a separate, discounted per-token price.[^langfuse-cost] **Helicone** surfaces
a dashboard view of cache hits, cost, and time saved, and exposes per-request cache status
via a `Helicone-Cache` response header so you can verify individual hits.[^helicone-cache]
Either removes most of the build cost; the DIY path (parse `usage`, emit a metric to your
existing telemetry) is a few lines per call.

### What a low hit rate diagnoses

A measured-but-low hit rate is *actionable*, which is the whole point:

- **Unstable prefix** — volatile content (timestamp, user id, request id, agent working
  memory) placed before the static block, so the prefix diverges on nearly every call. This
  is the most common and most expensive failure (see the example below).
- **TTL too short / cold traffic** — the cache evicts between requests; low-volume or bursty
  endpoints never warm up.
- **Below the minimum** — prompt under the provider threshold (OpenAI's 1,024 tokens), so
  nothing is eligible.[^openai-pc-docs]
- **Poor key design** (exact/semantic caches) — over-specific keys that never collide, or an
  over-tight similarity threshold.

A collapse in hit rate is also a leading cost-anomaly signal — a prompt edit or model bump
that quietly kills caching will spike spend long before the invoice arrives, which is why
this cross-links to production cost-anomaly detection.

## Example Where It Works

ProjectDiscovery's security agent "Neo" ran ~26 LLM steps (with ~40 tool calls) per task on
top of a **20,000-token system prompt**. On paper it was a perfect prompt-caching candidate.
In reality, instrumentation revealed the prefix-cache hit rate was only **7%**: dynamic
working memory was embedded *inside* the cacheable prefix and mutated on nearly every step,
so Anthropic's strictly prefix-based cache was invalidated downstream almost every call —
they were paying full input price on a 20K-token prefix, 26 times per task.[^projectdiscovery]

The fix was pure static-first / volatile-last: relocate the volatile working memory out of
the system prompt and append it as a user message at the tail, so only the final block
changes between steps. The measured hit rate jumped to **74%** in a single deployment and
then **84%**, cutting overall LLM cost by **59%** — with **9.8 billion tokens** ultimately
served from cache.[^projectdiscovery] None of that tuning is possible without the
instrumentation: the 7% number is what turned "we have caching" into "our caching is broken,
here's exactly where." The savings came from `prompt-caching-prefix-caching` and
`cache-aware-agent-design`; the *visibility* that unlocked them is this technique.

## Example Where It Would NOT Work

Instrumentation is nearly free and low-risk, so it rarely "fails" — but it can be **wasted
effort** or **misleading**:

- **No cache to measure.** If a workload has no reusable prefix and no repeat requests (every
  call is a unique one-off document with a tiny shared instruction), the hit rate will be
  correctly near zero and there is nothing to tune toward. The right move is a different lever
  (a smaller model, Batch API), not a caching dashboard — measuring here just confirms an
  absence.
- **Vanity hit rate without the dollar axis.** A high *token* hit rate on a workload whose
  cost is dominated by **output** tokens looks great and saves little, because prefix caching
  discounts input only. Reporting hit rate without the dollars-saved figure can make a cache
  look far more valuable than it is; always pair the two.
- **Per-call rate averaging that hides the truth.** Averaging per-call hit rates gives equal
  weight to a 50-token call and a 50,000-token call. If a few large requests miss while many
  tiny ones hit, the simple average looks healthy while spend bleeds — the aggregate
  token-weighted rate is the one that maps to cost.[^anthropic-usage]

[^anthropic-usage]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^projectdiscovery]: ProjectDiscovery, "How We Cut LLM Costs by 59% With Prompt Caching" — <https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching>
[^langfuse-cost]: Langfuse Docs, "Token & Cost Tracking" — <https://langfuse.com/docs/observability/features/token-and-cost-tracking>
[^helicone-cache]: Helicone Docs, "LLM Caching" — <https://docs.helicone.ai/features/advanced-usage/caching>
