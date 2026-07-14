---
title: "Embedding Caching"
category: caching-reuse
maturityLevel: 2
maturityProvisional: false
shortDescription: "Cache embedding vectors keyed by (text hash + embedding model + model version) so you never re-embed the same text — cutting embedding-API spend and compute on re-indexing and repeated queries."
effort: Low
gain: Low
riskToQuality: Low
detectionSignals:
  - "Every deploy or nightly job re-embeds the entire corpus, even when almost nothing changed."
  - "No content-hash dedupe: unchanged chunks are re-sent to the embedding API on each rebuild."
  - "The same popular query text is embedded again on every request."
  - "Embedding-API line items grow linearly with re-index frequency, not with how much content actually changed."
measurementMethods:
  - "Embedding-API calls (and tokens) avoided per re-index — cache hit rate at ingestion."
  - "$ / full re-index before vs. after content-hash dedupe."
  - "Query-embedding cache hit rate on repeated/popular queries."
  - "Wall-clock re-index time (a proxy for embedding work performed)."
status: published
lastUpdated: "2026-07-02"
related:
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "rag/chunking-parameter-tuning"
sources:
  - id: lc-cache-embeddings
    title: "CacheBackedEmbeddings"
    publisher: "LangChain — Python API Reference"
    year: 2026
    url: "https://python.langchain.com/api_reference/langchain/embeddings/langchain.embeddings.cache.CacheBackedEmbeddings.html"
    accessed: "2026-07-02"
    kind: docs
    note: "Wraps an embedder + a ByteStore; the text is hashed and the hash is the cache key. namespace defaults to \"\" and must be set (e.g. to the model name) to avoid collisions when the same text is embedded with different models. Document embeddings cached by default; pass query_embedding_store to also cache query embeddings."
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

An embedding is a deterministic function of its inputs: the **same text**, run through the
**same model at the same version**, always produces the **same vector**. Yet many RAG and
semantic-search systems pay to recompute embeddings they already have — most often by
**re-embedding an entire corpus on every deploy or nightly rebuild**, even when only a
handful of documents changed, and by **re-embedding the same query text** every time a
popular question comes in.[^incremental-indexing]

Embedding caching removes that waste. You store each vector keyed by a hash of the text
(plus the model identity), and on the next ingestion or query you look it up instead of
calling the model again. Because embedding results are stable, a hit returns a
byte-identical vector — so, unlike response caching, there is **no quality risk from the
cache itself**; the only correctness rule is to **invalidate when the model or its version
changes** (vectors from different models are not comparable).[^lc-cache-embeddings]

The honest framing for this technique: embeddings are **cheap per unit** — OpenAI's
`text-embedding-3-small` is **$0.02 / 1M tokens** and `text-embedding-3-large` is
**$0.13 / 1M tokens**;[^openai-embed-small][^openai-embed-large] Voyage's line runs
$0.02–$0.18 / 1M.[^voyage-pricing] So on a small or write-once corpus this lever is minor.
It earns its place at **Level 2** because at **high re-index volume** (large corpora rebuilt
frequently) the waste is real and recurring, and doing it *correctly* — content-hash keys
plus mandatory model-version invalidation — is deliberate engineering rather than a config
toggle.

## Detailed Approach & Techniques

### Where the re-embedding waste comes from

1. **Full re-index on every deploy.** A pipeline that rebuilds the whole index on each
   release (or nightly) re-embeds every chunk regardless of whether it changed. For a
   1,000-document / 50,000-chunk base, a full rebuild can run ~45 minutes even when
   *nothing* changed; incremental hashing brings the no-change case down to seconds.[^incremental-indexing]
2. **Re-embedding unchanged chunks.** Even when only one document is edited, a naive
   pipeline re-embeds the entire corpus rather than the few chunks that actually changed.[^incremental-indexing]
3. **Repeated query embedding.** Every retrieval call embeds the query text. Popular or
   canned queries (autocomplete suggestions, dashboard defaults, common support questions)
   embed the *same string* over and over — a pure duplicate cost that a query-embedding
   cache eliminates.[^lc-cache-embeddings]

### Key design: the cache key

The cache key must uniquely identify *what produced the vector*:

> **key = hash(normalized text) + embedding-model + model-version**

- **Content hash.** Hash the exact (normalized) chunk text; the hash is the lookup key.
  LangChain's `CacheBackedEmbeddings` does exactly this — the text is hashed and the hash is
  used as the key in the cache.[^lc-cache-embeddings]
- **Model + version are part of the key — this is mandatory.** Embeddings from different
  models (or even different *versions* of the same model) live in different vector spaces
  and are **not comparable**; mixing them silently corrupts retrieval. In
  `CacheBackedEmbeddings` this is the `namespace` parameter, which defaults to `""` and
  should be set to the embedding model's name to avoid collisions and conflicts when the
  same text is embedded using different embedding models.[^lc-cache-embeddings] Treat a
  model upgrade as a **full cache invalidation** — bump the namespace/version and re-embed.
- **Normalize before hashing** (whitespace, casing where semantically irrelevant) so
  trivially-different strings that should share a vector actually hit.

### Mechanism: where the cache lives

- **Framework cache (buy).** LangChain's `CacheBackedEmbeddings.from_bytes_store(embedder,
  store, namespace=model_name)` wraps any embedder over a `ByteStore` (local file, Redis,
  etc.). Document embeddings are cached by default; pass a `query_embedding_store` to also
  cache **query** embeddings.[^lc-cache-embeddings]
- **KV / Redis store (build).** A store keyed by the content+model hash, with the vector as
  the value. Cheap, language-agnostic, and easy to instrument for hit rate.
- **The vector DB as the cache.** Because the vector store already holds every embedded
  chunk with metadata, an **incremental-indexing** pipeline can use it directly: hash each
  chunk's content+metadata, compare against a record-manager ledger, and **skip anything
  whose hash is unchanged** — re-embedding only genuinely new/edited chunks and deleting
  removed ones.[^incremental-indexing]

### Stacking with other cost levers

Embedding caching removes *duplicate* calls; the calls you still make can be made cheaper.
Route large offline (re-)indexing jobs through the **Batch API** — a **50% discount** on
OpenAI (`/v1/embeddings` is a supported batch endpoint),[^openai-batch] and **33% on
Voyage**[^voyage-pricing] — and right-size the embedding model to the task. Caching and
batching are complementary: cache to avoid the call, batch to discount the calls you can't
avoid.

## Example Where It Works

A knowledge-base assistant indexes **1,000 documents / ~50,000 chunks** with
`text-embedding-3-small`, and the CI pipeline **rebuilds the index on every deploy** —
several deploys a day. Editors touch only a handful of docs between deploys.

- **Without caching:** each deploy re-embeds all 50,000 chunks. Beyond the ~45-minute
  rebuild, it re-bills the full corpus's tokens on every run for content that didn't
  change.[^incremental-indexing]
- **With content-hash caching:** the pipeline hashes each chunk, compares to the ledger, and
  **only re-embeds the few changed chunks** — a no-change deploy drops from ~45 minutes to
  ~2 seconds, and a one-file edit to ~6 seconds (≈99.8% of the embedding work
  eliminated).[^incremental-indexing] The savings recur on **every** deploy, and stacking
  the residual (real) new-chunk embeddings through the Batch API halves even that.[^openai-batch]

A query-embedding cache adds a second, smaller win: if 30% of daily queries are repeats of a
popular set, 30% of query-embedding calls disappear at zero quality cost.[^lc-cache-embeddings]

## Example Where It Would NOT Work

- **Write-once / small corpus.** A few thousand chunks embedded once and rarely rebuilt cost
  cents to embed in total — at **$0.02–$0.13 / 1M tokens**, the whole corpus may be under a
  dollar.[^openai-embed-small][^openai-embed-large] The cache infrastructure and its
  invalidation logic aren't worth the maintenance; just embed and move on.
- **Every input is unique.** A pipeline embedding a continuous stream of never-repeating text
  (unique user utterances, one-off documents) has a ~0% hit rate — there is nothing to reuse,
  so the cache only adds a lookup miss on every call.
- **Right after a model upgrade.** Switching embedding models (or versions) **invalidates the
  entire cache** — the old vectors are incomparable and must be discarded, forcing a full
  re-embed.[^lc-cache-embeddings] The cache saves nothing on that migration; it only starts
  paying off again on subsequent rebuilds.
- **Generation-dominated bills.** If embedding spend is a rounding error next to LLM
  generation cost (the usual case), this lever is not where the money is — prompt/response
  caching and output optimization matter far more. Embedding caching is a modest,
  ingestion-scale win, not a headline saving.

[^lc-cache-embeddings]: LangChain, "CacheBackedEmbeddings," Python API Reference — <https://python.langchain.com/api_reference/langchain/embeddings/langchain.embeddings.cache.CacheBackedEmbeddings.html>
[^openai-embed-small]: OpenAI API Docs, "text-embedding-3-small model" — <https://developers.openai.com/api/docs/models/text-embedding-3-small>
[^openai-embed-large]: OpenAI API Docs, "text-embedding-3-large model" — <https://developers.openai.com/api/docs/models/text-embedding-3-large>
[^openai-batch]: OpenAI API Docs, "Batch API guide" — <https://developers.openai.com/api/docs/guides/batch>
[^voyage-pricing]: Voyage AI Docs, "Pricing" — <https://docs.voyageai.com/docs/pricing>
[^incremental-indexing]: Aayush Gupta, "Building a Production-Ready RAG System with Incremental Indexing," DEV Community — <https://dev.to/guptaaayush8/building-a-production-ready-rag-system-with-incremental-indexing-4bme>
