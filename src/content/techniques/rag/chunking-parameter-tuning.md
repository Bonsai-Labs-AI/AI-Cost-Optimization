---
title: "Chunking-Parameter Tuning"
category: rag
maturityLevel: 2
maturityProvisional: false
shortDescription: "Tune chunk size, overlap, and boundary strategy so retrieval returns fewer, denser, more relevant chunks — cutting the tokens fed to the LLM per query without hurting answer quality."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Chunk size and overlap are framework defaults (e.g. 1024 tokens / 20-token overlap) that were never tuned against your corpus."
  - "A large overlap (20%+) is set out of habit, inflating both index size and retrieved-token volume."
  - "Retrieved context contains oversized chunks that pad the prompt with mostly-irrelevant text."
  - "No retrieval-quality metric (recall, precision, faithfulness) is measured, so nobody can say whether a config change helped or hurt."
  - "Semantic/LLM-based chunking was adopted on faith, with no A/B against recursive fixed-size chunking on your own data."
measurementMethods:
  - "Retrieved tokens per query (the input the LLM is billed for), across candidate chunk configs."
  - "Retrieval recall / precision (or Chroma-style token-level IoU) on a labelled query set."
  - "Answer-quality proxies — faithfulness and relevancy — held at bar while retrieved tokens drop."
  - "Index size and embedding cost per re-index as a function of overlap."
  - "Cost-per-correct-answer: dollars per query at the answer-quality bar you require."
status: published
lastUpdated: "2026-07-02"
related:
  - "rag/reducing-retrieved-chunk-count"
  - "rag/retrieval-chunk-deduplication"
  - "rag/reranking-before-generation"
sources:
  - id: llama-chunksize
    title: "Evaluating the Ideal Chunk Size for a RAG System using LlamaIndex"
    publisher: "LlamaIndex — Blog"
    year: 2024
    url: "https://www.llamaindex.ai/blog/evaluating-the-ideal-chunk-size-for-a-rag-system-using-llamaindex-6207e5d3fec5"
    accessed: "2026-07-02"
    kind: blog
    note: "Eval loop over chunk sizes 128/256/512/1024/2048 scored on average response time, faithfulness, and relevancy; faithfulness and relevancy peaked at 1024 in their run — the point being the config must be measured, not assumed."
  - id: llama-nodeparsers
    title: "Node Parser Modules"
    publisher: "LlamaIndex — Developer Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/"
    accessed: "2026-07-02"
    kind: docs
    note: "SentenceSplitter defaults chunk_size=1024, chunk_overlap=20; SemanticSplitterNodeParser 'adaptively picks the breakpoint in-between sentences using embedding similarity' with a breakpoint_percentile_threshold."
  - id: pinecone-chunking
    title: "Chunking Strategies for LLM Applications"
    publisher: "Pinecone — Learn"
    year: 2026
    url: "https://www.pinecone.io/learn/chunking-strategies/"
    accessed: "2026-07-02"
    kind: docs
    note: "'There's no one-size-fits-all solution to chunking'; suggests testing 128/256 vs 512/1024; notes embedding context-window truncation; recommends chunk-expansion (retrieve neighboring chunks) as an alternative to large overlap."
  - id: chroma-eval
    title: "Evaluating Chunking Strategies for Retrieval"
    publisher: "Chroma — Research"
    year: 2024
    url: "https://www.trychroma.com/research/evaluating-chunking"
    accessed: "2026-07-02"
    kind: benchmark
    note: "Introduces token-level IoU; RecursiveCharacterTextSplitter@200 recall 88.1% / IoU 6.9%, ClusterSemanticChunker@200 recall 87.3% / IoU 8.0%, LLMSemanticChunker recall 91.9% / IoU 3.9%. Strategy choice moved recall by up to ~9%; semantic gains are mixed and metric-dependent."
  - id: naacl-semchunk
    title: "Is Semantic Chunking Worth the Computational Cost?"
    publisher: "Findings of NAACL 2025 (ACL Anthology)"
    authors: "Renyi Qu, Ruixuan Tu, Forrest Bao"
    year: 2025
    url: "https://aclanthology.org/2025.findings-naacl.114/"
    accessed: "2026-07-02"
    kind: paper
    note: "Across document/evidence/answer-generation retrieval tasks, 'the computational costs associated with semantic chunking are not justified by consistent performance gains' — fixed 200-word chunks match or beat semantic chunking."
  - id: rethinking-chunksize
    title: "Rethinking Chunk Size For Long-Document Retrieval: A Multi-Dataset Analysis"
    publisher: "arXiv:2505.21700"
    year: 2025
    url: "https://arxiv.org/abs/2505.21700"
    accessed: "2026-07-02"
    kind: paper
    note: "Dense-embedding retrieval (stella_en_1.5B_v5, snowflake-arctic-embed-l-v2.0) across NarrativeQA/NQ/NewsQA/TechQA/COVID/DuReader/SQuAD: optimal chunk size is strongly dataset-dependent. (Its experiments were run without chunk overlap — it does not evaluate overlap.)"
  - id: firecrawl-chunking
    title: "Best Chunking Strategies for RAG (and LLMs) in 2026"
    publisher: "Firecrawl — Blog"
    year: 2026
    url: "https://www.firecrawl.dev/blog/best-chunking-strategies-rag"
    accessed: "2026-07-02"
    kind: blog
    note: "10–20% overlap as a starting point (50–100 tokens on a 500-token chunk); 'don't assume overlap is always worth the storage trade-off'; start recursive, move to semantic only if metrics justify the cost."
---

## Overview

In a Retrieval-Augmented Generation (RAG) pipeline, documents are split into **chunks**
before they are embedded and indexed. At query time the system retrieves the top-`k`
chunks and pastes them into the prompt as context. The size and shape of those chunks
therefore directly control **how many input tokens the LLM is billed for on every
query** — and, at the same time, whether the *right* information is in the context at
all.

The problem is that the default chunk parameters most teams ship with are arbitrary.
LlamaIndex's `SentenceSplitter`, for example, defaults to **1,024-token chunks with a
20-token overlap**; many pipelines copy a "512 tokens, 20% overlap" recipe from a
tutorial and never revisit it.[^llama-nodeparsers][^firecrawl-chunking] Oversized chunks
pad the prompt with mostly-irrelevant text (you pay for the whole chunk to get the two
relevant sentences inside it); large overlap duplicates tokens across neighbouring chunks,
inflating both the index and the retrieved-token count.

Chunking-parameter tuning is the practice of choosing chunk **size**, **overlap**, and
**boundary strategy** (fixed / recursive / semantic) deliberately, so retrieval returns
**fewer, denser, more on-topic chunks** — fewer generation-context tokens per query at
equal or better answer quality. It sits at **Level 2** rather than L1 for one reason:
there is **no universal best setting**. The optimal configuration is
dataset-dependent,[^rethinking-chunksize][^pinecone-chunking] so getting it right means
running an **evaluation loop** — measuring retrieval and answer quality across candidate
configs — not flipping a switch. Doing that measurement is real engineering.

## Detailed Approach & Techniques

### Chunk size: the core retrieved-token / quality trade-off

Chunk size is the primary lever on retrieved-token volume. For a fixed `k`, doubling the
chunk size roughly doubles the tokens sent to the LLM per query. But smaller is not simply
"cheaper and better": chunks that are too small fragment an idea across boundaries and hurt
recall; chunks that are too large dilute the embedding and drag in irrelevant text.

The honest answer is that the sweet spot depends on your corpus and queries. A multi-dataset
study using dense-embedding retrieval across NarrativeQA, Natural Questions, NewsQA, TechQA, and
others found that **the ideal chunk size varies significantly from one dataset to the
next** — there is no single winner.[^rethinking-chunksize] LlamaIndex's own tutorial makes
the same point operationally: it sweeps 128 / 256 / 512 / 1,024 / 2,048-token chunks and
scores each on **average response time, faithfulness, and relevancy**; in that particular
run faithfulness and relevancy peaked at **1,024 tokens**, but the takeaway is the *method*,
not the number.[^llama-chunksize] Pinecone states it plainly: "there's no one-size-fits-all
solution to chunking," and recommends testing small (128/256) against larger (512/1,024)
sizes on your own data.[^pinecone-chunking]

One hard constraint: chunks must fit the **embedding model's** context window. Exceeding it
means the excess tokens are silently truncated before they are embedded, so an oversized
chunk can index only a fraction of its own text.[^pinecone-chunking]

### Overlap: usually a cost you can cut

Overlap re-includes the last *N* tokens of one chunk at the start of the next, to avoid
splitting a sentence or idea across a boundary. Conventional guidance is **10–20% overlap**
(≈50–100 tokens on a 500-token chunk).[^firecrawl-chunking] The catch is that overlap
**duplicates tokens**: every overlapped span is embedded, stored, and — when adjacent
chunks are both retrieved — sent to the LLM twice. That inflates index size, embedding cost,
and retrieved-token volume in direct proportion to the overlap fraction.

Overlap is often not worth paying for. Its cost — duplicated, re-embedded, re-retrieved
tokens — is certain, while its benefit is not: practitioner guidance is to **"not assume
overlap is always worth the storage trade-off,"** treating it as a *tunable parameter to
justify against your own retrieval metrics* rather than a default to copy.[^firecrawl-chunking]
(Notably, the multi-dataset chunk-size study above ran its experiments **without** any overlap
at all and still reported strong retrieval.[^rethinking-chunksize]) Where you *do*
need surrounding context, a cheaper alternative to blanket overlap is **chunk expansion**:
index tight, non-overlapping chunks, then at retrieval time pull the immediate neighbours of
a hit only when needed.[^pinecone-chunking]

### Boundary strategy: fixed vs recursive vs semantic (be honest about semantic)

- **Fixed-size / token splitting** — cut every `N` tokens. Simplest and cheapest; ignores
  structure, so it can split mid-sentence.
- **Recursive** — split on a hierarchy of separators (paragraph → sentence → word) to keep
  natural units together while targeting a size. The pragmatic default.[^firecrawl-chunking]
- **Semantic** — embed sentences and place boundaries where embedding similarity drops
  (LlamaIndex's `SemanticSplitterNodeParser` "adaptively picks the breakpoint in-between
  sentences using embedding similarity"; LangChain's semantic chunker offers percentile /
  standard-deviation / interquartile thresholds).[^llama-nodeparsers] It costs an **extra
  embedding pass over every sentence at ingestion**.

**Does semantic chunking's extra cost pay off? The evidence is genuinely mixed.** A NAACL
2025 study evaluated it across document retrieval, evidence retrieval, and answer generation
and concluded that **"the computational costs associated with semantic chunking are not
justified by consistent performance gains"** — plain fixed 200-word chunks matched or beat
it on real datasets.[^naacl-semchunk] Chroma's evaluation is similarly nuanced: on a
token-level Intersection-over-Union (IoU) metric, a recursive splitter at 200 tokens scored
**88.1% recall / 6.9% IoU**, a cluster-based semantic chunker **87.3% recall / 8.0% IoU**
(better token efficiency, comparable recall), while an LLM-based semantic chunker reached
the highest recall (**91.9%**) but the *worst* IoU (**3.9%** — it retrieved more irrelevant
tokens).[^chroma-eval] The right read: chunking strategy matters (Chroma saw recall swing by
up to ~9% across strategies), but semantic chunking is **not a free win**. Start with
recursive fixed-size; adopt semantic only if your own metrics show it earns its extra
ingestion cost.[^firecrawl-chunking][^naacl-semchunk]

### The evaluation loop (why this is L2)

Because the best config is dataset-dependent, the technique *is* the measurement loop:

1. **Build a labelled query set** — representative questions with their gold-relevant
   passages (this is the shared golden set from a *Quality–Cost Evaluation Suite*).
2. **Sweep candidate configs** — a grid of chunk sizes, overlaps, and one or two boundary
   strategies (e.g. 256/512/1024 × 0/10/20% overlap × recursive/semantic).
3. **Score each on retrieval quality AND cost together** — recall / precision or token-level
   IoU for retrieval, faithfulness / relevancy for the answer, and **retrieved tokens per
   query** for cost.[^llama-chunksize][^chroma-eval]
4. **Pick the cheapest config that holds the quality bar**, then re-check after any embedding-
   model change (which invalidates the index anyway).

This is the same discipline LlamaIndex demonstrates with its faithfulness/relevancy sweep,
and it is what separates tuned RAG from copied defaults.[^llama-chunksize]

## Example Where It Works

A support knowledge-base assistant indexes 40,000 help articles. It shipped on the default
`SentenceSplitter` config — **1,024-token chunks with 20% overlap** — and retrieves `k=5`,
so each query feeds ~5,000 tokens of context to the LLM, much of it padding around the one
relevant paragraph.[^llama-nodeparsers]

The team builds a 300-question labelled eval set and sweeps configs. They find that
**512-token recursive chunks with zero overlap** hold answer faithfulness and relevancy at
the same bar while retrieving roughly **half the tokens per query**, and that dropping the
20% overlap removes duplicated spans with no measurable recall loss on their eval set. At a few
hundred thousand queries a month, halving retrieved context tokens is a direct, permanent cut
to per-query generation cost, and the smaller non-overlapping index also lowers embedding and
storage cost. Because every change was checked against the eval set, they can ship it without
guessing about quality.[^llama-chunksize][^firecrawl-chunking]

## Example Where It Would NOT Work

- **Tiny corpus, cost dominated elsewhere.** A pipeline over a 50-page internal handbook where
  the LLM-generation and reasoning tokens dwarf the retrieved context has little to gain from
  shaving chunk tokens; the eval-loop effort isn't repaid. Right-sizing the model or budgeting
  reasoning tokens is the bigger lever.
- **Expecting semantic chunking to be a guaranteed upgrade.** Swapping in an LLM- or
  embedding-based semantic chunker "to improve quality" can *raise* ingestion cost and, on some
  metrics, retrieve *more* irrelevant tokens — Chroma's LLM chunker had the best recall but the
  worst token-level IoU, and the NAACL study found fixed chunks matched or beat semantic
  overall.[^chroma-eval][^naacl-semchunk] Without an eval to prove the gain on your data, it is
  a cost increase dressed as an optimization.
- **Over-tuning a moving target.** If the corpus, query distribution, or embedding model changes
  frequently, a chunk config hand-tuned to last quarter's data can quietly go stale; the win
  evaporates unless the eval loop is re-run. Chunk tuning pays off on a stable corpus with a
  representative, maintained query set.[^rethinking-chunksize]
- **Recall-critical retrieval where smaller chunks fragment evidence.** For questions whose
  answer spans a long, contiguous passage (multi-paragraph procedures, legal clauses), shrinking
  chunks to save tokens can split the evidence and drop recall. Here the fix is *reranking* or
  chunk-expansion, not aggressive size reduction.[^pinecone-chunking]

[^llama-chunksize]: LlamaIndex, "Evaluating the Ideal Chunk Size for a RAG System using LlamaIndex" — <https://www.llamaindex.ai/blog/evaluating-the-ideal-chunk-size-for-a-rag-system-using-llamaindex-6207e5d3fec5>
[^llama-nodeparsers]: LlamaIndex Developer Documentation, "Node Parser Modules" — <https://developers.llamaindex.ai/python/framework/module_guides/loading/node_parsers/modules/>
[^pinecone-chunking]: Pinecone, "Chunking Strategies for LLM Applications" — <https://www.pinecone.io/learn/chunking-strategies/>
[^chroma-eval]: Chroma Research, "Evaluating Chunking Strategies for Retrieval" — <https://www.trychroma.com/research/evaluating-chunking>
[^naacl-semchunk]: Qu, Tu & Bao, "Is Semantic Chunking Worth the Computational Cost?" Findings of NAACL 2025 — <https://aclanthology.org/2025.findings-naacl.114/>
[^rethinking-chunksize]: "Rethinking Chunk Size For Long-Document Retrieval: A Multi-Dataset Analysis," arXiv:2505.21700 — <https://arxiv.org/abs/2505.21700>
[^firecrawl-chunking]: Firecrawl, "Best Chunking Strategies for RAG (and LLMs) in 2026" — <https://www.firecrawl.dev/blog/best-chunking-strategies-rag>
