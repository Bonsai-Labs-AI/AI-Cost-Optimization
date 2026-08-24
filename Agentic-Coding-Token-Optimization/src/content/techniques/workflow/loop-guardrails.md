---
title: "Loop guardrails (max-turns, budgets, hooks)"
group: workflow
level: 2
costLever: [turns, calls]
effort: Low
savingEstimate: "caps the tail — bounds the worst runs, not the median"
savingBasis: estimate
qualityRisk: Medium
appliesTo:
  - claude-code
  - cursor
  - cline
  - copilot
  - codex
  - aider
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
sources:
  - id: cc-cli
    title: "CLI reference"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/cli-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "--max-turns and --max-budget-usd are print-mode only; --max-budget-usd requires v2.1.217+; subagent spend counts toward the cap."
  - id: cc-hooks
    title: "Hooks reference"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/hooks"
    accessed: "2026-08-10"
    kind: docs
    note: "PreToolUse blocks via exit code 2 or permissionDecision: deny; Stop hook can force continuation via exit 2."
  - id: cc-stophook-issue
    title: "Stop hook fires repeatedly… (stop_hook_active not propagating) — issue #54360"
    publisher: "anthropics/claude-code"
    url: "https://github.com/anthropics/claude-code/issues/54360"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "stop_hook_active JSON field is true on a re-fired Stop hook; check it and exit 0 or the hook loops forever."
  - id: goose-cli
    title: "goose CLI commands — run --max-turns / --max-tool-repetitions"
    publisher: "Block / goose docs"
    url: "https://goose-docs.ai/docs/guides/goose-cli-commands/"
    accessed: "2026-08-19"
    kind: docs
    note: "goose run --max-turns caps turns without user input (default 1000; also GOOSE_MAX_TURNS); --max-tool-repetitions caps identical consecutive tool calls to break loops. No dollar-budget flag."
  - id: cursor-spend
    title: "Spend limits"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/account/billing/spend-limits"
    accessed: "2026-08-10"
    kind: docs
    note: "Team- and member-level dollar spend limits; no per-run turn cap. Admin-only edit via Permissions toggle."
  - id: copilot-budgets
    title: "Getting started with budget controls"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/tutorials/budgets/getting-started-with-budget-controls"
    accessed: "2026-08-10"
    kind: docs
    note: "'Stop usage when budget limit is reached' makes a budget a hard stop; user-level budgets always hard-stop; org/enterprise opt-in."
  - id: roo-maxreq
    title: "Add allowedMaxRequests feature (inspired by Cline) — PR #3631"
    publisher: "RooCodeInc/Roo-Code"
    url: "https://github.com/RooCodeInc/Roo-Code/pull/3631"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Auto-approve Max Requests cap: pauses for re-approval after N consecutive auto-approved calls."
  - id: aider-maxreflect
    title: "Add ability to configure max_reflections setting — issue #3865"
    publisher: "Aider-AI/aider"
    url: "https://github.com/Aider-AI/aider/issues/3865"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "max_reflections hardcoded to 3 (lint/test retry loop); not yet exposed as a flag/config."
  - id: codex-budget-pr
    title: "add rollout token budget configuration (1/N) — PR #28746"
    publisher: "openai/codex"
    url: "https://github.com/openai/codex/pull/28746"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Rollout token budget (limit_tokens, reminder_interval_tokens) is in-progress, not a shipped stable knob as of 2026-08-10."
---

## What & why

An agentic coding tool runs a loop: think, call a tool, read the result, repeat. When it gets stuck — a
test it can't make pass, a build error it keeps mis-diagnosing — it will keep looping, and every turn
re-sends the accumulated context at full input cost. A loop guardrail puts a ceiling on that loop:
a maximum number of turns, a token/dollar budget, or a hook that halts a runaway pattern. The lever is
the number of turns and calls: the guardrail doesn't make a good run cheaper, it stops a bad run from
running up the bill until it exhausts itself.

## How to do it

Pick the tightest of three mechanisms your tool supports and set it where an unattended agent runs:

1. **Turn ceiling.** Cap the number of agentic iterations for a single task. This is the cleanest guard
   for headless/CI runs where no human is watching — the agent exits with an error when it hits the cap
   instead of grinding on. Size it to the task class (a few turns for a small edit, more for a feature),
   not to the worst case. Claude Code exposes `--max-turns` (print mode only);[^cc-cli] goose exposes
   `--max-turns` plus `--max-tool-repetitions` to break identical-call loops.[^goose-cli] Some tools
   instead cap *consecutive auto-approved* calls and pause for re-approval — Roo Code's
   `allowedMaxRequests`, following Cline.[^roo-maxreq] Aider's lint/test retry ceiling
   (`max_reflections`) is hardcoded to 3 and not yet a configurable flag,[^aider-maxreflect] and Codex's
   rollout token budget is still in-progress, not a shipped stable knob.[^codex-budget-pr]
2. **Budget.** Set a token or dollar cap per run, per user, or per team, with the "stop when reached"
   behavior turned on so it's a hard stop, not just an alert. This is the guard that survives across
   task types — you don't have to guess the right turn count, you cap the spend. Prefer a hard stop:
   many tools' default budget only emails you *after* the overrun. Claude Code's `--max-budget-usd`
   (print mode, v2.1.217+) counts subagent spend toward the cap;[^cc-cli] Cursor offers team- and
   member-level dollar limits (no per-run turn cap);[^cursor-spend] GitHub Copilot's budgets are a hard
   stop only when "stop usage when budget limit is reached" is on (user-level budgets always hard-stop;
   org/enterprise opt in).[^copilot-budgets]
3. **Anti-runaway hook.** Where the tool exposes hooks, a pre-tool hook can detect a runaway pattern —
   the same command run N times, an edit-test-edit cycle that isn't converging — and block the call so
   the agent has to change approach or stop (in Claude Code, `PreToolUse` blocks via exit code 2 or a
   `permissionDecision: deny`).[^cc-hooks] If you use a stop-style hook to force the agent to keep
   going until a check passes, guard it against looping forever (in Claude Code, check the
   `stop_hook_active` flag and let it stop when that's true).[^cc-stophook-issue]

For most teams the order of adoption is: budget first (it's the broad safety net), then a turn ceiling
on CI/headless runs, then hooks only if you have a specific runaway pattern to catch. See this
technique's row in `TOOL_MATRIX.md` for the exact per-tool flag or setting.

## When it's worth it / when not

- **Worth it:** any unattended run — CI, headless `-p`/print mode, background agents, an overnight
  `/goal`. These are exactly the runs where "stuck and looping" turns into a real bill with no human to
  hit stop.
- **Worth it:** as a team-wide backstop — a per-user or per-team dollar budget with a hard stop caps the
  blast radius of any one bad session regardless of tool.
- **Not the main lever for interactive use.** When a human is watching, they *are* the guardrail — they
  hit escape. Here a turn cap mostly gets in the way; a budget as a far-off backstop is fine.
- **Not a savings technique.** It bounds the worst runs; it does nothing for the median. If your spend is
  high because normal tasks cost a lot, the fixes are model routing, context, and caching — not this.

## What it costs you

- **A too-tight cap kills good work.** A turn or budget ceiling set below what a legitimately hard task
  needs makes the agent stop mid-task; you re-run (often from scratch) and pay again — you can spend more
  than you saved. Size caps to the task class and keep them loose enough for the real work.
- **Hooks are the highest-effort option** and can misfire: a loop-detector that's too eager blocks a
  legitimate retry. Start with budgets and turn caps (near-zero effort) before writing hook logic.
- **A stop-style hook with no loop guard is its own runaway** — it can pin the agent in forced
  continuation and burn tokens until the session times out, the exact failure it was meant to prevent.[^cc-stophook-issue]
- **Coverage gaps.** Several tools only cap dollars at the account/team level, not turns per run, and
  some turn caps only exist in print mode — a guardrail on one surface leaves the interactive surface
  uncovered.

## How to verify

- After setting a turn cap or budget, confirm the run actually **halts with a limit/error message** at
  the ceiling rather than continuing — test it deliberately on a task you expect to hit the cap.
- Watch the **distribution of cost-per-task, not the average**: guardrails clip the long tail, so look at
  the p95/max run cost before and after, and count how often runs now hit the cap (too often means the
  cap is too tight or the real problem is elsewhere).
- For a team budget, confirm it is set to **hard-stop**, not alert-only — check that "stop usage when the
  limit is reached" (or the tool's equivalent) is on.

## Measured impact

_Not yet measured by us._ Benchmark: run a task set that includes at least one deliberately unsolvable or
under-specified task (the kind that makes an agent loop), once with no guardrail and once with a turn cap
and a per-run budget, and compare the **maximum and p95 cost per task** and the number of runs that hit
the cap — the median should be unchanged, the tail bounded. There is no independent published savings
figure for this technique to cite; its value is variance reduction (capping runaway runs), not a
percentage cut on normal work, so we won't quote a headline number until the benchmark produces one.

[^cc-cli]: Claude Code docs, CLI reference — <https://code.claude.com/docs/en/cli-reference>
[^cc-hooks]: Claude Code docs, Hooks reference — <https://code.claude.com/docs/en/hooks>
[^cc-stophook-issue]: anthropics/claude-code, issue #54360 — <https://github.com/anthropics/claude-code/issues/54360>
[^goose-cli]: goose docs, CLI commands (run --max-turns / --max-tool-repetitions) — <https://goose-docs.ai/docs/guides/goose-cli-commands/>
[^cursor-spend]: Cursor docs, Spend limits — <https://cursor.com/docs/account/billing/spend-limits>
[^copilot-budgets]: GitHub Docs, Getting started with budget controls — <https://docs.github.com/en/copilot/tutorials/budgets/getting-started-with-budget-controls>
[^roo-maxreq]: RooCodeInc/Roo-Code, PR #3631 (allowedMaxRequests) — <https://github.com/RooCodeInc/Roo-Code/pull/3631>
[^aider-maxreflect]: Aider-AI/aider, issue #3865 (configure max_reflections) — <https://github.com/Aider-AI/aider/issues/3865>
[^codex-budget-pr]: openai/codex, PR #28746 (rollout token budget configuration) — <https://github.com/openai/codex/pull/28746>
