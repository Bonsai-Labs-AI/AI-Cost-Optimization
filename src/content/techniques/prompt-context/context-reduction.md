---
title: "Context Reduction"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Shrink an accumulating conversation or agent context before the model re-processes it: drop whole stale blocks (pruning) and compress remaining history into a rolling summary (compaction) — turning an ever-growing, quadratically-billed transcript into a capped, bounded window."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "Per-turn input tokens climb steadily over a long session or agent run even though each new step adds little genuinely new information."
  - "Total tokens billed for a session grow roughly with the square of its length — each of N turns re-processes the accumulated N-turn history."
  - "Agent context is dominated by old tool outputs (file reads, search results, API JSON) that were processed turns ago and no longer referenced."
  - "Long agent runs or long-lived chats hit or approach the context-window limit, causing failures or forced truncation."
  - "No compaction trigger or pruning step exists; history only ever grows (append-only) until it errors out."
measurementMethods:
  - "Input tokens per turn plotted over a long session, before vs. after (should be flat/capped instead of rising)."
  - "Total tokens billed per session (sum across all turns), before vs. after."
  - "Peak context size across an agent run (does it stay bounded or climb unbounded?)."
  - "Pruned-block share: fraction of input tokens removed per pruning step."
  - "Task success / answer quality held at the eval bar to confirm neither pruning nor compaction dropped something that mattered."
status: published
lastUpdated: "2026-07-14"
related:
  - "prompt-context/learned-prompt-compression"
  - "prompt-context/context-offloading"
  - "caching-reuse/provider-native-context-management"
  - "caching-reuse/summary-caching"
  - "agent-workflow/agent-memory-management"
  - "rag/reducing-retrieved-chunk-count"
sources:
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-03"
    kind: docs
    note: "clear_tool_uses_20250919 strategy: clears oldest tool results past a trigger (default 100k input tokens), keeps N most recent (default 3), replaces cleared blocks with a placeholder. Server-side; client keeps the full history. Beta header context-management-2025-06-27. Invalidates prompt cache — use clear_at_least to make the write worthwhile. count_tokens preview shows e.g. 70,000 → 25,000 tokens (45,000 saved) on an agent with heavy tool output."
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
  - id: anthropic-compaction
    title: "Compaction"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/compaction"
    accessed: "2026-07-03"
    kind: docs
    note: "Server-side compaction: default trigger 150,000 input tokens, minimum 50,000; summarizes older content into a compaction block and drops all blocks before it on subsequent requests; pause_after_compaction keeps recent messages verbatim; adds a separate compaction sampling step (billed in usage.iterations)."
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Compaction 'distills the contents of a context window in a high-fidelity manner'; preserves architectural decisions/unresolved bugs while discarding redundant tool outputs; introduces 'context rot' — recall degrades as tokens grow; warns over-aggressive compression drops subtle-but-critical context."
  - id: bedrock-compaction
    title: "Compaction (Anthropic Claude Messages API)"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html"
    accessed: "2026-07-03"
    kind: docs
    note: "Same compaction feature exposed on Bedrock via InvokeModel; default summarization prompt text; re-applying a previous compaction block incurs no additional compaction cost; cache_control can be placed on a compaction block."
  - id: complexity-trap
    title: "The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management"
    publisher: "arXiv:2508.21433"
    year: 2025
    url: "https://arxiv.org/abs/2508.21433"
    accessed: "2026-07-03"
    kind: paper
    note: "Observation masking = replace tool observations older than a window with a placeholder, keep reasoning/actions. Cuts cost >50% vs raw baseline (Qwen3-Coder 480B 52.7%, Gemini 2.5 Flash 56.1%) and matches or beats LLM summarization on solve rate at lower cost."
  - id: provence
    title: "Provence: efficient and robust context pruning for retrieval-augmented generation"
    publisher: "Naver Labs Europe — ICLR 2025 (arXiv:2501.16214)"
    authors: "Chirkova et al."
    year: 2025
    url: "https://arxiv.org/abs/2501.16214"
    accessed: "2026-07-03"
    kind: paper
    note: "Context pruning as token-level sequence labeling, unified with reranking in one DeBERTa-large forward pass so pruning cost is ~zero on top of an existing reranker. Compression ratio auto-varies 50–80% by dataset with negligible-to-no quality drop (e.g. NQ 72.4 pruned vs 71.8 full)."
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
  - id: langchain-summary-buffer
    title: "ConversationSummaryBufferMemory"
    publisher: "LangChain — Python Reference (langchain-classic)"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-classic/memory/summary_buffer/ConversationSummaryBufferMemory"
    accessed: "2026-07-03"
    kind: docs
    note: "DIY rolling summary: keeps recent interactions verbatim, compiles older ones into a running summary, uses token length (max_token_limit) to decide when to flush older turns into the summary."
  - id: langchain-summary
    title: "ConversationSummaryMemory"
    publisher: "LangChain — Python Reference (langchain-classic)"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-classic/memory/summary/ConversationSummaryMemory"
    accessed: "2026-07-03"
    kind: docs
    note: "Continuously updates one running summary after each turn so token consumption does not grow proportionally with dialogue length."
  - id: llamaindex-summary-buffer
    title: "Chat Summary Memory Buffer"
    publisher: "LlamaIndex — Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/"
    accessed: "2026-07-03"
    kind: docs
    note: "ChatSummaryMemoryBuffer stores the last messages that fit into a token_limit (example 40,000) and summarizes older chat history into a single message."
---

## Overview

Every LLM API request re-processes its **entire input**. In a conversation or agentic loop
that means every subsequent turn re-sends — and re-bills — the accumulated transcript from
the beginning. The per-turn cost does not grow linearly with session length: it grows
**quadratically**, because a session of *N* turns processes the equivalent of `1 + 2 + … + N`
turn-prefixes. Left unmanaged, a long support chat or a multi-hour agent run spends most of
its budget re-encoding history, and eventually slams into the context-window limit and
fails.[^anthropic-compaction][^anthropic-context-engineering]

**Context reduction** is the category of techniques that interrupt this accumulation before
the model sees the prompt. There are two complementary tools, applied in sequence:

1. **Pruning** — drop whole blocks that are no longer needed. Stale tool outputs, old API
   responses, irrelevant retrieved chunks: each was useful for one turn and is now dead
   weight. Pruning removes it entirely, with no model call and no information loss if the
   source is re-fetchable.[^anthropic-context-editing][^complexity-trap]

2. **Compaction (rolling summarization)** — compress history that *does* matter but
   doesn't need to be verbatim. Once the accumulated transcript crosses a budget, an LLM
   call distills the older turns into a compact summary; subsequent turns re-send *summary +
   recent verbatim* instead of the full transcript, capping the per-turn input
   size.[^anthropic-compaction][^langchain-summary-buffer]

Pruning is lossless and zero-inference-cost; compaction is lossy and incurs one extra model
call per trigger. The practical approach is **prune first, then compact the rest**: clear all
re-fetchable or clearly irrelevant blocks, then summarize the meaningful history that remains.
Doing it the other way wastes the compaction call on content that could have been dropped for
free.

Beyond cost, compaction also protects quality. Anthropic documents **"context rot"** — as
context grows, the model's ability to accurately recall any given fact *decreases* — so a
bloated transcript is both more expensive *and* less reliable than a well-reduced one.[^anthropic-context-engineering]

Both techniques sit at **L2** because doing them well is real engineering: relevance or
staleness signals for pruning, threshold-tuning and summary-prompt design for compaction,
and quality gating to verify neither drops something that matters — even though managed
**provider-native** implementations now handle much of the mechanics.[^anthropic-compaction][^anthropic-context-editing]

## Detailed Approach & Techniques

### Step 1 — Pruning: drop what's irrelevant or re-fetchable

Pruning removes **whole blocks** from the context based on a relevance or staleness signal.
It cuts coarser than learned compression (which rewrites tokens) and targets a different
problem from prompt-cleanup (which edits authored prompts): its targets are the *retrieved
and generated* content that piled up at runtime.[^milvus-pruning]

**Tool-output pruning (agents).** As an agent loop runs, old tool results become dead weight:
once the model has processed a file dump or an API response, the raw block rarely needs to
stay verbatim. Anthropic's native entry point is **context editing**
(`clear_tool_uses_20250919`): the API automatically clears the oldest tool results once the
conversation crosses a **trigger** threshold (default 100,000 input tokens), keeps the
**N most recent** (default 3), and replaces each cleared block with a short placeholder so
the model knows the call happened.[^anthropic-context-editing] This runs **server-side** —
your client retains the full history, so nothing is lost on your side and any cleared content
can simply be re-fetched if the agent needs it later. That makes clearing **lossless and
zero-inference-cost**, unlike compaction, which spends a model call and cannot be
undone.[^anthropic-cookbook]

The same idea implemented client-side is called **observation masking**: replace environment
observations older than a sliding window with a placeholder, preserve the agent's own
reasoning and action traces. Research confirms observation masking **cuts cost by more than
50%** (52.7% on Qwen3-Coder-480B, 56.1% on Gemini 2.5 Flash) and **matches or beats LLM
summarization** on task solve rate — the compression without the summarizer
bill.[^complexity-trap]

**Retrieved-chunk pruning (RAG).** Here the gate lives **between retrieval and the
generator**. After the retriever (and optionally a reranker) returns candidates, a relevance
scorer drops chunks below a threshold before they reach the prompt.[^milvus-pruning] The
strongest example is **Provence**, which frames pruning as **token-level sequence labeling**
unified with reranking in a single DeBERTa forward pass — so if you already run a reranker,
the marginal cost of pruning is essentially zero. Provence prunes **50–80% of context tokens**
depending on the dataset with **negligible-to-no quality drop** (Natural Questions: 72.4
pruned vs. 71.8 full).[^provence]

**Signals that drive the pruning decision:**

- *Staleness/recency.* Keep the last *N* tool results; clear older ones. This is the simplest
  and cheapest signal and works well in practice.
- *Relevance scoring.* A small model or the reranker's own head scores each block against the
  current query; blocks below a threshold (Provence reports ~0.6 as optimal in practice) are
  dropped.[^milvus-pruning][^provence]
- *Provenance.* Which tool produced a block, and is it re-fetchable? Native clearing lets you
  `exclude_tools` to protect memory-tool outputs that can't be recovered from a tool
  call.[^anthropic-context-editing]
- *A minimum-clear floor.* Clearing content **invalidates the prompt-cache prefix**, so small
  clears can cost more (a fresh cache write) than they save. The `clear_at_least` parameter
  forces each firing to remove enough tokens to exceed the cache write penalty.[^anthropic-context-editing]

### Step 2 — Compaction: compress what's still load-bearing

Once irrelevant and re-fetchable blocks are gone, the history that remains may still be
growing faster than you want to re-pay for. Compaction breaks the quadratic resend curve by
replacing the older portion with a compact **rolling summary** while keeping the most recent
turns **verbatim**.[^anthropic-compaction][^langchain-summary-buffer]

The core loop has three moving parts:

1. **A trigger threshold.** Track the running input-token count and fire when it crosses a
   budget. Anthropic's server-side compaction defaults to a **150,000-token trigger** with a
   **50,000-token minimum**.[^anthropic-compaction] DIY memory classes key on a
   `max_token_limit` / `token_limit`.[^langchain-summary-buffer][^llamaindex-summary-buffer]

2. **Summarize-older.** When triggered, an LLM call condenses the older portion into a
   summary. Anthropic's default prompt asks the model to write a summary of the transcript
   "to provide continuity … write down anything that would be helpful, including the state,
   next steps, learnings," wrapped in a `<summary>` block.[^bedrock-compaction] The summary
   then *replaces* the older turns — on Claude the API emits a `compaction` block and
   **drops all message blocks before it** on subsequent requests.[^anthropic-compaction]

3. **Keep-recent-verbatim.** The last few turns are preserved exactly, because they carry
   live task state and the user's most recent intent. LangChain's
   `ConversationSummaryBufferMemory` keeps recent interactions in full and folds only the
   overflow into the summary;[^langchain-summary-buffer] Anthropic's `pause_after_compaction:
   true` pauses after the summary so you can re-append, say, the last three messages verbatim
   before continuing.[^anthropic-compaction]

**DIY vs. provider-native compaction:**

- **DIY (framework memory).** LangChain's `ConversationSummaryMemory` maintains a single
  running summary updated after each turn so token use "does not grow proportionally with
  dialogue length";[^langchain-summary] `ConversationSummaryBufferMemory` adds the
  recent-verbatim buffer.[^langchain-summary-buffer] LlamaIndex's `ChatSummaryMemoryBuffer`
  keeps the last messages that fit a `token_limit` and summarizes the rest.[^llamaindex-summary-buffer]
  You control the prompt and the keep/summarize split, but you own the trigger logic, the
  summary quality, and the extra model call.
- **Provider-native.** Anthropic (and the same feature on Amazon Bedrock) offers **server-side
  compaction** via the `compact_20260112` edit: the API summarizes and prunes automatically,
  with no client-side code needed — the recommended path for long-running conversations and
  agentic workflows.[^anthropic-compaction][^bedrock-compaction] Re-applying an existing
  compaction block on later turns incurs **no additional** compaction cost, so the amortized
  overhead is one summary call per threshold crossing, not per
  turn.[^bedrock-compaction]

### The honest cost picture

**Pruning is free.** Server-side tool clearing and observation masking add no model calls and
no tokens.

**Compaction adds overhead.** Each compaction is a **separate sampling step** that reads the
whole current history and writes a summary, billed on top of the normal turn. Anthropic
reports it in `usage.iterations` — e.g. a compaction iteration of **180,000 input / 3,500
output tokens** alongside the follow-on message — and the top-level `input_tokens`
deliberately **excludes** that compaction usage, so cost tracking must sum across
iterations.[^anthropic-compaction][^bedrock-compaction] The net remains positive for
sessions long enough that the quadratic tail's savings exceed the amortized summary cost.

**Combined gains.** On Anthropic's 100-turn web-search evaluation, context editing alone cut
token consumption by **84%** and lifted task completion by **+29%**; paired with the memory
tool, **+39%** over baseline.[^anthropic-context-mgmt] The cookbook shows concretely: a
research agent's **peak context dropped from 335,279 to 173,137 tokens** with tool-result
clearing, and the run got *further* (7 turns vs. 5) because it stopped drowning in old
output.[^anthropic-cookbook] Pairing it with compaction — clear the raw tool bloat, summarize
the rest — compounds the win (the 70k→25k context editing preview shows how much raw tool
bloat there is to shed before summarizing).[^anthropic-context-editing]

### Quality risk and how to bound it

**Pruning risk:** the failure mode is dropping a block that turns out to matter later. Recency-
based clearing can evict a tool result the agent re-references two steps on. Mitigations:
keep the signal conservative (generous `keep`, moderate relevance thresholds), make cleared
content re-fetchable rather than gone, pair pruning with a memory tool so anything important
is written out before it's cleared, and gate thresholds behind your eval suite.[^anthropic-context-editing][^anthropic-cookbook][^complexity-trap]

**Compaction risk:** the failure mode is **lost detail** — a fact dropped during summarization
that a later turn needs (a constraint stated 40 turns ago, an unresolved bug, an exact ID).
Anthropic warns that overly aggressive compression can discard "subtle but critical context
whose importance only becomes apparent later."[^anthropic-context-engineering] Guards: keep
enough recent turns verbatim; use custom `instructions` to force-preserve load-bearing
categories (IDs, decisions, open tasks); offload durable facts to an external store before
compacting; gate changes on an eval suite so regression is caught before it ships.[^anthropic-compaction][^anthropic-context-engineering]

## Example Where It Works

A coding agent works a multi-hour task: it greps the repo, reads a dozen files, fetches
three API endpoints, runs tool after tool, and accumulates transcript on every step. By
turn 20 the context is a graveyard of raw file dumps and JSON payloads — each relevant for
exactly one step and never again — and the whole pile re-sends, at full input price, on
**every** remaining turn. Without intervention, the run marches toward context exhaustion
and fails.[^anthropic-context-mgmt]

Applying the two-step toolkit:

- **First, pruning.** Enable `clear_tool_uses` (trigger 30k tokens, keep the last 4 tool
  results, `clear_at_least` 10k). Oldest tool outputs are replaced with placeholders. Peak
  context roughly **halves** (335k → 173k in the cookbook's comparable run), the per-turn
  bill stops climbing, and the agent completes **more** of the task — all with **no
  summarizer call** and full lossless recovery, since any cleared file can be re-read if
  needed.[^anthropic-cookbook][^anthropic-context-editing]

- **Then, compaction.** Enable server-side compaction at 150k tokens. Once the conversation
  crosses the trigger, the API distills the history into a summary that "preserves
  architectural decisions, unresolved bugs, and implementation details while discarding
  redundant tool outputs," drops the pre-summary blocks, and keeps the recent steps
  verbatim.[^anthropic-compaction][^anthropic-context-engineering] Per-step input is now
  **capped near the trigger** instead of climbing toward the limit, so the quadratic tail of
  the run flattens — the run both costs less and stays coherent, dodging context rot.

A RAG pipeline benefits from the pruning leg alone: folding a Provence-style relevance gate
into the existing rerank pass drops **50–80% of retrieved tokens** at equivalent answer
quality, for essentially no added compute.[^provence]

## Example Where It Would NOT Work

- **Short sessions.** A two- or three-turn Q&A never approaches the compaction trigger and
  has no stale tool outputs to prune — the quadratic tail never develops. Both techniques
  add code complexity with no measurable saving; the compaction minimum trigger is 50,000
  tokens for a reason.[^anthropic-compaction]
- **Everything is load-bearing.** A synthesis task that must weigh **all** retrieved evidence,
  or a legal/medical/financial dialogue where a paraphrased summary could silently drop an
  exact figure or clause, is a poor fit for compaction. The recall risk Anthropic flags is
  unacceptable there; prefer keeping more turns verbatim, offloading durable facts to an
  external store, or using prompt/prefix caching to reduce the *cost* of resending without
  altering what the model sees.[^anthropic-context-engineering]
- **Agent re-references old outputs.** When an agent genuinely revisits past tool results
  each step — comparing outputs, tracking state across many prior turns — pruning trades
  accuracy for tokens. If cleared content can't be re-fetched (no deterministic source) and
  can't be offloaded, the technique is unsafe.[^complexity-trap]
- **Small clears against a hot cache.** Clearing invalidates the cached prefix. Pruning a
  few thousand tokens each turn on a workload that was benefiting from prompt caching incurs
  repeated cache **writes** that can cost more than the pruning saves; the `clear_at_least`
  floor exists precisely to avoid this net-negative case.[^anthropic-context-editing]
- **Schema bloat, not output bloat.** If the context is dominated by *tool definitions*
  loaded up front — one real deployment consumed 143,000 of 200,000 tokens before the first
  user query — pruning tool *results* barely helps; the fix is deferred tool loading, a
  different lever entirely.[^mcp-bloat]
- **Compaction and caching in tension.** Triggering a compaction can cause a **cache miss**
  on the next request. On workloads where prompt caching alone is already capping resend
  cost, adding compaction may disrupt the cache hit rate without yielding net
  savings.[^bedrock-compaction]

[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-context-mgmt]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-cookbook]: Anthropic, "Context engineering: memory, compaction, and tool clearing," Claude Cookbook — <https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools>
[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^bedrock-compaction]: Amazon Bedrock User Guide, "Compaction (Anthropic Claude Messages API)" — <https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html>
[^complexity-trap]: "The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management," arXiv:2508.21433 — <https://arxiv.org/abs/2508.21433>
[^provence]: Chirkova et al., "Provence: efficient and robust context pruning for retrieval-augmented generation," Naver Labs Europe, ICLR 2025 — <https://arxiv.org/abs/2501.16214>
[^milvus-pruning]: Milvus (Zilliz), "LLM Context Pruning: A Developer's Guide to Better RAG and Agentic AI Results" — <https://milvus.io/blog/llm-context-pruning-a-developers-guide-to-better-rag-and-agentic-ai-results.md>
[^mcp-bloat]: AgentMarketCap, "MCP's Context Bloat Crisis" — <https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget>
[^langchain-summary-buffer]: LangChain, "ConversationSummaryBufferMemory," Python Reference — <https://reference.langchain.com/python/langchain-classic/memory/summary_buffer/ConversationSummaryBufferMemory>
[^langchain-summary]: LangChain, "ConversationSummaryMemory," Python Reference — <https://reference.langchain.com/python/langchain-classic/memory/summary/ConversationSummaryMemory>
[^llamaindex-summary-buffer]: LlamaIndex, "Chat Summary Memory Buffer," Documentation — <https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/>
