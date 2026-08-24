---
title: "Fresh session + handoff doc per task"
group: context
level: 2
costLever: [input]
effort: Low
savingEstimate: "varies — cuts the per-turn context tax on the next task"
savingBasis: estimate
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - aider
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/keep-rules-file-small"
  - "context/tool-output-filtering"
sources:
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "\"Clear between tasks\" with /clear; long context re-sent every turn at cached rate; /compact reads the whole conversation so compacting a large context is itself a large request; /clear costs nothing. Agent teams ~7x. $13/dev/active-day."
  - id: recca-cost-model
    title: "Does a Long Claude Code Session Waste Tokens? A Cost Model Most People Get Wrong"
    publisher: "recca0120 (blog)"
    url: "https://recca0120.github.io/en/2026/04/13/claude-code-session-cost-cache-misconception/"
    accessed: "2026-08-10"
    kind: blog
    note: "Counter-point: with prompt caching, splitting one long task into several short sessions can cost more because each fresh session pays a cold cache start. The handoff/fresh-session split pays off between unrelated tasks, not mid-task."
  - id: cline-newtask
    title: "Unlocking Persistent Memory: How Cline's new_task Tool Eliminates Context Window Limitations"
    publisher: "Cline"
    url: "https://cline.bot/blog/unlocking-persistent-memory-how-clines-new_task-tool-eliminates-context-window-limitations"
    accessed: "2026-08-10"
    kind: blog
    note: "new_task ends the current session and starts a fresh one preloaded with a structured handoff (summary, file states, next steps); triggered via ask_followup_question, .clinerules can set a context-% threshold and what to package."
  - id: opencode-tui
    title: "TUI"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/tui/"
    accessed: "2026-08-10"
    kind: docs
    note: "/new (alias /clear, ctrl+x n) starts a new session; /compact (alias /summarize, ctrl+x c) compacts the current one."
  - id: aider-commands
    title: "In-chat commands"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/commands.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/clear clears chat history (files stay); /reset drops all files and clears history; /drop frees context; /tokens reports current context tokens."
  - id: codex-slash
    title: "Complete Codex Slash Commands and CLI Options Guide (April 2026)"
    publisher: "AiOps School"
    url: "https://aiopsschool.com/blog/complete-codex-slash-commands-and-cli-options-guide-updated-april-2026/"
    accessed: "2026-08-10"
    kind: blog
    note: "/new starts a new conversation in the same CLI session (resets context without quitting); /compact summarizes; /init scaffolds AGENTS.md."
  - id: grok-cheatsheet
    title: "Grok Build Cheat Sheet 2026"
    publisher: "Toolsbase"
    url: "https://toolsbase.dev/en/reference/grok-build-commands"
    accessed: "2026-08-10"
    kind: blog
    note: "/new (alias /clear) starts a new session clearing the conversation; /compact compresses history; reads AGENTS.md/CLAUDE.md family."
  - id: newstack-longctx
    title: "Anthropic makes a pricing change that matters for Claude's longest prompts"
    publisher: "The New Stack"
    url: "https://thenewstack.io/claude-million-token-pricing/"
    accessed: "2026-08-10"
    kind: blog
    note: "Long-context premium (2x input / 1.5x output above the long-context threshold) removed 2026-03-13. So a big carried-forward context no longer triggers a surcharge — but still bills full per-token rates every turn."
---

## What & why

A coding agent re-sends the whole conversation with every request, so a transcript that has grown all day is re-billed on each turn — even a one-line question drags the entire history along at the input (cached-read) rate.[^cc-costs] Ending a task by writing a short state/handoff file and then starting a **clean session** for the next task drops that accumulated transcript instead of carrying it — and its per-turn tax — into unrelated work. The lever is context size / input tokens per turn on the next task.

## How to do it

The portable pattern is two steps:

1. **Write the handoff at the end of a task.** Before you finish, have the agent write a short state file — what was done, the decisions that matter, the files touched, and the exact next step. Keep it to what the next session actually needs to resume (a plan, key decisions, relevant paths, next action), not a transcript dump. A page or less is usually enough.
2. **Start the next task in a fresh session.** Open a new session (or clear the current one), let the small always-loaded context reload (rules file, skills), and point it at the handoff file. The next task starts from a lean context instead of inheriting the previous task's history and its repeated auto-compactions.

Two things make this cheap and reliable:

- **The handoff file is a normal file**, so writing and re-reading it costs a trivial amount next to carrying the full transcript every turn.
- **Draw the boundary at task edges, not mid-task.** Within a single task, keeping one warm session is usually cheaper than restarting (see below). The win is at the seam *between* unrelated tasks, where the old history has no value to the new one.

Some tools automate the seam: Cline's `new_task` ends the current session and starts a fresh one preloaded with a structured handoff (summary, file states, next steps), and `.clinerules` can set the context-% threshold at which it proposes the handoff and what to package.[^cline-newtask] Elsewhere it's a manual "new session" command plus a handoff file you ask the agent to write — OpenCode's `/new` (alias `/clear`),[^opencode-tui] Codex's `/new`,[^codex-slash] Grok Build's `/new`,[^grok-cheatsheet] or Aider's `/clear` (files stay) and `/reset` (also drops files).[^aider-commands] See this technique's row in `TOOL_MATRIX.md` for the exact per-tool command.

**Fresh session vs. compaction.** These are different tools. *Compaction* (`/compact`) summarizes the current history in place so one long task can keep going past the context window — but compacting a large context is itself a large request, because the model has to read the whole thing to summarize it.[^cc-costs] A *fresh session* discards the history entirely; when you want a clean start rather than continuity, it costs nothing.[^cc-costs] Use compaction to survive a long single task; use a fresh session + handoff at the boundary between tasks.

## When it's worth it / when not

- **Worth it:** moving to an **unrelated** next task, or when the current transcript has bloated (auto-compaction has fired more than once, `/context` shows history dominating). The old history is dead weight the next task pays for on every turn.
- **Worth it:** long-running work where a written handoff also survives crashes, restarts, and the next day — the file is the source of truth, not a fragile in-memory transcript.
- **Not worth it — this is the common mistake:** clearing *mid-task* or between tightly related steps. With prompt caching giving cheap reads, one warm session across related steps often costs **less** than several fresh sessions, because each restart pays a cold-cache start (re-reads the rules file, re-warms the cache, re-explores the same files).[^recca-cost-model][^cc-costs] Don't reflexively clear after every message.
- **Not worth it:** when the next task genuinely needs the last task's reasoning — then compact or continue, don't reset.

## What it costs you

- **Setup effort: Low.** It's a habit plus a one-line prompt ("write a handoff file, then I'll start fresh"), or a `.clinerules`-style rule in tools that automate it.[^cline-newtask]
- **Cold-start cost on the new session.** The fresh session re-loads the rules file and re-warms the cache, and may re-read a few files the handoff pointed to. This is the price you trade the carried-forward history for — it only nets out when the old history was genuinely irrelevant, which is why the boundary is task edges, not mid-task.[^recca-cost-model]
- **Handoff-quality risk (the real failure mode).** If the handoff omits a decision or constraint, the fresh session re-derives it — costing more than you saved and risking a wrong turn. Keep the handoff concrete (decisions, paths, next step), and for anything that must persist across many tasks, put it in the rules file or a durable doc, not a one-off handoff.
- **Note on big contexts:** since Anthropic removed the long-context premium (the 2x input / 1.5x output multiplier above the long-context threshold) on 2026-03-13, a bloated carried-forward context no longer triggers a *surcharge* — but it still bills full per-token rates on **every** turn, which is exactly what the fresh start avoids.[^newstack-longctx]

## How to verify

- Watch **input tokens per turn** at the start of the next task: a fresh session should begin near your baseline (rules file + tools) instead of near the previous task's high-water mark. Claude Code's `/context` and `/usage` show the current split; `ccusage` and OpenTelemetry give per-session input over time.[^cc-costs]
- Watch how often **auto-compaction** fires. If a session compacts repeatedly, you're carrying too much forward — a task boundary was missed.
- Confirm the trade nets out by comparing **cost per completed task** across a few tasks done with vs. without the fresh-session boundary; if fresh sessions are costing more, you're resetting too aggressively (mid-task) rather than at task edges.[^recca-cost-model]

## Measured impact

_Not yet measured by us._ Benchmark: run a sequence of unrelated tasks two ways on the same repo — baseline (one continuous session that accumulates and auto-compacts across all tasks) vs. the variant that writes a handoff and starts a fresh session at each task boundary — and compare input tokens per turn and cost per completed task. The expected result is lower per-turn input on later tasks in the fresh-session variant, offset partly by each session's cold-cache start; the net depends on how unrelated the tasks are. ⚠ The counter-case is practitioner-reported: with prompt caching, over-splitting *related* work into short sessions can cost more, so the arm must isolate unrelated-task boundaries from mid-task resets.[^recca-cost-model]

[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^recca-cost-model]: recca0120, "Does a Long Claude Code Session Waste Tokens? A Cost Model Most People Get Wrong" — <https://recca0120.github.io/en/2026/04/13/claude-code-session-cost-cache-misconception/>
[^cline-newtask]: Cline, "Unlocking Persistent Memory: How Cline's new_task Tool Eliminates Context Window Limitations" — <https://cline.bot/blog/unlocking-persistent-memory-how-clines-new_task-tool-eliminates-context-window-limitations>
[^opencode-tui]: OpenCode docs, "TUI" — <https://opencode.ai/docs/tui/>
[^aider-commands]: Aider docs, "In-chat commands" — <https://aider.chat/docs/usage/commands.html>
[^codex-slash]: AiOps School, "Complete Codex Slash Commands and CLI Options Guide (April 2026)" — <https://aiopsschool.com/blog/complete-codex-slash-commands-and-cli-options-guide-updated-april-2026/>
[^grok-cheatsheet]: Toolsbase, "Grok Build Cheat Sheet 2026" — <https://toolsbase.dev/en/reference/grok-build-commands>
[^newstack-longctx]: The New Stack, "Anthropic makes a pricing change that matters for Claude's longest prompts" — <https://thenewstack.io/claude-million-token-pricing/>
