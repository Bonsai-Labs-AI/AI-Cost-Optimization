---
title: "Contextual Compression"
category: rag
maturityLevel: 4
maturityProvisional: false
shortDescription: "Compress retrieved context conditioned on the query — keeping only the query-relevant spans (extractive) or rewriting chunks to the query (abstractive) — before it reaches the expensive generator, cutting generation-context tokens beyond what reranking or dedup achieve."
effort: High
gain: Medium
riskToQuality: High
detectionSignals:
  - "Large retrieved context is sent whole to the generator, and generation input tokens dominate the RAG bill."
  - "Reranking and deduplication are already applied but each retrieved chunk still carries mostly query-irrelevant filler."
  - "You cannot prefix-cache the retrieved context (it changes per query) and input tokens are not cheap on your model/provider."
  - "Answer quality is degrading from 'lost in the middle' — the model is distracted by irrelevant passages, not just paying for them."
measurementMethods:
  - "Generation-context tokens per query before vs. after compression (the tokens that actually reach the generator)."
  - "Answer quality held at a fixed bar (EM/F1 or an LLM-judge eval suite) — compression must not drop it."
  - "Compressor cost + added latency vs. generator savings: net $/query and net p95 latency, not just the token cut."
  - "Compression ratio (compressed tokens ÷ retrieved tokens) at the quality bar, tracked per query type."
status: published
lastUpdated: "2026-07-03"
related:
  - "rag/reranking-before-generation"
  - "rag/retrieval-chunk-deduplication"
  - "rag/hierarchical-retrieval"
  - "prompt-context/learned-prompt-compression"
sources:
  - id: recomp
    title: "RECOMP: Improving Retrieval-Augmented LMs with Compression and Selective Augmentation"
    publisher: "arXiv (ICLR 2024)"
    authors: "Fangyuan Xu, Weijia Shi, Eunsol Choi"
    year: 2023
    url: "https://arxiv.org/abs/2310.04408"
    accessed: "2026-07-03"
    kind: paper
    note: "Proposes an extractive compressor (selects useful sentences via a contrastively-trained encoder) and an abstractive compressor (a T5-based model distilled from an LLM that writes a query-conditioned summary). Achieves compression rates as low as 6% of the original retrieved text with minimal loss in language-modeling and open-domain QA performance; summaries stay largely faithful to the sources."
  - id: provence
    title: "Provence: efficient and robust context pruning for retrieval-augmented generation"
    publisher: "arXiv (ICLR 2025)"
    authors: "Nadezhda Chirkova, Thibault Formal, Vassilina Nikoulina, Stéphane Clinchant"
    year: 2025
    url: "https://arxiv.org/abs/2501.16214"
    accessed: "2026-07-03"
    kind: paper
    note: "Casts context pruning as sequence labeling over a DeBERTa-based reranker: a linear head emits per-token keep/drop masks so pruning and reranking happen in one forward pass, adding negligible-to-no cost to a standard RAG pipeline. Detects the needed pruning amount per query (adaptive ratio) with negligible-to-no drop in performance across domains."
  - id: langchain-ccr
    title: "Improving Document Retrieval with Contextual Compression"
    publisher: "LangChain Blog"
    year: 2023
    url: "https://www.langchain.com/blog/improving-document-retrieval-with-contextual-compression"
    accessed: "2026-07-03"
    kind: docs
    note: "The ContextualCompressionRetriever wraps a base retriever with a DocumentCompressor that runs compress_documents(documents, query) — compressing retrieved docs using the query context so only relevant info returns. LLMChainExtractor makes one LLM call per document to extract query-relevant statements; EmbeddingsFilter is the cheaper embedding-similarity alternative. Motivation: irrelevant retrieved text distracts the LLM and wastes context space."
  - id: longllmlingua
    title: "LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression"
    publisher: "arXiv (ACL 2024)"
    authors: "Huiqiang Jiang, Qianhui Wu, Xufang Luo, Dongsheng Li, Chin-Yew Lin, Yuqing Yang, Lili Qiu"
    year: 2023
    url: "https://arxiv.org/abs/2310.06839"
    accessed: "2026-07-03"
    kind: paper
    note: "Query-aware prompt compression for long-context RAG. Up to ~4x compression (using ~1/4 of the original tokens) with up to 21.4% performance boost on NaturalQuestions (GPT-3.5-Turbo); reports up to 94.0% cost reduction on LooGLE and 1.4x–2.6x end-to-end latency speedup at 2x–6x compression on ~10k-token prompts."
  - id: llmlingua-repo
    title: "microsoft/LLMLingua"
    publisher: "GitHub — Microsoft (EMNLP'23 / ACL'24)"
    year: 2024
    url: "https://github.com/microsoft/LLMLingua"
    accessed: "2026-07-03"
    kind: repo
    note: "A small compressor LM (e.g. GPT-2-small or LLaMA-7B) scores token importance and drops low-information tokens, achieving up to 20x compression with minimal performance loss. LongLLMLingua is the query-aware RAG/long-context variant; LLMLingua-2 distills from GPT-4 for 3x-6x speedup. No target-LLM training required."
  - id: fixed-compression-bench
    title: "Fixed RAG Compression Collapses Measured Reader Scaling"
    publisher: "arXiv"
    authors: "Sugam Panthi, Rabab Abdelfattah"
    year: 2026
    url: "https://arxiv.org/abs/2606.21807"
    accessed: "2026-07-03"
    kind: benchmark
    note: "Fixed compression ratios help weak reader models (by removing noise they can't filter) but harm strong ones (by dropping details they would use): compression gain decreases with reader baseline. A fixed HotpotQA compressor masked 80% of the gain from a Qwen-7B→GPT-4.1-mini upgrade, and generic summarization flipped 31% of model rankings — evidence that compression must be re-tuned per reader model and can be net-negative on capable generators."
  - id: cc-survey
    title: "Contextual Compression in Retrieval-Augmented Generation for Large Language Models: A Survey"
    publisher: "arXiv"
    authors: "Sourav Verma"
    year: 2024
    url: "https://arxiv.org/abs/2409.13385"
    accessed: "2026-07-03"
    kind: paper
    note: "Surveys the field; frames compression as addressing the limited context window, irrelevant retrieved information, and the high processing overhead of feeding extensive context to the generator."
---

## Overview

In a RAG pipeline, retrieval hands the generator a set of chunks that are *relevant
enough to have been retrieved* but are rarely *all signal*. A retrieved passage may be
a 400-token chunk in which two sentences answer the query and the rest is boilerplate,
navigation text, or adjacent-but-off-topic prose. Feed the whole set to the model and
you pay generation-input price for every one of those wasted tokens — and, worse, the
filler can bury the answer ("lost in the middle") and degrade quality.[^cc-survey]

**Contextual compression** attacks that waste by shrinking the retrieved context
**conditioned on the query** before it reaches the expensive generator. Two families:

- **Extractive** — keep only the query-relevant sentences/spans and drop the rest
  (RECOMP's extractive compressor, Provence's per-token pruning, LangChain's
  `LLMChainExtractor`).[^recomp][^provence][^langchain-ccr]
- **Abstractive** — a small model *rewrites* the retrieved chunks into a short,
  query-focused summary (RECOMP's abstractive compressor).[^recomp]

The cost mechanism is direct: only the compressed, query-relevant slice is sent to the
generator, so you pay for fewer generation-input tokens **at held answer quality**.
Reported compression is large — RECOMP reaches as low as **6% of the original text**
with minimal accuracy loss, and query-aware token compression (LongLLMLingua) runs at
roughly **4x** (about one-quarter of the tokens) while *improving* NaturalQuestions
accuracy by up to 21.4%.[^recomp][^longllmlingua]

The reason this sits at **Level 4** rather than alongside L2 reranking is the caveat
that runs through the rest of this page: compression is **an extra model call with its
own cost and latency**, and it competes against two things that are often cheaper —
cheap long-context input (especially when the context prefix-caches) and plain L2
reranking. It is a real win only in a specific regime, and it is genuinely net-negative
outside it.

## Detailed Approach & Techniques

### It is query-*conditioned*, not query-agnostic

The distinction that defines the technique: contextual compression decides what to keep
**using the query**. LangChain frames it exactly this way — "compress them using the
context of the given query, so that only the relevant information is
returned."[^langchain-ccr] This is different from **learned prompt compression** of the
query-agnostic kind — e.g. base LLMLingua dropping low-information tokens from *any*
prompt by importance score, independent of a question.[^llmlingua-repo] The RAG-tuned
variant closes that gap: **LongLLMLingua** adds *query-aware* compression, keeping tokens
relevant to the specific question and reorganizing to fight "lost in the
middle."[^longllmlingua] Treat query-agnostic token-dropping as the sibling
`learned-prompt-compression` technique; this page is the query-conditioned case.

### Extractive compressors

Extractive methods select spans and are typically the cheaper, safer choice because they
never hallucinate — they only delete.

- **RECOMP (extractive).** Trains an encoder contrastively so that sentences useful for
  the query score high, then keeps the top spans; reported down to **6%** of the original
  text with minimal QA/LM loss.[^recomp]
- **Provence.** Casts pruning as **sequence labeling** on top of a DeBERTa reranker: a
  linear head emits per-token keep/drop masks, so **reranking and pruning happen in one
  forward pass**. It detects *how much* to prune per query (adaptive ratio) and adds
  **negligible-to-no cost** to a standard RAG pipeline — which is why it is the most
  cost-defensible option: you were going to run a reranker anyway, and pruning rides along
  for free.[^provence]
- **LangChain `LLMChainExtractor`.** Makes **one LLM call per retrieved document** to
  extract the query-relevant statements. This is the naïve, expensive end: the compressor
  cost scales with the number of chunks and can rival the generation you were trying to
  cheapen. `EmbeddingsFilter` is the cheap alternative — embed docs + query and drop the
  dissimilar ones — but it filters whole chunks rather than trimming within
  them.[^langchain-ccr]

### Abstractive compressors

- **RECOMP (abstractive).** A T5-based sequence-to-sequence model **distilled from an
  LLM** writes a query-conditioned summary that synthesizes across multiple retrieved
  documents.[^recomp] Abstractive methods can compress harder than extractive ones (they
  fuse and paraphrase) but introduce a **rewrite failure mode**: the summarizer can drop a
  needed detail or subtly distort it, which is why `riskToQuality` here is High, not
  Medium.

### The cost/latency accounting that decides it

The compressor is a **second model in the request path**. The honest ledger is:

> **net saving = (generator tokens removed × generator input price) − (compressor cost) − (compressor latency, priced as it hurts you)**

- **Provence / a per-token pruning head** ≈ free rider on the reranker → the ledger is
  almost always positive when there is filler to cut.[^provence]
- **Small distilled compressor (RECOMP-style, LongLLMLingua)** → cheap enough that the
  4x–16x token cut on a *frontier* generator clears it easily; LongLLMLingua reports up to
  **94% end-to-end cost reduction** on LooGLE plus a **1.4x–2.6x latency speedup**,
  because compressing *shortens* the generator's prefill.[^longllmlingua]
- **`LLMChainExtractor` on a large model, one call per chunk** → the ledger can go
  **negative**: you may spend as much compressing as you saved generating.[^langchain-ccr]

### The L4 caveat: when compression does NOT pay

Three conditions each kill the ROI:

1. **Cheap or cached input.** If the generator's input tokens are cheap, or the retrieved
   context **prefix-caches** (reused across queries at ~0.1x input price on major
   providers), then plain long-context is already near-free and the compressor is pure
   added cost + latency. Contextual compression fights caching directly: the whole point
   of the compressor is to make the context *query-specific*, which is exactly what
   *breaks* a shared cacheable prefix.
2. **L2 reranking already suffices.** If dropping whole low-ranked chunks
   (`reranking-before-generation`) or removing duplicates
   (`retrieval-chunk-deduplication`) gets the context small enough, do that first — it is
   an L2 technique with no per-query generative compressor to feed.
3. **A capable generator that uses the detail.** A 2026 benchmark shows **fixed**
   compression helps weak readers (removing noise they can't filter) but **harms strong
   ones** (dropping details they would use): compression gain *decreases* as the reader
   improves. A fixed HotpotQA compressor **masked 80%** of a Qwen-7B→GPT-4.1-mini upgrade,
   and generic summarization **flipped 31% of model rankings**.[^fixed-compression-bench]
   So a compressor tuned once and left alone can silently cap the quality of your best
   model — you must re-validate it per generator, which is part of why this is a
   maintained L4 system, not a config flag.

### The scale gate

Contextual compression turns ROI-positive when **all** of: generation-input tokens
dominate RAG cost, the context is **not** prefix-cacheable (changes per query), reranking
alone leaves too much filler, and you run enough volume to amortize building + maintaining
+ re-validating the compressor. Below that — low volume, cheap/cached input, or a task L2
reranking already handles — prefer `reranking-before-generation` and
`retrieval-chunk-deduplication` (L2) or `hierarchical-retrieval` (L3).

## Example Where It Works

A legal-research assistant answers narrow questions over a corpus where the top-k
retrieval routinely returns **8 chunks of ~500 tokens (~4,000 tokens)**, of which maybe
600 tokens actually bear on any given query. The context is **different for every query**
(so it never prefix-caches) and the generator is a frontier model billed at a premium
input rate — generation input is the dominant line item, and volume is high and steady.

- **Without compression:** ~4,000 context tokens per query hit the expensive generator,
  most of it filler that also risks burying the answer.
- **With a Provence-style pruning head** riding on the reranker they already run: pruning
  is essentially free (one forward pass, sequence-labeling mask) and adaptively keeps only
  the query-relevant sentences.[^provence] Context shrinks toward the ~600 relevant
  tokens — an **~80%+ cut in generation-input tokens at held answer quality**, plus a
  faster prefill. Because the compressor is nearly free and the removed tokens were priced
  at the frontier rate, the ledger is strongly positive. A distilled RECOMP/LongLLMLingua
  compressor would push the ratio further (down toward RECOMP's 6% / LongLLMLingua's ~4x)
  with a small extra compressor cost that the frontier-rate savings still
  clears.[^recomp][^longllmlingua]

## Example Where It Would NOT Work

A support-doc assistant runs on a **cheap long-context model** and serves a **stable set
of product manuals** as its retrieved context. Because the manuals rarely change, the
context is placed as a shared prefix and **prefix-caches** at ~0.1x input price across
almost every query.

- **Adding contextual compression here backfires twice.** First, input is already cheap
  *and* mostly cached, so the tokens the compressor would remove cost almost nothing to
  begin with — there is little to save. Second, making the context query-specific
  **destroys the cacheable prefix**, so you *lose* the 90% caching discount you had, then
  *add* a per-query compressor call and its latency on top. Net cost goes up.
- **A capable generator makes it worse still.** If the reader is strong, a fixed
  compressor risks dropping details it would have used — the exact "compression gain
  decreases with reader baseline" failure, where a compressor masks up to 80% of a
  model-upgrade's gains.[^fixed-compression-bench] Here the right levers are the L2 ones:
  `reranking-before-generation` to drop clearly-off-topic chunks and
  `retrieval-chunk-deduplication` to remove overlap — cutting context **without** a
  per-query generative compressor and **without** breaking the cache.

[^recomp]: Xu, Shi & Choi, "RECOMP: Improving Retrieval-Augmented LMs with Compression and Selective Augmentation," arXiv (ICLR 2024) — <https://arxiv.org/abs/2310.04408>
[^provence]: Chirkova et al., "Provence: efficient and robust context pruning for retrieval-augmented generation," arXiv (ICLR 2025) — <https://arxiv.org/abs/2501.16214>
[^langchain-ccr]: LangChain Blog, "Improving Document Retrieval with Contextual Compression," 2023 — <https://www.langchain.com/blog/improving-document-retrieval-with-contextual-compression>
[^longllmlingua]: Jiang et al., "LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression," arXiv (ACL 2024) — <https://arxiv.org/abs/2310.06839>
[^llmlingua-repo]: Microsoft, "microsoft/LLMLingua" (EMNLP'23 / ACL'24) — <https://github.com/microsoft/LLMLingua>
[^fixed-compression-bench]: Panthi & Abdelfattah, "Fixed RAG Compression Collapses Measured Reader Scaling," arXiv, 2026 — <https://arxiv.org/abs/2606.21807>
[^cc-survey]: Verma, "Contextual Compression in Retrieval-Augmented Generation for Large Language Models: A Survey," arXiv, 2024 — <https://arxiv.org/abs/2409.13385>
