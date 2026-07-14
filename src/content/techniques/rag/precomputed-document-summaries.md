---
title: "Precomputed Document Summaries"
category: rag
maturityLevel: 3
maturityProvisional: false
shortDescription: "Summarize each document once offline, index and retrieve/route on the short summaries, and pull full document content into context only when a query actually needs it — cutting retrieved tokens and amortizing summarization cost across many queries."
effort: Medium
gain: Medium
riskToQuality: Medium
effortWhy: "A build-time summarization pass plus a two-tier index (summaries + full content) and a refresh pipeline on document change — real engineering, but frameworks provide most of it off the shelf."
gainWhy: "Cuts retrieved tokens on routing/overview queries and shrinks the vector index; the summarization cost is amortized once per doc, so ROI grows with queries-per-doc."
riskWhy: "A summary that omits the queried detail routes wrong or answers incompletely; summaries go stale when the underlying document changes."
detectionSignals:
  - "Full documents (or many chunks from one document) pulled into context just to decide relevance or answer overview/routing queries."
  - "No summary layer — retrieval runs flat top-k chunk search over the whole corpus every time."
  - "The same documents are retrieved repeatedly at full length across many queries (high query reuse per document)."
  - "Top-k chunks frequently all come from a single document, missing cross-document coverage."
  - "Large corpus where the per-document embedding/index cost and vector-DB size are becoming significant."
measurementMethods:
  - "Retrieved tokens per query (and $/query) before vs. after adding the summary routing layer."
  - "Queries-per-document over the corpus lifetime — the break-even denominator that amortizes one-time summarization cost."
  - "One-time summarization cost + ongoing refresh cost (summaries regenerated on document change)."
  - "Vector-index size and embedding/indexing time (summaries vs. full chunk set)."
  - "Answer/routing quality at the bar: retrieval recall (e.g. NDCG@k) and rate of queries where the needed detail was omitted from the summary."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/summary-caching"
  - "rag/hierarchical-retrieval"
  - "product-ux/precomputed-content-surfacing"
  - "rag/reducing-retrieved-chunk-count"
sources:
  - id: llamaindex-dsi-blog
    title: "A New Document Summary Index for LLM-powered QA Systems"
    publisher: "LlamaIndex Blog"
    authors: "Jerry Liu"
    year: 2023
    url: "https://www.llamaindex.ai/blog/a-new-document-summary-index-for-llm-powered-qa-systems-9a32ece2f9ec"
    accessed: "2026-07-03"
    kind: blog
    note: "At build time an LLM extracts a summary from each document; retrieval selects relevant documents from their summaries (LLM-based or embedding-based) and then returns all nodes for the selected documents. Maps summary → source document/nodes."
  - id: llamaindex-dsi-docs
    title: "Document Summary Index (example)"
    publisher: "LlamaIndex Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/index_structs/doc_summary/docsummary/"
    accessed: "2026-07-03"
    kind: docs
    note: "DocumentSummaryIndex.from_documents extracts a summary per document and stores it plus all nodes. Retrieval: DocumentSummaryIndexLLMRetriever or DocumentSummaryIndexEmbeddingRetriever first select relevant documents by summary, then return all nodes of the selected documents."
  - id: ragie-summary-index
    title: "Summary Index"
    publisher: "Ragie Documentation"
    year: 2026
    url: "https://docs.ragie.ai/docs/summary-index"
    accessed: "2026-07-03"
    kind: docs
    note: "Production RAG platform: on each document create/update it precomputes a detailed summary with a long-context LLM. With max_chunks_per_document set, retrieval first uses the summary index to select the top documents by cosine distance to the query, then pulls chunks from those documents — routing before chunk retrieval."
  - id: summary-rag-paper
    title: "Summary RAG: A Multi-Format Document Retrieval System with Document-Level Summarization"
    publisher: "Research and Science Today"
    year: 2026
    url: "https://www.rstjournal.com/article/21.2026"
    accessed: "2026-07-03"
    kind: paper
    note: "Two-tier index (summary index + full-content store). Embedding cost is O(n) for n documents vs. O(n·c) for chunk-based indexing (c = avg chunks/doc). On TREC-COVID (171K docs) indexing was 3.1× faster (249s vs 778s, 171K summaries vs 343K chunks); vector count cut up to 99.3% on a 125-doc pilot and ~50% on TREC-COVID. Retrieval accuracy: +16.5% NDCG@100 on NFCorpus, +12.2% on TREC-COVID, but −7.9% on fact-dense SciFact."
  - id: cost-aware-routing
    title: "Cost-Aware Query Routing in RAG: Empirical Analysis of Retrieval Depth Tradeoffs"
    publisher: "arXiv"
    authors: "Sanjay Mishra"
    year: 2026
    url: "https://arxiv.org/abs/2606.02581"
    accessed: "2026-07-03"
    kind: paper
    note: "Cost-Aware RAG dynamically selects retrieval depth (from retrieval-free to top-k=10) per query; reports 26% fewer billed tokens vs. always-heavy retrieval and 34% lower mean latency vs. always-direct inference at equivalent answer quality."
  - id: openai-batch
    title: "Batch API"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-07-03"
    kind: docs
    note: "50% cost discount vs. synchronous APIs within a 24-hour completion window; supports chat completions and embeddings. The natural vehicle for the one-time offline summarization pass over a corpus."
  - id: clinical-summ-safety
    title: "A framework to assess clinical safety and hallucination rates of LLMs for medical text summarisation"
    publisher: "npj Digital Medicine (also PMC)"
    year: 2025
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12075489/"
    accessed: "2026-07-03"
    kind: paper
    note: "Across 12,999 clinician-annotated sentences in 18 experimental configurations, LLM summaries showed a 1.47% hallucination rate and a 3.45% omission rate (relevant details missed). Evidence that summaries silently drop source detail — the core quality risk of routing on summaries."
---

## Overview

A standard RAG system indexes every document as many small chunks and, on each query,
runs a flat top-k similarity search over that whole chunk pool, pulling the winning chunks
(and often several chunks from the *same* document) into the model's context. That means
two recurring costs: the corpus is embedded and stored at chunk granularity (many vectors
per document), and every routing/overview query drags full-length source text into the
prompt just to decide what is relevant.

**Precomputed document summaries** add a cheap layer above the chunks. Once — offline, in
batch — an LLM writes a short summary of each document; those summaries are embedded and
indexed. At query time you **retrieve and route on the summaries first**, and only pull the
full document content (or its chunks) for the documents the summary layer says are actually
relevant.[^llamaindex-dsi-blog][^ragie-summary-index] LlamaIndex ships this as the
`DocumentSummaryIndex`: it "extract[s] a summary from each document and store[s] that
summary, as well as all nodes corresponding to the document," then selects relevant
documents by summary (via an LLM or by embedding similarity) before returning their
nodes.[^llamaindex-dsi-docs]

The cost logic is an **amortization play**, which is why it sits at **Level 3**. The
summary is generated *once* and reused across *every* future query against that document, so
the more queries per document, the better the payoff — but you take on a real summarization
pipeline and a refresh obligation when documents change. Below a corpus with meaningful
query reuse, the one-time summarization spend never earns back.

## Detailed Approach & Techniques

### The pattern

1. **Summarize each document once (offline / batch).** Run a summarization pass over the
   corpus and store one summary per document, keyed back to the source document and its
   chunks/nodes.[^llamaindex-dsi-blog] Because this is not latency-sensitive, do it on a
   batch tier — OpenAI's Batch API is **50% cheaper** than synchronous calls within a
   24-hour window — which directly halves the one-time cost you are amortizing.[^openai-batch]
2. **Index the summaries.** Embed the summaries and store them alongside (or in front of) the
   full-content store. This is the "two-tier index": a summary index for routing plus a
   full-content/chunk store for the actual evidence.[^summary-rag-paper][^ragie-summary-index]
3. **Retrieve/route on summaries first.** For each query, match against the summary index and
   pick the relevant documents — either **embedding-based** (cosine similarity to summary
   embeddings, top-k cutoff) or **LLM-based** (show the LLM the candidate summaries and ask
   which are relevant + a relevance score).[^llamaindex-dsi-docs][^llamaindex-dsi-blog]
4. **Pull full content only when needed.** For genuine overview/routing questions the summary
   itself can answer, you never touch the full text. For detail questions, you fetch chunks
   *only from the selected documents* — a much smaller candidate set than flat top-k over the
   whole corpus.[^ragie-summary-index]

### Where the cost actually drops

Two distinct savings, worth keeping separate:

- **Fewer retrieved tokens per query (LLM cost).** Answering or routing from a short summary
  instead of full-document text cuts the input tokens sent to the model, and narrowing chunk
  retrieval to already-selected documents avoids over-retrieving "to be safe." A cost-aware
  RAG router that varies retrieval depth per query rather than always retrieving heavily
  reported **26% fewer billed tokens at equivalent answer quality** — the same lever the
  summary layer pulls by letting light queries stay in the summary tier.[^cost-aware-routing]
- **Smaller, cheaper index (infra cost).** Embedding *n* documents is **O(n)** vs. **O(n·c)**
  for chunk-level indexing, where *c* is the average chunks per document. On TREC-COVID (171K
  documents) a summary-first system indexed **3.1× faster** (249 s vs. 778 s — 171K summaries
  vs. 343K chunks) and cut vector count by up to **99.3%** on a small pilot (125 vectors vs.
  16,902 chunks) and ~**50%** at the larger scale.[^summary-rag-paper]

### The break-even: queries per document

The summarization pass is a fixed, one-time cost per document; the per-query savings recur.
So the technique pays off once:

> (summarization cost per doc) < (retrieved-token saving per query) × (queries per doc over the doc's lifetime)

A rarely-queried document in a long-tail archive may never reach break-even; a hot FAQ or
policy document queried thousands of times amortizes its summary almost immediately. This is
why **query reuse per document is the number to measure** — not raw corpus size.

### Refresh and staleness

Every summary is a cache of its document and must be invalidated when the document changes.
Production platforms regenerate the summary on document create/update.[^ragie-summary-index]
Budget for that refresh cost and treat summaries like any other derived cache: a summary
that lags its source silently routes queries on out-of-date content.

### Relationship to neighboring techniques

Routing on summaries is one rung of the broader **hierarchical retrieval** idea (summaries →
drill into children); the win here is specifically *fewer, cheaper units to route on*, and
it composes with reranking and chunk-count reduction downstream. The two-tier structure also
overlaps retrieval/summary caching — the summary index *is* a precomputed, reusable artifact.

## Example Where It Works

An internal knowledge-base assistant sits over **8,000 policy, product, and support
documents**, each averaging ~40 chunks, and handles a high volume of repeated questions
("what's our refund window?", "which plans include SSO?"). Many queries are routing or
overview questions that only need to identify the right one or two documents.

- **Flat chunk RAG:** every query runs top-k over ~320,000 chunk vectors, frequently pulling
  several long chunks from one document into context — and top-k results often cluster in a
  single document, missing cross-document coverage.[^ragie-summary-index]
- **Summary-first:** each document is summarized once via the batch tier (50% off, one
  time),[^openai-batch] producing 8,000 summary vectors instead of 320,000 — an O(n) vs.
  O(n·c) index that is far smaller and faster to build.[^summary-rag-paper] Queries route on
  the summary layer, so overview questions are answered from short summaries and detail
  questions fetch chunks only from the 1–2 selected documents. Because each document is
  queried hundreds of times, the one-time summarization cost is amortized to near zero per
  query, and retrieved tokens per query drop materially — in line with the ~26% billed-token
  reduction seen when retrieval depth is chosen per query instead of always-heavy.[^cost-aware-routing]
  Summary-first retrieval has also *improved* recall on some corpora (e.g. +12.2% NDCG@100 on
  TREC-COVID), so the cost win came without a quality penalty there.[^summary-rag-paper]

## Example Where It Would NOT Work

- **Fact-dense documents where the queried detail lives in the fine print.** If answers hinge
  on specific numbers, clauses, or entities scattered through a document, a summary routes on
  the gist and can omit exactly what the query needs. LLM summaries in a controlled clinical
  study showed a **3.45% omission rate** (relevant details missed) alongside a 1.47%
  hallucination rate[^clinical-summ-safety] — and summary-first retrieval measurably *lost*
  recall on the fact-dense SciFact corpus (**−7.9% NDCG@100**).[^summary-rag-paper] For
  precise/high-stakes retrieval, route on chunks, not summaries.
- **Low query reuse per document (long-tail archives).** If most documents are queried once
  or never, the one-time summarization + embedding cost never amortizes — you pay to summarize
  a corpus that no query benefits from. The break-even math simply doesn't close.
- **High-churn corpora.** If documents change constantly, summaries are perpetually stale and
  the refresh/re-summarize cost can exceed the retrieval savings, on top of the risk of
  routing on out-of-date summaries.[^ragie-summary-index]
- **Small corpora.** When flat top-k over a modest chunk set is already cheap and accurate,
  the extra summary tier and its pipeline are unjustified complexity; the O(n·c) vs. O(n) index
  advantage only matters at scale.[^summary-rag-paper]

[^llamaindex-dsi-blog]: Jerry Liu, "A New Document Summary Index for LLM-powered QA Systems," LlamaIndex Blog — <https://www.llamaindex.ai/blog/a-new-document-summary-index-for-llm-powered-qa-systems-9a32ece2f9ec>
[^llamaindex-dsi-docs]: LlamaIndex Documentation, "Document Summary Index (example)" — <https://developers.llamaindex.ai/python/examples/index_structs/doc_summary/docsummary/>
[^ragie-summary-index]: Ragie Documentation, "Summary Index" — <https://docs.ragie.ai/docs/summary-index>
[^summary-rag-paper]: "Summary RAG: A Multi-Format Document Retrieval System with Document-Level Summarization," Research and Science Today, 2026 — <https://www.rstjournal.com/article/21.2026>
[^cost-aware-routing]: Sanjay Mishra, "Cost-Aware Query Routing in RAG: Empirical Analysis of Retrieval Depth Tradeoffs," arXiv, 2026 — <https://arxiv.org/abs/2606.02581>
[^openai-batch]: OpenAI API Docs, "Batch API" — <https://developers.openai.com/api/docs/guides/batch>
[^clinical-summ-safety]: "A framework to assess clinical safety and hallucination rates of LLMs for medical text summarisation," npj Digital Medicine / PMC, 2025 — <https://pmc.ncbi.nlm.nih.gov/articles/PMC12075489/>
