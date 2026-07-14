---
title: "Hierarchical Retrieval"
category: rag
maturityLevel: 3
maturityProvisional: false
shortDescription: "Retrieve in stages over a hierarchy (summaries/parents → drill into relevant children, or coarse→fine) so you read fewer, better-targeted units to find the answer instead of scanning many flat top-k chunks."
effort: High
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Flat top-k over a large corpus, with a big k 'to be safe' inflating retrieved chunks and context tokens."
  - "Many small chunks retrieved to reconstruct a single answer that spans a structured document set."
  - "Multi-hop or 'holistic' questions (summarize/compare across a document) that flat chunk retrieval answers poorly."
  - "Retrieval recall is fine but context is bloated with adjacent low-value chunks pulled in for safety."
measurementMethods:
  - "Retrieved units per query (chunks/nodes) and LLM-context tokens per query, before vs. after."
  - "Recall / answer accuracy held at the same bar as flat retrieval (equal-recall comparison, not just token count)."
  - "Index build + refresh cost: summarization tokens per document, re-index time on corpus change."
  - "Share of retrieved nodes coming from summary (non-leaf) layers — confirms the hierarchy is doing work."
status: published
lastUpdated: "2026-07-03"
related:
  - "rag/reducing-retrieved-chunk-count"
  - "rag/reranking-before-generation"
  - "rag/precomputed-document-summaries"
  - "rag/chunking-parameter-tuning"
sources:
  - id: raptor-paper
    title: "RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval"
    publisher: "arXiv (ICLR 2024)"
    authors: "Sarthi, Abdullah, Tuli, Khanna, Goldie, Manning"
    year: 2024
    url: "https://arxiv.org/abs/2401.18059"
    accessed: "2026-07-03"
    kind: paper
    note: "Recursively embeds, clusters, and summarizes chunks bottom-up into a tree. Collapsed-tree retrieval with a 2000-token budget (~top-20 nodes) outperforms tree traversal. RAPTOR + GPT-4 lifts QuALITY from 62.3% to 82.6% (a 20% absolute gain). Build cost scales linearly with document length."
  - id: raptor-html
    title: "RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval (full text)"
    publisher: "arXiv HTML"
    authors: "Sarthi et al."
    year: 2024
    url: "https://arxiv.org/html/2401.18059v1"
    accessed: "2026-07-03"
    kind: paper
    note: "Appendix I layer-contribution analysis: on QuALITY (DPR) leaf nodes are 67.71% of retrieved nodes while summary layers 1 and 2 contribute 29.43% and 2.85%; on NarrativeQA non-leaf (summary) nodes reach 57.36% — the hierarchy substitutes summary units for many leaf chunks."
  - id: raptor-repo
    title: "raptor — official implementation"
    publisher: "GitHub (parthsarthi03/raptor)"
    year: 2024
    url: "https://github.com/parthsarthi03/raptor"
    accessed: "2026-07-03"
    kind: repo
    note: "Official RAPTOR code: add_documents() builds the recursive tree; answer_question() queries it; save()/load() persist. Confirms the build-a-tree / query-the-tree workflow."
  - id: llamaindex-automerge
    title: "Auto Merging Retriever"
    publisher: "LlamaIndex Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/retrievers/auto_merging_retriever/"
    accessed: "2026-07-03"
    kind: docs
    note: "HierarchicalNodeParser builds nodes at 2048 / 512 / 128 chunk sizes; only leaf (128) nodes are embedded in the vector index, parents live in a docstore. When enough sibling leaves of a parent are retrieved, they are merged up into the single parent node — collapsing several small chunks into one coherent unit."
  - id: llamaindex-recursive
    title: "Recursive Retriever + Node References"
    publisher: "LlamaIndex Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/retrievers/recursive_retriever_nodes/"
    accessed: "2026-07-03"
    kind: docs
    note: "Small chunks (128/256/512) or metadata (summaries, generated questions) reference a bigger base node; retrieve the small unit, follow the reference to the bigger one for synthesis. Metadata-reference retrieval improved hit rate 0.778→0.892 and MRR 0.563→0.718 over a flat baseline."
  - id: langchain-parentdoc
    title: "ParentDocumentRetriever"
    publisher: "LangChain Reference"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-classic/retrievers/parent_document_retriever/ParentDocumentRetriever"
    accessed: "2026-07-03"
    kind: docs
    note: "Splits into small child chunks for accurate embedding/search but returns the parent document/chunk the match came from — small units for search precision, larger units for LLM context. child_splitter / parent_splitter config."
  - id: hichunk
    title: "HiChunk: Evaluating and Enhancing RAG with Hierarchical Chunking"
    publisher: "arXiv"
    authors: "Lu, Chen, Qiao, Sun"
    year: 2025
    url: "https://arxiv.org/pdf/2509.11552"
    accessed: "2026-07-03"
    kind: benchmark
    note: "Introduces HiCBench to evaluate chunking. Finds hierarchical multi-level chunking improves the recall-vs-token-budget tradeoff over flat fixed-size chunking — retrieving fewer, higher-quality units at a given context budget."
---

## Overview

The default RAG retriever is **flat top-k**: chunk the whole corpus into uniform pieces,
embed them all, and at query time pull the *k* most similar chunks straight into the
prompt. It works, but it has two failure modes that both cost money. First, to be safe
teams inflate *k* — retrieving 15–20 chunks so the answer is *probably* in there — which
drags a lot of adjacent, low-value text into the LLM context. Second, "holistic" or
multi-hop questions ("summarize the section," "compare A and B across the document") have a
real **semantic gap** between the wording of the question and any single leaf chunk, so
flat retrieval either misses or over-retrieves.[^raptor-paper]

**Hierarchical retrieval** organizes the corpus into levels — leaf chunks at the bottom,
progressively coarser **summary / parent** nodes above — and retrieves in *stages*: match
at a coarse level to find the right region, then drill into only the relevant children (or
the reverse: match small, precise units and merge upward for context). Instead of scanning
many flat chunks, you route to the right subtree and read the few units that actually
matter.[^raptor-paper][^llamaindex-automerge]

The cost mechanism is specifically **fewer retrieved *units*** — fewer chunks/nodes, and
therefore fewer LLM-context tokens — **at equal recall**. It is *not* inherently a smaller
context window: you still fill the same budget if you want to. The win is that the units you
put in that budget are better targeted, so you can hit the same recall with fewer of them,
or the same unit count at higher recall. This lands at **Level 3** because the savings come
from **building and maintaining a real hierarchy** (offline summarization, a parent/child
docstore, re-indexing on change) — genuine engineering, not a config flag.

## Detailed Approach & Techniques

There are four common patterns, from cheapest-to-build to most-powerful.

### Parent-document (child-search, parent-return)

The simplest hierarchy is two levels. Split each document into **small child chunks** for
embedding and search — small chunks embed more precisely because a long chunk dilutes its
own meaning — but at retrieval time **return the parent** (the larger chunk or whole
document the matched child came from).[^langchain-parentdoc] You search on precise units and
hand the model coherent context, without the flat-retriever compromise of "chunk size that's
good for search *or* good for context, pick one."

### Auto-merging (leaf-search, merge-up)

A depth-N generalization. LlamaIndex's `HierarchicalNodeParser` builds nodes at, e.g.,
**2048 / 512 / 128** token sizes; only the **128-token leaves are embedded** in the vector
index, while parents live in a docstore. You retrieve leaves as usual, but when **enough
sibling leaves of the same parent** show up in the results, the `AutoMergingRetriever`
**replaces them with the single parent node**.[^llamaindex-automerge] Five fragmented
128-token hits collapse into one 512-token unit — fewer units, less fragmentation, one
coherent block for the LLM.

### Recursive retrieval (node references)

Nodes carry **references** to other nodes: small chunks point to a bigger base chunk, or —
more powerfully — **summaries and generated questions** point to the chunk they describe.
You embed and match the small/derivative unit, then **follow the reference** to the richer
unit for synthesis. On LlamaIndex's own example this metadata-reference approach lifted
**hit rate from 0.778 → 0.892 and MRR from 0.563 → 0.718** over a flat baseline — better
targeting, same retrieval step.[^llamaindex-recursive]

### Summary-tree (RAPTOR)

The most complete form. **RAPTOR** recursively **embeds → clusters → summarizes** chunks
bottom-up, building a tree whose upper layers are LLM-generated summaries of the clusters
below.[^raptor-paper][^raptor-repo] Queries can match a high-level summary that a single leaf
chunk would never surface, then the summary stands in for a whole cluster of leaves. RAPTOR's
best-performing query mode ("collapsed tree") flattens all layers and pulls top nodes until a
**2000-token budget** (~top-20 nodes) is hit — and crucially, a large share of those nodes
come from the **summary layers, not leaves**: on QuALITY, 32% of retrieved nodes are non-leaf
summaries; on NarrativeQA, **57%** are.[^raptor-html] Those summary units are *substituting*
for many leaf chunks — that is the "fewer units at equal or better recall" effect made
concrete, and it delivered a **20% absolute accuracy gain on QuALITY (62.3% → 82.6%)** paired
with GPT-4.[^raptor-paper]

### Quantifying the unit reduction (and being precise about it)

The honest framing: hierarchical retrieval lets you meet a recall bar with **fewer, coarser
units**. A summary node can carry the information of an entire cluster of leaves, so at a
fixed 2000-token / top-k budget you cover more of the document with each slot; equivalently,
you can shrink k. Independent benchmark work (HiChunk / HiCBench) confirms hierarchical,
multi-level chunking **improves the recall-versus-token-budget tradeoff** over flat
fixed-size chunking — you get more relevant content per token of context.[^hichunk] Note
what this is *not*: it does not automatically shrink your prompt window, and it is not free
context compression. If you keep k and the token budget fixed, you spend the same input
tokens — you just spend them on better-targeted units.

### The costs (why this is L3, not L1)

- **Building the hierarchy.** Summary/RAPTOR indexes require an **offline LLM summarization
  pass** over the corpus (RAPTOR: recursive summarization at every cluster). That is real
  token spend, though it is **amortized once per document** and scales **linearly** with
  document length.[^raptor-paper][^raptor-html]
- **Maintaining it.** When a source document changes, the affected summaries/parents must be
  **re-generated and re-indexed** — invalidation is the operational tax that flat retrieval
  doesn't pay.
- **Extra retrieval hops.** Multi-stage retrieval (route → drill, or retrieve → merge → fetch
  parents from the docstore) adds a hop and a docstore lookup versus a single ANN query.
- **Wrong-subtree risk.** If the coarse stage routes to the wrong region, you can **miss the
  answer entirely** — a failure mode flat top-k doesn't have. Auto-merging and collapsed-tree
  modes mitigate this by still ranking leaves globally rather than committing to one branch
  early.[^llamaindex-automerge][^raptor-paper]

Pairs naturally with **reranking** (rank the merged/hierarchical candidates) and with
**precomputed document summaries** (the summary layer *is* the coarse index).

## Example Where It Works

A legal-research assistant indexes **200,000 pages** across long, structured contracts and
case files. Users ask both pinpoint questions ("what's the indemnity cap in exhibit C?") and
holistic ones ("summarize the parties' obligations across the master agreement").

- **Flat top-k baseline:** to answer holistic questions at acceptable recall, the team runs
  **k = 20** small chunks per query — many of them adjacent, redundant, or only tangentially
  relevant — and still misses cross-section answers because no single leaf chunk states the
  synthesis.
- **Hierarchical (RAPTOR-style summary tree + auto-merge):** a summary node captures each
  contract section, so holistic queries match a **handful of summary units** instead of
  scraping 20 leaves, and pinpoint queries still hit precise leaves that merge up to their
  parent clause. At the same **~2000-token retrieval budget**, roughly a third of the units
  now come from summary layers, standing in for clusters of leaves.[^raptor-html] Recall on
  multi-hop questions rises (RAPTOR's QuALITY-style **+20% absolute** regime), and the number
  of distinct retrieved units per query drops meaningfully — fewer, better-targeted units at
  equal-or-better recall.[^raptor-paper][^hichunk] The one-time summarization cost is
  amortized across a corpus queried thousands of times a day.

## Example Where It Would NOT Work

- **Small or flat corpus.** A few hundred short, self-contained FAQ entries have no
  meaningful hierarchy to exploit; a summary layer just adds build cost and a retrieval hop
  for no recall gain. Flat top-k (or plain reranking) wins.[^hichunk]
- **High-churn data.** If documents change constantly (live tickets, pricing, inventory), the
  summary/parent layer must be **re-summarized and re-indexed** on every change — the
  maintenance and token cost of keeping the hierarchy fresh can exceed the retrieval savings.
- **Pinpoint-only, well-separated facts.** When every query maps cleanly to exactly one leaf
  chunk (a code snippet, a single spec value), the summary layers rarely get selected and the
  extra machinery buys nothing over precise flat retrieval — the leaf layer already answers
  it.[^raptor-html]
- **Low query volume per document.** The offline summarization cost only amortizes if each
  document is queried many times. For a corpus retrieved a handful of times, you pay to build
  a tree you barely use — below that break-even, a managed flat-retrieval + rerank stack is
  cheaper.[^raptor-paper]

[^raptor-paper]: Sarthi et al., "RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval," arXiv/ICLR 2024 — <https://arxiv.org/abs/2401.18059>
[^raptor-html]: Sarthi et al., "RAPTOR" (full text, Appendix I layer-contribution analysis) — <https://arxiv.org/html/2401.18059v1>
[^raptor-repo]: parthsarthi03, "raptor — official implementation," GitHub — <https://github.com/parthsarthi03/raptor>
[^llamaindex-automerge]: LlamaIndex Documentation, "Auto Merging Retriever" — <https://developers.llamaindex.ai/python/examples/retrievers/auto_merging_retriever/>
[^llamaindex-recursive]: LlamaIndex Documentation, "Recursive Retriever + Node References" — <https://developers.llamaindex.ai/python/examples/retrievers/recursive_retriever_nodes/>
[^langchain-parentdoc]: LangChain Reference, "ParentDocumentRetriever" — <https://reference.langchain.com/python/langchain-classic/retrievers/parent_document_retriever/ParentDocumentRetriever>
[^hichunk]: Lu, Chen, Qiao, Sun, "HiChunk: Evaluating and Enhancing RAG with Hierarchical Chunking," arXiv 2025 — <https://arxiv.org/pdf/2509.11552>
