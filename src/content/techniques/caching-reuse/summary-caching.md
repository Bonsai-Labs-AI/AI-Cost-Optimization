---
title: "Summary Caching"
category: caching-reuse
maturityLevel: 2
maturityProvisional: false
shortDescription: "Summarize a document or conversation once, cache the summary, and reuse it in place of the full text on later calls — paying the summarization cost once instead of re-sending or re-summarizing the full content every time."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "The same long document (contract, spec, transcript, knowledge-base article) is re-sent full-text across many separate queries."
  - "Conversation or agent history is re-sent verbatim every turn instead of being compacted into a rolling summary."
  - "A RAG pipeline re-summarizes the same retrieved chunks on every request that touches them."
  - "Input tokens grow with document length and conversation length, and the same content is paid for repeatedly."
measurementMethods:
  - "Input tokens per call on reused content, before vs. after (full text vs. cached summary)."
  - "Reuse count per cached summary (how many calls a single summarization amortizes across)."
  - "Summarization cost ($ and tokens) vs. cumulative full-text cost avoided — the break-even ratio."
  - "Task quality held at bar on a golden set when the summary replaces full text (detail-loss regression check)."
status: published
lastUpdated: "2026-07-02"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/exact-response-caching"
  - "prompt-context/provider-native-context-management"
sources:
  - id: anthropic-compaction
    title: "Compaction"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/compaction"
    accessed: "2026-07-02"
    kind: docs
    note: "Server-side compaction auto-summarizes older conversation context at a token threshold (default 150,000 input tokens, minimum 50,000), creates a compaction block, and drops prior content blocks on subsequent requests."
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-02"
    kind: docs
    note: "Tool-result clearing example: 70,000 input tokens reduced to 25,000 (a 64% reduction) by clearing old tool results."
  - id: anthropic-memory
    title: "Memory tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool"
    accessed: "2026-07-02"
    kind: docs
    note: "Client-side memory files persist information outside the context window; pairs with compaction so critical detail survives summarization."
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Compaction = summarize a conversation near the context limit and reinitiate with the summary. Summarization is inherently lossy; overly aggressive compaction loses subtle-but-critical context. Prefer raw history, then compaction, then summarization."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Per-MTok input/output rates used for break-even math (e.g. Haiku 4.5 $1 in / $5 out; Sonnet 5 $2 in / $10 out; a cache hit is 0.1x input)."
  - id: ragie-doc-summary
    title: "Advanced RAG with Document Summarization"
    publisher: "Ragie — Blog"
    year: 2026
    url: "https://www.ragie.ai/blog/advanced-rag-with-document-summarization"
    accessed: "2026-07-02"
    kind: blog
    note: "Condense each document into a single summary (~one-tenth the original length) once, index it, and reuse it across all subsequent queries instead of re-summarizing per request."
  - id: n1n-rag-caching
    title: "Beyond Prompt Caching: 5 More Things You Should Cache in RAG Pipelines"
    publisher: "n1n.ai — Blog"
    year: 2026
    url: "https://explore.n1n.ai/blog/beyond-prompt-caching-rag-pipeline-optimization-2026-03-21"
    accessed: "2026-07-02"
    kind: blog
    note: "Cache summarized chunks keyed by a content hash (content-addressable storage): chunks are static until the source changes, so summaries are static — summarize once, reuse many, invalidate on content change."
---

## Overview

A large share of AI spend is paying, over and over, to shovel the *same long text*
through the model: a 40-page contract re-sent on every question a user asks about it, a
knowledge-base article re-attached to hundreds of support queries, or a conversation
history re-sent verbatim on every turn so its tokens are billed again each round-trip.
Every one of those calls re-processes content the model has effectively already "read."

**Summary caching** breaks that loop: compute a summary of the document, chunk, thread,
or conversation **once**, store it, and on subsequent calls send the (much shorter)
cached summary in place of the full text. You pay the summarization cost a single time
and then reuse the compressed representation across many calls. Two shapes dominate:

- **Summarize-once, reuse-many** — a long, stable source (a document or retrieved chunk)
  is condensed to roughly a tenth of its length and that summary is served to every later
  query that touches it, instead of re-summarizing or re-sending the full text.[^ragie-doc-summary][^n1n-rag-caching]
- **Rolling conversation summary (compaction)** — a growing chat or agent history is
  periodically collapsed into a running summary so each new turn carries a compact digest
  rather than the full transcript.[^anthropic-context-engineering][^anthropic-compaction]

The reason this is **Level 2** and not a trivial cache is that doing it *correctly*
requires real engineering: deciding **when the reuse count justifies the summarization
cost** (the break-even), **invalidating** the cached summary when the underlying content
changes, and **managing the quality risk** that a summary drops a detail that later turns
out to matter. A summary is lossy by construction[^anthropic-context-engineering] — which
is exactly why it saves tokens, and exactly why it can be dangerous.

## Detailed Approach & Techniques

### The economics: break-even on reuse

Summarizing is itself an LLM call — you pay input tokens to read the full text and output
tokens to write the summary.[^n1n-rag-caching] It only pays off if the summary is reused
enough times that the tokens saved on later calls exceed that one-time cost. The rule of
thumb:

> **reuse count × (full-text token cost − summary token cost) > one-time summarization cost**

A worked example. Suppose a 20,000-token document is summarized to 2,000 tokens with a
cheap model. On Claude Haiku 4.5 ($1/M input, $5/M output), the one-time summarization
costs roughly 20,000 × $1/M (read) + 2,000 × $5/M (write) ≈ **$0.03**.[^anthropic-pricing]
Each later query that sends the 2,000-token summary instead of the 20,000-token full text
saves ~18,000 input tokens — about **$0.018 per query at Haiku input rates, and more on a
pricier answering model**. Break-even arrives after only a couple of reuses; a document
queried hundreds of times over its life is almost pure savings. The lever is strongest
when the source is **long, stable, and reused often**, and weakest when it's short,
volatile, or touched once.

### DIY summary cache vs. provider-native compaction

There are two ways to build this, and the honest framing is **build vs. buy**.

**DIY (the "build" path).** Roll your own cache: summarize the content, store the summary
keyed by a **content hash** of the source (content-addressable storage), and look it up on
subsequent requests. Because a chunk's summary is static until the chunk changes, hashing
the raw text as the key means identical content — even the same passage appearing in
different documents or result sets — is summarized only once.[^n1n-rag-caching] In RAG this
is often done at ingestion time: condense each document to ~10% of its length, index the
summary, and serve it to every query rather than re-summarizing live.[^ragie-doc-summary]
You own the summarization prompt, the cache store, the TTL, and the invalidation logic.

**Provider-native compaction (the "buy" path).** For the *conversation* shape, Anthropic
now ships **server-side compaction**: when a conversation's input tokens cross a configured
threshold (**default 150,000 tokens, minimum 50,000**), the API automatically summarizes
the older context into a `compaction` block and, on subsequent requests, drops all content
blocks before it — no client-side bookkeeping.[^anthropic-compaction] This is the managed
alternative to a hand-rolled rolling-summary loop, and Anthropic recommends the server-side
version over an SDK/DIY equivalent for lower integration complexity and more accurate token
accounting.[^anthropic-compaction] A lighter-weight relative, **context editing**, clears
old *tool results* rather than summarizing — one documented example cut a request from
**70,000 to 25,000 input tokens (a 64% reduction)**.[^anthropic-context-editing]

**Guard the lossy part with memory.** Because compaction/summarization is lossy, pair it
with the **memory tool**: write the facts that *must* survive (IDs, decisions, exact
figures) to persistent memory files outside the context window, so a summary that drops
them can still recover them on demand.[^anthropic-memory] Anthropic's own guidance is to
prefer **raw history first, compaction second, and summarization only as a last resort**,
maximizing recall in the compaction prompt before trimming for precision.[^anthropic-context-engineering]

### Invalidation

A cached summary is only valid while its source is unchanged. When the underlying
document, chunk, or thread is edited, the summary is **stale** and must be regenerated.
The content-hash key makes this clean: if the source text changes, its hash changes, the
old key misses, and a fresh summary is produced.[^n1n-rag-caching] For the conversation
shape, staleness is handled for you — compaction always summarizes the *current* history
up to the threshold.[^anthropic-compaction] Skipping invalidation is the classic caching
failure mode: serving a confident summary of a document that has since been superseded.

### Managing the quality risk

The saving *is* the risk: a summary omits detail. Anthropic is explicit that summarization
is inherently lossy and that overly aggressive compaction "can result in the loss of subtle
but critical context whose importance only becomes apparent later."[^anthropic-context-engineering]
Practical mitigations: keep summaries longer/denser for high-stakes content, extract exact
entities (numbers, dates, clause references) into a structured sidecar rather than trusting
prose, fall back to full text for queries that clearly need verbatim detail, and gate the
change behind a golden-set eval so a detail-loss regression is caught before it ships.

## Example Where It Works

A B2B analytics product lets customers "chat with" their uploaded documents. A typical
account uploads a **30,000-token quarterly report** and then asks **40–60 questions**
about it over the following weeks — trends, comparisons, "what did section 4 say," summary
requests.

- **Without summary caching:** each of those ~50 questions re-sends the full 30k-token
  report as context, re-billing ~1.5M input tokens over the document's life.
- **With summary caching:** the report is condensed once to a ~3,000-token structured
  summary at upload (~10% of length),[^ragie-doc-summary] stored keyed by the file's
  content hash.[^n1n-rag-caching] Most of the 50 questions are answered against the 3k
  summary — a **~90% cut in per-query context tokens** on those calls — and the summary is
  reused dozens of times against a one-time summarization cost of a few cents.[^anthropic-pricing]
  Queries that genuinely need verbatim text (an exact figure) fall back to the full
  document, and the summary is regenerated only when the file is re-uploaded (its hash
  changes).[^n1n-rag-caching] For the conversational side of the same product, enabling
  server-side compaction keeps long chat threads from re-billing the whole transcript each
  turn, with no custom code.[^anthropic-compaction]

## Example Where It Would NOT Work

- **Detail-critical, high-stakes content.** A legal-review or clinical-decision assistant
  must reason over *exact* wording — a specific indemnity clause, a precise dosage, an exact
  effective date. A cached summary that smooths those away can produce a confidently wrong
  answer, and summarization is lossy by design.[^anthropic-context-engineering] Here the
  correct default is full text (or prompt/prefix caching of the verbatim document), not a
  lossy summary.
- **Low reuse.** A one-off pipeline that reads each document exactly once (classify it,
  move on) never recovers the summarization call's cost — you pay to summarize *and* to
  answer, with no later reuse to amortize against. The break-even is never reached.
- **Volatile sources.** Content that changes constantly (a live dashboard, an actively
  edited draft) invalidates its summary almost as fast as you can compute it, so the cache
  churns and the hit rate collapses.[^n1n-rag-caching]
- **Already-cheap context.** If the reused content is short, or is already covered by
  prompt/prefix caching at 0.1× input,[^anthropic-pricing] the extra machinery of a summary
  cache buys little over just caching the verbatim prefix — and avoids the quality risk
  entirely.

[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-memory]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-pricing]: Anthropic, "Pricing," Claude Platform Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^ragie-doc-summary]: Ragie, "Advanced RAG with Document Summarization" — <https://www.ragie.ai/blog/advanced-rag-with-document-summarization>
[^n1n-rag-caching]: n1n.ai, "Beyond Prompt Caching: 5 More Things You Should Cache in RAG Pipelines" — <https://explore.n1n.ai/blog/beyond-prompt-caching-rag-pipeline-optimization-2026-03-21>
