---
title: "Agent Memory Management"
category: agent-workflow
maturityLevel: 2
maturityProvisional: false
shortDescription: "Control what an agent holds in context across steps and sessions by compressing in-context state and externalizing completed work to a persistent store — keeping less and reusing more to break the O(n²) token growth that makes long-horizon agents expensive."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "The full trace (every prior step, tool call, and tool result) is re-sent on every step of an agent loop."
  - "Per-step input tokens grow roughly linearly with run length, so a long run's later steps cost several times its early ones."
  - "Fat tool outputs (search results, file dumps, API payloads) accumulate in context and are never cleared once used."
  - "Long autonomous or multi-session runs hit context-window limits or fail from context exhaustion."
  - "Agents re-derive the same intermediate results (computed answers, generated code/docs, extracted facts) on every new session instead of reusing prior work."
  - "Each session starts cold — re-exploring a codebase, re-summarizing the same documents, or re-learning user preferences it already learned last time."
  - "No compaction/summarization trigger and no external memory — working state lives entirely in the live context window and is discarded when the run ends."
measurementMethods:
  - "Input tokens per step across a long run, before vs. after compression (and the peak-step token count)."
  - "Total tokens/$ per completed task on a fixed benchmark run."
  - "Compaction/clear trigger rate and the tokens cleared per event."
  - "Artifact/memory reuse rate (share of runs that read a stored artifact instead of regenerating it)."
  - "Tokens and tool cost avoided per run by serving a stored artifact vs. re-deriving it."
  - "Task success / quality at the eval bar, to confirm compression or reuse didn't drop needed state."
  - "Staleness incidents: how often a stored artifact was served but was out of date."
status: published
lastUpdated: "2026-07-14"
related:
  - "prompt-context/provider-native-context-management"
  - "prompt-context/context-reduction"
  - "prompt-context/context-offloading"
  - "caching-reuse/cache-aware-agent-design"
  - "caching-reuse/tool-result-caching"
sources:
  - id: anthropic-compaction
    title: "Compaction"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/compaction"
    accessed: "2026-07-03"
    kind: docs
    note: "Server-side summarization of older context when input tokens hit a trigger threshold (default 150k, min 50k). Emits a compaction block; subsequent requests drop all blocks before it. The summarization is an extra sampling iteration billed separately (usage.iterations), so total cost must sum across iterations."
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-03"
    kind: docs
    note: "clear_tool_uses_20250919 clears the oldest tool results once context passes a trigger (default 100k input tokens), keeping the most recent N (default 3). clear_at_least justifies the cache write it forces. Also clears thinking blocks. Clearing invalidates the cached prefix at the clear point."
  - id: anthropic-memory-tool
    title: "Memory tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool"
    accessed: "2026-07-03"
    kind: docs
    note: "File-based store (/memories, client-side) the agent reads/writes on demand, keeping working state out of the live window. GA on the Messages API, Claude 4+. Persists between sessions; pairs with compaction — 'memory preserves the information that must survive summarization.' Claude auto-views its memory directory before acting when the tool is present."
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Agents in loops 'generate more and more data that could be relevant for the next turn.' Tool-result clearing is 'one of the safest lightest touch forms of compaction.' 'Structured note-taking, or agentic memory' persists notes outside the context window; just-in-time retrieval loads data on demand. Compress for recall first, then precision."
  - id: anthropic-context-management-announce
    title: "Managing context on the Claude Developer Platform"
    publisher: "Anthropic (claude.com)"
    year: 2025
    url: "https://claude.com/blog/context-management"
    accessed: "2026-07-03"
    kind: blog
    note: "Context editing alone: +29% on agentic search; context editing + memory tool: +39% over baseline. In a 100-turn web-search eval, context editing let agents finish runs that would otherwise fail from context exhaustion while cutting token consumption by 84%."
  - id: anthropic-cookbook
    title: "Context engineering: memory, compaction, and tool clearing"
    publisher: "Anthropic — Claude Cookbook"
    year: 2026
    url: "https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools"
    accessed: "2026-07-03"
    kind: repo
    note: "Worked long-running research agent (~320k tokens of documents across sessions) demonstrating the three primitives: compaction handles dialogue accumulation, tool-result clearing manages re-fetchable outputs, memory enables cross-session persistence."
  - id: anthropic-harnesses
    title: "Effective harnesses for long-running agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Multi-session pattern: a progress file, a feature-list registry, and git history let a new session read prior state instead of re-exploring — 'saves Claude some tokens in every session since it doesn't have to figure out how to test the code.'"
  - id: zylos-compression
    title: "AI Agent Context Compression: Strategies for Long-Running Sessions"
    publisher: "Zylos Research"
    year: 2026
    url: "https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies/"
    accessed: "2026-07-03"
    kind: blog
    note: "Practitioner compression-ratio targets: conversation history 3:1–5:1, tool outputs/observations 10:1–20:1, last 5–7 turns uncompressed; trigger at ~70% context utilization. ACON reduces peak-token usage 26–54% at 95%+ task accuracy. ~65% of 2025 enterprise-AI failures attributed to context drift/memory loss in multi-step reasoning."
  - id: mem0-paper
    title: "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"
    publisher: "arXiv:2504.19413"
    year: 2026
    url: "https://arxiv.org/abs/2504.19413"
    accessed: "2026-07-03"
    kind: paper
    note: "On the LOCOMO benchmark, selective external memory saves >90% token cost and attains 91% lower p95 latency vs. processing the entire conversation history, at a modest accuracy trade."
  - id: redis-ltm
    title: "Long-Term Memory Architectures for AI Agents"
    publisher: "Redis Blog"
    year: 2026
    url: "https://redis.io/blog/long-term-memory-architectures-ai-agents/"
    accessed: "2026-07-03"
    kind: blog
    note: "Long-term memory splits into semantic (facts), episodic (events), procedural (skills); read-before-reasoning / write-after-acting loop; ingestion→embed→retrieve→consolidate pipeline. LOCOMO figures: full-context 72.9% acc / 17.12s p95 / ~26,031 tokens vs. selective memory 66.9% / 1.44s / ~1,764 tokens. Consolidation/forgetting is the hard, unsolved part."
  - id: mem0-cost
    title: "How to Reduce LLM Token Costs for AI Agent Memory"
    publisher: "Mem0 Blog"
    year: 2026
    url: "https://mem0.ai/blog/6-techniques-to-cut-ai-agent-memory-cost-beyond-basic-retrieval"
    accessed: "2026-07-03"
    kind: blog
    note: "Measured with real GPT-4o-mini calls: top-5 retrieval 166 tokens vs. 594-token naive full dump = 72% reduction; token-budgeting, hierarchical summarization and eviction stack to a claimed 3–4× total cost reduction. Storage: int8 quantization = 4× smaller."
  - id: mem0-ltm
    title: "Long-Term Memory for AI Agents: The What, Why and How"
    publisher: "Mem0 Blog"
    year: 2026
    url: "https://mem0.ai/blog/long-term-memory-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Pipeline: extract facts from raw text → consolidate (merge on similarity >0.85, dedupe >0.9) → store (vectors/graph) → retrieve by relevance×recency×type. Turns 'stateless AI agents into stateful knowledge accumulators.'"
---

## Overview

An agent works by looping: call a model, pick a tool, get a result, append it to
context, repeat. That loop has a compounding cost problem on two timescales.

**Within a run**, every step re-sends the entire history to date — past reasoning, every
tool call, and, worst of all, every raw tool **output** (search results, file contents,
API payloads) pile up and are re-billed at full input price on each subsequent
step.[^anthropic-context-engineering] On a run of *n* steps where history grows by a
roughly constant amount each step, **cumulative input tokens scale on the order of n²**.
A 40-step agent does not cost 40× a single step — by step 39, the model is paying to
re-read almost everything the first 38 steps produced. Left unmanaged, the run eventually
hits the context-window limit and dies of context exhaustion.

**Across runs**, most agents are stateless between sessions: they start every new run
from a cold context, re-read the same codebase, re-summarize the same documents,
re-run the same lookups, re-learn the same preferences — then throw all of it away when
the session ends.[^redis-ltm] Every re-derivation is paid for again, in tokens and tool
calls, on the next run.

Agent memory management addresses both problems through two complementary moves:

- **Keep less** — compress the in-context trace by summarizing, structured state, and
  dropping tool outputs the agent no longer needs.
- **Store and reuse** — externalize completed work (artifacts, facts, decisions) to a
  durable store so a later step or a later session can retrieve rather than re-derive it.

Together they convert the O(n²) within-run blow-up into something close to linear, and
turn each run's output into an asset that amortizes across future runs. This is **L2**
work — real engineering, not a config flag — but with strong off-the-shelf entry points
(provider-native compaction, context editing, and the memory tool) that substantially lower
the build cost.

## Detailed Approach & Techniques

### 1. Rolling trace summarization (compaction)

Once the running context crosses a threshold, summarize the older portion of the trace
into a compact block, keep the last few steps verbatim, and continue from the summary.
Anthropic's native **compaction** (`compact_20260112`) does this server-side: it fires when
input tokens reach a trigger (default 150k, minimum 50k), emits a `compaction` block, and
on later requests automatically drops every block before it.[^anthropic-compaction] The
practitioner rule of thumb is to **trigger at ~70% of the context budget** and compress
old conversation turns at **3:1–5:1** while leaving the last 5–7 turns
untouched.[^zylos-compression]

The key cost caveat: the summarization is **its own model call**, billed as a separate
sampling iteration not included in the top-level token counts — you must sum
`usage.iterations` to get the real total.[^anthropic-compaction] Compress too often on too
little and the summary calls eat the savings.

### 2. Structured state objects

Rather than free-text summaries, keep a **schema'd state object** the agent updates in
place: `intent`, `changes made`, `decisions taken`, `open sub-tasks`, `next steps`. This
"anchored" state is re-sent every step at a fixed, small size; only newly-evicted spans
are merged into it.[^zylos-compression] Framing agent memory as **execution state** rather
than a growing transcript cuts token requirements while holding task success, because the
structure preserves the decision-critical fields without the redundant prose.

### 3. Dropping stale tool outputs

The biggest, coarsest cut is removing whole blocks the agent no longer needs — completed
sub-tasks and **raw tool results** it has already extracted what it needs from. Tool-result
clearing is "one of the safest, lightest-touch forms of compaction" because a re-fetchable
result does not need to sit in context after it has been used.[^anthropic-context-engineering]
Natively, **context editing** (`clear_tool_uses_20250919`) clears the oldest tool results
once context passes a trigger (default 100k input tokens), keeps the most recent N (default
3), replaces each cleared block with a placeholder, and uses `clear_at_least` so a clear is
big enough to justify the cache write it forces.[^anthropic-context-editing] Compression
ratios here are the largest — verbose tool outputs compress **10:1–20:1**.[^zylos-compression]

### 4. Externalizing state to a persistent store

Compression's limit is that anything you drop is gone. The escape hatch is to move state
**out of the window** into a store the agent reads on demand. Anthropic's file-based
**memory tool** (`memory_20250818`, GA on the Messages API, Claude 4+) lets the agent write
notes, progress, and artifacts to a `/memories` directory that **persists between sessions**;
when the tool is present, Claude automatically reads its memory directory before acting.
Crucially, the store is **client-side** — Claude requests `create`/`view`/`str_replace`/
`delete`/`rename` operations, your application executes them against storage you control
(a per-user directory, S3, or a database), so you own retention, size caps, and
expiry.[^anthropic-memory-tool]

The primitive **pairs with compaction**: "memory preserves the information that must survive
summarization."[^anthropic-memory-tool] The cookbook's worked long-running research agent
(≈320k tokens of documents across sessions) uses all three together: compaction for dialogue
accumulation, clearing for re-fetchable tool output, memory for cross-session
persistence.[^anthropic-cookbook]

### 5. What to put in the store (the three memory kinds)

Long-term agent memory splits into three useful categories:[^redis-ltm]

- **Semantic** — durable facts and distilled knowledge: user preferences ("deploys to
  Railway, prefers Python"), domain rules, a project's architecture summary.
- **Episodic** — time-indexed records of what happened: past decisions, run outcomes,
  sub-tasks that were tried and failed — so the next run doesn't repeat them.
- **Procedural** — reusable artifacts and skills: generated code or utilities, document
  summaries, extraction templates, solved sub-task outputs — the things most expensive to
  re-derive.

Anthropic's long-running-agent harness uses the pattern concretely for multi-session
software work: a `claude-progress.txt` log, a feature-list registry, and git history let a
new session **read prior state instead of re-exploring** the codebase — which, in their
words, "saves Claude some tokens in every session since it doesn't have to figure out how
to test the code."[^anthropic-harnesses]

### 6. The read/write loop and retrieval pipeline

Framework memory systems (mem0, Redis Agent Memory Server, LangGraph stores) implement a
**read-before-reasoning, write-after-acting** loop: on input, query the long-term store and
inject only what's relevant; after acting, extract new facts/artifacts and write them
back.[^redis-ltm] The write path is a small pipeline — **extract** facts from raw text →
**consolidate** (merge near-duplicates above a similarity threshold, e.g. >0.85; dedupe
above 0.9) → **store** as vectors or a graph → **retrieve** later by a relevance ×
recency × type score.[^mem0-ltm] Consolidation keeps the store from growing without bound
and keeps retrieval sharp. On the LOCOMO long-conversation benchmark, selective memory used
**~1,764 tokens per conversation vs. ~26,031 for full-context — a >90% token-cost
reduction and 91% lower p95 latency (1.44s vs. 17.12s)**, at a ~6-point accuracy
trade.[^redis-ltm][^mem0-paper]

### The payoff, and the caution

Anthropic's evals quantify both sides: **context editing alone lifted agentic-search
performance by 29%**, and **context editing + the memory tool by 39%** over an unmanaged
baseline — in a **100-turn web-search evaluation, context editing cut token consumption by
84%** while letting agents finish runs that would otherwise have died of context
exhaustion.[^anthropic-context-management-announce]

The caution is symmetric. Compression that drops a detail a later step needs causes
**context drift** — drift and memory-loss in multi-step reasoning was blamed for roughly
**65% of enterprise-AI failures in 2025**.[^zylos-compression] The right strategy: compress
for recall first (capture everything relevant), then tighten for
precision.[^anthropic-context-engineering] And every method has overhead of its own — the
summary call, the memory read/writes, the cache invalidation a tool-result clear
forces[^anthropic-context-editing] — so on *short* runs the machinery loses to just sending
the whole trace.

## Example Where It Works

A coding agent maintains ~200 internal microservices and runs a nightly **dependency-upgrade
task** per service. Without a store, each night's run re-derives the same context: it
re-reads the service's architecture, re-summarizes its README and CI config, and
re-discovers the test command — thousands of tokens and several tool calls of "getting
oriented" *before it does any actual work*, repeated every night for every service.

With agent memory management applied, the first run writes a per-service artifact —
architecture summary, test command, known-flaky tests, prior upgrade decisions — into
`/memories`. Every subsequent night's run **reads that artifact** instead of rebuilding it,
exactly the progress-file pattern Anthropic documents.[^anthropic-harnesses] Because the
orientation phase is pure re-derivation of stable facts, retrieving it rather than
regenerating it eliminates the large fixed per-run overhead — in the same class as the
**>90% token reduction** selective memory shows on repeated long-context work.[^mem0-paper]

Within each run, **tool-result clearing** keeps the per-step token count flat. The run
reads logs, test output, and changelog entries step by step; each result is used and then
cleared. Rather than a 40-step run that accumulates 160k tokens of trace by step 40 (the
classic O(n²) profile), per-step input stays roughly **flat at ~20k** — consistent with
Anthropic's 100-turn result where token consumption dropped on the order of
**~80%**.[^anthropic-context-management-announce][^anthropic-context-editing] At scale
(thousands of such runs a night), that is the difference between an agent product that is
profitable per task and one that is not.

## Example Where It Would NOT Work

- **Short or one-off runs.** A 3–5 step agent never accumulates enough trace to matter.
  The context never approaches the compaction trigger, and the extra summarization call,
  memory round-trips, and cache-invalidation from a tool-result clear cost *more* than just
  re-sending the small transcript.[^anthropic-compaction][^anthropic-context-editing] Below
  the growth threshold, all of this machinery is negative ROI.

- **Low overlap between runs.** If every task is genuinely novel — one-off research
  questions, unique user requests with no shared sub-problems — there is nothing to reuse
  across sessions. The store adds retrieval latency and storage/ops burden on every run
  while almost never scoring a hit; below meaningful repetition, a stateless agent (plus
  ordinary within-run prompt/tool caching) is cheaper.

- **Fast-changing underlying data → stale artifacts.** The core risk of the store is
  serving a stored artifact as if it were fresh when the world moved on: a cached
  architecture summary after a refactor, an extracted price after it changed, a "learned
  fact" that is now wrong. Deciding what to safely drop or refresh — **consolidation and
  forgetting — "remains a major open problem"**, and getting it wrong "can hurt answer
  quality, inflate storage costs, or leak stale context into new sessions."[^redis-ltm]
  For volatile data, per-artifact TTLs and event-based invalidation are mandatory, and
  where correctness is safety-critical, re-derivation may simply be the right call.

- **The prefix, not the trace, is the cost.** If most of the input is a large stable
  system prompt or tool schema that repeats each step, the cheaper first move is **prompt
  caching plus cache-aware agent design** — reuse the prefix at ~0.1× rather than
  compressing it. Note the tension: clearing tool results mid-run **invalidates the cached
  prefix** at the clear point, so aggressive compression and prompt caching can work against
  each other and must be tuned together (that is what `clear_at_least` is
  for).[^anthropic-context-editing]

[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-memory-tool]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-context-management-announce]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-cookbook]: Anthropic, "Context engineering: memory, compaction, and tool clearing," Claude Cookbook — <https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools>
[^anthropic-harnesses]: Anthropic, "Effective harnesses for long-running agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
[^zylos-compression]: Zylos Research, "AI Agent Context Compression: Strategies for Long-Running Sessions," 2026 — <https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies/>
[^mem0-paper]: Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory," arXiv:2504.19413 — <https://arxiv.org/abs/2504.19413>
[^redis-ltm]: Redis, "Long-Term Memory Architectures for AI Agents" — <https://redis.io/blog/long-term-memory-architectures-ai-agents/>
[^mem0-cost]: Mem0, "How to Reduce LLM Token Costs for AI Agent Memory" — <https://mem0.ai/blog/6-techniques-to-cut-ai-agent-memory-cost-beyond-basic-retrieval>
[^mem0-ltm]: Mem0, "Long-Term Memory for AI Agents: The What, Why and How" — <https://mem0.ai/blog/long-term-memory-ai-agents>
