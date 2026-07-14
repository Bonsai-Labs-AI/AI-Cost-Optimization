---
title: "Retrieval Result Caching"
category: caching-reuse
maturityLevel: 3
maturityProvisional: false
shortDescription: "Cache the retrieved set (chunk IDs / reranked results) for a query so a repeated or similar query skips re-running the whole retrieval pipeline — embedding, ANN search, and reranking — instead of just the LLM call."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "The same or near-duplicate queries re-run the full retrieval pipeline (embed → vector search → rerank) every time."
  - "A relatively static corpus is queried repeatedly with overlapping intents (FAQ-style, dashboard, support)."
  - "An expensive cross-encoder / hosted reranker (Cohere Rerank, etc.) is re-run for identical query+candidate sets."
  - "Retrieval latency (not generation) is a visible share of end-to-end response time."
measurementMethods:
  - "Retrieval cache hit rate (retrieval requests served from cache ÷ total retrieval requests)."
  - "Retrieval compute cost + latency saved per hit (embedding calls, ANN queries, rerank searches avoided)."
  - "Staleness / stale-hit incidents after a corpus or index update (served-superseded-result rate, sampled)."
  - "Time-to-invalidate: lag between an index update and cached retrieval sets being purged."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/semantic-caching"
  - "caching-reuse/embedding-caching"
  - "caching-reuse/cache-invalidation-strategies"
  - "rag/reranking-before-generation"
sources:
  - id: apxml-rag-caching
    title: "Caching Strategies for RAG (Embeddings & LLM Responses)"
    publisher: "ApXML — Optimizing RAG for Production"
    year: 2026
    url: "https://apxml.com/courses/optimizing-rag-for-production/chapter-4-end-to-end-rag-performance/caching-strategies-rag"
    accessed: "2026-07-03"
    kind: docs
    note: "Distinguishes cache layers in a RAG pipeline: embedding cache, retrieval-result cache (query → retrieved chunks/IDs), and generation cache. Notes invalidation is the hard part when the corpus changes; combine TTL with event-driven purge on index updates and version documents."
  - id: milvus-rag-caching
    title: "What caching strategies are effective for multimodal RAG?"
    publisher: "Milvus — AI Quick Reference"
    year: 2026
    url: "https://milvus.io/ai-quick-reference/what-caching-strategies-are-effective-for-multimodal-rag"
    accessed: "2026-07-03"
    kind: docs
    note: "Retrieval-results caching stores the results of similar retrieval queries (via embeddings/hashing) so subsequent requests skip redundant vector-DB calls; embedding cache reuses precomputed feature vectors. Requires LRU eviction + invalidation when the knowledge base updates."
  - id: tds-agentic-rag-cache
    title: "Zero-Waste Agentic RAG: Designing Caching Architectures to Minimize Latency and LLM Costs at Scale"
    publisher: "Towards Data Science"
    year: 2026
    url: "https://towardsdatascience.com/zero-waste-agentic-rag-designing-caching-architectures-to-minimize-latency-and-llm-costs-at-scale/"
    accessed: "2026-07-03"
    kind: blog
    note: "Two-tier cache: a semantic (query→answer) cache and a separate retrieval/context cache (>70% topic-similarity key) that stores raw retrieved blocks to skip DB lookups and passes them to the LLM for a fresh answer. Reports >30% of enterprise queries are repetitive/semantically similar. Invalidation via row/table timestamps, SHA-256 fingerprints, predicate-staleness, and bypassing 'latest/current' temporal queries."
  - id: llamaindex-ingestion-cache
    title: "Ingestion Pipeline (transformation caching)"
    publisher: "LlamaIndex — Developer Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/"
    accessed: "2026-07-03"
    kind: docs
    note: "Each node+transformation pair is hashed and cached (including the embedding transformation), so re-running the same input+transformation returns the cached output. Supports remote RedisCache / MongoDBCache / FirestoreCache for a shared cache across workers."
  - id: gptcache-repo
    title: "GPTCache — Semantic cache for LLMs (LangChain / LlamaIndex integrated)"
    publisher: "Zilliz — GitHub"
    year: 2026
    url: "https://github.com/zilliztech/GPTCache"
    accessed: "2026-07-03"
    kind: repo
    note: "Modular semantic cache: embedding generator → vector store → similarity evaluator → cache storage, with pluggable eviction. The same building blocks (embed the query, vector-search prior queries, threshold on cosine similarity) implement a semantic-keyed retrieval cache."
  - id: cohere-pricing
    title: "Rerank pricing and search-unit definition"
    publisher: "Cohere — Pricing"
    year: 2026
    url: "https://cohere.com/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "One Rerank 'search unit' = one query with up to 100 documents; any document over 500 tokens is split into chunks and each chunk counts as a document (so long candidates multiply the billed unit). Rerank served via Model Vault at $5/hr (Medium) / $10/hr (Large) per deployment — a per-query reranker cost the cache skips on a hit."
  - id: cohere-rerank
    title: "Rerank — boost enterprise search and retrieval"
    publisher: "Cohere"
    year: 2026
    url: "https://cohere.com/rerank"
    accessed: "2026-07-03"
    kind: docs
    note: "Rerank is a cross-encoder step that re-scores retrieved candidates for relevance; the common pattern retrieves ~50–100 candidates and reranks to a final 3–5. This scoring pass is what a retrieval cache avoids re-running for a repeated query."
  - id: memstrata-temporal
    title: "Temporal Validity in Retrieval Memory: Eliminating Stale-Fact Errors for AI Agents over Evolving Knowledge"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/abs/2606.26511"
    accessed: "2026-07-03"
    kind: paper
    note: "Standard RAG serves superseded/stale facts 15–40% of the time on evolving knowledge; embedding similarity alone cannot separate a contradicted old fact from a rephrased current one (AUROC 0.59). Quantifies the staleness risk that caching retrieval sets amplifies if invalidation is weak."
---

## Overview

A RAG or agent query does not just call the LLM. Before generation it typically runs a
**multi-stage retrieval pipeline**: embed the query (a model call), run an approximate
nearest-neighbour (ANN) search against a vector index, and often re-score the top
candidates with a **reranker** (a cross-encoder such as Cohere Rerank).[^cohere-rerank]
Each of those stages costs money and latency on *every* query — even when the same
question, or a paraphrase of it, was asked minutes ago and would return the exact same
chunks.

**Retrieval result caching** stores the *output of the retrieval pipeline* — the set of
retrieved chunk IDs, or the final reranked set — keyed on the query, so a repeated or
similar query returns the cached retrieval set and **skips re-running embedding + ANN
search + rerank**.[^milvus-rag-caching][^apxml-rag-caching] The important scoping point:
this saves **retrieval compute, not the LLM call**. The cached chunks are still passed to
the model for a fresh generation (unlike full response/semantic caching, which caches the
answer itself).[^tds-agentic-rag-cache] It is therefore complementary to — not a
replacement for — response caching, and it pays off precisely when the *retrieval* stage
(especially reranking) is a meaningful share of cost or latency.

What pushes this technique to **Level 3** is not the caching, which is straightforward, but
**freshness and invalidation**. A cached retrieval set is a frozen snapshot of the corpus
at cache time; when the underlying corpus or index changes, those cached chunk IDs go
stale, and standard RAG already serves superseded facts **15–40%** of the time on evolving
knowledge even *without* a cache making it worse.[^memstrata-temporal] Getting the
invalidation right is the real engineering work.

## Detailed Approach & Techniques

### What to cache, and the key

The cache value is the retrieval output — most compactly the **ordered list of chunk IDs**
(plus rerank scores), which you rehydrate to text at read time, or the reranked chunks
themselves. The design decision is the **key**:

- **Exact-match key.** Hash the normalized query string (plus any filters, `top_k`, index
  version). Cheap, zero false hits, but only catches byte-identical repeats — a low hit
  rate on natural-language traffic where users paraphrase.[^apxml-rag-caching]
- **Semantic key.** Embed the query and vector-search *prior queries*; if cosine
  similarity to a cached query exceeds a threshold, reuse that query's retrieval set. This
  is the same machinery as semantic response caching (embed → vector-search → threshold),
  and libraries like GPTCache expose exactly these modules (embedding generator → vector
  store → similarity evaluator).[^gptcache-repo] A production two-tier design uses a
  *tight* threshold for query→answer reuse and a *looser* topic-similarity key (e.g. > 70%)
  for the retrieval/context cache, since sharing retrieved context is more forgiving than
  sharing a final answer.[^tds-agentic-rag-cache]

Framework support exists at the ingestion layer too: LlamaIndex's ingestion pipeline
hashes each `node + transformation` pair (embeddings included) and caches the result,
backed by a shared **RedisCache / MongoDBCache** so workers reuse each other's
computation.[^llamaindex-ingestion-cache]

### The hard part: freshness & invalidation (the L3 driver)

A retrieval cache is only safe if it is invalidated when the corpus changes. Two families,
usually combined:[^apxml-rag-caching][^milvus-rag-caching]

- **TTL (time-based).** Every cached retrieval set expires after a fixed window. Simple and
  bounded, but a blunt instrument: too long serves stale chunks, too short kills the hit
  rate. Tune the TTL to the corpus's volatility — hours for a slow-moving knowledge base,
  minutes (or no cache) for fast-changing data.
- **Event-based (index-update-driven).** Hook the ingestion/indexing pipeline: when a
  document is added, updated, or deleted, purge the cached retrieval sets that could have
  returned it. Cleaner correctness, but requires wiring a change signal (a webhook, a CDC
  stream, or an index-version bump) into the cache.

Robust deployments layer additional guards on top: **version/namespace the key** by index
or corpus version so a re-index invalidates everything at once; **validate on read** by
comparing the stored document version/timestamp (or a SHA-256 content fingerprint) against
the live source and discarding on mismatch; and **bypass the cache for temporal queries**
("latest", "current", "today") that must always hit fresh data.[^tds-agentic-rag-cache]
The failure mode to respect: embedding similarity *cannot on its own* distinguish a
superseded fact from a rephrased current one (AUROC ≈ 0.59), so a semantic key with weak
invalidation is a stale-answer generator.[^memstrata-temporal]

### The cost mechanism — what a hit actually saves

A hit skips, per query: (1) one **embedding call** for the query, (2) one **ANN search**
against the vector DB, and (3) if present, the **reranking pass**. The reranker is usually
the largest single item — a cross-encoder re-scores every candidate, and the common
pattern retrieves ~50–100 candidates to rerank down to a final 3–5.[^cohere-rerank] On a
hosted reranker the unit is a **"search" = one query with up to 100 documents**, and any
candidate over 500 tokens is *split into chunks that each count as a document*, so a query
over long candidates bills as several documents' worth of rerank work — the exact cost a
cache read avoids.[^cohere-pricing] The gain is therefore biggest when reranking is
expensive (large candidate sets, long chunks, a hosted cross-encoder) and the hit rate is
high — and in enterprise deployments **> 30% of queries are repetitive or semantically
similar**, which is roughly the ceiling on achievable hit rate.[^tds-agentic-rag-cache]

Be honest about the ROI threshold: because this saves retrieval compute and **not** the
(usually dominant) LLM generation cost, the absolute dollar savings are modest unless
retrieval is a real cost/latency line — a fat reranker, or very high query volume over a
stable-ish corpus. Below that, exact/semantic **response** caching (which also saves the
LLM call) is the higher-leverage move.[^tds-agentic-rag-cache]

## Example Where It Works

An internal support assistant answers questions over a **product-documentation corpus that
updates a few times a week**. Each query runs: embed → ANN search over ~200k chunks →
**Cohere Rerank on 60 candidates → top 5**. Traffic is peaky and repetitive — during a
release, hundreds of agents ask minor variants of the same dozen questions.

With a **semantic-keyed retrieval cache** (cosine ≥ ~0.95 on the query embedding) plus
**event-based invalidation** wired to the docs-ingestion pipeline (a re-index bumps the
corpus version and purges affected sets), roughly **30–40%** of retrieval requests hit the
cache.[^tds-agentic-rag-cache] Every hit skips a query embedding, an ANN search, and — the
big one — a 60-document rerank "search".[^cohere-pricing][^cohere-rerank] Retrieval latency
on those requests collapses to a cache lookup, and the LLM still generates a fresh answer
from the cached chunks so quality is unchanged. Because the corpus is versioned and purged
on update, the multi-day staleness that plagues naïve RAG caches is avoided.

## Example Where It Would NOT Work

- **Fast-changing / real-time corpus.** A cache over prices, inventory, news, or an
  agent's live tool results goes stale in seconds; TTLs short enough to be safe leave
  almost no hit rate, and event-based purge fires constantly. The 15–40% stale-fact rate of
  uncached RAG on evolving knowledge is a *floor* a poorly-invalidated cache pushes
  higher.[^memstrata-temporal] Route "latest/current" queries straight to
  source.[^tds-agentic-rag-cache]
- **Low query overlap.** A long-tail workload where almost every query is unique (open-
  ended research, highly personalized retrieval) has a hit rate near zero — the cache adds
  storage, an embedding lookup for the semantic key, and invalidation complexity for no
  return.[^apxml-rag-caching]
- **Cheap retrieval, dominant generation.** If retrieval is a small embedding + a fast ANN
  lookup with *no reranker*, the savable compute is tiny; the LLM call dwarfs it. Here the
  effort belongs in **response/semantic caching** (which saves the generation) rather than
  caching the retrieval set.[^tds-agentic-rag-cache][^milvus-rag-caching]
- **Loose semantic key on precise retrieval.** If a too-loose similarity threshold reuses
  one query's chunks for a subtly different query, the model generates over the *wrong
  context* — a silent quality failure, since embedding similarity can't tell a contradicted
  fact from a rephrased one.[^memstrata-temporal]

[^apxml-rag-caching]: ApXML, "Caching Strategies for RAG (Embeddings & LLM Responses)," Optimizing RAG for Production — <https://apxml.com/courses/optimizing-rag-for-production/chapter-4-end-to-end-rag-performance/caching-strategies-rag>
[^milvus-rag-caching]: Milvus, "What caching strategies are effective for multimodal RAG?" — <https://milvus.io/ai-quick-reference/what-caching-strategies-are-effective-for-multimodal-rag>
[^tds-agentic-rag-cache]: Towards Data Science, "Zero-Waste Agentic RAG: Designing Caching Architectures to Minimize Latency and LLM Costs at Scale" — <https://towardsdatascience.com/zero-waste-agentic-rag-designing-caching-architectures-to-minimize-latency-and-llm-costs-at-scale/>
[^llamaindex-ingestion-cache]: LlamaIndex, "Ingestion Pipeline" (transformation caching) — <https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/>
[^gptcache-repo]: Zilliz, "GPTCache — Semantic cache for LLMs," GitHub — <https://github.com/zilliztech/GPTCache>
[^cohere-pricing]: Cohere, "Pricing" (Rerank search-unit definition) — <https://cohere.com/pricing>
[^cohere-rerank]: Cohere, "Rerank — boost enterprise search and retrieval" — <https://cohere.com/rerank>
[^memstrata-temporal]: "Temporal Validity in Retrieval Memory: Eliminating Stale-Fact Errors for AI Agents over Evolving Knowledge," arXiv — <https://arxiv.org/abs/2606.26511>
