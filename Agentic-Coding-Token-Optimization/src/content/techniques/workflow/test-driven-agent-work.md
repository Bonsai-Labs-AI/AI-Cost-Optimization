---
title: "Test-driven agent work"
group: workflow
level: 2
costLever: [turns, calls]
effort: Low
savingEstimate: "fewer turns/rework; varies by task"
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
status: researched
lastUpdated: "2026-08-10"
related:
  - "quality/objective-quality-gates"
  - "workflow/plan-spec-before-code"
  - "context/tool-output-filtering"
sources:
  - id: cc
    title: "Best practices for Claude Code — Give Claude a way to verify its work"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/best-practices"
    accessed: "2026-08-10"
    kind: docs
    note: "In-prompt check, /goal condition, Stop hook (blocks the turn until the check passes; overridden after 8 consecutive blocks), adversarial review subagent."
  - id: cursor
    title: "Best practices for coding with agents — Test-driven development"
    publisher: "Cursor docs"
    url: "https://cursor.com/blog/agent-best-practices"
    accessed: "2026-08-10"
    kind: docs
    note: "Write failing tests, confirm they fail, iterate until pass, don't modify the tests. 'Agents perform best when they have a clear target to iterate against.'"
  - id: aider
    title: "Linting and testing"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/lint-test.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--test-cmd + --auto-test run the suite after each edit; /test in chat; aider expects a non-zero exit on failure and tries to fix it."
  - id: costs
    title: "Manage costs — agent teams token cost"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Agent teams use ~7x the tokens of a standard session (plan mode); each teammate is a separate context."
---

## What & why

Give the agent a concrete pass/fail target — a failing test, a build, a linter, a script that
diffs output against a fixture — and tell it to run that check and keep going until it passes.
The lever is turns and rework: without an objective check, "looks done" is the only stop signal,
so you become the verification loop and every miss costs another round-trip of correction.[^cc]
A check the agent can read closes the loop on its own — it edits, runs the check, reads the
result, and iterates — which cuts the count of speculative turns and re-prompts that each re-pay
input and output tokens.

## How to do it

The portable move is to **name the check before the work starts** and require the agent to reach
green, not to declare success. Three levels, cheapest first:

1. **In one prompt.** State the verification criteria and tell the agent to run the check and
   iterate in the same message: "write `validateEmail`, here are three example cases, run the tests
   after implementing and fix until they pass." This works on any tool today, with no setup.[^cc]
2. **Write the failing test first (red-green).** Ask the agent to write tests from expected
   input/output pairs, confirm they fail, then write code to pass them — and tell it **not to modify
   the tests**. This stops the common failure where the agent weakens the assertion instead of fixing
   the code.[^cursor] Be explicit that you're doing TDD so it doesn't stub the not-yet-built
   function.
3. **Make the check a gate.** Bind the pass/fail so the agent can't stop on red: a test-command flag
   that runs after every edit (Aider), a per-turn goal condition, or a Stop hook that blocks the turn
   until the script exits zero.[^cc][^aider] This is what lets an unattended run finish correctly
   without you watching.

Keep the check fast and scoped — a single failing test or the one affected module, not the whole
suite on every turn — so the feedback loop is cheap to run. See this technique's row in
`TOOL_MATRIX.md` for the exact per-tool flag or gate.

## When it's worth it / when not

- **Worth it:** any task with a checkable definition of done — bug fixes with a repro, features with
  clear I/O, refactors behind an existing suite. This is the highest-leverage case: the agent
  self-corrects instead of pinging you.
- **Worth it:** unattended or batch runs, where a gate is the only thing keeping the agent honest
  about "done."
- **Not worth it:** exploratory or design work with no crisp target yet (spikes, "what would you
  improve here?"), where forcing a test up front just adds ceremony.
- **Backfires when the test is a bad oracle.** If the check is under-specified, the agent games it —
  hard-codes the fixture, over-fits to the one case, or (if allowed) edits the test. Then you re-pay
  the tokens plus the debugging. Lock the tests and make them cover the real cases.

## What it costs you

- **Setup effort is Low** for the in-prompt and flag versions; **Medium** for a Stop-hook or
  goal-gate you have to write and tune.
- **A slow or broad check taxes every turn.** Running the full suite on each edit can cost more tokens
  in test output than the rework it saves — scope the check and filter its output (see
  `context/tool-output-filtering`).
- **Gate loops need a cap.** A hard gate against a flaky or impossible check burns turns retrying.
  Tools cap this differently — Claude Code overrides a Stop hook after 8 consecutive blocks[^cc] — but
  a flaky test still wastes the turns up to the cap.
- **Don't let the agent grade its own work unchecked.** For anything unattended, pair the gate with a
  fresh-context review (a separate reviewer or subagent) so the model that wrote the code isn't the
  only one confirming it passes.[^cc]

## How to verify

- **Turns (or messages) to green per task**, before and after — the direct signal that the loop is
  self-closing instead of routing through you.
- **Cost per passing task** (input + output tokens ÷ tasks that reach green), so a cheaper loop that
  needs more turns still shows up honestly.
- Watch **test-output tokens per turn** to catch a check that's too verbose or too broad; if it's
  large, scope or filter it.

## Measured impact

_Not yet measured by us._ Benchmark: run the same fixed tasks two ways on one repo — a baseline with
a subjective "looks done" stop, and a variant that hands the agent a failing test/check as the target
and gates on green — and compare turns-to-done and cost per passing task. Expected direction is fewer
turns and less rework in the gated variant; the risk case to measure is a broad or slow check whose
per-turn output cost eats the savings. Related caution for the unattended version: multi-agent
setups that add a separate reviewer are more thorough but cost more — Claude Code reports agent teams
use roughly **7x** the tokens of a standard session, so reserve a second grader for runs where a
missed defect is expensive. ⚠ The 7x figure is vendor-reported (Claude Code docs), not independently
verified.[^costs]

[^cc]: Claude Code docs, "Best practices — Give Claude a way to verify its work" — <https://code.claude.com/docs/en/best-practices>
[^cursor]: Cursor docs, "Best practices for coding with agents — Test-driven development" — <https://cursor.com/blog/agent-best-practices>
[^aider]: Aider docs, "Linting and testing" — <https://aider.chat/docs/usage/lint-test.html>
[^costs]: Claude Code docs, "Manage costs" (agent teams ~7x tokens) — <https://code.claude.com/docs/en/costs>
