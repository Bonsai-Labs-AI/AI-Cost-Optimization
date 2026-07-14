---
title: "State Compression for Agents"
category: agent-workflow
maturityLevel: 3
maturityProvisional: false
shortDescription: "Compress an agent's running state and trace — past steps, tool outputs, reasoning — into a compact working memory so a long autonomous run stops re-sending an ever-growing transcript at full input price on every step."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "The full trace (every prior step, tool call, and tool result) is re-sent on every step of an agent loop."
  - "Per-step input tokens grow roughly linearly with run length, so a long run's later steps cost several times its early ones."
  - "Fat tool outputs (search results, file dumps, API payloads) accumulate in context and are never cleared once used."
  - "Long autonomous or multi-session runs hit context-window limits or fail from context exhaustion."
  - "No compaction/summarization trigger and no external memory — working state lives entirely in the live window."
measurementMethods:
  - "Input tokens per step across a long run, before vs. after compression (and the peak-step token count)."
  - "Total tokens/$ per completed task on a fixed benchmark run."
  - "Compaction/clear trigger rate and the tokens cleared per event."
  - "Task success / quality at the eval bar, to confirm compression didn't drop needed state."
  - "Compression overhead: the summarization call's own input+output tokens as a share of the run."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/provider-native-context-management"
  - "prompt-context/conversation-summarization"
  - "prompt-context/context-offloading"
  - "agent-workflow/reusable-memory-artifact-store"
  - "caching-reuse/cache-aware-agent-design"
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
    note: "File-based store (/memories) the agent reads/writes on demand, keeping working state out of the live window (just-in-time retrieval). Pairs with compaction: 'memory preserves the information that must survive summarization.'"
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Agents in loops 'generate more and more data that could be relevant for the next turn.' Tool-result clearing is 'one of the safest lightest touch forms of compaction.' Compaction = summarize a trace nearing the window and reinitiate; maximize recall first, then precision."
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
  - id: zylos-compression
    title: "AI Agent Context Compression: Strategies for Long-Running Sessions"
    publisher: "Zylos Research"
    year: 2026
    url: "https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies/"
    accessed: "2026-07-03"
    kind: blog
    note: "Practitioner compression-ratio targets: conversation history 3:1–5:1, tool outputs/observations 10:1–20:1, last 5–7 turns uncompressed; trigger at ~70% context utilization. ACON reduces peak-token usage 26–54% at 95%+ task accuracy. ~65% of 2025 enterprise-AI failures attributed to context drift/memory loss in multi-step reasoning."
---

## Overview

An agent works by looping: it calls a model, the model chooses a tool, the tool returns
a result, and that result is appended to the conversation and fed back in on the next
step. Because every step re-sends **the entire history so far**, the input the model must
re-process grows with every step of the run — past reasoning, every tool call, and, worst
of all, every raw tool **output** (search results, file contents, API payloads) pile up
and are re-billed at full input price on each subsequent step.[^anthropic-context-engineering]

This is the dominant cost of long-horizon agents. On a run of *n* steps where history
grows by a roughly constant amount each step, the model re-encodes an ever-larger prefix,
so **cumulative input tokens for the run scale on the order of *n²***. A 40-step agent
therefore does not cost 40× a single step — it costs far more, because step 39 is paying
to re-read almost everything the first 38 steps produced. Left unmanaged, the run also
simply hits the context-window limit and fails from context exhaustion.

**State compression** breaks that growth. Instead of carrying the full transcript, the
agent maintains a **compact working state** — a rolling summary, a structured state
object, and/or a set of externalized notes — and re-sends *that* plus only the most recent
steps. This caps per-step input tokens on a long run at (roughly) a constant, converting
the O(n²) blow-up into something close to linear. In 2026 this is available both as a
build-it-yourself pattern and through **provider-native primitives** — compaction, context
editing (tool-result clearing), and a file-based memory tool — which is why it sits at
**Level 3**: real engineering leverage, but with off-the-shelf entry points. It absorbs
what used to be called *agent-trace summarization*.

## Detailed Approach & Techniques

The methods trade off along one axis: **how much of the raw trace you throw away vs. how
much you risk losing.** A production long-horizon agent usually stacks several.

### 1. Rolling trace summarization (compaction)

Once the running context crosses a threshold, summarize the older portion of the trace
into a compact block, keep the last few steps verbatim, and continue from the summary. In
Anthropic's terms this is **compaction**: "taking a conversation nearing the context
window limit, summarizing its contents, and reinitiating a new context window with the
summary," preserving decisions and unresolved work while discarding redundant tool
output.[^anthropic-context-engineering] The **provider-native** version
(`compact_20260112`) does it server-side — it fires when input tokens reach a trigger
(default 150k, minimum 50k), emits a `compaction` block, and on later requests
automatically drops every block *before* it.[^anthropic-compaction] The practitioner rule
of thumb is to **trigger at ~70% of the context budget** and compress old conversation
turns at **3:1–5:1** while leaving the last 5–7 turns untouched.[^zylos-compression]

The key cost caveat: the summarization is **its own model call**. Anthropic bills it as a
separate sampling iteration whose usage is *not* included in the top-level token counts —
you must sum `usage.iterations` to get the real cost.[^anthropic-compaction] Compress too
often on too little and the summary calls eat the savings.

### 2. Structured state objects

Rather than free-text summaries, keep a **schema'd state object** the agent updates in
place: `intent`, `changes made`, `decisions taken`, `open sub-tasks`, `next steps`. This
"anchored" state is re-sent every step at a fixed, small size; only newly-evicted spans
are merged into it.[^zylos-compression] Framing agent memory as **execution state** rather
than a growing transcript is the thesis of recent long-horizon-agent research: structured
state representations cut token requirements versus raw trace concatenation while holding
task success, because the structure preserves the decision-critical fields.[^zylos-compression]

### 3. Dropping resolved sub-tasks and stale tool outputs

The biggest, coarsest cut is removing whole blocks the agent no longer needs — completed
sub-tasks, and **raw tool results** it has already extracted what it needs from. Tool-result
clearing is "one of the safest, lightest-touch forms of compaction" because a re-fetchable
result doesn't need to sit in context after it's been used.[^anthropic-context-engineering]
Natively, **context editing** (`clear_tool_uses_20250919`) clears the oldest tool results
once context passes a trigger (default 100k input tokens), keeps the most recent N
(default 3), replaces each cleared block with a placeholder, and uses `clear_at_least` so a
clear is big enough to be worth the cache write it forces.[^anthropic-context-editing]
Compression ratios here are the largest — verbose tool outputs compress **10:1–20:1**.[^zylos-compression]

### 4. Offloading state to external memory

Compression's limit is that anything you drop is gone. The escape hatch is to move state
**out of the window** into a store the agent reads on demand. Anthropic's file-based
**memory tool** lets the agent write notes/progress/artifacts to `/memories` and read them
back "just-in-time," so the active context stays focused on the current step; it explicitly
**pairs with compaction** — "memory preserves the information that must survive
summarization."[^anthropic-memory-tool] The cookbook's worked long-running research agent
(≈320k tokens of documents across sessions) uses all three primitives together: compaction
for dialogue accumulation, clearing for re-fetchable tool output, memory for
cross-session state.[^anthropic-cookbook] (This offloading pattern is developed further in
its own techniques — see *Context Offloading* and *Reusable Memory / Artifact Store*.)

### The payoff, and the caution

Anthropic's own evals quantify both: **context editing alone lifted agentic-search
performance by 29%**, and **context editing + the memory tool by 39%** over an unmanaged
baseline — and in a **100-turn web-search evaluation, context editing cut token consumption
by 84%** while letting the agent finish runs that would otherwise have died of context
exhaustion.[^anthropic-context-management-announce] That last number is the headline for
cost: on a long run, four-fifths of the input tokens were pure re-processing overhead.

The caution is symmetric. Compression that drops a fact a *later* step needs causes
**context drift** — and drift/memory-loss in multi-step reasoning was blamed for roughly
**65% of enterprise-AI failures** in 2025.[^zylos-compression] Compress for recall first
(capture everything relevant), then tighten for precision.[^anthropic-context-engineering]
And every compression method has a cost of its own — the summary call, the memory
read/writes, the cache invalidation a clear forces[^anthropic-context-editing] — so on
*short* runs the machinery loses to just sending the whole trace.

## Example Where It Works

A coding/research agent runs an autonomous task that takes **40 steps**. Each step's
tool output — file reads, test logs, search results — averages **~4,000 tokens**, and the
system prompt + tools are another ~6,000. With no compression, by step 40 the input is the
6k prefix plus ~40 × 4k ≈ **160k tokens of accumulated trace**, and the *cumulative* input
across all 40 steps is on the order of 3M tokens — the classic O(n²) profile, and it's
brushing the context-window ceiling.[^anthropic-context-engineering]

Turn on **tool-result clearing** (keep the last 3 tool results, clear the rest past a 30k
trigger) plus a **structured state object** carrying the task plan and decisions. Now each
step re-sends the 6k prefix, a small anchored state, and only the three most recent tool
results (~12k) — per-step input is roughly **flat at ~20k** instead of climbing to 160k.
Consistent with Anthropic's 100-turn result, the long run's token consumption drops on the
order of **~80%**, the run stops hitting the window limit, and — because the cleared blobs
were re-fetchable — task quality is preserved or improves.[^anthropic-context-management-announce][^anthropic-context-editing]
At scale (thousands of such runs a day), that is the difference between an agent product
that is profitable per task and one that is not.

## Example Where It Would NOT Work

- **Short runs.** A 3–5 step agent never accumulates enough trace to matter. The context
  never approaches the compaction trigger, and the extra summarization call, memory
  round-trips, and cache-invalidation from a clear[^anthropic-compaction][^anthropic-context-editing]
  cost *more* than just re-sending the small transcript. Below the growth threshold,
  compression is negative ROI.

- **Every step genuinely needs the full detail.** Some tasks — precise multi-file
  refactors, legal/financial reasoning where an earlier exact figure must be recalled
  verbatim — can't tolerate lossy summaries or dropped tool outputs. Compressing away a
  detail a later step depends on produces context drift and a wrong result, exactly the
  failure mode behind most multi-step agent breakdowns.[^zylos-compression] Here the right
  move is *offloading* the detail to memory (recallable in full) rather than *compressing*
  it away.[^anthropic-memory-tool]

- **The prefix, not the trace, is the cost.** If most of the input is a large stable
  system prompt / tool schema that repeats each step, the cheaper first move is **prompt
  caching plus cache-aware agent design** — reuse the prefix at ~0.1× rather than
  compressing it. Note the tension: clearing tool results mid-run **invalidates the cached
  prefix** at the clear point, so aggressive compression and prompt caching can work
  against each other and must be tuned together (that's what `clear_at_least`
  is for).[^anthropic-context-editing]

[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-memory-tool]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-context-management-announce]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-cookbook]: Anthropic, "Context engineering: memory, compaction, and tool clearing," Claude Cookbook — <https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools>
[^zylos-compression]: Zylos Research, "AI Agent Context Compression: Strategies for Long-Running Sessions," 2026 — <https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies/>
