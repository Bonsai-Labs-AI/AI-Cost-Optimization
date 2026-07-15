---
title: "Context Offloading / Filesystem-as-Memory"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Move an agent's working state out of the live context window into an external store (files, a scratchpad, a memory tool) and pull back only what's needed per step, instead of re-sending the whole accumulated transcript every turn."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "The entire working state (all prior tool outputs, notes, sub-results) is carried in-context on every turn of a long or branching task."
  - "Per-turn input tokens grow monotonically with task progress — a long agent run's cost curve is superlinear."
  - "Fat tool outputs (file dumps, search results, API payloads) sit in context long after the model has already used them."
  - "No external scratchpad, notes file, or memory store; the context window is the only place state lives."
  - "Long-horizon runs fail or degrade as they approach the context limit rather than because the task is hard."
measurementMethods:
  - "Input tokens per turn/step over a long task, before vs. after offloading (look for a flat vs. rising curve)."
  - "Share of working state held out-of-context vs. in-context."
  - "Total tokens consumed to complete a fixed long-horizon task."
  - "Task success / completion rate on runs that previously hit context exhaustion."
  - "Extra retrieval calls + latency added by read-back steps (the offloading tax)."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/context-reduction"
  - "prompt-context/context-reduction"
  - "caching-reuse/cache-aware-agent-design"
  - "agent-workflow/agent-memory-management"
  - "agent-workflow/agent-memory-management"
sources:
  - id: anthropic-memory
    title: "Memory tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool"
    accessed: "2026-07-03"
    kind: docs
    note: "Client-side memory tool: Claude reads/writes files in a /memories directory via six commands (view, create, str_replace, insert, delete, rename). Supports just-in-time retrieval — records what it learns and reads back on demand rather than loading everything up front. GA on Claude 4+; no beta header."
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Structured note-taking: the agent writes notes to memory outside the context window and pulls them back later — 'persistent memory with minimal overhead.' Claude Playing Pokémon maintains tallies and maps across context resets to sustain multi-hour sequences; Claude Code writes to-do lists to track progress while discarding redundant tool output."
  - id: anthropic-context-mgmt
    title: "Managing context on the Claude Developer Platform"
    publisher: "Anthropic / Claude"
    year: 2025
    url: "https://claude.com/blog/context-management"
    accessed: "2026-07-03"
    kind: blog
    note: "In a 100-turn web search evaluation, context editing reduced token consumption by 84% while completing workflows that would otherwise fail from context exhaustion. Combining the memory tool with context editing improved performance by 39% over baseline; context editing alone gave 29%."
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-03"
    kind: docs
    note: "Server-side clearing of stale tool results (clear_tool_uses_20250919). Pairs with the memory tool: on approaching the clearing threshold Claude is warned to save important tool results to memory files before they're cleared. Token-count example shows 70,000 original input tokens reduced to 25,000."
  - id: langchain-deepagents-docs
    title: "Context engineering in Deep Agents"
    publisher: "LangChain — Docs"
    year: 2026
    url: "https://docs.langchain.com/oss/python/deepagents/context-engineering"
    accessed: "2026-07-03"
    kind: docs
    note: "Deep Agents auto-offloads tool outputs over 20,000 tokens to a filesystem backend, substituting a file-path reference plus a 10-line preview; older tool calls become pointers to disk. read_file/grep retrieve offloaded content on demand. Summarization is the fallback at ~85% of the window."
  - id: langchain-deepagents-blog
    title: "Context Management for Deep Agents"
    publisher: "LangChain — Blog"
    year: 2026
    url: "https://www.langchain.com/blog/context-management-for-deepagents"
    accessed: "2026-07-03"
    kind: blog
    note: "Filesystem abstraction (list/read/write/search) as the offload target; three-tier approach — large tool-result offloading, large tool-input offloading, summarization fallback — showing a sharp token drop when a compression event fires."
  - id: anthropic-harnesses
    title: "Effective harnesses for long-running agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Multi-session pattern: an initializer session writes a progress log + feature checklist to memory files; each later session reads them to resume without re-exploring the codebase, treating memory as a recovery mechanism across context resets."
---

## Overview

Agents that run for many steps have a structural cost problem: **every turn re-sends the
entire accumulated state**. Each tool result, each intermediate note, each earlier
sub-answer stays in the message history and is re-billed as input on the *next* turn, and
the turn after that, and so on. Because the transcript only grows, per-turn input cost
rises with task progress — a long run's token spend curves upward, and eventually the run
either gets expensive or hits the context limit and fails. Fat tool outputs (a file dump,
a page of search results, a large API payload) are the worst offenders: the model reads
them once, then keeps paying to carry them for the rest of the run.[^langchain-deepagents-docs]

**Context offloading** breaks that curve. Instead of keeping all working state in the live
context window, the agent writes intermediate results, notes, and bulky tool outputs to an
**external store** — a filesystem, a scratchpad file, a memory tool, or a database — and
pulls back **only what the current step needs**, using a lightweight identifier (a file
path or query) rather than the full content.[^anthropic-context-eng] Anthropic calls the
retrieval side of this *just-in-time context retrieval*: "an agent records what it learns
in memory files and reads them back on demand … keeps the active context focused on the
current task."[^anthropic-memory]

The cost mechanism is direct: the per-turn window stays small and roughly flat instead of
growing with the task, so you stop paying to re-encode state the model has already used.
In Anthropic's own 100-turn web-search evaluation, clearing stale tool results from context
**cut token consumption by 84%** while letting the agent finish work that would otherwise
have failed from context exhaustion; pairing that clearing with a memory tool to preserve
what mattered **improved task performance by 39%** over baseline.[^anthropic-context-mgmt]
It sits at **L2** because doing it well is real engineering — an external store, a
read/write protocol, retrieval logic, and the judgment about *what* to offload and *when*
to read it back — not a config flag.

## Detailed Approach & Techniques

### The core loop

1. **Offload** — when the agent produces or receives a large or no-longer-active chunk of
   state (a tool output, a computed result, a plan), write it to the external store and
   replace it in context with a compact reference: a file path, an ID, and optionally a
   short preview.
2. **Keep working memory small** — the live context holds the task, recent turns, and the
   *pointers*, not the full payloads.
3. **Read back just-in-time** — when a later step needs a specific piece of state, the
   agent fetches it by reference (read the file, grep for the line range, query the store)
   and pulls only that slice into context.[^anthropic-memory][^langchain-deepagents-docs]

### Native primitive: the Anthropic memory tool

The memory tool is the 2026 first-class primitive for this pattern. It gives the model a
`/memories` directory and six file operations — `view`, `create`, `str_replace`, `insert`,
`delete`, `rename` — that it calls to persist and retrieve state. The tool is **client-side**:
the model *requests* a file operation and your application executes it against storage you
control (disk, a database, per-user keys), so `/memories` is just a prefix you map onto real
storage. It runs on Claude 4+ with **no beta header**.[^anthropic-memory] Because the model
records what it learns and reads it back on demand, "this keeps the active context focused on
the current task, which matters for long-running sessions that would otherwise overwhelm the
context window."[^anthropic-memory]

Offloading pairs naturally with **context editing**, which server-side clears stale tool
results once context passes a threshold (`clear_tool_uses_20250919`). The two combine safely:
as context approaches the clearing threshold, Claude is warned to **save important tool
results to memory files before they are cleared** — so the bulky content leaves the window
but a durable copy survives on disk for later read-back. A token-count example in the docs
shows the original 70,000 input tokens reduced to 25,000 after clearing.[^anthropic-context-editing]

### Framework primitive: virtual filesystem offloading

Framework runtimes automate the same loop. LangChain's Deep Agents **automatically offload
any tool output over ~20,000 tokens** to a filesystem backend, substituting a **file-path
reference plus a 10-line preview** in context; older tool calls are collapsed into pointers
to disk. The agent retrieves offloaded content on demand with `read_file` and `grep`
(progressive disclosure — start with a snippet or line range, expand only if needed). If
offloading alone can't keep the window under budget, a **summarization fallback** fires at
around **85% of the model's window**, compressing history into a structured summary while
the full messages are preserved to the filesystem for recovery.[^langchain-deepagents-docs][^langchain-deepagents-blog]

### The structured note-taking / scratchpad pattern (DIY)

Even without a native tool, the pattern is "the agent regularly writes notes persisted to
memory outside of the context window … pulled back into the context window at later times" —
Anthropic describes this as **persistent memory with minimal overhead**. Claude Code writes
to-do lists to track progress across a long task while discarding redundant tool output;
Claude Playing Pokémon maintains precise tallies and maps ("for the last 1,234 steps I've
been training …") across context resets, which is what lets it sustain multi-hour
sequences.[^anthropic-context-eng] For work spanning multiple sessions, an **initializer**
session writes a progress log and feature checklist to memory, and each later session reads
them to resume without re-exploring the codebase — memory as a recovery mechanism across
context resets.[^anthropic-harnesses]

### What to offload (and what not to)

Offload **bulky, already-consumed, or intermittently-needed** state: raw tool payloads, large
retrieved documents, computed intermediate artifacts, long plans, and resolved sub-task
outputs. Keep **in-context** the small, hot state the model reasons over every step (the
current objective, recent turns, and the references themselves). The judgment call is the
technique: offload too aggressively and the agent pays extra read-back round-trips for state
it needed anyway; offload the wrong thing and a later step misses context it can't recover.

### Costs and risks (be honest)

- **Retrieval overhead.** Each read-back is an extra tool call — added latency and, in an
  agent loop, another model turn to issue and process it. Offloading trades a large, constant
  in-context tax for a smaller, variable retrieval tax; it only wins when the state is big
  and re-sent many times.
- **Bad-read failures.** If the agent reads the wrong file, an outdated version, or misses a
  needed slice, it acts on missing state. Provenance, clear file naming, and previews reduce
  this, but it's the core quality risk.
- **Storage discipline.** Files grow, go stale, and clutter. Anthropic's guidance calls for
  size caps, expiration of unused files, and — critically — **path-traversal protection**,
  since the model requests paths your app executes.[^anthropic-memory]
- **Scale threshold.** For short, single-shot, or shallow tasks the machinery is pure
  overhead — a plain prompt (with prompt caching for any stable prefix) is cheaper and
  simpler. Offloading earns its keep on **long-horizon or branching agent runs**, where the
  in-context state would otherwise dominate the bill or blow the window.

## Example Where It Works

A coding agent works a multi-hour refactor across a large repository. Over the run it opens
dozens of files, runs the test suite repeatedly, and calls search tools that each return
thousands of tokens. **Without offloading**, every one of those tool outputs stays in the
transcript and is re-billed on every subsequent turn; by turn 50 the per-turn input is huge
and mostly *stale* payloads the model already digested — and the run risks hitting the
context limit before the task is done.

**With offloading**, large tool outputs are written to a filesystem/memory store and replaced
in context by a path plus a short preview; the agent keeps a running progress log in a memory
file and reads back a specific file or line range only when a step needs it.[^langchain-deepagents-docs][^anthropic-harnesses]
Per-turn input stays small and roughly flat instead of climbing with progress. This is the
regime where the measured wins land: Anthropic's 100-turn agentic evaluation saw an **84%
reduction in token consumption** from clearing stale tool results, and a **39% task-success
improvement** when paired with a memory tool — precisely because the gain compounds in the
long-task regime where in-context state would otherwise dominate.[^anthropic-context-mgmt]
Multi-session continuity is a bonus: a later session reads the progress log and resumes
without re-deriving earlier state.[^anthropic-harnesses]

## Example Where It Would NOT Work

- **Short, single-shot tasks.** A one-turn classification or a two-turn Q&A has no growing
  state to offload — the whole input already fits comfortably. Adding a memory store and
  read-back steps only adds latency, extra calls, and complexity for zero token savings. For
  a stable prefix here, plain *prompt caching* is the right lever, not offloading.
- **State that's needed every step anyway.** If the task genuinely requires *all* the
  accumulated context on *every* turn (e.g. holistic reasoning over a whole document that
  must stay fully in view), offloading just forces the agent to re-read everything each step —
  you pay the retrieval tax and get the tokens back in context regardless. *Learned
  compression* or *summarization* fits better when the state must stay present but can be
  shrunk.[^langchain-deepagents-blog]
- **When a bad read is unacceptable and hard to guard.** For high-stakes flows where missing
  a piece of offloaded state would silently produce a wrong result and retrieval correctness
  can't be cheaply guaranteed, the risk of a bad read can outweigh the token savings — keep
  the critical state in-context, or gate reads with verification.[^anthropic-memory]
- **Low-volume / infrequent runs.** The engineering to build and operate the store, retrieval
  logic, and expiration only amortizes over sustained long-horizon traffic; below that, a
  managed native feature (memory tool + context editing) or a simpler L2 approach is the
  better trade.[^anthropic-context-editing]

[^anthropic-memory]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-context-eng]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-context-mgmt]: Anthropic / Claude, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^langchain-deepagents-docs]: LangChain Docs, "Context engineering in Deep Agents" — <https://docs.langchain.com/oss/python/deepagents/context-engineering>
[^langchain-deepagents-blog]: LangChain Blog, "Context Management for Deep Agents" — <https://www.langchain.com/blog/context-management-for-deepagents>
[^anthropic-harnesses]: Anthropic, "Effective harnesses for long-running agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
