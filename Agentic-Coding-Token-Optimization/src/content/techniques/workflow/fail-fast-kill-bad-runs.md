---
title: "Fail fast — kill bad runs early"
group: workflow
level: 1
costLever: [turns, output]
effort: Low
savingEstimate: "varies — the tail of a wrong run"
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
  - "workflow/plan-spec-before-code"
  - "context/tool-output-filtering"
sources:
  - id: cc-interactive
    title: "Interactive mode"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/interactive-mode"
    accessed: "2026-08-10"
    kind: docs
    note: "Esc interrupts the current response or tool call mid-turn; Claude keeps the work done so far. Ctrl+C also interrupts. Queued messages are sent next."
  - id: cursor
    title: "Agent — Overview"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/agent/overview"
    accessed: "2026-08-10"
    kind: docs
    note: "Cmd/Ctrl+Enter sends immediately, bypassing the queue, to interrupt or redirect the agent's current work; a Stop control halts the run."
  - id: codex-esc
    title: "Clarify or fire Stop hook when a turn is interrupted with Esc (issue #22858)"
    publisher: "openai/codex"
    url: "https://github.com/openai/codex/issues/22858"
    accessed: "2026-08-10"
    kind: repo
    note: "Confirms Esc interrupts an active Codex turn mid-run ('Press Esc while Codex is actively working')."
  - id: opencode-keybinds
    title: "Keybinds"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/keybinds/"
    accessed: "2026-08-10"
    kind: docs
    note: "Default session_interrupt is Escape."
  - id: copilot
    title: "Use agent mode in VS Code"
    publisher: "Visual Studio Code docs"
    url: "https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode"
    accessed: "2026-08-10"
    kind: docs
    note: "While a request runs, the Send button becomes a dropdown: Steer with Message (yield after current tool) or Stop and Send (cancel the current request entirely)."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Agent teams use ~7x the tokens of a standard session (each teammate is its own context window)."
  - id: openrouter
    title: "DeepSeek V4 Is Earning Agentic Token Share"
    publisher: "OpenRouter"
    url: "https://openrouter.ai/blog/insights/deepseek-v4-adoption/"
    accessed: "2026-08-10"
    kind: blog
    note: "Agentic work burns ~15x more tokens per request than normal human AI usage, per OpenRouter gateway data."
---

## What & why

A coding agent that has picked the wrong approach keeps spending — more turns, more tool calls,
more output tokens — until it hits a budget cap or you stop it. Failing fast means interrupting the
run the moment the trajectory is clearly wrong, instead of letting it burn the rest of a task budget
on a path you will throw away. The lever is turns and output tokens: you cut the tail of a bad run.
This matters most for agentic work, where each request already uses far more tokens than an
interactive chat and multi-agent runs multiply that again.[^openrouter][^cc-costs]

## How to do it

The portable habit is: **watch the first few actions of a run, and stop it as soon as the direction
is wrong** — before the plan compounds into edits, test runs, and re-tries you will discard.

- **Read the plan and the first tool calls, not just the final diff.** The wrong-file, wrong-API, or
  wrong-framework tell almost always shows up early. Stop on that signal.
- **Interrupt, don't wait for the cap.** Every tool has a one-key or one-click stop (see this
  technique's row in `TOOL_MATRIX.md`) — Esc mid-run in most terminal agents.[^cc-interactive][^codex-esc][^opencode-keybinds]
  In most terminal agents the work done so far is kept, so stopping costs you nothing beyond what
  already ran.
- **Steer instead of restarting when you can.** Several tools let you queue or inject a redirect that
  takes effect after the current tool call, rather than a hard stop — cheaper than killing the run
  and re-priming context from scratch.[^cursor][^copilot]
- **Set a tripwire.** Decide up front what "off-track" looks like (touching files outside scope,
  re-running a failing test more than twice, inventing an API) so you interrupt on a rule, not a
  hunch.

Steering vs. hard-stop is the main choice. A hard stop keeps the partial work but ends the turn; a
steer keeps the session and context warm and just changes direction. Prefer steering for a small
course-correction, a hard stop when the whole approach is wrong.

See this technique's row in `TOOL_MATRIX.md` for the exact stop/steer key per tool.

## When it's worth it / when not

- **Worth it:** long autonomous runs, agent teams, and background/YOLO-mode sessions where the agent
  will keep going without you — that is where a wrong run runs up the largest bill.
- **Worth it:** any task where you can judge the approach from the plan or the first edits.
- **Not worth it:** short, cheap tasks that finish in a turn or two — interrupting saves little and
  costs your attention.
- **Backfires if you stop too eagerly.** Killing a run that was actually fine, then re-priming context
  and re-issuing the prompt, can cost more than letting it finish. Interrupt on a clear wrong-turn
  signal, not on the first thing you would have done differently.

## What it costs you

- **Attention.** This is a manual habit: it only works if someone is watching the run. It does not
  help fully unattended pipelines unless you also set hard budget/turn caps (a separate technique).
- **A small re-priming cost on a hard stop.** Restarting re-reads the rules file and re-establishes
  context. Steering avoids most of that by keeping the session warm.[^cursor]
- **Judgment risk.** Stopping a run that was on track wastes the partial work. The mitigation is a
  written tripwire so the call is consistent, not mood-based.
- **Setup: essentially none.** The stop/steer control already ships in every tool; the discipline is
  the only thing to adopt.

## How to verify

- Watch **turns per task** and **output tokens per task** across a set of runs before and after
  adopting the habit — a fail-fast culture should lower both the average and, especially, the
  worst-case tail.
- Track **discarded-run cost**: tokens spent on runs whose output you threw away. That is the number
  this technique targets directly.
- Per-session usage in `ccusage` or Claude Code's `/usage` (and OpenTelemetry cost metrics) lets you
  see whether the long, expensive runs are getting shorter.

## Measured impact

_Not yet measured by us._ Benchmark: run the same set of tasks twice — once letting every run go to
its natural stop, once interrupting on a fixed "off-track" tripwire — and compare turns, output
tokens, and cost per passing task (baseline vs. the fail-fast variant). The saving is inherently the
tail of wrong runs, so the benchmark must include tasks where the agent plausibly goes off-track,
not only clean ones. No cited headline number applies here — the gain is situational and depends on
how often runs go wrong and how long they would otherwise continue. Context for scale: agentic
coding requests already run ~15x more tokens per request than interactive chat, and agent teams use
~7x a standard session[^openrouter][^cc-costs] ⚠ (both practitioner/vendor-reported), so the tail of
a bad autonomous run is where this lever has the most to cut.

[^cc-interactive]: Claude Code docs, "Interactive mode" — <https://code.claude.com/docs/en/interactive-mode>
[^codex-esc]: openai/codex, "Clarify or fire Stop hook when a turn is interrupted with Esc (issue #22858)" — <https://github.com/openai/codex/issues/22858>
[^opencode-keybinds]: OpenCode docs, "Keybinds" — <https://opencode.ai/docs/keybinds/>
[^cursor]: Cursor docs, "Agent — Overview" — <https://cursor.com/docs/agent/overview>
[^copilot]: Visual Studio Code docs, "Use agent mode in VS Code" — <https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode>
[^openrouter]: OpenRouter, "DeepSeek V4 Is Earning Agentic Token Share" — <https://openrouter.ai/blog/insights/deepseek-v4-adoption/>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
