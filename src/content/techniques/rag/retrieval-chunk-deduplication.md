---
title: "Retrieval-Time Chunk Deduplication"
category: rag
maturityLevel: 2
maturityProvisional: false
shortDescription: "Drop near-duplicate or heavily-overlapping retrieved chunks before they reach the LLM — by exact hash, near-duplicate (MinHash), embedding-similarity threshold, or MMR at retrieval — so you don't pay to send the same information two or three times."
effort: Medium
gain: Medium
riskToQuality: Medium
effortWhy: "A greedy embedding-threshold filter or an MMR flag is a small change; picking a safe threshold and validating answer quality is the real work."
gainWhy: "Saves context tokens proportional to how redundant retrieval already is — modest on clean corpora, large on overlap-heavy or boilerplate-heavy ones."
riskWhy: "Too-aggressive dedup can drop a chunk that looked similar but carried a distinct fact, hurting answer completeness."
detectionSignals:
  - "Retrieved context visibly repeats the same sentences or passages across multiple chunks."
  - "The same source passage is indexed in several documents and keeps co-appearing in top-K results."
  - "Chunking uses large overlap, so adjacent chunks share most of their text."
  - "Boilerplate (headers, footers, disclaimers, nav text) repeats across many retrieved pages."
  - "Effective K is lower than nominal K because several of the top hits are near-identical."
measurementMethods:
  - "Duplicate-token percentage in the assembled retrieval context (before vs. after dedup)."
  - "Retrieved input tokens per query before vs. after."
  - "Number of unique vs. total chunks retained per query."
  - "Answer quality at a fixed bar (exact-match / faithfulness eval) to confirm dedup did not drop distinct facts."
status: published
lastUpdated: "2026-07-02"
related:
  - "rag/chunking-parameter-tuning"
  - "rag/reranking-before-generation"
  - "rag/reducing-retrieved-chunk-count"
sources:
  - id: mmr-sigir98
    title: "The Use of MMR, Diversity-Based Reranking for Reordering Documents and Producing Summaries"
    publisher: "ACL Anthology (TIPSTER Phase III / SIGIR 1998)"
    authors: "Jaime Carbonell, Jade Goldstein"
    year: 1998
    url: "https://aclanthology.org/X98-1025.pdf"
    accessed: "2026-07-02"
    kind: paper
    note: "Original MMR: MMR = argmax[ λ·Sim(d,q) − (1−λ)·max Sim(d, selected) ]; introduced to reduce redundancy in reranked document sets."
  - id: langchain-mmr
    title: "maximal_marginal_relevance (utility)"
    publisher: "LangChain — Python Reference"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-mongodb/utils/maximal_marginal_relevance"
    accessed: "2026-07-02"
    kind: docs
    note: "lambda_mult is the relevance/diversity trade-off, default 0.5; 0 = maximum diversity, 1 = minimum diversity. Selects documents both relevant and diverse."
  - id: llamaindex-mmr
    title: "Simple Vector Stores — Maximum Marginal Relevance Retrieval"
    publisher: "LlamaIndex — Python Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/vector_stores/simpleindexdemommr/"
    accessed: "2026-07-02"
    kind: docs
    note: "vector_store_query_mode=\"mmr\" with mmr_threshold: close to 1 emphasizes relevance, close to 0 emphasizes diversity."
  - id: rag-semantic-dedup
    title: "RAG with Retrieval-Time Semantic Deduplication"
    publisher: "GitHub — dakshjain-1616"
    year: 2026
    url: "https://github.com/dakshjain-1616/RAG-with-Retrieval-Time-Semantic-Deduplication"
    accessed: "2026-07-02"
    kind: repo
    note: "Greedy dedup: keep highest-relevance chunk first, drop any later chunk whose cosine similarity to a kept chunk exceeds threshold (default 0.95). Claims ~30–50% fewer input tokens; warns lower thresholds risk dropping useful context."
  - id: milvus-minhash-docs
    title: "MINHASH_LSH"
    publisher: "Milvus Documentation"
    year: 2026
    url: "https://milvus.io/docs/minhash-lsh.md"
    accessed: "2026-07-02"
    kind: docs
    note: "MinHash + LSH for fast approximate near-duplicate detection; probability that signature positions match approximates Jaccard similarity. Threshold left to implementation."
  - id: milvus-minhash-blog
    title: "MinHash LSH in Milvus: The Secret Weapon for Fighting Duplicates in LLM Training Data"
    publisher: "Milvus Blog"
    year: 2026
    url: "https://milvus.io/blog/minhash-lsh-in-milvus-the-secret-weapon-for-fighting-duplicates-in-llm-training-data.md"
    accessed: "2026-07-02"
    kind: blog
    note: "Concrete params: 128 hash functions (num_perm=128), k-shingles (k=3 word-level example); banding LSH flags docs sharing any band's bucket as candidate near-duplicates."
  - id: merlin-dedup
    title: "Merlin: Deterministic Byte-Exact Deduplication for Lossless Context Optimization in LLM Inference"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/pdf/2605.09990"
    accessed: "2026-07-02"
    kind: paper
    note: "Targets duplicate passages within inference-time RAG contexts; byte-exact matching is deterministic and lossless (no risk of merging semantically-different text), unlike embedding/fuzzy dedup."
  - id: unstructured-chunking
    title: "Chunking Strategies for RAG: Best Practices and Key Methods"
    publisher: "Unstructured"
    year: 2026
    url: "https://unstructured.io/blog/chunking-for-rag-best-practices"
    accessed: "2026-07-02"
    kind: blog
    note: "Overlap reduces mid-idea cutoffs but too much overlap increases redundancy and reduces effective context capacity; treat overlap as a tunable parameter."
---

## Overview

A standard RAG pipeline retrieves the top-K chunks for a query and feeds all of them to
the model. When the knowledge base contains overlapping or repeated content, several of
those K chunks say **the same thing** — and you pay full input-token price to send that
information two or three times.[^rag-semantic-dedup] Because the LLM re-processes its
entire input on every call, redundant chunks are pure waste: they inflate the input bill,
they crowd out slots that could have held *distinct* evidence, and they can dilute the
signal the model keys on.[^rag-semantic-dedup]

Duplication in retrieved context comes from three recurring sources:

- **Chunking overlap.** A common ingestion setting slides a window with overlap so ideas
  aren't cut off at chunk boundaries — but too much overlap means adjacent chunks share
  most of their text, "increas[ing] redundancy and reduc[ing] effective context
  capacity."[^unstructured-chunking] If two overlapping neighbors both rank in the top-K,
  the shared span is sent twice.
- **The same passage indexed in multiple documents.** Boilerplate policies, quoted
  regulations, or copy-pasted sections appear verbatim across many source docs, so the
  identical passage is stored under several chunk IDs and can co-appear in one result
  set.[^merlin-dedup]
- **Repeated boilerplate across pages.** Headers, footers, disclaimers, and navigation
  text recur on every page of a corpus and get swept into many chunks.

Retrieval-time chunk deduplication removes these near-duplicates **after retrieval,
before the LLM call** — keeping the highest-ranked representative of each cluster and
dropping the rest. It sits at **Level 2**: it's a targeted retrieval-quality-and-cost
optimization whose payoff scales with how redundant your corpus already is, and it
carries a real (but manageable) quality risk if tuned too aggressively.

## Detailed Approach & Techniques

The core pattern is a **greedy filter**: sort candidates by relevance, keep the top one,
then for each subsequent chunk drop it if it is "too similar" to any already-kept
chunk.[^rag-semantic-dedup] The methods differ only in how "too similar" is measured, and
they trade precision for cost and coverage.

### Exact / hash deduplication (cheapest, safest)

Normalize whitespace and hash each chunk (or a canonicalized form); identical hashes are
exact duplicates and all but one are dropped. This is O(n), deterministic, and **lossless**
— it can never merge two genuinely different chunks, which is why a byte-exact approach is
attractive when correctness must be guaranteed.[^merlin-dedup] It catches verbatim
boilerplate and passages indexed in multiple documents, but it **misses** the more common
case where overlapping chunks are *almost* identical rather than byte-for-byte equal.

### Near-duplicate detection with MinHash / LSH

To catch *near*-duplicates cheaply at scale, MinHash reduces each chunk to a compact
signature such that "the probability that hash values align at the same positions in the
MinHash signatures of two documents provides a close approximation of the Jaccard
similarity."[^milvus-minhash-docs][^milvus-minhash-blog] Locality-sensitive hashing then
buckets similar signatures so you compare only likely matches rather than all pairs. A
typical configuration uses 128 hash functions over word-level k-shingles (e.g. k=3), and
the banding scheme flags any two chunks that share a bucket in any band as candidate
duplicates.[^milvus-minhash-blog] The **similarity threshold is not fixed** — the docs
leave it to the implementation and recommend tuning per corpus.[^milvus-minhash-docs]
MinHash is well-proven for LLM-scale corpus dedup and is character/lexical-similarity
based, so it excels at overlap and boilerplate but does not detect two paraphrases that
share few tokens.[^milvus-minhash-blog]

### Embedding cosine-similarity threshold (semantic)

Because you already computed query and chunk embeddings for retrieval, you can reuse them:
compute pairwise cosine similarity among the retrieved chunks and, greedily from the
highest-relevance chunk, discard any chunk whose similarity to an already-kept chunk
exceeds a threshold.[^rag-semantic-dedup] A reference implementation defaults to a
**0.95** cosine cutoff — deliberately conservative, "remov[ing] highly redundant chunks"
— and reports collapsing "10 chunks, many near-identical" down to "6–7 diverse, unique
chunks" for roughly **30–50% fewer input tokens.**[^rag-semantic-dedup] Semantic dedup
catches paraphrases that lexical hashing misses, at the cost of an O(K²) similarity pass
over the (small) retrieved set — negligible next to the LLM call.

### MMR (Maximal Marginal Relevance) at retrieval

MMR folds diversity into the ranking step itself rather than filtering afterward. The
original 1998 formulation selects each next document to maximize
`λ·Sim(d, query) − (1−λ)·max Sim(d, already-selected)` — that is, relevance to the query
minus a penalty for redundancy with what's already picked.[^mmr-sigir98] Both LangChain
and LlamaIndex ship it as a drop-in retrieval mode. In LangChain a `lambda_mult`
parameter (default **0.5**) tunes the trade-off, where **0 = maximum diversity** and
**1 = minimum diversity** (pure relevance).[^langchain-mmr] LlamaIndex exposes the same
knob as `mmr_threshold` via `vector_store_query_mode="mmr"`, where values near 1 emphasize
relevance and values near 0 emphasize diversity.[^llamaindex-mmr] MMR is the lowest-effort
option when your stack already supports it — a one-flag change — but it is a *soft*
diversity nudge, not a hard duplicate remover, so exact/near-dup filtering is still worth
layering on for verbatim repeats.

### Choosing and layering

A robust pipeline layers cheap-to-expensive: exact hash first (free, lossless), then
either MinHash near-dup or an embedding-threshold pass for the fuzzy cases, optionally with
MMR at retrieval to reduce redundancy up front. Whatever the method, **start with a
conservative (high) threshold and only loosen it if redundancy persists**, because lower
thresholds "increase token savings but risk dropping genuinely useful
context."[^rag-semantic-dedup] Dedup composes naturally with reranking and with reducing K:
dedup first, then rerank the survivors, so the final K slots hold distinct, high-value
evidence.

## Example Where It Works

A compliance assistant answers questions over a library of contracts and policy PDFs.
The same standard clauses (data-protection boilerplate, liability language) are pasted
verbatim into dozens of documents, and ingestion used a large overlap so adjacent chunks
share most of their text.[^unstructured-chunking] For a typical query the retriever
returns K=10 chunks, but 4 of them are near-copies of the same clause.

- **Without dedup:** ~10 chunks of context, roughly 40% of which is repeated text; the
  model sees the same clause four times and the effective K is really ~6.
- **With an embedding-threshold dedup pass (cosine ≥ 0.95):** the four near-copies collapse
  to one representative, leaving ~6–7 distinct chunks — about **30–50% fewer input
  tokens** on the retrieval block, with the freed slots now available for genuinely
  different evidence, and answer quality held or improved because the signal is
  less diluted.[^rag-semantic-dedup]

This is the sweet spot: an overlap-heavy, boilerplate-heavy corpus where duplication is a
large fraction of retrieved tokens, so a small filter recovers real savings on every query.

## Example Where It Would NOT Work

- **Clean, low-redundancy corpus.** If chunking used little/no overlap and documents don't
  share passages, retrieved chunks are already distinct — dedup finds almost nothing to
  drop and only adds a similarity pass. The token savings track how redundant retrieval
  actually is; on a clean corpus that's near zero.[^unstructured-chunking]
- **Similar-but-distinct chunks (the core risk).** In dense technical or legal text, two
  chunks can be lexically or semantically very close yet carry *different* load-bearing
  facts (e.g. two subsections that differ only in a threshold value or an exception). An
  over-aggressive threshold treats them as duplicates and drops one, silently removing the
  fact the answer needed — "lower values… risk dropping genuinely useful
  context."[^rag-semantic-dedup] Here byte-exact dedup is safer than fuzzy/semantic dedup
  because it is lossless and will never merge two different chunks.[^merlin-dedup]
- **Diversity is the point.** For "summarize all distinct positions" or multi-perspective
  queries, MMR's diversity bias helps, but hard duplicate-dropping can prune legitimately
  repeated-but-independent corroborating sources you actually wanted to count.[^mmr-sigir98]
- **Tiny K where cost is trivial.** If you already retrieve only 2–3 short chunks, the
  absolute token savings are small and the added complexity plus quality risk rarely pays
  off — reducing K or reranking is the better lever.

[^mmr-sigir98]: Carbonell & Goldstein, "The Use of MMR, Diversity-Based Reranking…," 1998 — <https://aclanthology.org/X98-1025.pdf>
[^langchain-mmr]: LangChain Python Reference, "maximal_marginal_relevance" — <https://reference.langchain.com/python/langchain-mongodb/utils/maximal_marginal_relevance>
[^llamaindex-mmr]: LlamaIndex Docs, "Maximum Marginal Relevance Retrieval" — <https://developers.llamaindex.ai/python/examples/vector_stores/simpleindexdemommr/>
[^rag-semantic-dedup]: dakshjain-1616, "RAG with Retrieval-Time Semantic Deduplication," GitHub — <https://github.com/dakshjain-1616/RAG-with-Retrieval-Time-Semantic-Deduplication>
[^milvus-minhash-docs]: Milvus Documentation, "MINHASH_LSH" — <https://milvus.io/docs/minhash-lsh.md>
[^milvus-minhash-blog]: Milvus Blog, "MinHash LSH in Milvus… LLM Training Data" — <https://milvus.io/blog/minhash-lsh-in-milvus-the-secret-weapon-for-fighting-duplicates-in-llm-training-data.md>
[^merlin-dedup]: "Merlin: Deterministic Byte-Exact Deduplication for Lossless Context Optimization in LLM Inference," arXiv — <https://arxiv.org/pdf/2605.09990>
[^unstructured-chunking]: Unstructured, "Chunking Strategies for RAG: Best Practices and Key Methods" — <https://unstructured.io/blog/chunking-for-rag-best-practices>
