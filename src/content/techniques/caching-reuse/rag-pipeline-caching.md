---
title: "RAG Pipeline Caching"
category: caching-reuse
maturityLevel: 2
maturityProvisional: false
shortDescription: "Cache both query embeddings and retrieval results as layered stages in the RAG pipeline — avoid re-embedding the same query text, then avoid re-querying the vector store for the same embedding — cutting retrieval cost and latency without touching generation."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "The same or near-duplicate queries re-run the full retrieval pipeline (embed → vector search → rerank) every time."
  - "Every deploy or nightly job re-embeds the entire corpus, even when almost nothing changed."
  - "No content-hash dedupe: unchanged chunks are re-sent to the embedding API on each rebuild."
  - "A relatively static corpus is queried repeatedly with overlapping intents (FAQ-style, dashboard, support)."
  - "An expensive cross-encoder / hosted reranker (Cohere Rerank, etc.) is re-run for identical query+candidate sets."
  - "Retrieval latency (not generation) is a visible share of end-to-end response time."
measurementMethods:
  - "Query-embedding cache hit rate on repeated/popular queries."
  - "Retrieval cache hit rate (retrieval requests served from cache ÷ total retrieval requests)."
  - "Retrieval compute cost + latency saved per hit (embedding calls, ANN queries, rerank searches avoided)."
  - "Embedding-API calls (and tokens) avoided per re-index — cache hit rate at ingestion."
  - "$ / full re-index before vs. after content-hash dedupe."
  - "Staleness / stale-hit incidents after a corpus or index update (served-superseded-result rate, sampled)."
status: published
lastUpdated: "2026-07-14"
related:
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/semantic-caching"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/cache-invalidation-strategies"
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
  - id: lc-cache-embeddings
    title: "CacheBackedEmbeddings"
    publisher: "LangChain — Python API Reference"
    year: 2026
    url: "https://python.langchain.com/api_reference/langchain/embeddings/langchain.embeddings.cache.CacheBackedEmbeddings.html"
    accessed: "2026-07-02"
    kind: docs
    note: "Wraps an embedder + a ByteStore; the text is hashed and the hash is the cache key. namespace defaults to \"\" and must be set (e.g. to the model name) to avoid collisions when the same text is embedded with different models. Document embeddings cached by default; pass query_embedding_store to also cache query embeddings."
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
  - id: openai-embed-small
    title: "text-embedding-3-small model"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/models/text-embedding-3-small"
    accessed: "2026-07-02"
    kind: pricing
    note: "text-embedding-3-small: $0.02 per 1M input tokens."
  - id: openai-embed-large
    title: "text-embedding-3-large model"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/models/text-embedding-3-large"
    accessed: "2026-07-02"
    kind: pricing
    note: "text-embedding-3-large: $0.13 per 1M input tokens."
  - id: openai-batch
    title: "Batch API guide"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-02"
    kind: docs
    note: "50% cost discount vs. synchronous APIs; /v1/embeddings is a supported Batch endpoint."
  - id: voyage-pricing
    title: "Pricing"
    publisher: "Voyage AI Docs"
    year: 2026
    url: "https://docs.voyageai.com/docs/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "voyage-3.5-lite $0.02/M, voyage-3.5 $0.06/M, voyage-3-large $0.18/M input tokens; Batch API is a 33% discount."
  - id: incremental-indexing
    title: "Building a Production-Ready RAG System with Incremental Indexing"
    publisher: "DEV Community"
    authors: "Aayush Gupta"
    year: 2026
    url: "https://dev.to/guptaaayush8/building-a-production-ready-rag-system-with-incremental-indexing-4bme"
    accessed: "2026-07-02"
    kind: blog
    note: "Content+metadata hashes compared against a record-manager ledger skip unchanged chunks; re-index of a 1,000-doc / 50k-chunk base with one changed file drops from ~45 min to ~6 s (≈99.8%)."
---

## Overview

A RAG query does not just call the LLM. Before generation it runs a **multi-stage retrieval
pipeline**: embed the query text (a model call), run an approximate nearest-neighbour (ANN)
search against a vector index, and often re-score candidates with a **reranker**.[^cohere-rerank]
Every stage in that pipeline costs money and latency — and all of it repeats from scratch on
every request, even when an identical or near-identical question came in seconds ago.

**RAG pipeline caching** addresses both waste points as two complementary layers:

1. **Query-embedding cache (Layer 1).** An embedding is a deterministic function of its
   inputs — the same text through the same model always returns the same vector.[^lc-cache-embeddings]
   A small KV cache keyed by `hash(query text) + embedding model` eliminates redundant embedding
   API calls for repeated or popular queries. There is no quality risk: a cache hit returns a
   byte-identical vector.

2. **Retrieval result cache (Layer 2).** The embedding layer produces a vector; that vector
   drives an ANN search and optional reranking. Cache the *output* of this whole retrieval
   pipeline — the ordered set of chunk IDs (plus rerank scores) — keyed on the query.
   A cache hit returns the cached retrieval set and **skips re-running ANN search + rerank**
   entirely.[^milvus-rag-caching][^apxml-rag-caching] The cached chunks are still passed to
   the LLM for a **fresh generation**, so unlike full response caching, the answer is always
   freshly generated from (potentially stale) retrieved context.[^tds-agentic-rag-cache]

Both layers save **retrieval compute, not the LLM call**, so the absolute dollar value is
modest unless retrieval is a real cost or latency line — most often when a fat reranker or
very high query volume over a stable-ish corpus is involved. This is also what puts the
technique at **Level 2**: the caching itself is straightforward, but correctness requires
deliberate cache-key design, model-version invalidation, and, for Layer 2, corpus-change
invalidation. The failure mode is real: standard RAG already serves superseded facts
**15–40%** of the time on evolving knowledge, and a poorly-invalidated retrieval cache
amplifies that rate.[^memstrata-temporal]

The ingestion-time analog of Layer 1 — content-hash deduplication at re-index — belongs
here too. Embedding an entire corpus on every deploy is the same redundant work as embedding
the same query over and over; the fix is the same key: hash the chunk text and skip chunks
whose hash is unchanged.

## Detailed Approach & Techniques

### Layer 1 — Query-embedding cache

**The cache key must capture what produced the vector:**

> **key = hash(normalized query text) + embedding model + model version**

- Normalize whitespace and casing where semantically irrelevant before hashing so
  trivially-different strings that should share a vector actually hit.
- Model + version are mandatory parts of the key: embeddings from different models (or
  versions of the same model) live in different vector spaces and are not comparable. In
  LangChain's `CacheBackedEmbeddings` this is the `namespace` parameter, which should be
  set to the embedding model's name to avoid cross-model collisions.[^lc-cache-embeddings]
  Treat a model upgrade as a **full cache invalidation** — bump the namespace and re-embed.
- LangChain wraps any embedder over a `ByteStore` (local file, Redis, etc.) with
  `CacheBackedEmbeddings.from_bytes_store(embedder, store, namespace=model_name)`. Document
  embeddings are cached by default; pass a `query_embedding_store` to also cache **query**
  embeddings.[^lc-cache-embeddings]

**Ingestion-time: incremental indexing.** The same principle applies at corpus-build time.
A pipeline that rebuilds the full index on every deploy (or nightly) re-embeds every chunk
even when only a handful of documents changed. Content-hash deduplication — compare each
chunk's hash against a record-manager ledger, re-embed only what actually changed — can
shrink a no-change re-index from ~45 minutes to ~2 seconds (≈99.8% of embedding work
eliminated).[^incremental-indexing] LlamaIndex's ingestion pipeline applies the same pattern
at the transformation level, caching each `node + transformation` pair in a shared
**RedisCache / MongoDBCache** so workers reuse each other's computation.[^llamaindex-ingestion-cache]

**Stack with Batch API.** Embedding calls you still must make (for genuinely new/changed
content) can be discounted further via the Batch API — **50% off** on OpenAI
(`/v1/embeddings` is a supported batch endpoint)[^openai-batch] and **33%** on
Voyage.[^voyage-pricing] Caching and batching are complementary: cache to avoid the call,
batch to discount the calls you can't avoid.

### Layer 2 — Retrieval result cache

**The cache value** is the retrieval pipeline output: most compactly, the **ordered list of
chunk IDs** (plus rerank scores), rehydrated to text at read time, or the reranked chunks
themselves. The key design decision is how to key it:

- **Exact-match key.** Hash the normalized query string (plus any filters, `top_k`, index
  version). Cheap, zero false hits, but only catches byte-identical repeats — a low hit rate
  on natural-language traffic where users paraphrase.[^apxml-rag-caching]
- **Semantic key.** Embed the query and vector-search *prior queries*; if cosine similarity
  to a cached query exceeds a threshold, reuse that retrieval set. Libraries like GPTCache
  expose exactly these modules: embedding generator → vector store → similarity
  evaluator.[^gptcache-repo] A two-tier design uses a *tight* threshold for query→answer
  reuse (where a wrong paraphrase is a visible failure) and a *looser* topic-similarity key
  (e.g. > 70%) for the retrieval cache (sharing context is more forgiving than sharing a
  final answer).[^tds-agentic-rag-cache]

**What a hit actually saves.** A retrieval cache hit skips: (1) one embedding call,
(2) one ANN search, and (3) if present, the reranking pass. The reranker is usually the
largest single item — a cross-encoder re-scores every candidate, and the common pattern
retrieves ~50–100 candidates to rerank down to a final 3–5.[^cohere-rerank] On a hosted
reranker, the billing unit is one query with up to 100 documents, and any candidate over
500 tokens is split into chunks that each count as a separate document — so a query over
long candidates bills as several documents' worth of rerank work.[^cohere-pricing] That is
the exact cost a cache read avoids. The gain is therefore biggest when reranking is
expensive and the hit rate is high; in enterprise deployments **> 30% of queries are
repetitive or semantically similar**, which is roughly the ceiling on achievable hit
rate.[^tds-agentic-rag-cache]

### The hard part: freshness and invalidation (the L2 driver)

A cached retrieval set is a frozen snapshot of the corpus at cache time. When the corpus
changes, those cached chunk IDs go stale. Two invalidation families, usually combined:

- **TTL (time-based).** Every cached retrieval set expires after a fixed window. Simple and
  bounded, but a blunt instrument: too long serves stale chunks, too short kills the hit
  rate. Tune the TTL to the corpus's volatility — hours for a slow-moving knowledge base,
  minutes (or no cache) for fast-changing data.[^apxml-rag-caching][^milvus-rag-caching]
- **Event-based (index-update-driven).** Hook the ingestion/indexing pipeline: when a
  document is added, updated, or deleted, purge the cached retrieval sets that could have
  returned it. Cleaner correctness, but requires wiring a change signal (a webhook, a CDC
  stream, or an index-version bump) into the cache.[^apxml-rag-caching]

Robust deployments layer additional guards: **namespace the key** by corpus version so a
re-index invalidates everything at once; **validate on read** by comparing stored document
version/timestamps or SHA-256 content fingerprints against the live source and discarding
on mismatch; **bypass the cache for temporal queries** ("latest", "current", "today") that
must always hit fresh data.[^tds-agentic-rag-cache] The failure mode to respect: embedding
similarity *cannot on its own* distinguish a superseded fact from a rephrased current one
(AUROC ≈ 0.59), so a semantic key with weak invalidation is a stale-answer
generator.[^memstrata-temporal]

## Example Where It Works

An internal support assistant answers questions over a **product-documentation corpus that
updates a few times a week**. Each query runs: embed → ANN search over ~200k chunks →
**Cohere Rerank on 60 candidates → top 5**. Traffic is peaky and repetitive — during a
release, hundreds of agents ask minor variants of the same dozen questions.

**Layer 1 (query-embedding cache):** popular queries arrive many times per hour. A Redis-
backed embedding cache eliminates the embedding API call on every repeat, with zero quality
risk since the vector is deterministic.[^lc-cache-embeddings]

**Layer 2 (retrieval result cache):** with a semantic-keyed retrieval cache (cosine ≥ ~0.95
on the query embedding) plus event-based invalidation wired to the docs-ingestion pipeline
(a re-index bumps the corpus version and purges affected sets), roughly **30–40%** of
retrieval requests hit the cache.[^tds-agentic-rag-cache] Every hit skips a query
embedding, an ANN search, and — the big one — a 60-document rerank "search".[^cohere-pricing][^cohere-rerank]
Retrieval latency on those requests collapses to a cache lookup, and the LLM still generates
a fresh answer from the cached chunks, so quality is unchanged. Because the corpus is
versioned and purged on update, multi-day staleness is avoided.

On the ingestion side, the same corpus triggers nightly rebuilds. Content-hash deduplication
at the chunk level drops a no-change re-index from ~45 minutes to ~2 seconds, and residual
new-chunk embeddings are routed through the Batch API for a 50% additional
discount.[^incremental-indexing][^openai-batch]

## Example Where It Would NOT Work

- **Fast-changing / real-time corpus.** A cache over prices, inventory, news, or an agent's
  live tool results goes stale in seconds; TTLs short enough to be safe leave almost no hit
  rate, and event-based purge fires constantly. The 15–40% stale-fact rate of uncached RAG
  on evolving knowledge is a *floor* a poorly-invalidated cache pushes higher.[^memstrata-temporal]
  Route "latest/current" queries straight to source.[^tds-agentic-rag-cache]
- **Low query overlap.** A long-tail workload where almost every query is unique (open-ended
  research, highly personalized retrieval) has a hit rate near zero — the cache adds storage,
  an embedding lookup for the semantic key, and invalidation complexity for no
  return.[^apxml-rag-caching]
- **Write-once / small corpus.** A few thousand chunks embedded once and rarely rebuilt cost
  cents to embed in total — at $0.02–$0.13 / 1M tokens.[^openai-embed-small][^openai-embed-large]
  The cache infrastructure and its invalidation logic are not worth the maintenance.
- **Cheap retrieval, dominant generation.** If retrieval is a small embedding + a fast ANN
  lookup with no reranker, the savable compute is tiny and the LLM call dwarfs it. Here
  the effort belongs in **response/semantic caching** (which saves the generation) rather
  than caching the retrieval set.[^tds-agentic-rag-cache][^milvus-rag-caching]
- **Right after a model upgrade.** Switching embedding models (or versions) invalidates the
  entire embedding cache — the old vectors are incomparable and must be discarded, forcing a
  full re-embed.[^lc-cache-embeddings] The cache saves nothing on that migration.
- **Loose semantic key on precise retrieval.** If a too-loose similarity threshold reuses one
  query's chunks for a subtly different query, the model generates over the *wrong context* —
  a silent quality failure, since embedding similarity can't distinguish a contradicted fact
  from a rephrased one.[^memstrata-temporal]

[^apxml-rag-caching]: ApXML, "Caching Strategies for RAG (Embeddings & LLM Responses)," Optimizing RAG for Production — <https://apxml.com/courses/optimizing-rag-for-production/chapter-4-end-to-end-rag-performance/caching-strategies-rag>
[^milvus-rag-caching]: Milvus, "What caching strategies are effective for multimodal RAG?" — <https://milvus.io/ai-quick-reference/what-caching-strategies-are-effective-for-multimodal-rag>
[^tds-agentic-rag-cache]: Towards Data Science, "Zero-Waste Agentic RAG: Designing Caching Architectures to Minimize Latency and LLM Costs at Scale" — <https://towardsdatascience.com/zero-waste-agentic-rag-designing-caching-architectures-to-minimize-latency-and-llm-costs-at-scale/>
[^lc-cache-embeddings]: LangChain, "CacheBackedEmbeddings," Python API Reference — <https://python.langchain.com/api_reference/langchain/embeddings/langchain.embeddings.cache.CacheBackedEmbeddings.html>
[^llamaindex-ingestion-cache]: LlamaIndex, "Ingestion Pipeline" (transformation caching) — <https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/>
[^gptcache-repo]: Zilliz, "GPTCache — Semantic cache for LLMs," GitHub — <https://github.com/zilliztech/GPTCache>
[^cohere-pricing]: Cohere, "Pricing" (Rerank search-unit definition) — <https://cohere.com/pricing>
[^cohere-rerank]: Cohere, "Rerank — boost enterprise search and retrieval" — <https://cohere.com/rerank>
[^memstrata-temporal]: "Temporal Validity in Retrieval Memory: Eliminating Stale-Fact Errors for AI Agents over Evolving Knowledge," arXiv — <https://arxiv.org/abs/2606.26511>
[^openai-embed-small]: OpenAI API Docs, "text-embedding-3-small model" — <https://developers.openai.com/api/docs/models/text-embedding-3-small>
[^openai-embed-large]: OpenAI API Docs, "text-embedding-3-large model" — <https://developers.openai.com/api/docs/models/text-embedding-3-large>
[^openai-batch]: OpenAI API Docs, "Batch API guide" — <https://developers.openai.com/api/docs/guides/batch>
[^voyage-pricing]: Voyage AI Docs, "Pricing" — <https://docs.voyageai.com/docs/pricing>
[^incremental-indexing]: Aayush Gupta, "Building a Production-Ready RAG System with Incremental Indexing," DEV Community — <https://dev.to/guptaaayush8/building-a-production-ready-rag-system-with-incremental-indexing-4bme>
