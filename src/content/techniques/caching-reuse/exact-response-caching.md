---
title: "Exact Response Caching"
category: caching-reuse
maturityLevel: 1
maturityProvisional: false
shortDescription: "Store the full model response keyed on a normalized, exact request so an identical call returns the stored answer with zero model tokens — the cost problem being repeated identical requests that are re-billed in full."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "Identical requests (same prompt, model, and params) are billed again instead of served from a store."
  - "Deterministic endpoints (temperature 0) or FAQ/support answers are regenerated on every hit."
  - "A high-traffic feature has a small set of very popular, repeated queries."
  - "No response-cache layer exists in front of the model, or a naive cache has no TTL/invalidation."
measurementMethods:
  - "Cache hit rate: cached-served responses ÷ total requests (see Cache-Hit-Rate Instrumentation)."
  - "Dollars and tokens saved (a hit is a 100% saving on that call)."
  - "Stale-answer incident rate after content/prompt/model changes."
  - "p50/p95 latency on hits vs misses (a hit is a store lookup, not a model call)."
status: published
lastUpdated: "2026-07-02"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/semantic-caching"
  - "caching-reuse/cache-invalidation-strategies"
  - "caching-reuse/cache-hit-rate-instrumentation"
  - "product-ux/precomputed-content-surfacing"
sources:
  - id: portkey-cache
    title: "Cache (Simple & Semantic)"
    publisher: "Portkey Docs"
    year: 2026
    url: "https://portkey.ai/docs/product/ai-gateway/cache-simple-and-semantic"
    accessed: "2026-07-02"
    kind: docs
    note: "Simple cache = exact match on the full request body (messages/prompt, model, temperature, max_tokens, every other param). max_age TTL: min 60s, max 90 days, default 7 days. Force-refresh via x-portkey-cache-force-refresh header."
  - id: cf-aig-cache
    title: "Caching — Cloudflare AI Gateway"
    publisher: "Cloudflare Developer Docs"
    year: 2026
    url: "https://developers.cloudflare.com/ai-gateway/features/caching/"
    accessed: "2026-07-02"
    kind: docs
    note: "Cache key = SHA-256 hash of provider + endpoint + model + auth header + full request body. Any difference in messages/tools/params = separate entry. cf-aig-cache-ttl min 60s / max 1 month; cf-aig-skip-cache; cf-aig-cache-key override; cf-aig-cache-status HIT/MISS."
  - id: litellm-cache
    title: "Caching — LiteLLM Proxy"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Per-request controls: ttl (no built-in default — unset = no expiry until evicted; docs show 600s as an example), s-maxage, no-cache (skip check), no-store (don't cache), namespace. Redis/in-memory/s3/gcs/disk backends."
  - id: litellm-keys
    title: "Caching — In-Memory, Redis, s3, gcs, Redis Semantic Cache, Disk"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/caching/all_caches"
    accessed: "2026-07-02"
    kind: docs
    note: "Custom get_cache_key example composes the key from model + messages + temperature + logit_bias — shows caching is keyed on the exact request parameters."
  - id: redis-expire
    title: "Redis key expiration (EXPIRE / TTL)"
    publisher: "Redis Docs"
    year: 2026
    url: "https://redis.io/docs/latest/develop/using-commands/keyspace/"
    accessed: "2026-07-02"
    kind: docs
    note: "Per-key TTL via EXPIRE / SET EX with 1ms resolution; TTL/PERSIST/PEXPIRE. Expiry is persisted and replicated. This is the DIY primitive for cache expiration."
  - id: redis-eviction
    title: "Key eviction"
    publisher: "Redis Docs"
    year: 2026
    url: "https://redis.io/docs/latest/develop/reference/eviction/"
    accessed: "2026-07-02"
    kind: docs
    note: "maxmemory + maxmemory-policy: noeviction, allkeys-lru/lfu/random, volatile-lru/lfu/ttl/random. allkeys-lru recommended default for a cache (Pareto access). Approximated LRU with maxmemory-samples."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Prefix/token-level caching — cache read at 0.1× input but still a model call. Contrasted here with response-level caching (zero model call)."
---

## Overview

Every request to an LLM is billed in full, even when it is **byte-for-byte identical** to
one you served a minute ago. In many products a meaningful share of traffic is exactly
that: the same FAQ question, the same deterministic classification, the same "summarize
this fixed document" call, the same idempotent tool prompt. Exact response caching stores
the **complete model response** keyed on a normalized representation of the request, so the
next identical request returns the stored answer with **zero model tokens consumed** — a
100% saving on that call, and a store-lookup latency instead of a generation.

This is a fundamentally different mechanism from **prompt / prefix caching**. Prefix
caching is a *token-level* provider cache: it reuses the model's internal KV state over a
shared prompt prefix, still runs the model, and still bills the read (Anthropic's cache
read is 0.1× input, not zero).[^anthropic-pc] Exact response caching is a *response-level*
application cache: on a hit the model is **never called at all**. The two stack — prefix
caching cuts the cost of the calls you *do* make; exact caching removes the calls you don't
need to make twice.

It sits at **L1**, earning its place as a foundational win precisely because doing it
*correctly* is real engineering rather than a dictionary lookup. A naive `dict[prompt] = response` is trivial;
the hard parts — a **normalized key** that neither collides nor fragments, **TTL and
invalidation** so you never serve a stale or now-wrong answer, and honest judgment about
**where the hit rate is actually nonzero** — are what separate a cache that saves money
from one that quietly ships incorrect responses.

## Detailed Approach & Techniques

### Key design: hash the exact request, after normalization

The cache key must capture *everything that can change the answer* and nothing that
shouldn't. Managed gateways make the contract explicit. Cloudflare AI Gateway builds the
key by concatenating the **provider, endpoint, model, auth header, and the full request
body**, then hashing with **SHA-256** — so "any difference in the body, including messages,
tools, or model parameters, will result in a separate cache entry."[^cf-aig-cache] Portkey's
simple cache does an **exact match on the full request body** — `messages`/`prompt`,
`model`, `temperature`, `max_tokens`, "and every other parameter."[^portkey-cache] LiteLLM's
own `get_cache_key` example composes the key from `model + messages + temperature +
logit_bias`, i.e. the exact request parameters.[^litellm-keys]

Two failure modes bracket the design:

- **Over-broad keys serve wrong answers.** If you key on the user message alone and ignore
  `model`, `temperature`, the `system` prompt, or `tools`, a request run against a different
  model or a changed system prompt gets the old configuration's answer. Include every
  parameter that influences output.
- **Over-narrow keys never hit.** Un-normalized keys fragment: trailing whitespace, JSON
  key ordering, an incidental request ID, or a per-call timestamp make two semantically
  identical requests hash differently, dropping the hit rate toward zero. **Normalize
  before hashing**: trim/collapse whitespace, canonicalize JSON (sorted keys), and exclude
  fields that don't affect the answer (request IDs, trace headers). LiteLLM exposes
  `enable_caching_on_provider_specific_optional_params` for exactly the judgment call of
  which non-standard params belong in the key.[^litellm-cache]

### TTL, expiration, and invalidation — the engineering that matters

A cached response is a snapshot of a fact that may stop being true. Correctness comes from
three levers:

1. **Time-based expiry (TTL).** Set an age after which an entry is discarded regardless of
   anything else — a coarse but robust guard against unbounded staleness. Every managed
   layer centers on this: Portkey's `max_age` (min **60s**, max **90 days**, default **7
   days**),[^portkey-cache] Cloudflare's `cf-aig-cache-ttl` (min 60s, max one
   month),[^cf-aig-cache] and LiteLLM's per-entry `ttl` (no built-in default — unset means no
   expiry until evicted; docs show `600s` as an example).[^litellm-cache] On a DIY
   store this is a native primitive — Redis `SET key value EX <seconds>` / `EXPIRE`, with
   TTL persisted and replicated.[^redis-expire] Pick the TTL from *how fast the underlying
   answer can change*, not from convenience.

2. **Event-based invalidation.** TTL alone means you serve stale answers for up to one TTL
   after the truth changes. When you *know* the source changed (a document was edited, a
   price updated, the KB was re-published), invalidate proactively — delete the affected
   keys, or force a refresh (Portkey `x-portkey-cache-force-refresh`, Cloudflare
   `cf-aig-skip-cache`, LiteLLM `no-cache`/`no-store`).[^portkey-cache][^cf-aig-cache][^litellm-cache]

3. **Versioned keys.** The cleanest way to invalidate on a *prompt or model change* is to
   fold a version tag into the key: `v{promptVersion}:{model}:{hash(request)}`. Deploying a
   new system prompt or bumping the model bumps the version, so old entries are simply never
   read again (and age out by TTL) — no explicit purge, no risk of serving a previous
   model's or previous prompt's output. Because Cloudflare/Portkey already fold `model` and
   the full body into the key, a model change auto-misses; an out-of-band prompt-template
   change is the case you must version yourself.[^cf-aig-cache][^portkey-cache]

### Eviction (capacity, not correctness)

Distinct from TTL: eviction is what happens when the *store fills up*. On Redis you set
`maxmemory` with a `maxmemory-policy`; for a cache the recommended default is
**`allkeys-lru`** (evict least-recently-used across all keys) because access follows a
Pareto distribution — a hot subset earns its space.[^redis-eviction] `volatile-ttl` (evict
the soonest-to-expire) and `allkeys-lfu` are alternatives; `noeviction` (error on write
when full) is almost never what a cache wants.[^redis-eviction]

### Where the hit rate is real — and where it's ~0

Exact caching only pays when identical requests actually recur:

- **High hit rate:** deterministic tasks (`temperature = 0` extraction/classification),
  FAQ and support answers, repeated identical queries on popular content, idempotent tool
  prompts, and any endpoint where the *same input maps to one correct output*.
- **Near-zero hit rate:** open-ended chat, high-entropy free text, anything with a unique
  per-request body (timestamps, user-specific context, long unique documents). Here two
  requests are *never* byte-identical, so an exact cache is theater.

That ~0 case is exactly the **bridge to semantic caching (L3)**: when requests are similar
but not identical, you match on embedding similarity instead of an exact hash — trading the
guaranteed-correct exact match for a fuzzy one with its own quality risk. Reach for exact
caching first (it's cheaper and can't return a wrong-question answer); reach for semantic
caching when the exact hit rate is provably low but paraphrase volume is high.

### Build vs. buy

- **Buy (gateway):** Portkey, LiteLLM, and Cloudflare AI Gateway ship response caching as
  configuration — a `cache` block or a TTL header — with the exact-match key, TTL, force-
  refresh, and a `HIT`/`MISS` status field already implemented.[^portkey-cache][^litellm-cache][^cf-aig-cache]
  Fastest path; you inherit their key/normalization semantics.
- **Build (Redis/KV):** a direct store gives you full control of key normalization,
  versioning, TTL, and eviction policy, at the cost of owning correctness. Redis provides
  every primitive — per-key `EX`/`EXPIRE`,[^redis-expire] and `maxmemory` +
  `allkeys-lru`.[^redis-eviction] Choose this when your normalization/invalidation rules are
  non-trivial (versioned prompts, event-driven purges tied to your data model).

Either way, instrument the hit rate and dollars saved — an un-measured cache is
indistinguishable from a broken one (see *Cache-Hit-Rate Instrumentation*).

## Example Where It Works

A support product exposes an "explain this policy" endpoint. The 200 most common questions
account for **~60%** of the ~500,000 daily calls, each run at `temperature = 0` against a
fixed knowledge base with a stable system prompt.

- **Without caching:** every one of the 500k calls is billed in full, including the ~300k
  that are exact repeats of the top-200 questions.
- **With exact caching:** key on `v{promptVersion}:{model}:sha256(normalized messages +
  params)` with a 24-hour TTL, invalidated whenever the KB is republished. The first ask of
  each popular question is a full model call; the next thousands are **store lookups at zero
  model tokens** — roughly a **60% reduction in generation spend** on this endpoint, plus a
  large latency win on hits.[^cf-aig-cache][^portkey-cache] When the KB changes, a force-
  refresh / key-version bump prevents any stale answer from being served.[^portkey-cache]

Because the answers are deterministic (`temperature = 0`) and the questions genuinely
repeat, both preconditions for exact caching hold — high recurrence and a correct-by-
construction key.

## Example Where It Would NOT Work

- **Open-ended chat.** A conversational assistant where every turn carries unique history,
  user context, and phrasing produces requests that are essentially never byte-identical.
  The exact-match key fragments completely and the hit rate is ~0 — this is the case for
  *semantic caching* (or none) instead.
- **Non-deterministic sampling.** At `temperature > 0` the "correct" output isn't unique;
  caching pins one sampled response and re-serves it, silently removing the variety the
  product intended (e.g. a "give me another idea" button that now returns the same idea).
- **Fast-changing ground truth with a loose TTL.** Caching answers about live prices,
  inventory, or breaking events with a long TTL and no event-based invalidation is the
  classic staleness bug — you serve a confidently-wrong old answer. If you can't invalidate
  on change, keep the TTL below the data's change interval, or don't cache it.[^redis-expire]
- **Under-normalized keys.** If an incidental per-request field (a timestamp, a nonce, a
  trace ID) leaks into the hashed body, every request is unique and the cache never hits —
  a configuration bug that looks like "caching doesn't help" but is really a key-design
  failure.[^cf-aig-cache]

[^portkey-cache]: Portkey Docs, "Cache (Simple & Semantic)" — <https://portkey.ai/docs/product/ai-gateway/cache-simple-and-semantic>
[^cf-aig-cache]: Cloudflare Developer Docs, "Caching — AI Gateway" — <https://developers.cloudflare.com/ai-gateway/features/caching/>
[^litellm-cache]: LiteLLM Docs, "Caching — LiteLLM Proxy" — <https://docs.litellm.ai/docs/proxy/caching>
[^litellm-keys]: LiteLLM Docs, "Caching — In-Memory, Redis, s3, gcs, Redis Semantic Cache, Disk" — <https://docs.litellm.ai/docs/caching/all_caches>
[^redis-expire]: Redis Docs, "Redis key expiration (EXPIRE / TTL)" — <https://redis.io/docs/latest/develop/using-commands/keyspace/>
[^redis-eviction]: Redis Docs, "Key eviction" — <https://redis.io/docs/latest/develop/reference/eviction/>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
