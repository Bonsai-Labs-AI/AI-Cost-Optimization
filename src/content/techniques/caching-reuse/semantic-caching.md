---
title: "Semantic Caching"
category: caching-reuse
maturityLevel: 3
maturityProvisional: false
shortDescription: "Cache responses keyed by embedding similarity so semantically-equivalent (not byte-identical) queries hit the cache, turning many near-duplicate LLM calls into free cache reads."
effort: Medium
gain: High
riskToQuality: High
detectionSignals:
  - "Many near-duplicate or paraphrased queries miss an exact-match cache (same intent, different wording)."
  - "High repeated-intent traffic — FAQ, support, or a fixed knowledge base answered by an LLM."
  - "An exact-response cache is deployed but sits at a low hit rate because inputs vary slightly."
  - "The same handful of questions dominate traffic but reach the model as fresh requests every time."
measurementMethods:
  - "Semantic cache hit rate (semantic hits ÷ total queries) and $ / calls saved on hits."
  - "False-hit rate: sample cached hits and score whether the served answer actually answered the query."
  - "Similarity-threshold sweep: accuracy and hit rate as a function of the cosine threshold."
  - "Added lookup latency (embed + vector search) vs. the LLM latency it replaces."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/cache-invalidation-strategies"
  - "caching-reuse/cache-hit-rate-instrumentation"
  - "caching-reuse/embedding-caching"
  - "caching-reuse/retrieval-result-caching"
sources:
  - id: gptcache-repo
    title: "GPTCache: Semantic cache for LLMs"
    publisher: "Zilliz — GitHub"
    year: 2026
    url: "https://github.com/zilliztech/gptcache"
    accessed: "2026-07-03"
    kind: repo
    note: "Reference open-source semantic cache. Query → embedding (ONNX/HF/OpenAI) → vector store similarity search (Milvus/FAISS/Chroma) → similarity evaluation decides hit/miss. Cache manager handles storage + LRU/FIFO/LFU eviction. Headline claim: 'Slash Your LLM API Costs by 10x, Boost Speed by 100x.'"
  - id: gptcache-paper
    title: "GPTCache: An Open-Source Semantic Cache for LLM Applications Enabling Faster Answers and Cost Savings"
    publisher: "NLP-OSS @ EMNLP (OpenReview)"
    authors: "Bang, F."
    year: 2023
    url: "https://openreview.net/pdf?id=ivwM8NwM4Z"
    accessed: "2026-07-03"
    kind: paper
    note: "The GPTCache paper: introduces the modular semantic-cache design (embedding generator, cache storage + vector store, similarity evaluator) as a drop-in layer for LLM apps."
  - id: gpt-semantic-cache-paper
    title: "GPT Semantic Cache: Reducing LLM Costs and Latency via Semantic Embedding Caching"
    publisher: "arXiv:2411.05276"
    authors: "Regmi, S.; Pun, C. P."
    year: 2024
    url: "https://arxiv.org/html/2411.05276v3"
    accessed: "2026-07-03"
    kind: paper
    note: "On a 2,000-query test set (Python, customer service, technical support, general knowledge) with all-MiniLM-L6-v2 embeddings and a 0.8 cosine threshold (swept 0.6–0.9): cache hit rates 61.6%–68.8%, API-call reduction up to 68.8%, positive (correct) hit rates 92.5%–97.3%."
  - id: aws-elasticache-semantic
    title: "Lower cost and latency for AI using Amazon ElastiCache as a semantic cache with Amazon Bedrock"
    publisher: "AWS Database Blog"
    year: 2026
    url: "https://aws.amazon.com/blogs/database/lower-cost-and-latency-for-ai-using-amazon-elasticache-as-a-semantic-cache-with-amazon-bedrock/"
    accessed: "2026-07-03"
    kind: blog
    note: "63,796 real chatbot queries + paraphrases (SemBenchmarkLmArena), Titan Text Embeddings V2 + Claude 3 Haiku. At threshold 0.75: 86.3% cost reduction, 88.3% latency improvement, 91.2% accuracy. At 0.99: 15.8% savings, 92.1% accuracy. Loosening 0.99→0.75 trades ~0.9pp accuracy for ~70pp more savings."
  - id: redis-semantic
    title: "What is semantic caching? Guide to faster, smarter LLM apps"
    publisher: "Redis"
    year: 2026
    url: "https://redis.io/blog/what-is-semantic-caching/"
    accessed: "2026-07-03"
    kind: docs
    note: "Mechanism (embed → cosine similarity search → hit if above threshold, commonly 0.85–0.95), TTL/invalidation guidance by data volatility, and false-positive control (start 0.90–0.95, escalate to a domain embedding model if false positives exceed 3–5%). Vector search adds ~5–20ms."
  - id: portkey-cache
    title: "Cache (Simple & Semantic)"
    publisher: "Portkey — AI Gateway Docs"
    year: 2026
    url: "https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/cache-simple-and-semantic"
    accessed: "2026-07-03"
    kind: docs
    note: "Gateway = buy option. Semantic cache is a superset of simple (exact) cache: exact-hash check first, vector similarity on a miss. Default cosine threshold 0.95 (SEMANTIC_CACHE_SIMILARITY_THRESHOLD). Limits: <8,191 tokens, ≤4 messages, ≥1 user message."
  - id: litellm-cache
    title: "Caching — In-Memory, Redis, Redis Semantic, Qdrant Semantic"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Open gateway option: redis-semantic / qdrant-semantic cache modes, a similarity_threshold param (0–1, example 0.8), a configured embedding model, and vector size matching the embedder (e.g. 1536)."
  - id: cloudflare-cache
    title: "Caching · Cloudflare AI Gateway"
    publisher: "Cloudflare AI Gateway Docs"
    year: 2026
    url: "https://developers.cloudflare.com/ai-gateway/features/caching/"
    accessed: "2026-07-03"
    kind: docs
    note: "Illustrates the exact-match end of the gateway spectrum: cache key = SHA-256 of provider+endpoint+model+auth+full body; any body difference is a separate entry. Semantic search 'planned' — so a gateway's exact cache alone misses paraphrases."
---

## Overview

An exact-response cache only fires when a request is **byte-for-byte identical** to one it has
seen before. In real products that almost never happens: users ask the same thing a dozen
different ways — "What's your return policy?", "How do I return something?", "Can I send this
back?" — each an identical intent but a distinct string. Every variation misses the exact cache
and pays full price for a fresh LLM call.[^redis-semantic]

**Semantic caching** closes that gap. Instead of hashing the raw text, it **embeds the query into
a vector, runs a similarity search against previously-seen queries, and — if the closest match's
cosine similarity clears a threshold — returns that query's cached answer** without ever calling
the model.[^gptcache-repo][^redis-semantic] A hit costs one embedding call plus a vector lookup
(single-digit-to-low-tens of milliseconds) and saves the entire generation — **100% of the model
cost and seconds of latency on every hit**.[^redis-semantic] Because it matches *meaning* rather
than exact bytes, its hit rate on paraphrase-heavy traffic is far higher than an exact cache's.

The catch is what makes it **Level 3** rather than a config toggle: the matching is *fuzzy*, so a
too-loose threshold serves a **confidently wrong answer** — a similar-but-not-equivalent question
gets someone else's response. This false-hit risk is the defining engineering problem of the
technique, and getting it right (threshold tuning, invalidation, false-hit monitoring, an embedding
model that separates your intents) is real work. It is the fuzzy sibling of *exact-response caching*
(L2), and it pays off on the same signal — high repeated-intent traffic — but one tier up in both
gain and risk.

## Detailed Approach & Techniques

### Mechanism: embed → search → threshold

The canonical implementation, popularized by **GPTCache**, is a modular layer that sits between
your app and the LLM:[^gptcache-repo][^gptcache-paper]

1. **Embed** the incoming query with a sentence-embedding model (e.g. `all-MiniLM-L6-v2`, an OpenAI
   embedding, or a domain-tuned model).
2. **Similarity search** that vector against stored query embeddings in a vector store (Milvus,
   FAISS, Redis, Qdrant, Chroma).
3. **Evaluate**: if the nearest neighbour's **cosine similarity ≥ threshold**, it's a **hit** —
   return the stored answer. Otherwise it's a **miss**: call the LLM, then store the new
   `(query embedding → response)` pair for next time.[^gptcache-repo][^redis-semantic]

A cache manager handles storage and eviction (LRU/FIFO/LFU).[^gptcache-repo] The vector lookup adds
only ~5–20 ms, versus the 1–5 s it removes on a hit.[^redis-semantic]

### The threshold tradeoff — the core risk

Everything rides on one number, the cosine-similarity threshold, and it is a direct
**precision/recall dial**:

- **Too tight** (e.g. 0.98–0.99): near-identical paraphrases are treated as misses. The hit rate —
  and the savings — collapse toward what an exact cache already gave you.
- **Too loose** (e.g. 0.70): distinct questions get merged, and the cache serves a **wrong-but-
  similar answer** — a false hit. This is the failure mode that makes semantic caching dangerous,
  not merely ineffective.[^redis-semantic]

Practitioner defaults cluster around **0.85–0.95** cosine, and the sweet spot is
model- and domain-dependent.[^redis-semantic] Gateways ship conservative defaults you then tune:
**Portkey defaults to 0.95**;[^portkey-cache] **LiteLLM** exposes a `similarity_threshold` (0–1,
docs example 0.8) for its `redis-semantic` / `qdrant-semantic` modes.[^litellm-cache] Redis'
guidance is to **start at 0.90–0.95, monitor the false-positive rate, and if it exceeds ~3–5% the
fix is a better (domain-specific) embedding model, not just a looser number** — a general-purpose
embedder that can't separate your intents can't be rescued by threshold alone.[^redis-semantic]

Crucially, the threshold does **not** trade linearly. On AWS's 63,796-query benchmark, moving the
threshold from a strict **0.99 to a permissive 0.75** changed answer accuracy by only **~0.9
percentage points** (92.1% → 91.2%) while lifting cost savings from **15.8% to 86.3%** — roughly
**70 points of extra savings for under a point of accuracy**.[^aws-elasticache-semantic] That is why
tuning against a *real* query distribution (with a held-out false-hit eval) beats guessing: the
efficient operating point is often far looser than intuition suggests, but only your data proves it.

### Quantifying hit rate and savings

Published deployments give a realistic band:

- **GPT Semantic Cache** (2,000-query test across Python, customer-service, technical-support, and
  general-knowledge intents; `all-MiniLM-L6-v2`; 0.8 threshold): **61.6%–68.8% cache hit rate**,
  **up to 68.8% fewer API calls**, and **92.5%–97.3% positive (correct) hit rate**.[^gpt-semantic-cache-paper]
- **AWS ElastiCache + Bedrock** (Titan V2 embeddings, Claude 3 Haiku): **86.3% cost reduction and
  88.3% latency reduction** at threshold 0.75 on paraphrase-heavy traffic.[^aws-elasticache-semantic]
- **GPTCache** headlines up to **10× cost and 100× speed** on highly repetitive
  workloads.[^gptcache-repo]

Note what "savings" means: on a hit you save **100% of the generation cost**, so total savings
scale directly with hit rate, which in turn scales with how repetitive and paraphrase-heavy your
traffic is.

### Invalidation — keeping a fuzzy cache correct

A semantic cache without invalidation is a wrong-answer generator: it will happily serve last
month's pricing to this month's paraphrase. Bound staleness with **TTLs sized to data volatility**
(minutes for prices/inventory, hours for descriptions, ~a day for stable FAQs/policies) plus
**content-triggered purges** (when the source doc changes, flush the related entries rather than
waiting for TTL), and **version-namespace keys** by model and prompt version so a model/prompt
change doesn't reuse stale answers.[^redis-semantic] (See *Cache Invalidation Strategies* for the
cross-cutting discipline.)

### Build vs. buy: the gateway path

You do not have to build this. An **LLM gateway is the "buy" option**, and a good one is a **superset
of exact caching**: Portkey checks an **exact hash first and only runs semantic search on a miss**,
so you get byte-exact hits *and* paraphrase hits from one layer.[^portkey-cache] **LiteLLM** offers
open-source `redis-semantic` / `qdrant-semantic` modes with a tunable
threshold.[^litellm-cache] Some gateways still do **exact-match only** — Cloudflare AI Gateway keys
on a SHA-256 of the full request body (any difference is a separate entry) and lists semantic search
as "planned" — so if paraphrase hits matter, confirm the gateway actually does semantic
matching.[^cloudflare-cache] Build your own (GPTCache-style) when you need control over the embedding
model, threshold policy, or invalidation; buy the gateway when you want it turnkey alongside routing,
fallbacks, and exact caching.[^gptcache-repo][^portkey-cache]

## Example Where It Works

A SaaS company runs a **customer-support assistant** over a stable help-center. Traffic is dominated
by a few hundred recurring intents — password resets, billing questions, "how do I export my data",
return/refund policy — each arriving in endless phrasings. An **exact** cache barely helps because no
two users type the question identically.

Add a semantic cache: embed each query, and on a **~0.9 threshold** return the stored answer when a
prior equivalent question is close enough. On this kind of paraphrase-heavy, repeated-intent traffic,
deployments report **~60–70% hit rates**[^gpt-semantic-cache-paper] and, at a well-tuned
loose-but-safe threshold, **~85%+ cost and latency reductions on the cached fraction** while holding
answer accuracy above **~91%**.[^aws-elasticache-semantic] Every hit turns a multi-second, full-price
generation into a **~20 ms, ~free** vector lookup.[^redis-semantic] Because the answers are
FAQ-style and identical for everyone, the false-hit risk is low, and a **24-hour TTL** with a purge
on help-center edits keeps them fresh.[^redis-semantic] This is the archetypal fit: **high repeated
intent, shared (non-personalized) answers, tolerant of a small false-hit rate.**

## Example Where It Would NOT Work

A **personal-finance assistant** answers questions like "What's my current balance?", "How much did I
spend on travel last month?", and "Am I on track for my savings goal?" Two users — or the same user a
day later — can phrase these **almost identically**, so their query embeddings are nearly identical
and sit **well above any reasonable similarity threshold**. A semantic cache would happily serve **one
user's balance to another**, or a stale figure to the same user, because the *questions* are
semantically equivalent even though the *correct answers* are completely different and
per-user.[^redis-semantic] Here the whole premise — "similar question ⇒ reusable answer" — is false.

The same disqualifier applies to any **personalized, precise, time-sensitive, or high-stakes** output:
medical/legal advice, real-time prices or inventory, code generated against a specific repo, anything
where a plausible-but-wrong answer causes harm. The loosened-threshold economics that make FAQ caching
so attractive[^aws-elasticache-semantic] are exactly what make it dangerous here — a false hit isn't a
missed saving, it's a confidently wrong, personalized answer. For these workloads, restrict caching to
**exact matches** (or don't cache the answer at all and instead cache upstream pieces like embeddings
or retrieval results), and lean on *prompt caching* to cut the shared-prefix cost without ever reusing
a whole answer.

[^gptcache-repo]: Zilliz, "GPTCache: Semantic cache for LLMs," GitHub — <https://github.com/zilliztech/gptcache>
[^gptcache-paper]: Bang, F., "GPTCache: An Open-Source Semantic Cache for LLM Applications," NLP-OSS @ EMNLP 2023 — <https://openreview.net/pdf?id=ivwM8NwM4Z>
[^gpt-semantic-cache-paper]: Regmi & Pun, "GPT Semantic Cache: Reducing LLM Costs and Latency via Semantic Embedding Caching," arXiv:2411.05276 — <https://arxiv.org/html/2411.05276v3>
[^aws-elasticache-semantic]: AWS Database Blog, "Lower cost and latency for AI using Amazon ElastiCache as a semantic cache with Amazon Bedrock" — <https://aws.amazon.com/blogs/database/lower-cost-and-latency-for-ai-using-amazon-elasticache-as-a-semantic-cache-with-amazon-bedrock/>
[^redis-semantic]: Redis, "What is semantic caching? Guide to faster, smarter LLM apps" — <https://redis.io/blog/what-is-semantic-caching/>
[^portkey-cache]: Portkey AI Gateway Docs, "Cache (Simple & Semantic)" — <https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/cache-simple-and-semantic>
[^litellm-cache]: LiteLLM Docs, "Caching — In-Memory, Redis, Redis Semantic, Qdrant Semantic" — <https://docs.litellm.ai/docs/proxy/caching>
[^cloudflare-cache]: Cloudflare AI Gateway Docs, "Caching" — <https://developers.cloudflare.com/ai-gateway/features/caching/>
