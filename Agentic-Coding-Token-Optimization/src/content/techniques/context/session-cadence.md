---
title: "Session cadence (/clear, /compact)"
group: context
level: 1
costLever: [input, cache]
effort: Low
savingEstimate: "varies — cuts the per-turn context tax"
savingBasis: cited
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
    note: "/clear costs nothing; /compact reads the whole conversation it summarizes (itself a large request); custom compact instructions in CLAUDE.md; long context is re-billed at the cached rate every turn; cache miss after a break longer than the TTL."
  - id: cc-model-config
    title: "Model configuration — context window and auto-compaction"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/model-config"
    accessed: "2026-08-10"
    kind: docs
    note: "Auto-compact window is configurable (CLAUDE_CODE_AUTO_COMPACT_WINDOW, --autocompact, /autocompact); default compacts near the model's context limit (e.g. Sonnet 5 ~967K of 1M, 200K-window models at that boundary)."
  - id: aider-cmds
    title: "In-chat commands"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/commands.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/clear clears chat history; /reset drops all files and clears history; /tokens reports context token use. No auto-compaction."
  - id: copilot-ctx
    title: "Managing context in GitHub Copilot CLI"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management"
    accessed: "2026-08-10"
    kind: docs
    note: "/compact manually compacts (Esc cancels); auto-compaction starts at ~80% of the context window and pauses near 95% if not done; /context shows usage."
  - id: codex-compaction
    title: "Context Compaction Deep Dive: Codex CLI, Claude Code, and OpenCode"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/14/context-compaction-deep-dive-codex-cli-claude-code-opencode/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex /new starts a fresh conversation per task; /compact after a logical unit of work; model_auto_compact_token_limit sets the auto-trigger (default ~200K), cannot be raised above 90% of the window."
  - id: badlogic-gist
    title: "Context Compaction Research: Claude Code, Codex CLI, OpenCode, Amp"
    publisher: "Mario Zechner (gist)"
    url: "https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Cross-tool comparison: all of Claude Code / Codex / OpenCode expose /compact, distinct from /clear which fully resets; auto-triggers fire late (near ~95% capacity)."
  - id: grok-cmds
    title: "Grok Build (grok) command reference"
    publisher: "Toolsbase"
    url: "https://toolsbase.dev/en/reference/grok-build-commands"
    accessed: "2026-08-10"
    kind: other
    note: "Grok Build /new starts a new session (alias /clear); /compact [context] with optional preserve arg, auto-compacts at ~85% by default; /context shows usage."
  - id: cline-condense
    title: "Context Condensing"
    publisher: "Kilo Code / Cline docs"
    url: "https://kilo.ai/docs/customize/context/context-condensing"
    accessed: "2026-08-10"
    kind: docs
    note: "Cline/Roo/Kilo condenses (summarizes) automatically past a configurable threshold (compaction.threshold_percent) or when the remaining context hits a ~20K-token safety buffer; a lighter pruning pass clears old tool outputs beyond a 40K-token recency window; manual /compact also available."
---

## What & why

A coding agent re-sends the entire conversation on every turn, and with prompt caching that history is re-billed at the cached-input rate each time — so a one-line follow-up in a session that has been open all day still draws tokens for the whole transcript.[^cc-costs] Session cadence is the discipline of ending a session at a task boundary instead of carrying stale history forward. It pulls the input-token lever (smaller context per turn) and the cache lever (a fresh session or a well-timed resume avoids re-processing a bloated transcript).

## How to do it

It's two sides of one decision — when to reset context and when to keep it warm:

- **Reset at task boundaries.** When you switch to unrelated work, start fresh rather than letting the old task's files, tool output, and dead ends ride along. In most tools this is a "clear" or "new session" command (Aider, which has no auto-compaction, uses `/clear` to clear history or `/reset` to also drop all files); the reset itself is free because there's nothing to summarize.[^cc-costs][^aider-cmds]
- **Compact within a task, not across tasks.** `/compact` replaces the running history with a summary so a long single task can continue without hitting the window. But compaction is not free: it reads the whole conversation it summarizes, so it's itself a large request.[^cc-costs] Use it when you need continuity, and clear when you don't.
- **Compact proactively, before the auto-trigger.** Every tool's automatic compaction fires *late* — near the top of the context window (roughly 80% in Copilot CLI, ~85% in Grok Build, ~95% in Claude Code and Codex; Cline/Roo/Kilo condense past a configurable threshold).[^copilot-ctx][^grok-cmds][^badlogic-gist][^cline-condense] By then you've already paid full context on many turns and the summarization request is at its largest. A manual `/compact` at a natural break (after a merge, a green test run, a finished refactor) summarizes a smaller transcript and stops the bleed earlier. Steer what it keeps with an instruction (e.g. `/compact focus on the API changes and open TODOs`).[^cc-costs][^codex-compaction] Where the auto-compact threshold itself is a knob (Claude Code exposes `CLAUDE_CODE_AUTO_COMPACT_WINDOW` / `--autocompact` / `/autocompact`), lowering it makes the automatic pass fire earlier and smaller.[^cc-model-config]
- **Keep a session warm for a burst of related tasks.** The flip side of clearing: prompt caches have a time-to-live, and the first message after a break longer than the TTL misses the cache and reprocesses the full context.[^cc-costs] If you're doing several related tasks back-to-back, keep the one session going so each turn hits the warm cache — clearing between *closely related* work throws away a live cache you were about to reuse. (Cache TTL is its own lever; see the caching group.)

See this technique's row in `TOOL_MATRIX.md` for the exact clear / new-session / compact command and the auto-compact threshold knob per tool.

## When it's worth it / when not

- **Worth it:** always, as a habit — it's a zero-regret default. The largest wins are in long-lived sessions where one transcript accretes many unrelated tasks (the "usage climbs in a long session" pattern), and where devs default to Opus and never clear.[^cc-costs]
- **Worth it:** clearing between genuinely unrelated tasks; proactive `/compact` on a long single task before auto-compact would fire.
- **Not worth it — don't over-clear:** clearing between two closely related tasks discards a warm cache and forces the agent to re-read the same files and re-derive the same context on the next turn, which costs more than it saves.
- **Not worth it:** compacting a session you're about to clear anyway — you'd pay for a summary you then throw away. Clear instead; clearing is free.[^cc-costs]

## What it costs you

- **Setup effort: none.** These are built-in commands, not configuration.
- **The failure mode is losing needed context.** `/clear` is a hard reset — anything the next task actually needs (a decision, a file path, a reproduction) is gone. Mitigate by finishing the thought before clearing, and by naming the session so you can resume it (Claude Code: `/rename` then `/resume`).[^cc-costs]
- **Compaction is lossy.** A summary drops detail; if the agent later needs a dropped line it re-derives or re-reads it, re-paying tokens. Custom compact instructions reduce this by telling it what to preserve.[^cc-costs][^codex-compaction]
- **Compaction is itself a large request.** Don't compact reflexively — each `/compact` re-reads the conversation. Prefer it over the *auto*-trigger (which fires later and larger), but prefer `/clear` over `/compact` whenever you don't need continuity.[^cc-costs]

## How to verify

- Watch **input tokens per turn** across a session: without cadence it climbs monotonically as history accretes; with it, it steps back down at each clear/compact. Claude Code's `/context` shows the current window breakdown, and `/usage` flags "long context" or "cache misses" when either is ≥10% of recent usage.[^cc-costs]
- Watch **cache-hit / cache-read share**: a healthy warm-session burst is mostly cache reads; a spike of cache-*creation* (or a "cache miss" flag) right after a break means the TTL lapsed — evidence you either cleared too eagerly or let the session go cold.[^cc-costs]
- Compare **cost per completed task** on a multi-task session run with and without clearing between tasks; `ccusage` and Claude Code OTel expose per-session input/output for the comparison.

## Measured impact

_Not yet measured by us._ Benchmark: run a fixed sequence of unrelated tasks in one continuous session (baseline: no clearing, auto-compact only) versus the same sequence with a `/clear` at each task boundary and a proactive `/compact` mid-task, and compare input tokens and cost per completed task. Report the cached-vs-fresh split so the cache effect is separated from the raw-context effect. ⚠ The threshold figures cited here (Copilot ~80%, Grok Build ~85%, Claude Code / Codex ~95%) are from vendor docs and practitioner write-ups and drift with releases — re-check at write time.[^copilot-ctx][^grok-cmds][^badlogic-gist]

[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cc-model-config]: Claude Code docs, "Model configuration — context window and auto-compaction" — <https://code.claude.com/docs/en/model-config>
[^aider-cmds]: Aider docs, "In-chat commands" — <https://aider.chat/docs/usage/commands.html>
[^copilot-ctx]: GitHub Docs, "Managing context in GitHub Copilot CLI" — <https://docs.github.com/en/copilot/concepts/agents/copilot-cli/context-management>
[^codex-compaction]: Codex Knowledge Base, "Context Compaction Deep Dive: Codex CLI, Claude Code, and OpenCode" — <https://codex.danielvaughan.com/2026/04/14/context-compaction-deep-dive-codex-cli-claude-code-opencode/>
[^badlogic-gist]: Mario Zechner, "Context Compaction Research: Claude Code, Codex CLI, OpenCode, Amp" — <https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f>
[^grok-cmds]: Toolsbase, "Grok Build command reference" — <https://toolsbase.dev/en/reference/grok-build-commands>
[^cline-condense]: Kilo Code / Cline docs, "Context Condensing" — <https://kilo.ai/docs/customize/context/context-condensing>
