---
title: "Fan-out reader / explorer subagent"
group: context
level: 3
costLever: [input]
effort: Medium
savingEstimate: "varies — main-thread context, at higher total tokens"
savingBasis: estimate
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "context/symbol-repo-map-retrieval"
  - "model-routing/strong-plan-cheap-execute-split"
sources:
  - id: cc-subagents
    title: "Subagents"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/sub-agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Each subagent runs in its own context window; verbose tool output stays there and only a summary returns to the main conversation. Defined in .claude/agents/*.md (name, description, tools, model). Built-in Explore (read-only) and Plan subagents. model: haiku for cheap delegation."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Agent teams use ~7x more tokens than a standard session in plan mode (each teammate = its own context window / separate instance). 'Delegate verbose operations to subagents so the verbose output stays in the subagent's context while only a summary returns.'"
  - id: cursor-subagents
    title: "Subagents"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/subagents"
    accessed: "2026-08-10"
    kind: docs
    note: "Subagents in .cursor/agents/*.md (name, description, model: inherit/fast/id, readonly, is_background). Own isolated context; parent must pass needed info since subagent has no prior history; returns a final summary. Parallel via multiple Task calls."
  - id: roo-boomerang
    title: "Boomerang tasks (Orchestrator mode)"
    publisher: "Roo Code docs"
    url: "https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks"
    accessed: "2026-08-10"
    kind: docs
    note: "new_task tool from Orchestrator mode: each subtask runs in complete isolation with its own conversation history, does not inherit parent context; only the completion summary flows back. mode parameter picks the specialized mode."
  - id: cline-newtask
    title: "Cline's tools"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/exploring-clines-tools/new-task-tool"
    accessed: "2026-08-10"
    kind: docs
    note: "Upstream Cline exposes bash/editor/read_files/apply_patch/search/fetch_web/ask_question — no native subagent/new_task in the core tool list; the Boomerang/Orchestrator delegation is a Roo Code feature."
  - id: codex-subagents
    title: "Subagents"
    publisher: "OpenAI Codex docs"
    url: "https://learn.chatgpt.com/docs/agent-configuration/subagents"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom agents in ~/.codex/agents/ or .codex/agents/ (TOML: name, description, developer_instructions; optional model, model_reasoning_effort). Built-in explorer/worker. Noisy work moved off the main thread; results return as summaries. /agent switches threads."
  - id: opencode-agents
    title: "Agents"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/agents/"
    accessed: "2026-08-10"
    kind: docs
    note: "mode: subagent in opencode.json or .opencode/agents/*.md (description, model, prompt). Invoked by @-mention or the Task tool; runs as a child session in its own context. Built-in explore/general agents."
  - id: copilot-agents
    title: "Custom agents and sub-agent orchestration"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom agents in .github/agents (or ~/.copilot/agents); the runtime delegates to one as a sub-agent in an isolated context so large search results / test logs stay out of the main agent's context. Built-in Explore/Plan/Task/Code-review agents; suitable subagents may run in parallel."
  - id: grok-subagents
    title: "Subagents"
    publisher: "xAI (grok-build repo)"
    url: "https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md"
    accessed: "2026-08-10"
    kind: repo
    note: "spawn_subagent tool (prompt, description, subagent_type explore/plan/general-purpose, background, isolation none/worktree). Definitions in .grok/agents/ (name, description, model). Own context window; returns a summary. Nesting depth 1."
  - id: aider-modes
    title: "Chat modes"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/modes.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Aider is single-session with no subagent spawning; architect/editor is a sequential two-model split in one context, not delegation to a throwaway reader."
---

## What & why

A single-context session pays for everything it reads. When the agent greps the repo, opens a dozen
files to find where something lives, or reads a long log, all of that lands in the main thread and is
re-sent — at the cached rate — on every turn for the rest of the session. A reader/explorer subagent
does that heavy read or search in a **separate, throwaway context** and returns only the short
conclusion and the file/line citations the main thread actually needs. The lever is **main-thread
context size**: the exploration tokens are spent once, in the subagent, instead of riding along in
your window for the rest of the task.[^cc-subagents][^cc-costs]

This is a deliberate move, not something the tool does for you. Claude Code (and the others below)
give you subagents; the technique is deciding *when* a piece of work is heavy enough to delegate so
its noise never enters the main window.

## How to do it

The portable idea is to **push a bounded, read-heavy question into a fresh context and keep only the
answer.** The main thread poses a specific question ("where is auth handled, and what calls it?",
"do the tests pass, and if not which ones?"), a subagent runs the greps and file reads to answer it,
and it hands back a paragraph plus citations. The intermediate reads stay in the subagent's context
and are discarded when it finishes.

Practical shape:

1. **Scope the question tightly.** Delegate a self-contained investigation with a clear deliverable
   ("return the 3 files that define the payment flow and one-line what each does"), not open-ended
   "look around." The subagent starts with a clean context and can't see your conversation, so the
   prompt has to carry everything it needs.[^cursor-subagents][^roo-boomerang]
2. **Prefer a read-only explorer for search/read work.** Several tools ship a built-in read-only
   explore agent for exactly this (Claude Code's Explore, Codex's explorer, OpenCode's explore, Grok
   Build's `explore`, Copilot's Explore agent); it can't edit, so it's a safe, cheap way to
   orient.[^cc-subagents][^codex-subagents][^opencode-agents][^grok-subagents][^copilot-agents]
3. **Run a cheaper model in the subagent when the work is mechanical.** Reading and summarizing rarely
   needs your top model — point the subagent at a small model so the fan-out is cheaper per token
   (Claude Code `model: haiku`; per-agent `model` elsewhere).[^cc-subagents] This pairs with
   `model-routing/strong-plan-cheap-execute-split`.
4. **Parallelize only when the reads are genuinely independent.** Firing several explorers at once
   (Cursor's parallel Task calls, Grok Build/Cursor fan-out) shortens wall-clock time but multiplies
   token spend — each runs a full context.[^cursor-subagents]

Two guardrails matter. **Filter before you delegate:** if the underlying command is just noisy
(a test run, a build), wrapping its output (`context/tool-output-filtering`) is far cheaper than
spinning up a 7x-cost subagent to read it. And **keep the return small** — the point is that only the
conclusion crosses back, so a subagent that dumps its whole transcript into the summary defeats the
technique.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool file, tool name, and model dial.

## When it's worth it / when not

- **Worth it:** heavy, bounded reads whose *intermediate* output you won't reference again — locating
  code in a large/unfamiliar repo, reading long logs or generated files, surveying many files to
  answer one question. The bigger the read relative to the answer, the better the trade.
- **Worth it:** when the main thread is long-lived and you want to protect its window — the reads you
  keep out now are re-sent on every later turn, so the saving compounds.
- **Worth it (latency, not tokens):** independent explorations you can run in parallel to finish
  sooner — accept the higher token bill for the speed.
- **Not worth it:** small or cheap reads. A subagent has fixed overhead (its own system prompt,
  CLAUDE.md, tool listing) and the ~7x agent-team multiplier is real; delegating a two-file read costs
  more than doing it inline.[^cc-costs]
- **Not worth it:** when the main thread needs the *detail*, not a summary. If you'll act on the raw
  content, keeping it in-context is the point — don't compress it away.
- **Not the right tool for noisy commands:** filter the output at the source instead
  (`context/tool-output-filtering`); a subagent is a heavier fix for the same problem.

## What it costs you

- **Higher total tokens.** This trades main-thread context for gross spend. Anthropic reports agent
  teams (multiple instances, each its own window) at **~7x** the tokens of a standard plan-mode
  session; a single delegated subagent is cheaper than a full team but still carries per-subagent
  startup cost.[^cc-costs] The win is a smaller, cheaper main thread over a long task — not fewer
  tokens overall on a short one.
- **Setup and judgment.** Low effort to use a built-in explorer ad hoc; Medium to define reusable
  subagents (a file per agent, deciding tools and model) and to build the habit of delegating the
  right things. The main failure mode is over-delegating trivial reads.
- **Lossy hand-off.** Only the summary returns, so if the subagent summarizes away a detail the main
  thread needed, you pay a round-trip to re-ask. Scope the deliverable so the citations (file:line)
  come back, not just prose.
- **Coverage gaps.** Aider has no subagent mechanism — its architect/editor split is a sequential
  two-model pass in one context, not delegation to a throwaway reader — and upstream Cline has no
  native `new_task`/subagent; the Boomerang/Orchestrator delegation is a Roo Code
  feature.[^aider-modes][^cline-newtask][^roo-boomerang]

## How to verify

- Watch **main-thread context size / input-tokens-per-turn** across a task run with and without
  delegation — the explorer should flatten the main window's growth even though total spend rises. In
  Claude Code, `/context` shows what's in the window and `/usage` attributes recent usage to
  subagents as a share, so you can see whether delegation is actually keeping the main thread lean.[^cc-costs]
- Watch **total tokens / cost per passing task** alongside it — this is the number that can go the
  wrong way. If delegation isn't shrinking the main thread enough to justify the extra subagent runs,
  you're delegating too much or too small.
- Sanity-check the **return size**: a healthy subagent returns a short conclusion plus citations, not
  a transcript. If summaries are large, the context isn't actually being isolated.

## Measured impact

_Not yet measured by us._ Benchmark: run the same repo task twice on the same harness — a baseline
where the main thread does its own search and file reads, and a variant where a read-only explorer
subagent does the heavy reading and returns only a conclusion plus citations — and compare
**main-thread input tokens (and peak context) against total tokens and cost per passing task**. The
expected shape is a smaller, cheaper main thread at a higher total token count; the technique is only
a win when the main-thread saving over the life of the task outweighs the extra subagent spend. ⚠ The
one load-bearing figure here is the **~7x agent-team token multiplier**, which is Anthropic
vendor-reported (plan mode) and not independently verified;[^cc-costs] treat the direction as expected,
not measured, until our own run lands.

[^cc-subagents]: Claude Code docs, "Subagents" — <https://code.claude.com/docs/en/sub-agents>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cursor-subagents]: Cursor docs, "Subagents" — <https://cursor.com/docs/subagents>
[^roo-boomerang]: Roo Code docs, "Boomerang tasks (Orchestrator mode)" — <https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks>
[^cline-newtask]: Cline docs, "Cline's tools" — <https://docs.cline.bot/exploring-clines-tools/new-task-tool>
[^codex-subagents]: OpenAI Codex docs, "Subagents" — <https://learn.chatgpt.com/docs/agent-configuration/subagents>
[^opencode-agents]: OpenCode docs, "Agents" — <https://opencode.ai/docs/agents/>
[^grok-subagents]: xAI, grok-build repo, "Subagents" — <https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md>
[^copilot-agents]: GitHub Docs, "Custom agents and sub-agent orchestration" — <https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents>
[^aider-modes]: Aider docs, "Chat modes" — <https://aider.chat/docs/usage/modes.html>
