---
title: "Scratchpad / filesystem-as-memory"
group: context
level: 2
costLever: [input]
effort: Medium
savingEstimate: "large on long tasks"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - codex
  - aider
  - copilot
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic"
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-08-10"
    kind: blog
    note: "Structured note-taking: agent writes progress/notes to files (NOTES.md), retrieves just-in-time; keep the smallest set of high-signal tokens in context."
  - id: anthropic-context-mgmt
    title: "Managing context on the Claude Developer Platform (memory tool + context editing)"
    publisher: "Anthropic"
    url: "https://claude.com/blog/context-management"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Memory tool = file-based store outside the context window. Memory + context editing: 39% improvement on multi-step tasks; a 100-turn eval cut token use 84%. Vendor-reported."
  - id: anthropic-cookbook
    title: "Context engineering: memory, compaction, and tool clearing"
    publisher: "Claude Cookbook"
    url: "https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "memory tool memory_20250818 uses a /memories directory. Saving ~3k tokens of notes cut a later session's peak context from 333,977 to 172,623 tokens. Vendor demo."
  - id: cc-memory
    title: "How Claude remembers your project (CLAUDE.md + auto memory)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/memory"
    accessed: "2026-08-10"
    kind: docs
    note: "Auto memory: Claude writes MEMORY.md + topic files under ~/.claude/projects/<project>/memory/. Only first 200 lines / 25KB of MEMORY.md load at start; topic files load on demand. /memory to view/edit."
  - id: cursor-dcd
    title: "Dynamic context discovery"
    publisher: "Cursor"
    url: "https://cursor.com/blog/dynamic-context-discovery"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Cursor writes long tool outputs, terminal sessions, and chat history to files the agent reads on demand. A/B test: MCP-tool runs used 46.9% fewer total agent tokens. Vendor-reported."
  - id: cline-memory-bank
    title: "Memory Bank"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/features/memory-bank"
    accessed: "2026-08-10"
    kind: docs
    note: "Not built-in — a custom-instructions pattern. Markdown files in memory-bank/ (projectbrief.md, activeContext.md, progress.md, …); 'initialize memory bank' / 'update memory bank'."
  - id: aipatternbook-offload
    title: "Context Offloading"
    publisher: "Encyclopedia of Agentic Coding Patterns"
    url: "https://aipatternbook.com/context-offloading"
    accessed: "2026-08-10"
    kind: blog
    note: "Route large output to a file, return a summary + a ref; agent reads the full payload only if needed. Cites Cursor's 46.9% figure."
---

## What & why

On a long or research-heavy task, the agent accumulates everything it has seen — file dumps, search
results, a long web page, a plan it drafted three turns ago — and re-sends all of it as input on every
turn. Scratchpad / filesystem-as-memory breaks that: the agent writes large intermediate results to a
file and reads back only the slice it needs later, so the working context stays small. The lever is
input tokens on long-horizon tasks, where re-sending accumulated context is the dominant cost.

Some of this is already automatic. Claude Code's auto memory writes `MEMORY.md` and topic files on its
own;[^cc-memory] Cursor writes long tool outputs, terminal sessions, and chat history to files the agent
reads on demand;[^cursor-dcd] the Claude Developer Platform ships a file-based **memory tool** plus
context editing.[^anthropic-context-mgmt] The deliberate technique is the part you add on top: telling
the agent to offload the big stuff to disk and pull back only what it needs, rather than carrying it all.

## How to do it

Separate what the tool does for you from what you instruct. **Automatic**, depending on the harness:
persistent memory files it maintains (Claude Code auto memory, Codex's memory layer), and harness-level
offloading of big outputs to files (Cursor). **What you add** is the instruction and the discipline:

1. **Tell the agent to write, not carry.** For a research or multi-file task, instruct it to write
   findings, long command output, or a running plan to a file (`NOTES.md`, `plan.md`, a `scratch/`
   dir) and to read back only the relevant section later.[^anthropic-context-eng] This is the core
   move and it works in any harness that can write files.
2. **Return a summary plus a reference, not the payload.** When a step produces a large result, have
   the agent record the file path and a one-paragraph summary, and open the file again only if a later
   step needs the detail.[^aipatternbook-offload]
3. **Use the harness's built-in memory where it exists.** Keep a short index file (Claude Code
   `MEMORY.md`; a Cline `memory-bank/` with `activeContext.md` + `progress.md`) so a fresh session or a
   post-compaction turn re-reads a small pointer file instead of the whole history.[^cc-memory][^cline-memory-bank]
4. **Keep the index small.** The point is defeated if the pointer file itself is large. Claude Code
   loads only the first 200 lines (or 25KB) of `MEMORY.md`; keep one line per entry and push detail into
   topic files that load on demand.[^cc-memory]

The distinction that matters for cost: a memory file that is *loaded every turn* (a rules file, the
`MEMORY.md` index) is recurring input — keep it tiny. A scratch file the agent *reads on demand* is paid
for only when it opens it — that is where you want the bulk to live. See this technique's row in
`TOOL_MATRIX.md` for the exact per-tool file names and flags.

## When it's worth it / when not

- **Worth it:** long, multi-step, or research tasks — the agent explores many files, runs many commands,
  or works across sessions. This is where accumulated context, not any single message, is the cost.
- **Worth it:** anything that spans a context reset or compaction. A small index file lets the next turn
  resume from a pointer instead of re-deriving or re-reading.
- **Not worth it:** short, single-shot edits. Writing and re-reading a file adds turns for no saving if
  the task fits comfortably in one context window.
- **Not worth it as a substitute for filtering.** If the problem is one noisy command, filter that output
  ([context/tool-output-filtering]) rather than spooling it to disk and reading it back.

## What it costs you

- **Extra tool calls.** Writing then re-reading a file adds turns (and the read is itself input). On a
  short task that overhead can exceed the saving — hence "long tasks only." Each read also costs an
  output token or two to issue.
- **Stale or wrong notes.** If the agent trusts an out-of-date scratch file instead of re-checking the
  source, it can act on stale facts. Have it record source paths so a note is verifiable, and prune the
  index. Claude Code stamps a `modified` time on memory files with frontmatter to signal freshness.[^cc-memory]
- **A pointer file that bloats.** An oversized `MEMORY.md` or memory-bank silently drops content past the
  load limit (Claude Code loads only the first 200 lines / 25KB).[^cc-memory] Keep the index terse.
- **Setup effort.** Low if you lean on built-in memory; Medium if you write the "offload to a file, read
  the slice" instructions into your rules file and enforce them (Cline's Memory Bank is a
  custom-instructions pattern, not a built-in feature[^cline-memory-bank]).

## How to verify

- On a long task, compare **input tokens per turn** with and without the offload instruction. If it
  works, per-turn input stops climbing as the task grows instead of ratcheting up every turn.
- Watch **total input tokens per completed task** — the honest end-to-end number, since this technique
  trades a few extra reads for a smaller recurring context.
- Check the pointer file actually loaded and is small: Claude Code `/context` lists memory files and
  their size; `ccusage` and Claude Code OpenTelemetry show per-session input so you can see whether
  accumulated context is the cost driver.

## Measured impact

_Not yet measured by us._ Benchmark: run a long, multi-file research/refactor task on the same repo,
once with the agent carrying intermediate results in context and once instructed to offload them to a
scratch file and read back only the needed slice; compare total input tokens and cost per passing task
(baseline vs the filesystem-as-memory variant). Cited so far, all ⚠ vendor-reported: Anthropic's memory
tool plus context editing showed a 39% improvement on multi-step tasks, and a 100-turn eval cut token
use 84%;[^anthropic-context-mgmt] a cookbook demo saving ~3k tokens of notes dropped a later session's
peak context from 333,977 to 172,623 tokens;[^anthropic-cookbook] Cursor's A/B test found MCP-tool runs
used 46.9% fewer total agent tokens once outputs were offloaded to files.[^cursor-dcd] None is a
coding-specific before/after on a controlled repo.

[^anthropic-context-eng]: Anthropic, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-context-mgmt]: Anthropic, "Managing context on the Claude Developer Platform" — <https://claude.com/blog/context-management>
[^anthropic-cookbook]: Claude Cookbook, "Context engineering: memory, compaction, and tool clearing" — <https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools>
[^cc-memory]: Claude Code docs, "How Claude remembers your project" — <https://code.claude.com/docs/en/memory>
[^cursor-dcd]: Cursor, "Dynamic context discovery" — <https://cursor.com/blog/dynamic-context-discovery>
[^cline-memory-bank]: Cline docs, "Memory Bank" — <https://docs.cline.bot/features/memory-bank>
[^aipatternbook-offload]: Encyclopedia of Agentic Coding Patterns, "Context Offloading" — <https://aipatternbook.com/context-offloading>
