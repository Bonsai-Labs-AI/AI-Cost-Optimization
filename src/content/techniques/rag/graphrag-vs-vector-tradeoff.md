---
title: "GraphRAG vs Vector Tradeoff"
category: rag
maturityLevel: 4
maturityProvisional: false
shortDescription: "A decision, not a default: knowledge-graph RAG (entity/relation graph + community summaries) pays for global, multi-hop 'connect-the-dots' queries but carries a large LLM-heavy indexing cost — so reach for it only when the query mix and corpus stability justify amortizing that build."
effort: High
gain: Medium
riskToQuality: Medium
effortWhy: "A full graph index (LLM entity/relationship extraction + community detection + community summarization over the whole corpus) plus a query router and a refresh pipeline — a specialized build, not a config change."
gainWhy: "Large quality lift on global/multi-hop questions vector RAG can't answer, but on the common local-retrieval query mix it adds cost with little benefit — net gain only on the right query distribution."
riskWhy: "Heavy upfront/refresh indexing spend for a payoff that only materializes if queries are genuinely global; extraction quality and staleness on a churning corpus add failure modes."
detectionSignals:
  - "Users ask global/thematic questions ('what are the main themes', 'how do X and Y relate across the corpus') that vector RAG answers incompletely because no single chunk contains the answer."
  - "Multi-hop questions requiring evidence aggregated across many documents fail with top-k retrieval + rerank."
  - "A team is considering GraphRAG without having costed the LLM indexing (entity extraction + community summarization) over the full corpus."
  - "The corpus is relatively stable, so a one-time graph index can be amortized over many queries."
measurementMethods:
  - "GraphRAG indexing $ per corpus (LLM tokens for extraction + summarization) and the refresh $ per update cycle."
  - "Answer quality (comprehensiveness/diversity or task accuracy) on global vs local query sets, GraphRAG vs vector-RAG-plus-rerank."
  - "Query-mix share that is genuinely global/multi-hop vs local — the fraction that actually benefits."
  - "Break-even query volume: indexing + refresh cost ÷ per-query quality value; does the query volume amortize the build?"
status: published
lastUpdated: "2026-07-03"
related:
  - "rag/hierarchical-retrieval"
  - "rag/precomputed-document-summaries"
  - "rag/reducing-retrieved-chunk-count"
  - "rag/reranking-before-generation"
sources:
  - id: graphrag-paper
    title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization"
    publisher: "Microsoft Research (arXiv:2404.16130)"
    authors: "Edge, Trinh, Cheng, Bradley, Chao, Mody, Truitt, Metropolitansky, Ness, Larson"
    year: 2024
    url: "https://arxiv.org/abs/2404.16130"
    accessed: "2026-07-03"
    kind: paper
    note: "GraphRAG builds an LLM-derived entity knowledge graph then pregenerates community summaries; on global sensemaking questions over ~1M-token corpora it beats naive/vector RAG on comprehensiveness (72–83% win rate) and diversity (62–82%). Root-level community summaries (C0) use over 97% fewer context tokens per query than source-text summarization (e.g. ~26k vs ~1.01M tokens on the podcast dataset)."
  - id: graphrag-repo
    title: "GraphRAG (official repository)"
    publisher: "Microsoft — GitHub"
    year: 2026
    url: "https://github.com/microsoft/graphrag"
    accessed: "2026-07-03"
    kind: repo
    note: "README carries the explicit warning: 'GraphRAG indexing can be an expensive operation, please read all of the documentation to understand the process and costs involved, and start small.'"
  - id: graphrag-methods
    title: "Indexing Methods"
    publisher: "Microsoft — GraphRAG Documentation"
    year: 2026
    url: "https://microsoft.github.io/graphrag/index/methods/"
    accessed: "2026-07-03"
    kind: docs
    note: "Standard indexing = LLM entity extraction + LLM relationship extraction + entity/relationship summarization + claim extraction + community report generation. Graph extraction is estimated at ~75% of indexing cost; FastGraphRAG offered as a lower-LLM-cost variant."
  - id: lazygraphrag
    title: "LazyGraphRAG: Setting a New Standard for Quality and Cost"
    publisher: "Microsoft Research Blog"
    year: 2024
    url: "https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/"
    accessed: "2026-07-03"
    kind: blog
    note: "Defers summarization to query time: indexing cost is ~0.1% of full GraphRAG's and identical to vector RAG's. At mid budget it matches or beats competitors at ~4% of GraphRAG global-search query cost; at high budget it reaches comparable global-query quality to GraphRAG Global Search at >700× lower query cost."
  - id: needgraphrag-bench
    title: "Do We Still Need GraphRAG? Benchmarking RAG and GraphRAG for Agentic Search Systems"
    publisher: "arXiv:2604.09666"
    year: 2026
    url: "https://arxiv.org/abs/2604.09666"
    accessed: "2026-07-03"
    kind: benchmark
    note: "On general QA, GraphRAG adds only +0.47 avg over dense/vector retrieval; on multi-hop QA (HotpotQA, 2Wiki, Musique) it adds +27.23. Agentic search over dense RAG narrows the multi-hop gap only slightly (to +26.59). GraphRAG carries 'substantial offline preprocessing cost' and pays off 'when its offline cost is amortized.'"
---

## Overview

Standard **vector RAG** answers a question by embedding it, retrieving the top-*k* most
similar chunks, and stuffing them into the prompt. It is cheap to index (embed once) and
excellent at **local** questions whose answer lives in a few specific passages. It fails
on **global** questions — "what are the main themes across this corpus?", "how do these
findings connect?" — because no single chunk contains the answer; the answer has to be
*synthesized* across the whole dataset, which is a query-focused summarization problem,
not a retrieval one.[^graphrag-paper]

**GraphRAG** (Microsoft's canonical implementation) attacks exactly that gap. During
indexing it uses an LLM to extract an **entity/relationship knowledge graph** from every
text unit, detects **communities** of related entities, and **pregenerates a summary
report for each community**. At query time it can answer a global question by mapping over
those community summaries and reducing to a final answer.[^graphrag-paper][^graphrag-methods]
The result is a real quality win on global, multi-hop, "connect-the-dots" queries.

The catch — and the entire reason this is a *decision* page and not a build guide — is
**cost asymmetry**. That indexing is LLM-heavy: entity extraction, relationship
extraction, and community summarization run the model across the *whole corpus*, and must
re-run when the corpus changes. Microsoft's own repository leads with the warning that
"GraphRAG indexing can be an **expensive operation** … understand the process and costs
involved, and **start small**."[^graphrag-repo] So GraphRAG trades a large, recurring
**indexing** cost for a **query-time** win that only materializes on a specific query mix.
It sits at **Level 4** because it is a heavy, specialized build with a *narrow* payoff —
net-negative in the common case where most questions are local.

## Detailed Approach & Techniques

### The two sides of the tradeoff

**Cost side (indexing).** GraphRAG's index is produced by running an LLM over every chunk
to extract entities and their relationships, summarize them, and then summarize each
detected community — with **graph extraction alone estimated at ~75% of indexing
cost**.[^graphrag-methods] Because it is per-chunk LLM work over the full corpus, cost
scales with corpus size and re-runs on refresh. Vector RAG, by contrast, only needs an
embedding pass — orders of magnitude cheaper per token and trivially incremental. The
practical consequence: GraphRAG indexing can be prohibitively expensive on large or
fast-churning corpora, which is exactly why Microsoft ships the "start small" warning.[^graphrag-repo]

**Value side (query time).** When the question is genuinely global, GraphRAG delivers.
On global sensemaking questions over ~1M-token datasets, GraphRAG's community-summary
conditions beat a naive/vector RAG baseline on **comprehensiveness 72–83%** of the time
and on **diversity 62–82%** of the time.[^graphrag-paper] Independent 2026 benchmarking
sharpens *where* that value lives: on **general QA**, GraphRAG adds only **+0.47** over
dense/vector retrieval — effectively a tie — but on **multi-hop QA** (HotpotQA, 2Wiki,
Musique) it adds **+27.23**.[^needgraphrag-bench] The graph earns its cost specifically
for multi-hop, cross-document reasoning; on ordinary local retrieval it does not.

### Cheaper middle grounds

The indexing bill is not fixed. Two levers cut it:

- **Root-level community summaries (C0).** Answering global queries from only the
  top-level community summaries uses **over 97% fewer context tokens per query** than
  summarizing source text directly (e.g. ~26k vs ~1.01M tokens on the podcast
  dataset) — a large *query-time* saving at a small comprehensiveness cost.[^graphrag-paper]
- **LazyGraphRAG.** Microsoft's follow-up **defers the expensive summarization to query
  time**, so its **indexing cost is ~0.1% of full GraphRAG's and identical to vector
  RAG's**. At a mid query budget it matches or beats competitors at **~4% of GraphRAG
  global-search query cost**, and at a high budget reaches **comparable global-query
  quality to GraphRAG Global Search at >700× lower query cost**.[^lazygraphrag] LazyGraphRAG
  substantially collapses the indexing-cost argument against graph approaches — if you
  reach for a graph method at all, it is usually the right default over full GraphRAG.
- **FastGraphRAG / lighter extraction** trades some description richness for "much lower
  language model cost" during indexing.[^graphrag-methods]

### The decision rule

1. **Default to vector RAG + reranking.** For most products the query mix is dominated by
   local questions, and a well-tuned top-*k* + rerank pipeline (see *Reranking Before
   Generation*, *Reducing Retrieved Chunk Count*) answers them at a fraction of GraphRAG's
   build cost. Even 2026 agentic-search improvements over dense RAG mostly close the gap on
   everything except multi-hop.[^needgraphrag-bench]
2. **Reach for a graph approach only when BOTH hold:** (a) a material share of queries are
   genuinely **global or multi-hop/relational** — the class where GraphRAG's +27 shows
   up[^needgraphrag-bench] — AND (b) the **corpus is stable enough** to amortize indexing
   over many queries, since refresh re-runs the LLM extraction.[^graphrag-repo]
3. **When you do, prefer the cheap variant first.** LazyGraphRAG gives most of the global
   answer quality at vector-RAG indexing cost; only escalate to full GraphRAG community
   summaries if measured quality demands it.[^lazygraphrag]
4. **Cost it before building.** Measure indexing $ per corpus and per refresh, then divide
   by the volume of genuinely-global queries. If that break-even volume isn't there, the
   graph is a cost sink.

## Example Where It Works

An analyst-facing product sits on a **stable** corpus of a few thousand research reports
and earnings-call transcripts. Its highest-value queries are global and relational:
"summarize the recurring risks across all Q3 filings," "how does supplier X connect to
the companies in our portfolio?" Vector RAG answers these poorly — the answer is
distributed across dozens of documents, and no top-*k* set captures it.

Here GraphRAG pays. The corpus rarely changes, so the LLM-heavy indexing is a **one-time**
cost amortized over a high volume of global queries — exactly the "offline cost amortized"
regime the benchmark flags as GraphRAG-favorable.[^needgraphrag-bench] On the global
sensemaking questions that dominate this workload, the graph's community summaries beat a
vector baseline on comprehensiveness and diversity 60–80%+ of the time.[^graphrag-paper]
The team starts with **LazyGraphRAG** to get global-query quality at near-vector indexing
cost, and only considers full community summaries if evaluation shows a remaining
gap.[^lazygraphrag] Break-even is easy because the index is built once and queried
constantly.

## Example Where It Would NOT Work

A customer-support assistant retrieves from a **large, fast-changing** help-center and
ticket corpus (new articles and edits daily). Its queries are overwhelmingly **local**:
"how do I reset my password?", "what's the refund window?" — each answerable from one or
two specific passages.

GraphRAG is the wrong tool twice over. First, the query mix is local, where GraphRAG adds
essentially **nothing** over vector RAG (**+0.47** on general QA) — you'd pay the graph's
indexing bill for no answer-quality gain.[^needgraphrag-bench] Second, the corpus
**churns**, so the expensive LLM entity-extraction-and-summarization pass would have to
re-run constantly, and Microsoft explicitly warns that indexing is an expensive operation
to be undertaken carefully.[^graphrag-repo] The recurring indexing spend never amortizes
because there is no stable index and few global queries to benefit. The right stack is
plain **vector RAG with reranking and a lean retrieved-chunk count** — cheap to index,
trivial to keep fresh, and fully sufficient for local questions. If a *minority* of global
"connect-the-dots" queries do exist, route only those to a **LazyGraphRAG** or
summary-based path rather than paying full-GraphRAG indexing across the whole
corpus.[^lazygraphrag]

[^graphrag-paper]: Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization," Microsoft Research, arXiv:2404.16130 — <https://arxiv.org/abs/2404.16130>
[^graphrag-repo]: Microsoft, "GraphRAG" (official repository README) — <https://github.com/microsoft/graphrag>
[^graphrag-methods]: Microsoft, "Indexing Methods," GraphRAG Documentation — <https://microsoft.github.io/graphrag/index/methods/>
[^lazygraphrag]: Microsoft Research, "LazyGraphRAG: Setting a New Standard for Quality and Cost" — <https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/>
[^needgraphrag-bench]: "Do We Still Need GraphRAG? Benchmarking RAG and GraphRAG for Agentic Search Systems," arXiv:2604.09666 — <https://arxiv.org/abs/2604.09666>
