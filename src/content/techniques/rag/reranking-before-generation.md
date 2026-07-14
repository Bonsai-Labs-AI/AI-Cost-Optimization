---
title: "Reranking Before Generation"
category: rag
maturityLevel: 2
maturityProvisional: false
shortDescription: "Over-retrieve a wide candidate set, then use a cheap cross-encoder reranker to keep only the top few most-relevant chunks fed to the expensive LLM — cutting generation-context tokens at equal or better answer quality."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "Top-k retrieved chunks are passed straight into the generation prompt with no relevance filter between retrieval and the LLM."
  - "k is set large 'to be safe' (e.g. 10–20 chunks) because plain vector similarity misses the right passage at small k."
  - "Manual inspection of prompts shows several clearly-irrelevant chunks padding the context on most queries."
  - "Retrieval-context tokens dominate the per-query input bill; the LLM sees far more retrieved text than it actually needs."
measurementMethods:
  - "Generation-context tokens per query before vs. after reranking (retrieved tokens sent to the LLM)."
  - "Answer quality held at or above the bar (Recall@k, groundedness, human/LLM eval) at the smaller top-k."
  - "Reranker cost per query (API search units / tokens, or self-hosted GPU time) vs. LLM input-token savings — net $/query."
  - "Retrieval Recall@k of the reranked short list vs. the raw dense-retrieval short list at the same k."
status: published
lastUpdated: "2026-07-02"
related:
  - "rag/reducing-retrieved-chunk-count"
  - "rag/chunking-parameter-tuning"
  - "rag/retrieval-chunk-deduplication"
  - "rag/contextual-compression"
sources:
  - id: cohere-rerank
    title: "An Overview of Cohere's Rerank Model"
    publisher: "Cohere Docs"
    year: 2026
    url: "https://docs.cohere.com/docs/rerank-overview"
    accessed: "2026-07-02"
    kind: docs
    note: "Rerank 4.0 (rerank-v4.0-pro / rerank-v4.0-fast) and Rerank 3.5 (rerank-v3.5) are single multilingual cross-encoder models; billed per search unit; documents over 500 tokens are split into chunks, each counting as a document."
  - id: cohere-pricing
    title: "Cohere API Pricing: Command, Rerank & Embed Costs"
    publisher: "MetaCTO"
    year: 2026
    url: "https://www.metacto.com/blogs/cohere-pricing-explained-a-deep-dive-into-integration-development-costs"
    accessed: "2026-07-02"
    kind: blog
    note: "Reports Cohere Rerank 3.5 at $2.00 per 1,000 searches; a search unit = one query with up to 100 documents; docs >500 tokens (incl. query) are chunked, each chunk billed as a document."
  - id: voyage-reranker
    title: "Rerankers — Introduction"
    publisher: "Voyage AI Docs"
    year: 2026
    url: "https://docs.voyageai.com/docs/reranker"
    accessed: "2026-07-02"
    kind: docs
    note: "rerank-2.5 / rerank-2.5-lite (32K context), rerank-2 (16K), rerank-2-lite (8K). Token usage = (query tokens × number of documents) + sum of tokens in all documents; max 600K total tokens per request."
  - id: voyage-pricing
    title: "Pricing"
    publisher: "Voyage AI Docs"
    year: 2026
    url: "https://docs.voyageai.com/docs/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "rerank-2.5 and rerank-2: $0.05 / 1M tokens; rerank-2.5-lite and rerank-2-lite: $0.02 / 1M tokens; first 200M tokens free per account."
  - id: jina-reranker
    title: "Reranker API"
    publisher: "Jina AI"
    year: 2026
    url: "https://jina.ai/reranker/"
    accessed: "2026-07-02"
    kind: docs
    note: "jina-reranker-v3 (0.6B, 131K context, listwise), jina-reranker-v2-base-multilingual (cross-encoder, 100+ languages). Hugging Face weights under CC-BY-NC 4.0 (non-commercial); hosted API ~$0.02/1M tokens with 10M free tokens per key."
  - id: bge-reranker
    title: "BAAI/bge-reranker-v2-m3"
    publisher: "Hugging Face — Beijing Academy of Artificial Intelligence"
    year: 2026
    url: "https://huggingface.co/BAAI/bge-reranker-v2-m3"
    accessed: "2026-07-02"
    kind: repo
    note: "Open-source (Apache 2.0) cross-encoder reranker, 0.6B params, multilingual (based on bge-m3); free to self-host via FlagEmbedding / Transformers. Query + document in, similarity score out."
  - id: rag-benchmark
    title: "From BM25 to Corrective RAG: Benchmarking Retrieval Strategies for Text-and-Table Documents"
    publisher: "arXiv:2604.01733"
    authors: "Akarsu, Karaman, Mierbach"
    year: 2026
    url: "https://arxiv.org/html/2604.01733v1"
    accessed: "2026-07-02"
    kind: paper
    note: "Adding a cross-encoder reranker (Cohere Rerank v4.0 Pro) to hybrid retrieval: Recall@5 0.816 vs 0.695 hybrid RRF (+17.4%), 0.644 BM25, 0.587 dense; MRR@3 0.605 vs 0.433."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Claude Sonnet 5 input $2/M tokens (introductory, through Aug 31 2026), Haiku 4.5 input $1/M tokens — the LLM-side price the retrieved context is billed at."
---

## Overview

A naive RAG pipeline runs one vector-similarity search, takes the top-k chunks, and
staples them into the generation prompt. Because a single-vector (bi-encoder) similarity
score is a coarse relevance signal, teams compensate by making **k large "to be safe"** —
10, 15, 20 chunks — so the passage that actually answers the question is *somewhere* in
the pile. Every one of those chunks is then billed as **LLM input tokens on every query**,
and most of them are noise the model has to read past.

Reranking breaks the pipeline into two stages with very different unit economics. Stage
one **over-retrieves** a wide candidate set cheaply (e.g. 50–100 chunks from a vector or
hybrid index). Stage two runs those candidates through a **cross-encoder reranker** — a
model that scores each *(query, chunk)* pair jointly rather than comparing pre-computed
embeddings — and keeps only the **top 3–5**.[^cohere-rerank][^bge-reranker] Only that
short, high-precision list reaches the expensive generator.

The cost mechanism is a direct token trade. The reranker is **one to two orders of
magnitude cheaper per token than LLM generation**: Voyage's `rerank-2.5` is
**$0.05 per 1M tokens**[^voyage-pricing] and BGE cross-encoders are **free to
self-host**,[^bge-reranker] whereas the retrieved context that would otherwise flood the
prompt is billed at full LLM input rates — **$2/M tokens on Claude Sonnet 5**, and far
more on frontier models.[^anthropic-pricing] Dropping from ~15 chunks to ~4 removes roughly
**70% of the retrieval-context tokens** the LLM ingests per query, while a good reranker
*raises* answer quality because the surviving chunks are more relevant.[^rag-benchmark]
That "cheaper *and* better" property is why reranking sits at **Level 2**: it is a
deliberate architectural addition (a second model call, a candidate budget to tune) rather
than a one-line flag, but the payoff is large and well-established.

## Detailed Approach & Techniques

### The multi-stage retrieval cascade

Reranking is one half of a **retrieve-then-rerank cascade**, so this technique absorbs
"multi-stage retrieval": each stage is cheap where it is wide and precise where it is
narrow.

1. **Cheap, wide first-stage retrieval.** A bi-encoder vector search (or hybrid
   dense + BM25) pulls **50–100 candidates**. This stage is optimized for *recall* — get
   the right chunk *into* the set — not precision. Embeddings are pre-computed, so pulling
   100 candidates instead of 10 costs almost nothing.
2. **Precise, narrow reranking.** The cross-encoder reads the query together with each
   candidate and emits a fine-grained relevance score, capturing nuances that a single
   dot-product between pre-baked embeddings flattens.[^cohere-rerank][^bge-reranker] You
   then keep the **top 3–5**.
3. **Generation on the short list.** The LLM sees only the reranked survivors — a small,
   dense, high-signal context.

The economic point: recall work happens where compute is cheap (the index), and the
expensive LLM only ever ingests the precise, minimal context.

### Reranker options and pricing

**Hosted APIs** (no infra to run, pay per use):

- **Cohere Rerank** — `rerank-v4.0-pro` / `rerank-v4.0-fast` and the older `rerank-v3.5`,
  single multilingual cross-encoders. Billed **per search unit = one query with up to 100
  documents**; documents over 500 tokens (including the query) are split into chunks, each
  chunk counting as a document.[^cohere-rerank] Rerank 3.5 is reported at **$2.00 per 1,000
  searches**.[^cohere-pricing]
- **Voyage** — `rerank-2.5` / `rerank-2.5-lite` (32K context), billed on tokens:
  `(query tokens × number of documents) + sum of all document tokens`, at **$0.05/1M**
  (full) or **$0.02/1M** (lite), with the **first 200M tokens free** per account.[^voyage-reranker][^voyage-pricing]
- **Jina** — `jina-reranker-v3` (0.6B, 131K context, listwise) and
  `jina-reranker-v2-base-multilingual`; hosted API ~**$0.02/1M tokens** with **10M free
  tokens** per key.[^jina-reranker]

**Self-hosted (open weights)** — no per-call fee, you pay only for the GPU:

- **BGE rerankers** (`bge-reranker-v2-m3`) — an **Apache-2.0**, 0.6B-param multilingual
  cross-encoder, deployable with FlagEmbedding or Transformers; free for commercial
  use.[^bge-reranker] Jina's open weights exist too but are **CC-BY-NC 4.0
  (non-commercial)** — fine for prototyping, not for a commercial product without the
  hosted API.[^jina-reranker]

A useful rule of thumb: at Cohere-style search-unit pricing, reranking a 50-candidate set
costs a small fraction of a cent, while the LLM tokens it *saves* (a dozen chunks × hundreds
of tokens, at LLM input rates) are typically worth **more than the reranker call itself** —
so the net effect on the bill is negative cost plus a quality bump.[^cohere-pricing][^anthropic-pricing]

### Why it improves quality, not just cost

Because the cross-encoder attends to the query and the candidate together, its ranking is
substantially sharper than first-stage similarity. In a 2026 benchmark on text-and-table
documents, adding a cross-encoder reranker to hybrid retrieval lifted **Recall@5 to 0.816
from 0.695** for hybrid RRF alone (**+17.4%**), versus 0.644 for BM25 and 0.587 for pure
dense retrieval; MRR@3 rose from **0.433 to 0.605**.[^rag-benchmark] That means the answer
chunk is more likely to be present *at small k* — which is exactly what lets you cut k (and
tokens) without losing quality.

### Tuning the candidate budget

- **First-stage k (candidates):** big enough that the right chunk is almost always caught
  (recall), typically 25–100. Cheap to raise.
- **Final k (to the LLM):** as small as the eval allows — often 3–5. This is the token
  lever.
- **Latency:** the reranker adds a network hop / forward pass, commonly well under ~200 ms
  for a modest candidate set;[^rag-benchmark] batch the scoring and cap first-stage k to keep
  it bounded.
- Pair with **retrieval-time deduplication** (drop near-duplicate candidates before
  reranking so the top-k isn't three copies of one passage) and **chunk-count reduction**
  (the reranker is what makes an aggressive small final-k safe).

## Example Where It Works

An internal knowledge-base assistant serves **200,000 queries/month** over a large,
heterogeneous corpus. The original pipeline retrieved **top-15** chunks (~250 tokens each,
~3,750 retrieval tokens/query) straight into the prompt, because at top-5 the right passage
was often missing.

Add a retrieve-then-rerank cascade: pull **50 candidates** by hybrid search, rerank, keep
**top-4** (~1,000 tokens/query).

- **Token cut:** retrieval context drops from ~3,750 to ~1,000 tokens/query — about **73%
  fewer generation-context tokens**, on top of a plateau of system-prompt tokens.
- **Reranker cost:** on Voyage `rerank-2.5`, a 50-doc query is on the order of tens of
  thousands of tokens at **$0.05/1M** — a small fraction of a cent, and the first 200M
  tokens/month are free.[^voyage-pricing] Self-hosting BGE makes the per-call fee
  zero.[^bge-reranker]
- **Quality:** because the reranker surfaces the answer chunk at small k, groundedness holds
  or improves even though the LLM now reads a quarter of the text.[^rag-benchmark]

Net: the retrieval-token line of the LLM bill falls sharply, the reranker cost is
negligible, and answer quality goes **up** — the ideal shape for a cost optimization.

## Example Where It Would NOT Work

- **Already-small, already-precise candidate sets.** If the index reliably returns the
  right chunk at top-3 (a small, clean, well-structured corpus with high Recall@3), there is
  nothing to prune — reranking 3 chunks to keep 3 adds a model call and latency for no token
  saving. The lever here is simply *reducing retrieved chunk count*, not reranking.
- **Latency-critical paths.** The reranker adds a forward pass over the candidate
  set;[^rag-benchmark] on a hard real-time interaction with a tight p95 budget, that hop can
  cost more than the token savings are worth. Shrink first-stage k, use a `-lite`
  reranker,[^voyage-reranker] or skip reranking for the latency-sensitive route.
- **Recall is the failure, not precision.** If the answer chunk isn't in the *first-stage*
  candidate set at all, reranking can only reorder what it was given — it cannot recover a
  missed passage. The fix is better retrieval (chunking, hybrid search, query rewriting),
  not a reranker.
- **Tiny contexts where the LLM already reads everything.** When the whole corpus for a
  query is a few hundred tokens, stuffing it all in is cheaper than adding a second model —
  reranking is a distraction. It pays precisely when the candidate pool is **much larger**
  than what you want the LLM to read.

[^cohere-rerank]: Cohere Docs, "An Overview of Cohere's Rerank Model" — <https://docs.cohere.com/docs/rerank-overview>
[^cohere-pricing]: MetaCTO, "Cohere API Pricing: Command, Rerank & Embed Costs" — <https://www.metacto.com/blogs/cohere-pricing-explained-a-deep-dive-into-integration-development-costs>
[^voyage-reranker]: Voyage AI Docs, "Rerankers — Introduction" — <https://docs.voyageai.com/docs/reranker>
[^voyage-pricing]: Voyage AI Docs, "Pricing" — <https://docs.voyageai.com/docs/pricing>
[^jina-reranker]: Jina AI, "Reranker API" — <https://jina.ai/reranker/>
[^bge-reranker]: Hugging Face (BAAI), "bge-reranker-v2-m3" — <https://huggingface.co/BAAI/bge-reranker-v2-m3>
[^rag-benchmark]: Akarsu, Karaman, Mierbach, "From BM25 to Corrective RAG: Benchmarking Retrieval Strategies for Text-and-Table Documents," arXiv:2604.01733 — <https://arxiv.org/html/2604.01733v1>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
