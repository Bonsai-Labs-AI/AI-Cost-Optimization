---
title: "Cache Invalidation Strategies"
category: caching-reuse
maturityLevel: 2
maturityProvisional: false
shortDescription: "The cross-cutting discipline — TTLs, versioned/namespaced keys, and event-driven purges — that keeps every cache (exact, semantic, retrieval, tool, embedding) correct as models, prompts, and data change, so aggressive caching saves money instead of shipping stale wrong answers."
effort: Medium
gain: Medium
riskToQuality: Low
effortWhy: "Mostly design: TTL policy per cache, version tokens in the key, and purge hooks on the write path — modest engineering, but must be applied consistently across every cache."
gainWhy: "An enabler, not a direct saver: correct invalidation is what lets you cache far more aggressively (higher hit rate, longer TTLs) without risking stale answers."
riskWhy: "Done right it lowers risk; the danger is its absence — an un-invalidated cache is a wrong-answer generator after any model, prompt, or corpus change."
detectionSignals:
  - "Caches with no TTL and no versioning — entries live until manually flushed."
  - "Stale answers served after a model upgrade, a prompt/system-prompt edit, or a corpus/index update."
  - "Cache keys are the raw query or prompt only, not namespaced by model version, prompt version, or corpus version."
  - "A deploy requires manually flushing the whole cache because there is no targeted way to purge affected entries."
  - "Semantic/retrieval/tool caches reuse answers built on data that has since changed, with no freshness bound."
measurementMethods:
  - "Stale-hit rate: sample cache hits and check the cached answer against a freshly computed one; the fraction that diverges is your staleness error."
  - "Time-to-invalidate: latency from a source change (model/prompt/corpus/record) to the moment the affected cache entries stop being served."
  - "Hit rate vs. staleness bound: hit rate plotted against TTL length, so you can pick the shortest TTL that still meets the savings target."
  - "Percentage of caches with an explicit TTL and version-namespaced keys (coverage of the discipline itself)."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/semantic-caching"
  - "caching-reuse/rag-pipeline-caching"
  - "caching-reuse/tool-result-caching"
  - "caching-reuse/rag-pipeline-caching"
  - "caching-reuse/summary-caching"
sources:
  - id: redis-eviction
    title: "Key eviction"
    publisher: "Redis Docs"
    year: 2026
    url: "https://redis.io/docs/latest/develop/reference/eviction/"
    accessed: "2026-07-03"
    kind: docs
    note: "Eviction policies: noeviction, allkeys-lru/lfu/random, volatile-lru/lfu/random/ttl. maxmemory sets the limit; volatile-ttl evicts the shortest-remaining-TTL keys. Good key expiration keeps you under the memory limit so keys expire before they must be evicted."
  - id: redis-csc
    title: "Client-side caching reference"
    publisher: "Redis Docs"
    year: 2026
    url: "https://redis.io/docs/latest/develop/reference/client-side-caching/"
    accessed: "2026-07-03"
    kind: docs
    note: "When a key is modified, expires, or is evicted, clients with tracking enabled are notified through invalidation messages — the event-driven push-invalidation primitive."
  - id: redis-invalidation
    title: "Understanding cache invalidation for fast apps"
    publisher: "Redis Glossary"
    year: 2026
    url: "https://redis.io/glossary/cache-invalidation/"
    accessed: "2026-07-03"
    kind: docs
    note: "Overview of invalidation approaches: TTL/expiration, write-through, write-invalidate (delete-on-write), and event-driven invalidation; the consistency-vs-hit-rate tradeoff."
  - id: cloudfront-versioning
    title: "Use file versioning to update or remove content with a CloudFront distribution"
    publisher: "Amazon CloudFront Developer Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/UpdatingExistingObjects.html"
    accessed: "2026-07-03"
    kind: docs
    note: "AWS recommends a version identifier in file/directory names (e.g. image_1.jpg -> image_2.jpg). With versioning you don't wait for expiry and don't pay for invalidation; still set an expiration date. The canonical 'versioned keys beat purge' pattern."
  - id: cloudfront-invalidation
    title: "Invalidate files to remove content"
    publisher: "Amazon CloudFront Developer Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html"
    accessed: "2026-07-03"
    kind: docs
    note: "Explicit purge: invalidate a path so the next request goes back to origin for the latest version; the event-driven purge primitive at the CDN layer."
  - id: litellm-caching
    title: "Caching — LiteLLM Proxy"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Gateway cache config: ttl (seconds), default_in_memory_ttl, default_in_redis_ttl; per-request ttl and namespace overrides ('cache': {'ttl': 300, 'namespace': '...'}). The buy-path knobs for TTL + namespacing an LLM cache."
  - id: gptcache-repo
    title: "GPTCache: Semantic cache for LLMs"
    publisher: "Zilliz — GitHub"
    year: 2026
    url: "https://github.com/zilliztech/GPTCache"
    accessed: "2026-07-03"
    kind: repo
    note: "Semantic cache with LRU/FIFO/LFU/RR eviction policies and a similarity-evaluation step to accept/reject a hit; eviction is line-count based (a documented limitation), so TTL is needed to bound staleness."
  - id: gptcache-guide
    title: "Semantic Caching for LLM Inference: GPTCache, Redis Vector Cache, and Prompt Cache Setup"
    publisher: "Spheron Blog"
    year: 2026
    url: "https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/"
    accessed: "2026-07-03"
    kind: blog
    note: "Practical TTL-by-volatility guidance for LLM caches: ~24h for news/current events, ~72h for stable factual content, ~7 days for static FAQ; LRU without TTL risks serving stale answers indefinitely."
  - id: aws-llm-cache
    title: "Optimize LLM response costs and latency with effective caching"
    publisher: "AWS Database Blog"
    year: 2026
    url: "https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/"
    accessed: "2026-07-03"
    kind: blog
    note: "Applies classic cache patterns (TTL, eviction, exact vs semantic keys) to LLM response caching on Redis/vector stores."
---

## Overview

Every cache trades a small risk of serving *old* data for a large saving in cost and
latency. For LLM products the saving is enormous — an exact-, semantic-, retrieval-, or
tool-result cache hit can be **100% of the model or tool cost avoided** — but the risk is
sharp: an LLM cache stores an *answer*, and a stale answer is not slow, it is **wrong**.
The moment the thing that produced the answer changes — the model version, the system
prompt, the retrieved corpus, the external record a tool read — every cached entry built
on the old inputs becomes a potential wrong-answer generator that will keep serving
confidently until something removes it.

Cache invalidation is the cross-cutting discipline that keeps this from happening. It is
not a single cache; it is the set of policies — **time-to-live (TTL)**, **versioned and
namespaced keys**, **write-through / write-invalidate**, and **event-driven purge** — that
you apply to *every* cache in the stack so that entries expire, get overwritten, or get
purged before they can serve a stale result. This is the technique that makes aggressive
caching **safe**: without it you either cache timidly (short TTLs, low hit rate, small
savings) or cache recklessly (long TTLs, high hit rate, silent quality decay). With it you
can push hit rate as high as the data's real volatility allows and no further.

It sits at **Level 2** because doing it correctly is genuine cross-system engineering:
you have to know, per cache, *what* invalidates it, wire version tokens through the key,
add purge hooks to your write and deploy paths, and pick a TTL per data-volatility class —
and get it right consistently across five different cache types. It is a **Medium-effort,
Medium-gain** enabler: it rarely saves money by itself; it is what *lets the other caches
save money without regret*. The risk it carries is **Low** when present — and its
**absence** is the real hazard.

## Detailed Approach & Techniques

### The invalidation toolkit

The classic caching literature offers four primitives; a mature LLM cache uses all of them
together.[^redis-invalidation]

1. **TTL / expiration.** Every entry gets a maximum age; after it, the entry is gone and
   the next request recomputes. This is the *floor* of correctness — it bounds staleness
   even when nothing else fires. Backing stores make this cheap: in Redis you set an
   `EXPIRE`/TTL per key, and good use of expiration also keeps you under the memory limit
   because keys expire before they have to be evicted.[^redis-eviction] Note that
   *eviction* (dropping keys under memory pressure) is **not** invalidation: policies like
   `allkeys-lru` or `volatile-ttl` decide *who gets dropped when you run out of room*, not
   *whether an entry is still correct*.[^redis-eviction] A cache that relies on LRU alone,
   with no TTL, can serve a stale answer **indefinitely** as long as it keeps getting
   hit.[^gptcache-guide]

2. **Write-through.** On a write to the source of truth, update the cache in the same
   operation so the two never diverge. Strongest consistency, but every write pays to
   refresh the cache — worthwhile only for hot keys read far more than written.[^redis-invalidation]

3. **Write-invalidate (delete-on-write).** On a write, simply *delete* the affected cache
   entry; the next read repopulates it from source. Cheaper and more common than
   write-through, but exposes a read/write race (a reader can repopulate a stale value in
   the window around the write) — mitigated by invalidating before committing, or by
   **versioning keys** so a late writer cannot overwrite a newer entry.[^redis-invalidation]

4. **Event-driven purge.** A change *event* triggers targeted removal of exactly the
   affected entries. Redis exposes this as **client-side-caching invalidation messages** —
   when a key is modified, expires, or is evicted, tracking clients are pushed an
   invalidation notification.[^redis-csc] CDNs expose it as an explicit **invalidation /
   purge** call that forces the edge back to origin on the next request.[^cloudfront-invalidation]

### Versioned & namespaced keys (the LLM-specific workhorse)

The single most powerful pattern for LLM caches is to fold the identity of *everything that
determines the answer* into the cache key. Instead of keying on the query alone, key on a
**namespace built from the volatile dependencies**:

```
key = hash(model_version · prompt_version · corpus_version · query)
```

When any dependency changes, you bump its version token, the computed key changes, and
**every old entry is instantly orphaned** — no scan, no purge job, no flush. Old keys age
out naturally via TTL while new keys serve fresh answers. This is exactly the pattern AWS
recommends for CDNs: rather than pay to invalidate `image.jpg`, ship `image_2.jpg` — *"with
versioning, you don't have to wait for an object to expire before CloudFront begins to
serve a new version of it, and you don't have to pay for object invalidation."*[^cloudfront-versioning]
The same logic maps directly onto LLM caches:

- **Model version** in the key → a model upgrade (e.g. a new snapshot) doesn't serve
  answers generated by the old model.
- **Prompt / system-prompt version** in the key → editing the system prompt or few-shot
  block doesn't keep returning answers shaped by the old instructions.
- **Corpus / index version** in the key → a re-indexed knowledge base invalidates the
  **retrieval-result** and **semantic** caches that answered from the old documents.
- **Tool/data version or record ID + updated-at** → a **tool-result** cache doesn't return
  a stale price, inventory count, or record after the underlying system changed.

Versioned keys turn "invalidate the cache" from a risky bulk operation into a one-line
constant bump at deploy time. AWS still recommends setting a TTL *even when you
version*[^cloudfront-versioning] — belt-and-suspenders, so an entry no version bump touches
still expires eventually.

### Pick the TTL by data volatility, bound staleness per cache type

There is no universal TTL; the correct value is a function of *how fast the underlying data
changes* and *how much staleness the use case tolerates*. A practical volatility ladder for
LLM caches:[^gptcache-guide]

| Data class | Example | Suggested TTL |
| --- | --- | --- |
| Volatile / time-sensitive | news, current events, live prices, inventory | hours (e.g. ~24h) |
| Semi-stable factual | product specs, policy text, documentation | days (e.g. ~72h) |
| Static | evergreen FAQ, definitions, glossary | ~7 days+ |

The rule is per-cache-type: an **exact-response** cache on an FAQ can run a very long TTL;
a **tool-result** cache reading a mutable external record should run a short TTL *or* be
event-invalidated on the write; a **semantic** cache inherits the volatility of whatever it
answered from. Bound the staleness explicitly for each cache and you can reason about the
worst-case wrongness of any hit.

### The gateway (buy) path

You do not have to build all of this. LLM gateways expose the knobs directly. **LiteLLM**'s
proxy cache takes a global `ttl` (plus separate `default_in_memory_ttl` /
`default_in_redis_ttl` for a tiered setup) and supports **per-request TTL and namespace
overrides** — passing `"cache": {"ttl": 300, "namespace": "..."}` on a call lets you set a
short TTL for volatile requests and namespace keys by tenant, model, or prompt version
without touching the backing store.[^litellm-caching] Semantic-cache libraries do the same
on the read side: **GPTCache** pairs a similarity-evaluation gate (accept a hit only above
a threshold) with LRU/FIFO/LFU/RR eviction — but its eviction is line-count based, an
acknowledged limitation, which is exactly why you layer a **TTL** on top to bound
staleness rather than trusting eviction alone.[^gptcache-repo][^aws-llm-cache]

### The cost / quality tradeoff (how to tune)

Invalidation is a dial, not a switch. **Tighter invalidation — shorter TTLs, more
aggressive purges — means lower hit rate, which means less savings.** Looser invalidation
means higher hit rate and more savings, but a longer window in which a hit can be stale.
The tuning method:

1. Instrument a **stale-hit rate** by sampling hits and comparing each cached answer to a
   freshly recomputed one; the divergence fraction is your staleness error.
2. Plot **hit rate against TTL length**, and choose the *shortest* TTL whose stale-hit rate
   is under the use case's tolerance while the hit rate still clears your savings target.
3. For anything with a clean change signal (a DB write, a re-index job, a deploy), prefer
   **event-driven purge or a version bump** over a long TTL — you get both a high hit rate
   *and* near-zero staleness, because entries die exactly when their inputs change rather
   than on a fixed timer.

## Example Where It Works

A support assistant serves a knowledge base with an **exact + semantic response cache** and
a **retrieval-result cache**, running a healthy hit rate that cuts model spend meaningfully.
The team ships a system-prompt rewrite (new tone, new escalation rules) *and* re-indexes the
knowledge base the same week after a policy change.

- **Without invalidation:** the caches keep answering. Users get responses in the *old*
  tone, citing the *old* policy, for as long as those popular entries keep getting hit —
  a silent, confident-sounding quality regression with no error in any log.
- **With versioned keys:** `prompt_version` and `corpus_version` are part of every cache
  key. The prompt rewrite bumps one token; the re-index bumps the other. **Every affected
  entry is orphaned the instant the constants change** — no flush, no purge job, no
  downtime — while a modest TTL guarantees anything untouched still expires.[^cloudfront-versioning]
  New answers are correct from the first request; old entries age out harmlessly. The team
  can now run *longer* TTLs and a *higher* hit rate than they'd ever dare without
  versioning, because a change can no longer leak stale answers.[^redis-invalidation]

The payoff is asymmetric: a few version tokens in a key and one TTL policy unlock the full
savings of the underlying caches *and* remove the "we're afraid to cache aggressively"
tax.

## Example Where It Would NOT Work

- **Truly per-user, non-repeating, real-time answers.** If every response depends on live
  state that changes faster than any safe TTL (a trading position, a live sensor reading, a
  personalized real-time recommendation), the only "correct" TTL is effectively zero —
  which means no cache. Here invalidation discipline correctly tells you **not to cache**
  the response at all; force the model or tool to recompute, and cache only genuinely
  stable sub-parts (prompt prefix, embeddings) instead.[^gptcache-guide]

- **No detectable change signal + zero staleness tolerance.** Event-driven purge and
  versioned keys need a *signal* — a write hook, an index-version number, a deploy constant.
  If a dependency can change silently with no observable event and the use case tolerates
  **no** stale answer (e.g. a legal or medical fact that must be current), there is nothing
  to trigger invalidation and no safe TTL short of not caching. Manual whole-cache flushing
  is the fallback, and if you're flushing constantly the cache is buying nothing.[^cloudfront-invalidation]

- **Where the invalidation machinery costs more than the cache saves.** For a low-traffic
  endpoint, the engineering to wire version tokens, purge hooks, and stale-hit monitoring
  across every cache can exceed the model spend it protects. Below meaningful volume, a
  plain short TTL (or no cache) is the right call, and the full L2 discipline is
  over-engineering — reserve it for caches whose hit-driven savings are large enough to
  justify guaranteeing their correctness.[^redis-eviction]

[^redis-eviction]: Redis Docs, "Key eviction" — <https://redis.io/docs/latest/develop/reference/eviction/>
[^redis-csc]: Redis Docs, "Client-side caching reference" — <https://redis.io/docs/latest/develop/reference/client-side-caching/>
[^redis-invalidation]: Redis Glossary, "Understanding cache invalidation for fast apps" — <https://redis.io/glossary/cache-invalidation/>
[^cloudfront-versioning]: Amazon CloudFront Developer Guide, "Use file versioning to update or remove content with a CloudFront distribution" — <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/UpdatingExistingObjects.html>
[^cloudfront-invalidation]: Amazon CloudFront Developer Guide, "Invalidate files to remove content" — <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html>
[^litellm-caching]: LiteLLM Docs, "Caching — LiteLLM Proxy" — <https://docs.litellm.ai/docs/proxy/caching>
[^gptcache-repo]: Zilliz, "GPTCache: Semantic cache for LLMs" — <https://github.com/zilliztech/GPTCache>
[^gptcache-guide]: Spheron Blog, "Semantic Caching for LLM Inference: GPTCache, Redis Vector Cache, and Prompt Cache Setup" — <https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/>
[^aws-llm-cache]: AWS Database Blog, "Optimize LLM response costs and latency with effective caching" — <https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/>
