---
title: "Provider-Native Context Management"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Use providers' built-in context tools — Anthropic context editing, the memory tool, and server-side compaction, plus OpenAI Responses-API compaction — to shrink long-running agent/chat context by configuration instead of building your own pruning/summarization pipeline."
effort: Low
gain: High
riskToQuality: Medium
detectionSignals:
  - "Long-running agent or chat sessions where tool-result history grows every turn until it approaches the context window."
  - "A hand-rolled summarization/pruning layer is being built to keep sessions under the window."
  - "Old tool outputs (file reads, search results) are never cleared and are resent on every step."
  - "Multi-step agents fail or degrade at high turn counts because context is exhausted."
  - "Input tokens per turn climb steadily over a session while the useful working set stays small."
measurementMethods:
  - "Input tokens per turn over a long session, before vs. after enabling native management."
  - "Percent token reduction across a fixed N-turn workload (Anthropic reports the applied_edits cleared_input_tokens per call; use a token-count preview to model it)."
  - "Task-completion rate on long-horizon runs that previously hit the context limit."
  - "Cache-write cost incurred by clearing (clears invalidate the prefix) vs. tokens saved."
status: published
lastUpdated: "2026-07-02"
related:
  - "prompt-context/context-window-budgeting"
  - "prompt-context/structured-context-packing"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/summary-caching"
  - "agent-workflow/tool-use-minimization"
sources:
  - id: anthropic-context-mgmt
    title: "Managing context on the Claude Developer Platform"
    publisher: "Anthropic"
    year: 2026
    url: "https://claude.com/blog/context-management"
    accessed: "2026-07-02"
    kind: blog
    note: "Announcement. Context editing auto-clears stale tool calls/results near token limits; memory tool stores state outside the window via a file-based system. In a 100-turn web-search eval, context editing cut token consumption by 84%; memory + context editing improved performance 39% over baseline, context editing alone 29%."
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-02"
    kind: docs
    note: "clear_tool_uses_20250919 strategy: trigger (default 100k input tokens), keep (default 3 tool uses), clear_at_least, exclude_tools, clear_tool_inputs. Beta header context-management-2025-06-27. Clearing invalidates the cached prefix; clear_at_least avoids breaking cache for small clears. Response returns applied_edits with cleared_input_tokens."
  - id: anthropic-memory-tool
    title: "Memory tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool"
    accessed: "2026-07-02"
    kind: docs
    note: "Client-side file tool (memory_20250818) with view/create/str_replace/insert/delete/rename over a /memories directory; state persists across sessions outside the context window. Generally available; available on all Claude 4+ models. Pairs with context editing and compaction."
  - id: anthropic-compaction
    title: "Compaction"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/compaction"
    accessed: "2026-07-02"
    kind: docs
    note: "Server-side compaction (compact_20260112 edit; beta header compact-2026-01-12) auto-summarizes older context near the window limit — no client-side summarization code. Distinct from context editing, which clears specific tool results."
  - id: openai-conversation-state
    title: "Conversation state"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/conversation-state"
    accessed: "2026-07-02"
    kind: docs
    note: "Responses API manages state via previous_response_id / the Conversations API (store:true). Server-side compaction is enabled with context_management + compact_threshold."
  - id: openai-compaction
    title: "Compaction"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/compaction"
    accessed: "2026-07-02"
    kind: docs
    note: "Responses-API server-side compaction: when the rendered token count crosses compact_threshold, the server prunes context and emits an (encrypted) compaction item that carries forward prior state/reasoning in fewer tokens. ZDR-compatible."
  - id: gemini-caching
    title: "Context caching"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Gemini exposes context caching (implicit on by default for 2.5+; explicit cache objects) to reuse repeated input tokens — a cost/latency cache, not automatic pruning of a growing session."
---

## Overview

Long-running agents and chat sessions have a structural cost problem: the context grows
every turn. Each tool call appends its result — a file read, a web-search dump, a long
API response — and by default that history is resent, at full input price, on **every
subsequent step**. Left alone, a multi-step agent's per-turn input cost climbs steadily
until it either exhausts the context window and fails, or simply becomes expensive because
most of what it re-encodes each turn is stale.

The classic fix is to *build* a context pipeline: prune old messages, offload state to a
store, and summarize history into a rolling digest (the Level-3 "build" trio —
*Context Pruning*, *Context Offloading*, *Conversation Summarization*). **Provider-native
context management is the "buy/config" path**: providers now ship these mechanisms as
first-class API features you enable with a flag or a tool declaration, no custom pipeline
required. On Anthropic that means **context editing** (auto-clearing stale tool results),
the **memory tool** (offloading state to files outside the window), and **server-side
compaction** (auto-summarizing older context); on OpenAI it means the **Responses API's
server-side compaction** plus managed conversation state.[^anthropic-context-mgmt][^anthropic-context-editing][^openai-compaction]

Anthropic reports the headline number: in a 100-turn web-search evaluation, context
editing let agents complete workflows that would otherwise fail from context exhaustion
**while reducing token consumption by 84%**; pairing the memory tool with context editing
improved agentic performance **39% over baseline**, with context editing alone contributing
**29%**.[^anthropic-context-mgmt] Because it's configuration rather than engineering, this
sits at **Level 2** — but the auto-clearing carries a real risk (§ *Where It Would NOT
Work*), which is why it's not L1.

## Detailed Approach & Techniques

### Context editing — auto-clearing stale tool results (Anthropic)

Context editing "automatically clears stale tool calls and results from within the context
window when approaching token limits."[^anthropic-context-mgmt] You enable it with the
`clear_tool_uses_20250919` strategy under `context_management.edits`, behind the
`context-management-2025-06-27` beta header. The knobs:[^anthropic-context-editing]

- **`trigger`** — when clearing activates (default **100,000 input tokens**; can be set by
  `input_tokens` or `tool_uses`).
- **`keep`** — how many recent tool-use/result pairs to preserve (default **3**).
- **`clear_at_least`** — a minimum number of tokens to clear per activation. This exists to
  protect prompt caching: clearing content **invalidates the cached prefix** from the clear
  point on, so you incur a cache-write cost for the new prefix. `clear_at_least` ensures you
  only break the cache when the token savings justify it.[^anthropic-context-editing]
- **`exclude_tools`** — tool names never to clear (e.g. keep `web_search` results).
- **`clear_tool_inputs`** — whether to also clear the tool *call* parameters, not just the
  results (default `false`).

The API replaces each cleared result with a short placeholder so the model knows something
was removed, and returns an `applied_edits` block reporting `cleared_tool_uses` and
`cleared_input_tokens` — the auditable measure of what it saved. A token-count preview
endpoint lets you model the effect before spending.[^anthropic-context-editing]

### The memory tool — offloading state outside the window (Anthropic)

Context editing *deletes* stale context; the **memory tool** lets the model *keep* what
matters by writing it somewhere the window doesn't pay for. It's a client-side, file-based
tool (`memory_20250818`) exposing `view` / `create` / `str_replace` / `insert` / `delete` /
`rename` over a `/memories` directory that your application backs with real storage. Claude
records what it learns to files and reads them back on demand — "just-in-time context
retrieval" — so the active window stays focused while knowledge persists **across
sessions**, entirely outside the context window.[^anthropic-memory-tool] It's generally
available (no beta header) on all Claude 4+ models, and pairs naturally with context
editing: when a clear is imminent, the model can be prompted to save anything important to
memory first, so deletion is safe.[^anthropic-context-mgmt][^anthropic-memory-tool]

### Server-side compaction (Anthropic + OpenAI)

The third native mechanism is **compaction** — auto-summarizing older context server-side
as the conversation nears the window limit, with no client-side summarization code:

- **Anthropic** exposes it as the `compact_20260112` edit (beta header `compact-2026-01-12`).
  It detects the trigger, generates a summary, emits a `compaction` block, and continues
  with the compacted context. Anthropic calls it "the recommended strategy for managing
  context in long-running conversations." Unlike context editing (which *clears specific
  tool results*), compaction *summarizes the whole conversation*.[^anthropic-compaction]
- **OpenAI** ships the equivalent on the **Responses API**: set `context_management` with a
  `compact_threshold`, and when the rendered token count crosses it the server prunes
  context and emits an (encrypted) **compaction item** that "carries forward key prior state
  and reasoning into the next run using fewer tokens."[^openai-compaction] It builds on the
  Responses API's managed conversation state — `previous_response_id` or the Conversations
  API with `store: true` — so you don't reconstruct history by hand each turn.[^openai-conversation-state]

### What counts as "native management" vs. just caching

Be precise about the category boundary. **Gemini's context caching** (implicit-on for 2.5+,
plus explicit cache objects) reuses repeated *input* tokens at a discount — it's a
cost/latency cache, **not** automatic pruning of a growing session; it doesn't shrink the
working set, it just makes re-sending it cheaper.[^gemini-caching] Prompt caching
(*Prompt Caching / Prefix Caching*) is complementary and stacks with native management, but
it's a different lever. Native *management* is the set of features that actively **remove or
relocate** context: context editing, the memory tool, and compaction.

### The config-vs-build tradeoff

Reach for native management first: it's a few lines of config, it's maintained by the
provider, and it gets you most of the win. Build the L3 custom path (*Context Pruning*,
*Context Offloading*, *Conversation Summarization*, *State Compression for Agents*) only
when you need what config can't give you — a domain-specific eviction policy (e.g. "never
drop the legal citations, always drop the raw HTML"), a provider-portable pipeline across
vendors, or summarization tuned to your task. The native tools clear *by recency and tool
type*; a custom pruner clears *by relevance to your task*, and that difference is exactly
what pushes you to build.

## Example Where It Works

A research agent runs a 100-turn investigation, calling `web_search` and a file reader at
almost every step. Each search returns thousands of tokens of results; by turn 40 the
accumulated tool history is tens of thousands of tokens, most of it already-digested pages
the agent will never look at again — and every turn re-encodes all of it.

Enabling context editing with `clear_tool_uses_20250919` (`keep: 3`, `trigger: 30000`,
`clear_at_least: 5000`) means that once history crosses 30k tokens, the API drops the oldest
tool results — keeping the three most recent and clearing at least 5k tokens at a time to
avoid thrashing the prompt cache — and replaces them with placeholders. Anything the agent
must retain (findings, decisions) it has written to the **memory tool**, so nothing critical
is lost. This is precisely the scenario Anthropic benchmarked: the run completes instead of
dying on context exhaustion, at roughly **84% fewer tokens** than the uncleared
baseline.[^anthropic-context-mgmt][^anthropic-context-editing] Total engineering cost: a
config block and a memory handler.

## Example Where It Would NOT Work

- **The cleared result was still needed.** Auto-clearing evicts *by recency*, not by
  relevance. If turn 5's tool result is the one turn 60 needs to answer correctly — and it
  wasn't in the `keep` window or saved to memory — the model answers from a placeholder and
  silently degrades. The failure is invisible unless you eval for it; a domain-specific
  L3 pruner that scores relevance is the right tool when this risk is high.[^anthropic-context-editing]
- **Short or single-turn workloads.** If sessions never approach the trigger threshold,
  there's nothing to clear or compact — you pay setup cost for zero benefit. Native
  management earns its keep only on long-horizon agents and lengthy chats.[^anthropic-context-mgmt]
- **The problem is a bloated static prefix, not a growing history.** If per-turn cost is
  dominated by an oversized system prompt, tool schemas, or too many retrieved chunks, the
  fix is *Structured Context Packing*, *Tool-Use Minimization*, or *Context Window
  Budgeting* — not clearing tool results that aren't the bottleneck.
- **Naive clearing that fights your cache.** Because clears invalidate the cached prefix,
  a too-eager `trigger` with no `clear_at_least` can churn the prompt cache — paying repeated
  cache-write costs that erode, or exceed, the token savings. Tune `clear_at_least` (and
  prefer `exclude_tools` for cheap, frequently-referenced results) or the "optimization" can
  cost more than it saves.[^anthropic-context-editing]
- **Expecting Gemini context caching to do this.** Turning on Gemini caching does not prune
  a runaway session; it only discounts re-sent tokens. A growing agent context still grows —
  you need pruning/compaction (build it, or use a provider that offers it natively) rather
  than a cache.[^gemini-caching]

[^anthropic-context-mgmt]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-memory-tool]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^openai-conversation-state]: OpenAI API Docs, "Conversation state" — <https://developers.openai.com/api/docs/guides/conversation-state>
[^openai-compaction]: OpenAI API Docs, "Compaction" — <https://developers.openai.com/api/docs/guides/compaction>
[^gemini-caching]: Google, "Context caching," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/caching>
