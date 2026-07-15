---
title: "Context Window Budgeting"
category: prompt-context
maturityLevel: 1
maturityProvisional: false
shortDescription: "Set an explicit per-call token budget and allocate it across components (system, history, retrieved docs, tools) with hard caps and a trimming policy, instead of letting context grow until it hits the model max."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "Context grows unbounded per turn — the full, ever-growing conversation history is resent every request."
  - "No per-component token caps: retrieved-k, history length, and tool schemas can each balloon independently."
  - "Requests occasionally run near the model maximum, and cost scales directly with conversation length."
  - "A single long document or a large retrieval set can push a request into a higher long-context price tier."
measurementMethods:
  - "Tokens-per-call distribution and its p95/p99 — not just the mean."
  - "Percentage of calls near the budget (or near the model max / a higher-price context tier)."
  - "Cost per conversation (or per agent run) vs. cost per single call."
  - "Answer quality held at the eval bar as the budget and trimming policy are tightened."
status: published
lastUpdated: "2026-07-02"
related:
  - "prompt-context/long-context-avoidance"
  - "prompt-context/structured-context-packing"
  - "prompt-context/context-reduction"
  - "rag/reducing-retrieved-chunk-count"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: lost-in-middle
    title: "Lost in the Middle: How Language Models Use Long Contexts"
    publisher: "Transactions of the Association for Computational Linguistics (TACL)"
    authors: "Nelson F. Liu, Kevin Lin, John Hewitt, Ashwin Paranjape, Michele Bevilacqua, Fabio Petroni, Percy Liang"
    year: 2023
    url: "https://arxiv.org/abs/2307.03172"
    accessed: "2026-07-02"
    kind: paper
    note: "Performance is highest when relevant info is at the start or end of the context and degrades significantly in the middle; it also decreases as the input context grows longer, even for explicitly long-context models."
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Context is a finite resource with diminishing marginal returns; 'context rot' (recall decreases as tokens increase) and a limited 'attention budget' from transformer n² scaling. Goal: the smallest set of high-signal tokens."
  - id: gemini-pricing
    title: "Gemini Developer API pricing"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Gemini 2.5 Pro: $1.25/M input & $10/M output for prompts ≤200k tokens, doubling to $2.50/M input & $15/M output for prompts >200k tokens."
  - id: llamaindex-buffer
    title: "Chat Memory Buffer"
    publisher: "LlamaIndex Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/agent/memory/chat_memory_buffer/"
    accessed: "2026-07-02"
    kind: docs
    note: "ChatMemoryBuffer stores the last messages that fit into token_limit; older messages are dropped once the cumulative token count would exceed the limit — an explicit budget + drop-oldest eviction policy."
  - id: llamaindex-summary-buffer
    title: "Chat Summary Memory Buffer"
    publisher: "LlamaIndex Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/"
    accessed: "2026-07-02"
    kind: docs
    note: "ChatSummaryMemoryBuffer keeps recent messages within token_limit and, when the conversation exceeds the budget, summarizes older messages into a single message instead of discarding them — the summarize-when-over-budget policy."
  - id: langchain-trim
    title: "trim_messages"
    publisher: "LangChain — langchain_core reference"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-core/messages/utils/trim_messages"
    accessed: "2026-07-02"
    kind: docs
    note: "trim_messages trims a message list to be below a token count (max_tokens), with strategy='last'/'first', a configurable token_counter, and include_system to always keep the system prompt."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Caching applies to a stable prefix (static content first, variable content last); a prefix that changes every call — as an unbounded growing context does — cannot be cached."
---

## Overview

The default behavior of most LLM applications is to let the prompt grow until something
breaks: history accumulates turn after turn, retrieval returns "top-k to be safe," tool
schemas pile up, and the request stops only when it bumps the model's maximum context
size. Because every request re-processes its **entire** input, this "just stuff the
window" habit is the single largest driver of input cost — and input cost scales linearly
with the token count on every call.

**Context Window Budgeting** replaces that drift with an explicit policy: decide how many
tokens a call is *allowed* to use, allocate that budget across components (system prompt,
conversation history, retrieved documents, tool definitions, per-request input), enforce
a **hard cap per component**, and apply a **trimming/eviction policy** when the budget is
exceeded — drop the oldest turns, cap retrieved-k, or summarize older history rather than
letting it grow forever.

The reason this is worth engineering — rather than just relying on the fact that the model
*can* accept a huge context — is that a bigger context window is not free and not always
better. Cost scales with tokens, and quality degrades as the context lengthens: the widely
cited "Lost in the Middle" study found that model performance is highest when relevant
information sits at the **beginning or end** of the context and **degrades significantly**
when the model must use information buried in the middle — and that performance drops as
the input grows longer, *even for explicitly long-context models*.[^lost-in-middle]
Anthropic frames the same phenomenon as **context rot** ("as the number of tokens in the
context window increases, the model's ability to accurately recall information from that
context decreases") and a finite **attention budget**, concluding that good context
engineering means finding "the smallest possible set of high-signal tokens."[^anthropic-context-eng]
So an unbudgeted window costs more *and* can answer worse. It sits at **Level 1** because
the core practice — set a budget, enforce per-component caps, apply a trimming policy — is
foundational hygiene that any team can adopt with off-the-shelf primitives.

## Detailed Approach & Techniques

### 1. Set a budget and account for it per component

Start from a target token budget per call that is comfortably **below** the model maximum
(and, where relevant, below a price-tier boundary — see below), then allocate it:

| Component | Typical share | Enforcement |
|---|---|---|
| System prompt + tool defs | fixed, measured once | keep stable (cacheable) |
| Retrieved documents / RAG chunks | capped `k` | rerank/dedupe, cap `k` |
| Conversation history | remaining budget | trim or summarize |
| Per-request user input | reserve headroom | truncate/validate |

The point is that each component has its **own cap** and can't quietly consume the whole
window. This turns "how big did the prompt happen to get?" into "what did we decide to
spend?" — a number you can measure (tokens/call p95) and defend.

### 2. Choose a trimming / eviction policy

When the accumulated context would exceed the budget, something has to give. The three
standard policies, all available off-the-shelf:

- **Drop oldest turns (sliding window).** Keep the most recent messages that fit the
  budget and discard older ones. LlamaIndex's `ChatMemoryBuffer` does exactly this: it
  "stores the last X messages that fit into a token limit," dropping older messages once
  the cumulative token count would exceed `token_limit`.[^llamaindex-buffer] LangChain's
  `trim_messages` is the equivalent primitive — it trims a message list to be below a
  `max_tokens` count with `strategy="last"`, a configurable `token_counter`, and
  `include_system=True` so the system prompt is always retained even as history is
  trimmed.[^langchain-trim]
- **Cap retrieved-k.** Bound the number (and size) of retrieved chunks that enter the
  budget rather than passing everything the retriever returns. This is where budgeting
  meets RAG — reranking and deduplication before generation let you keep a small, dense
  set (see *Reducing Retrieved Chunk Count*).
- **Summarize when over budget.** Instead of discarding old turns, compress them.
  LlamaIndex's `ChatSummaryMemoryBuffer` keeps recent messages within the `token_limit`
  and, when the conversation exceeds it, summarizes the older messages into a single
  message rather than dropping them — preserving gist while capping tokens.[^llamaindex-summary-buffer]
  (The rolling-summary technique itself is covered in *Conversation Summarization*.)

A mature setup layers these: keep the last N turns verbatim, summarize everything older,
and cap retrieval — so total tokens stay near a flat ceiling regardless of session length.

### 3. Respect price-tier boundaries, not just the max

"Under the model max" is the wrong ceiling. Several providers charge a **premium above a
token threshold**: Gemini 2.5 Pro bills **$1.25 / M input and $10 / M output for prompts
≤ 200k tokens, doubling to $2.50 / M input and $15 / M output for prompts > 200k
tokens**.[^gemini-pricing] A budget that keeps the common case under 200k tokens avoids
paying 2× on input for the privilege of a context the model uses less reliably anyway. The
budget boundary should be set at the *economic* cliff, not the *technical* one.

### 4. Budgeting is what makes caching work

A stable, bounded prefix is cacheable; an unbounded, growing one is not. Prompt/prefix
caching only applies to a **contiguous prefix that is byte-for-byte identical** across
calls — the guidance is "static content first, variable content last."[^openai-pc-docs] A
context that grows and reshuffles every turn keeps invalidating that prefix, so caching
buys little. Budgeting with a stable system/tool block at the top and a bounded, append-only
tail is precisely the shape that maximizes cache hits (see *Prompt Caching / Prefix
Caching* and *Structured Context Packing*). Budgeting and caching are complementary: one
caps how many tokens you send, the other discounts the stable ones you must resend.

### 5. Validate the budget against an eval bar

Because over-aggressive trimming can drop needed context, tighten the budget under
measurement, not by feel: keep answer quality at the eval bar while you lower the cap,
back off if quality regresses. This is the same gate that governs every L2 cost move
(*Quality–Cost Evaluation Suite*).

## Example Where It Works

A customer-support copilot runs long multi-turn sessions and, per turn, attaches the full
conversation history plus 8 retrieved KB chunks. By turn 15 a request carries ~40k tokens,
most of it stale early chit-chat and duplicate chunks, and cost per turn has crept up
roughly linearly with turn count.

A budget of ~8k tokens per call, allocated as: 1.5k stable system+tools (cached), the last
5 turns verbatim, a running summary of everything older, and a hard cap of 4 reranked
chunks. History is managed with a token-limited buffer that drops/summarizes older
turns.[^llamaindex-buffer][^llamaindex-summary-buffer] The result: per-turn tokens flatten
to a near-constant ~8k regardless of session length instead of climbing to 40k+, cutting
input spend on long sessions by well over half — and, because the stable
system-and-tools block is now a fixed prefix, prefix caching discounts most of what
remains.[^openai-pc-docs] Answer quality holds or improves, consistent with the finding
that a tighter, well-ordered context is used more reliably than a bloated one.[^lost-in-middle][^anthropic-context-eng]

## Example Where It Would NOT Work

- **Genuinely long single-document reasoning.** A task that must reason over a whole 150k-token
  contract or codebase in one pass cannot be trimmed to 8k without losing the substance of
  the task — the tokens *are* the work. Here the levers are retrieval/summarization to
  select what's relevant (*Long-Context Avoidance*), not a hard cap that amputates required
  context.
- **Short, single-shot calls that are already tiny.** A classification prompt that is a
  200-token instruction plus a one-paragraph input has no budget problem; adding a
  budgeting layer is pure overhead with nothing to trim.
- **When trimming silently drops the needle.** If the answer depends on a detail in an early
  turn or a mid-context chunk, a naive drop-oldest or over-tight retrieval cap can evict
  exactly the information needed — the "lost in the middle" risk in reverse. Budgeting must
  be paired with good selection (reranking, summaries that retain key facts) and validated
  against evals; a budget tuned by feel rather than measurement can trade cost for silent
  quality loss.[^lost-in-middle][^anthropic-context-eng]

[^lost-in-middle]: Liu et al., "Lost in the Middle: How Language Models Use Long Contexts," TACL 2023 — <https://arxiv.org/abs/2307.03172>
[^anthropic-context-eng]: Anthropic, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^gemini-pricing]: Google, "Gemini Developer API pricing," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/pricing>
[^llamaindex-buffer]: LlamaIndex Documentation, "Chat Memory Buffer" — <https://developers.llamaindex.ai/python/examples/agent/memory/chat_memory_buffer/>
[^llamaindex-summary-buffer]: LlamaIndex Documentation, "Chat Summary Memory Buffer" — <https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/>
[^langchain-trim]: LangChain, "trim_messages," langchain_core reference — <https://reference.langchain.com/python/langchain-core/messages/utils/trim_messages>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
