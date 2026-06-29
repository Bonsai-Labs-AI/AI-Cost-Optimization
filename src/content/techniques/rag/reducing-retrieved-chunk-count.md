---
title: "Reducing Retrieved Chunk Count"
category: rag
maturityLevel: 1
maturityProvisional: false
shortDescription: "Lower the number of retrieved chunks (top-k) passed to the generator so the prompt is dominated by the answer's evidence, not defensive over-fetch — the single highest-ROI cost lever in a RAG pipeline."
effort: Low
gain: High
riskToQuality: Medium
effortWhy: "Lowering top-k is a configuration change plus one rerank call, so the implementation effort is low."
gainWhy: "Retrieved context is often ~74% of input and most apps over-fetch 3–5x, making top-k the single highest-ROI cost lever in RAG."
riskWhy: "Cut k too far and you drop the chunk holding the answer, so recall must be protected with reranking — a medium quality risk."
detectionSignals:
  - "Untuned high top-k — k is fixed at 10–20 'to be safe' and has never been tuned against an eval set."
  - "Context dwarfs question — retrieved chunks dominate the prompt, outweighing the question by one to two orders of magnitude in tokens."
  - "Unused chunks — many retrieved chunks are never cited in the answer and relevance scores fall off a cliff after the first few hits."
  - "Cost scales with k — input-token spend per query is high and grows linearly with k while answer quality is flat or declining."
measurementMethods:
  - "Chunks per query — average chunks (and retrieved-context tokens) passed to the generator per query."
  - "Quality-vs-k curve — answer faithfulness/correctness on an eval set plotted against k to find the knee of the curve."
  - "Input cost per query — measured before vs. after lowering k (and after adding a reranker to protect recall)."
  - "Context token share — share of input tokens that are retrieved context vs. system prompt + question."
status: published
lastUpdated: "2026-06-29"
related:
  - "rag/reranking-before-generation"
  - "rag/retrieval-chunk-deduplication"
  - "rag/metadata-filtering"
sources:
  - id: lost-in-middle
    title: "Lost in the Middle: How Language Models Use Long Contexts"
    publisher: "Transactions of the ACL (arXiv:2307.03172)"
    authors: "Liu, Lin, Hewitt, Paranjape, Bevilacqua, Petroni, Liang"
    year: 2023
    url: "https://arxiv.org/abs/2307.03172"
    accessed: "2026-06-29"
    kind: paper
    note: "Performance is highest when relevant information is at the start or end of the context and degrades significantly in the middle; performance also drops as the number of retrieved documents grows. The core evidence that more chunks can hurt, not just cost more."
  - id: databricks-longctx
    title: "Long Context RAG Performance of LLMs"
    publisher: "Databricks Blog"
    year: 2024
    url: "https://www.databricks.com/blog/long-context-rag-performance-llms"
    accessed: "2026-06-29"
    kind: benchmark
    note: "Answer quality follows an inverted-U vs. context length: it rises then degrades after a model-specific peak (e.g. ~16–32k tokens for several models). 'Longer context is not always optimal for RAG.'"
  - id: pinecone-rerank
    title: "Rerankers and Two-Stage Retrieval"
    publisher: "Pinecone — Learn"
    year: 2024
    url: "https://www.pinecone.io/learn/series/rag/rerankers/"
    accessed: "2026-06-29"
    kind: docs
    note: "'LLM recall degrades as we put more tokens in the context window' and models become less likely to follow instructions. Two-stage pattern: retrieve many (e.g. top-25), rerank, keep few (e.g. top-3). Retrieval needs breadth; LLM recall needs brevity."
  - id: cohere-rerank
    title: "Learn How Cohere's Rerank Models Work"
    publisher: "Cohere Docs"
    year: 2026
    url: "https://docs.cohere.com/page/rerank-demo"
    accessed: "2026-06-29"
    kind: docs
    note: "Retrieve top-100 with lexical/semantic search, then score each with the relevance endpoint and return the top_n — the 'retrieve wide, rerank, keep few' enabler that makes a low top-k safe."
  - id: tokencompany-rag
    title: "Why Your RAG App's Token Bill Is So High (And How to Fix It)"
    publisher: "The Token Company"
    year: 2026
    url: "https://thetokencompany.com/blog/why-rag-token-costs-are-high"
    accessed: "2026-06-29"
    kind: blog
    note: "Worked numbers: top-k=5 × 500-token chunks = 2,500 tokens of context = 74% of a 3,400-token input. Most RAG apps over-fetch 3–5×; at 100k queries/day on Sonnet, retrieved context alone is ~$22,500/month."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Claude Sonnet input is $3 / MTok; output $15 / MTok. Used to anchor the per-query cost arithmetic of retrieved-context tokens."
---

## Overview

In a Retrieval-Augmented Generation pipeline the retriever fetches the top **k** chunks for a
query and the generator is then prompted with all of them plus the question. The cost problem
is structural: **the retrieved context dwarfs the question.** A standard setup — `top_k = 5`
with ~500-token chunks — already injects **2,500 tokens of context** to answer a ~100-token
question; with an 800-token system prompt that retrieved context is roughly **74% of the
input** on every call.[^tokencompany-rag] At `top_k = 10` or `20` (a defensive default many
teams never revisit) the context outweighs the question by **one to two orders of magnitude**
in tokens, and because input is the only thing growing, query cost scales almost linearly with
k.

That makes **lowering top-k the single highest-ROI cost lever in RAG.** Most RAG applications
over-fetch by **3–5×** relative to what the model meaningfully uses, so the easy fraction of
those tokens can simply be removed.[^tokencompany-rag] On a workload of 100,000 queries/day on
a mid-tier model (~$3 / MTok input), the retrieved-context portion of the bill is on the order
of **$22,500/month** — cutting k from 10 to 4 cuts that line item by roughly **60%**, with the
rest of the prompt untouched.[^tokencompany-rag][^anthropic-pricing]

The catch — and why this sits at **Level 1** with **Medium** quality risk rather than Low — is
that k is not free to lower: cut it too far and you drop the chunk that held the answer. The
discipline is to lower k **safely**, which is what the rest of this page is about. The headline
is that smaller is usually *also better*, not just cheaper: model accuracy degrades as you stuff
more chunks in, so over-fetching pays twice — once at the meter and once in answer quality.[^pinecone-rerank][^lost-in-middle]

## Detailed Approach & Techniques

### Why fewer chunks often *improves* quality

The intuition that "more retrieved context can't hurt" is wrong on current models. Two
well-established effects make a bloated context actively worse:

- **Lost in the middle.** Models use the *beginning* and *end* of their context far better than
  the *middle*; accuracy "significantly degrades when models must access relevant information in
  the middle of long contexts," and it also drops as the number of retrieved documents grows.[^lost-in-middle]
  Every extra chunk you add pushes the real evidence deeper into the low-attention middle.
- **Distraction / instruction drift.** "LLM recall degrades as we put more tokens in the context
  window," and models "become less likely to follow instructions as we stuff the context
  window."[^pinecone-rerank] Irrelevant-but-plausible chunks act as distractors that can flip a
  correct answer to a wrong one.

Empirically the curve is an **inverted U**: answer quality rises as the first few relevant
chunks arrive, peaks at a model-specific context size, then *degrades* — Databricks measured
peaks around 16–32k tokens for several models, concluding bluntly that "longer context is not
always optimal for RAG."[^databricks-longctx] So the goal is to find the **knee of the
quality-vs-k curve**, which is usually a small number, and stop there.

### The enabler: retrieve wide, rerank, keep few

You cannot just set `top_k = 3` on a raw vector search and hope — the answer chunk is often
ranked 7th by a cheap embedding similarity. The safe way to run a *low* final k is a **two-stage
retrieval** pattern, which is why this technique is tightly coupled to *reranking*:

1. **Retrieve wide for recall.** Pull a large candidate set (e.g. 25–100) with fast vector /
   hybrid search. Breadth here is cheap — those candidates never reach the LLM.[^pinecone-rerank][^cohere-rerank]
2. **Rerank for precision.** Score every candidate against the query with a cross-encoder or a
   rerank API, which is far more accurate than embedding cosine similarity.[^cohere-rerank]
3. **Keep few.** Pass only the **top 3–5** reranked chunks to the generator.

This resolves the core tension cleanly: "retrieval recall requires breadth, but LLM recall
requires brevity."[^pinecone-rerank] Reranking lets you *raise* recall in stage one while
*lowering* the count that hits the (expensive, attention-limited) generation step. See
**Reranking Before Generation** for the reranker itself.

### Other ways to make a low k safe

- **Deduplicate first.** Overlapping or near-duplicate chunks waste slots and tokens; removing
  them lets a small k carry more distinct evidence. See **Retrieval Chunk Deduplication**.
- **Filter before you search.** Pre-filtering the candidate set by metadata (tenant, recency,
  doc-type) removes irrelevant chunks before they can crowd the top-k. See **Metadata
  Filtering**.
- **Tune k against an eval set, per query type.** Plot faithfulness/correctness against k and
  pick the knee. Ablations repeatedly land in the **k ≈ 3–5** range, with accuracy *declining*
  beyond it as distractors creep in.[^databricks-longctx][^lost-in-middle] Simple factoid queries
  may be safe at k=3; complex queries may need more (see below).
- **Consider a token budget instead of a fixed k.** Rather than a constant k, fill a fixed
  token budget with the highest relevance-per-token chunks — dense queries get more, simple ones
  get fewer.

### Measuring the win

Track **average chunks/tokens passed to generation**, **input cost per query**, and the
**quality-vs-k curve** together. The right outcome is fewer tokens at equal or better quality;
if quality dips, you cut past the knee — add the reranker or step k back up by one.

## Example Where It Works

A SaaS knowledge-base assistant answers product questions over a help-center corpus. The team
shipped with `top_k = 12` "to be safe," so every query sends ~6,000 tokens of retrieved context
around a ~80-token question — context is **~95% of the input**. Inspecting traces, only the top
**2–4** chunks are ever cited in the answer; the rest are unused filler sitting in the
low-attention middle of the prompt.[^lost-in-middle][^tokencompany-rag]

The fix is a textbook two-stage retrieval: keep wide recall by retrieving **40** candidates,
add a reranker, and pass only the **top 4** to the generator.[^pinecone-rerank][^cohere-rerank]
Retrieved-context tokens drop from ~6,000 to ~2,000 — a **~65–70% cut** in the context portion
of input — and on an eval set faithfulness actually **ticks up**, because the answer evidence is
no longer buried behind eight distractor chunks.[^lost-in-middle][^databricks-longctx] At their
volume on a mid-tier model, that is a four-to-five-figure monthly saving from a configuration
change plus one rerank call, with quality moving the *right* direction.[^tokencompany-rag][^anthropic-pricing]

## Example Where It Would NOT Work

- **Multi-fact / multi-hop and long-tail queries.** Questions that must synthesize evidence from
  many distinct documents ("compare the SLA terms across all five vendor contracts") genuinely
  need more chunks; cutting k starves recall and the answer becomes incomplete. Here the lever is
  *better selection* (reranking, dedup, query decomposition), not a lower k — and you should let
  the eval set, not a global constant, set k per query class.[^databricks-longctx]
- **No reranker and a weak retriever.** If embeddings alone routinely rank the answer chunk 6th
  or 8th, simply forcing `top_k = 3` will drop correct answers. Low-k is only safe *once the
  retrieve-wide-then-rerank stage exists*; do that first.[^pinecone-rerank][^cohere-rerank]
- **Already-lean retrieval.** A pipeline that retrieves a handful of large, well-deduplicated
  chunks has little defensive over-fetch to remove; the win has mostly been taken, and pushing k
  lower trades quality for marginal savings. Target **output**-side or **caching** levers instead.
- **Tiny / low-volume workloads.** When the corpus is small and query volume is light, the
  context tokens are cheap in absolute terms and the effort to tune k and stand up a reranker may
  not be worth it — though the *quality* benefit of fewer distractors can still justify it.

[^lost-in-middle]: Liu et al., "Lost in the Middle: How Language Models Use Long Contexts," TACL / arXiv:2307.03172 — <https://arxiv.org/abs/2307.03172>
[^databricks-longctx]: Databricks, "Long Context RAG Performance of LLMs" — <https://www.databricks.com/blog/long-context-rag-performance-llms>
[^pinecone-rerank]: Pinecone, "Rerankers and Two-Stage Retrieval" — <https://www.pinecone.io/learn/series/rag/rerankers/>
[^cohere-rerank]: Cohere Docs, "Learn How Cohere's Rerank Models Work" — <https://docs.cohere.com/page/rerank-demo>
[^tokencompany-rag]: The Token Company, "Why Your RAG App's Token Bill Is So High (And How to Fix It)" — <https://thetokencompany.com/blog/why-rag-token-costs-are-high>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
