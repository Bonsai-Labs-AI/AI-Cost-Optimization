---
title: "Context Pruning"
category: prompt-context
maturityLevel: 3
maturityProvisional: false
shortDescription: "Drop whole low-value blocks of retrieved content and stale tool outputs from the context before the model sees them, so an agent stops re-paying to re-process material it no longer needs."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Agent context is dominated by old tool outputs (file reads, search results, API JSON) that were already processed turns ago."
  - "Per-turn input tokens climb steadily over a long run even though each new step adds little genuinely new information."
  - "Retrieved chunks are passed to the generator verbatim with no relevance gate — irrelevant passages ride along on every call."
  - "Nothing is ever cleared: the full, unedited history is re-sent on every step and the run eventually hits context exhaustion."
measurementMethods:
  - "Context (input) tokens per turn before vs. after pruning, over a representative long run."
  - "Pruned-block share: fraction of input tokens removed per step (the API reports cleared_input_tokens / cleared_tool_uses)."
  - "Peak context size across a run (does it stay bounded or climb unbounded?)."
  - "Task success / answer quality held at the eval bar to confirm pruning didn't drop something that mattered."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/conversation-summarization"
  - "prompt-context/learned-prompt-compression"
  - "prompt-context/context-offloading"
  - "caching-reuse/provider-native-context-management"
  - "agent-workflow/state-compression-for-agents"
  - "rag/reducing-retrieved-chunk-count"
sources:
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-03"
    kind: docs
    note: "clear_tool_uses_20250919 strategy: clears oldest tool results past a trigger (default 100k input tokens), keeps N most recent (default 3), replaces cleared blocks with a placeholder. Server-side; client keeps the full history. Beta header context-management-2025-06-27. Invalidates prompt cache — use clear_at_least to make the write worthwhile."
  - id: anthropic-context-mgmt
    title: "Managing context on the Claude Developer Platform"
    publisher: "Anthropic (claude.com)"
    year: 2026
    url: "https://claude.com/blog/context-management"
    accessed: "2026-07-03"
    kind: blog
    note: "100-turn web search eval: context editing reduced token consumption by 84% and let agents finish workflows that otherwise failed on context exhaustion. Context editing alone: +29% on agentic search; memory tool + context editing: +39% over baseline."
  - id: anthropic-cookbook
    title: "Context engineering: memory, compaction, and tool clearing"
    publisher: "Anthropic — Claude Cookbook"
    year: 2026
    url: "https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools"
    accessed: "2026-07-03"
    kind: docs
    note: "Research-agent example: peak context 335,279 → 173,137 tokens with tool-result clearing; run completed 7 turns vs 5. Clearing is lossless — re-fetchable content can be pulled again — unlike summarization."
  - id: provence
    title: "Provence: efficient and robust context pruning for retrieval-augmented generation"
    publisher: "Naver Labs Europe — ICLR 2025 (arXiv:2501.16214)"
    authors: "Chirkova et al."
    year: 2025
    url: "https://arxiv.org/abs/2501.16214"
    accessed: "2026-07-03"
    kind: paper
    note: "Context pruning as token-level sequence labeling, unified with reranking in one DeBERTa-large forward pass so pruning cost is ~zero on top of an existing reranker. Compression ratio auto-varies 50–80% by dataset with negligible-to-no quality drop (e.g. NQ 72.4 pruned vs 71.8 full)."
  - id: complexity-trap
    title: "The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management"
    publisher: "arXiv:2508.21433"
    year: 2025
    url: "https://arxiv.org/abs/2508.21433"
    accessed: "2026-07-03"
    kind: paper
    note: "Observation masking = replace tool observations older than a window with a placeholder, keep reasoning/actions. Cuts cost >50% vs raw baseline (Qwen3-Coder 480B 52.7%, Gemini 2.5 Flash 56.1%) and matches or beats LLM summarization on solve rate at lower cost."
  - id: milvus-pruning
    title: "LLM Context Pruning: A Developer's Guide to Better RAG and Agentic AI Results"
    publisher: "Milvus (Zilliz) Blog"
    year: 2026
    url: "https://milvus.io/blog/llm-context-pruning-a-developers-guide-to-better-rag-and-agentic-ai-results.md"
    accessed: "2026-07-03"
    kind: blog
    note: "Pruning sits between retrieval and the model as a relevance gate; relevance scoring + threshold dropping (Provence optimal at 0.6); distinct from reranking (order) and from token-level compression (rewrite)."
  - id: mcp-bloat
    title: "MCP's Context Bloat Crisis: Why Loading 1,000+ Tool Definitions Is Breaking Enterprise AI Agents"
    publisher: "AgentMarketCap"
    year: 2026
    url: "https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget"
    accessed: "2026-07-03"
    kind: blog
    note: "Real deployment (GitHub+Slack+Sentry, ~40 tools): 143,000 of 200,000 tokens (72%) consumed before the first user query. Motivates aggressive removal of low-value context blocks."
---

## Overview

Long-running agents and RAG pipelines accumulate context they no longer need. An agent
reads a file, runs a search, calls an API — and every one of those tool results stays in
the conversation, re-sent and re-billed on **every subsequent step**. A retriever pulls
the top-*k* chunks and passes all of them to the generator, including the ones that don't
actually bear on the question. Because each request re-processes its entire input, this
dead weight is paid for again and again, and the per-turn bill climbs even when little new
information is being added.

**Context pruning** removes whole low-value blocks — stale tool outputs, irrelevant
retrieved chunks — from the context *before* the model sees them, based on a relevance or
staleness signal.[^milvus-pruning] The distinguishing move is that it cuts at the **block
level**: it drops an entire tool result or an entire passage that no longer contributes,
rather than shortening text token-by-token. That makes it a **coarser but bigger** cut
than learned compression (which rewrites text to fewer tokens) and a different operation
from prompt-cleanup (which edits the *authored* prompt you control). Pruning targets the
*retrieved and generated* content that piled up at runtime.

It sits at **Level 3** because doing it well is real engineering: you need a relevance or
provenance signal that is cheap enough to run on every candidate block yet accurate enough
that you don't throw away something a later step needs — and, for RAG, you have to decide
*where* in the pipeline the gate lives. The payoff is concentrated on **agents with fat
tool outputs**, where one API call can return hundreds of thousands of characters of raw
JSON and response bloat routinely out-weighs the prompt itself.[^mcp-bloat]

## Detailed Approach & Techniques

### Two places pruning happens

**1. Tool-output / conversation pruning (agents).** As an agent loop runs, old tool
results become dead weight: once Claude has read a file or processed a search result, the
raw block rarely needs to stay verbatim. The native entry point is Anthropic's
**context editing** (`clear_tool_uses_20250919`): the API automatically clears the oldest
tool results once the conversation crosses a **trigger** threshold (default 100,000 input
tokens), keeps the **N most recent** (default 3), and replaces each cleared block with a
short placeholder so the model knows a call happened but its bulky output is gone.[^anthropic-context-editing]
It runs **server-side** — your client keeps the full, unedited history, so nothing is lost
on your side and re-fetchable content (a file, an API response) can simply be pulled again
if the agent needs it later. That makes clearing **lossless and zero-inference-cost**,
unlike summarization, which spends a model call and can't be undone.[^anthropic-cookbook]

The research literature calls the DIY version **observation masking**: replace environment
observations older than a window with a placeholder while preserving the agent's own
reasoning and actions.[^complexity-trap]

**2. Retrieved-chunk pruning (RAG).** Here the gate lives **between retrieval and the
generator**. After the retriever (and optionally a reranker) returns candidates, a
relevance scorer decides which chunks — or which sentences within a chunk — actually earn
their place in the prompt, and drops the rest below a threshold.[^milvus-pruning] The
strongest primary example is **Provence**, which frames pruning as **token-level sequence
labeling** and, crucially, **unifies pruning with reranking in a single DeBERTa forward
pass** — so if you already run a reranker, the added cost of pruning is essentially
zero.[^provence]

### The signals that drive the cut

- **Relevance scoring against the query.** A small model (or the reranker's own head)
  scores each block; blocks below a threshold are dropped. Provence tunes this per-context
  and reports an optimal pruning threshold around 0.6 in practice.[^milvus-pruning][^provence]
- **Staleness / recency (provenance).** For agents, the cheapest signal is age: keep the
  last *N* tool results, clear older ones. Provenance — *which* tool produced a block and
  whether it's re-fetchable — decides what is safe to drop, and lets you `exclude_tools`
  (e.g. never clear a memory tool's output).[^anthropic-context-editing]
- **A minimum-clear floor.** Because clearing content **invalidates the prompt-cache
  prefix**, small clears can cost more (a fresh cache write) than they save. The
  `clear_at_least` parameter forces each firing to remove enough tokens to be worth the
  cache invalidation.[^anthropic-context-editing]

### The cost mechanism, quantified

Pruning removes whole blocks, so the savings scale with how much fat is in the context.
On Anthropic's **100-turn web-search evaluation**, context editing **cut token consumption
by 84%** and let agents complete workflows that otherwise **failed on context
exhaustion**; context editing alone lifted agentic-search performance **+29%**, and paired
with the memory tool **+39%** over baseline.[^anthropic-context-mgmt] Anthropic's cookbook
shows the same effect concretely: a research agent's **peak context dropped from 335,279 to
173,137 tokens** (roughly half) with tool-result clearing, and the run got *further* — 7
turns vs. 5 — because it stopped drowning in old output.[^anthropic-cookbook] On agentic
software tasks, observation masking **cut cost per instance by >50%** (52.7% on
Qwen3-Coder-480B, 56.1% on Gemini 2.5 Flash) while **matching or beating** LLM
summarization on solve rate — i.e. you get the compression without paying for a summarizer
call.[^complexity-trap] For RAG, Provence prunes **50–80% of context tokens** depending on
the dataset with **negligible-to-no quality drop** (Natural Questions: 72.4 pruned vs. 71.8
full).[^provence]

### The core risk

The failure mode is dropping a block that turns out to matter later. Recency-based clearing
can evict a tool result the agent re-references two steps on; a relevance scorer set too
aggressively can prune the one passage that held the answer. Mitigations: keep the signal
conservative (generous `keep`, moderate thresholds), make cleared content **re-fetchable**
rather than gone (native clearing preserves the client-side history and the tool-call
record), pair pruning with a **memory tool / offload** so anything important is written out
before it's cleared, and gate the threshold behind your eval suite so quality is measured,
not assumed.[^anthropic-context-editing][^anthropic-cookbook][^complexity-trap]

## Example Where It Works

A code-and-research agent works a multi-step task: it greps the repo, reads a dozen files,
fetches three API endpoints, and iterates. By turn 20 the context is a graveyard of raw
file dumps and JSON payloads that were relevant for one step each and never again — and
the whole pile is re-sent, at full input price, on **every** remaining turn. Left
unmanaged, the run marches toward context exhaustion and simply fails.[^anthropic-context-mgmt]

Enabling `clear_tool_uses` (trigger 30k tokens, keep the last 4 tool results,
`clear_at_least` 10k) clears the oldest tool outputs once context grows, replacing each
with a placeholder. Peak context roughly **halves** (the cookbook's comparable run goes
335k → 173k), the per-turn bill stops climbing, and the agent completes **more** of the
task rather than stalling — all with **no summarizer call** and full lossless recovery,
since any cleared file can be re-read if needed.[^anthropic-cookbook][^anthropic-context-editing]
In a RAG variant, folding a Provence-style prune into the existing rerank pass drops
50–80% of retrieved tokens at the same answer quality, for essentially no added compute.[^provence]

## Example Where It Would NOT Work

- **Thin context with no fat blocks.** A single-shot Q&A over a short prompt has nothing
  bulky to prune — the win comes from *removed blocks*, and if there are none, pruning adds
  a scoring step with no payoff.[^milvus-pruning]
- **Everything is load-bearing.** A synthesis task that must weigh **all** retrieved
  evidence, or an agent that genuinely re-references old tool outputs each step, will lose
  accuracy the moment you drop a block. When information isn't safely re-fetchable and can't
  be offloaded, pruning trades quality for tokens — the wrong trade.[^complexity-trap]
- **Small clears against a hot cache.** Clearing invalidates the cached prefix. If you clear
  a few thousand tokens each turn on a workload that was benefiting from prompt caching, the
  repeated cache **writes** can cost more than the pruning saves; without a `clear_at_least`
  floor this is a net loss.[^anthropic-context-editing]
- **Schema bloat, not output bloat.** If the context is dominated by *tool definitions*
  loaded up front (72% of the window in one real deployment), pruning tool *results* barely
  helps — the fix there is tool-search / deferred tool loading, a different lever.[^mcp-bloat]

[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-context-mgmt]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-cookbook]: Anthropic, "Context engineering: memory, compaction, and tool clearing," Claude Cookbook — <https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools>
[^provence]: Chirkova et al., "Provence: efficient and robust context pruning for retrieval-augmented generation," Naver Labs Europe, ICLR 2025 — <https://arxiv.org/abs/2501.16214>
[^complexity-trap]: "The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management," arXiv:2508.21433 — <https://arxiv.org/abs/2508.21433>
[^milvus-pruning]: Milvus (Zilliz), "LLM Context Pruning: A Developer's Guide to Better RAG and Agentic AI Results" — <https://milvus.io/blog/llm-context-pruning-a-developers-guide-to-better-rag-and-agentic-ai-results.md>
[^mcp-bloat]: AgentMarketCap, "MCP's Context Bloat Crisis" — <https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget>
