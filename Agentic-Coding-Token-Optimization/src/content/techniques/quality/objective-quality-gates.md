---
title: "Objective quality gates as an early stop"
group: quality
level: 1
costLever: [turns]
effort: Low
savingEstimate: "varies — the turns spent polishing past 'done'"
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
  - "workflow/test-driven-agent-work"
  - "workflow/loop-guardrails"
  - "context/tool-output-filtering"
sources:
  - id: cc-best-practices
    title: "Best practices for Claude Code — Give Claude a way to verify its work"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/best-practices"
    accessed: "2026-08-10"
    kind: docs
    note: "Stop hook blocks the turn until the check passes; overridden after 8 consecutive blocks. In-prompt check and /goal condition also described."
  - id: aider-lint-test
    title: "Linting and testing"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/lint-test.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--lint-cmd + --auto-lint and --test-cmd + --auto-test run after each edit; aider expects a non-zero exit on failure and tries to fix it, then stops."
  - id: metr-swebench-prs
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: paper
    note: "About half of test-passing SWE-bench Verified PRs would not be merged by maintainers; grader scores ~24 pts above maintainer acceptance. Failures: code quality, breaking other code, core functionality not fixed. A passing test suite is a necessary but not sufficient gate."
  - id: swebench-verified
    title: "SWE-bench Verified leaderboard (bash-only / mini-SWE-agent, $ per instance)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Publishes resolved-% next to $/instance for mini-SWE-agent submissions; cost data exists only for that harness, so cost comparisons across harnesses are invalid."
  - id: mini-swe-agent
    title: "mini-SWE-agent"
    publisher: "SWE-bench / princeton-nlp (GitHub)"
    url: "https://github.com/SWE-agent/mini-swe-agent"
    accessed: "2026-08-10"
    kind: repo
    note: "~100-line fixed scaffold; the standard minimal harness whose green/red (test-patch pass) is the objective gate reported on the SWE-bench Verified bash-only board."
  - id: langfuse-tracing
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Claude Code and Codex traced via lifecycle (Stop) hooks; GitHub Copilot via native OpenTelemetry export; Cursor via a dedicated integration. Captures tool calls, token usage (input/output/cache), timing."
  - id: harbor-terminal-bench
    title: "Running Terminal-Bench — Harbor"
    publisher: "Harbor (Laude Institute)"
    url: "https://www.harborframework.com/docs/tutorials/running-terminal-bench"
    accessed: "2026-08-10"
    kind: docs
    note: "Harbor runs Claude Code, Codex CLI, Aider, Cursor, Gemini CLI, OpenHands and mini-SWE-agent directly inside the harness (installed into the container); pass/fail on the task is the objective gate. `harbor run -d terminal-bench/terminal-bench-2 -a claude-code`."
---

## What & why

A patch has a non-subjective first layer of "done": the build passes, the tests pass, lint and
type-check are clean, the diff only touches the intended files, and coverage doesn't drop. These
gates are cheap to run and give a yes/no answer without a judgment call. The token angle is to make
that layer the agent's **stop condition** — halt the moment everything is green, and fail fast the
moment something is red — instead of letting the agent keep taking turns to reformat, add comments,
or "improve" code that already meets the bar. The lever is turns: you cut the tail the agent spends
polishing past done, and you avoid the turns a run burns wandering after it has actually broken
something.

## How to do it

This group is about method more than per-tool flags. The method is to define an objective check the
agent can run, wire it so the loop ends on that check, and keep the check fast enough to run every
turn.

1. **Pick the gates that have a hard answer.** Build result, test result, lint/type-check exit code,
   diff scope (did it touch files outside the task?), and coverage delta. These are the layer that
   needs no human judgment — reserve subjective quality (a judge or reviewer) for a later, separate
   pass.
2. **Make green the stop signal, not "looks done."** Tell the agent, in the task or in the rules
   file, to run the check and stop when it exits zero — don't keep editing. Without this, the model's
   own sense of "polished" is the only stop signal, and it will spend turns past the point where the
   work is already correct.
3. **Make red fail fast.** The same gates catch a broken run early: a build break or a failing test
   on turn two is the signal to stop or re-plan, not to push on. Pair this with a turn/attempt cap so
   a flaky or impossible check can't loop forever (see `workflow/loop-guardrails`).
4. **Bind it so the loop can't end on red.** A Stop hook that blocks the turn until the script exits
   zero (Claude Code), an after-edit test/lint command (Aider),[^aider] or a goal condition — see this
   technique's row in `TOOL_MATRIX.md`. This is what lets an unattended run finish correctly without
   you watching.
5. **Keep the gate cheap.** Run the affected module or a scoped subset, not the whole suite every
   turn, and filter the check's output down to pass/fail plus failures (see
   `context/tool-output-filtering`) so the gate itself doesn't cost more tokens than it saves.

**On the framework side**, the objective gate is exactly what the standard eval harnesses report.
mini-SWE-agent runs a fixed ~100-line scaffold and grades each attempt on whether the hidden
test patch passes;[^mini] the SWE-bench Verified bash-only board publishes that resolved-% next to
a `$`-per-instance figure, so you can read cost-per-passing-task off a board when shortlisting a
cheaper model.[^swebench] Harbor / Terminal-Bench run Claude Code, Codex CLI, Aider, Cursor and
Gemini CLI directly inside the harness and score the task pass/fail — the same green/red gate, on
your own tasks if you author them.[^harbor] To see whether an agent is actually stopping on green
(vs. taking extra turns after), trace the sessions: Langfuse traces Claude Code and Codex via a Stop
hook, GitHub Copilot via native OpenTelemetry, and Cursor via a dedicated integration, capturing
tool calls and token usage per turn.[^langfuse]

## When it's worth it / when not

- **Worth it:** any task with a checkable definition of done — bug fixes with a repro, features with
  clear I/O, refactors behind an existing suite. Green is a real stop line and the agent can find it
  itself.
- **Worth it most:** unattended, batch, or background runs, where an objective stop condition is the
  only thing that ends the loop at the right point instead of at a budget cap.
- **Not worth it as the *whole* bar:** passing tests is necessary, not sufficient. METR found that
  about half of test-passing SWE-bench Verified PRs would not be merged by maintainers — a patch can
  pass every test and still be brittle, break untested paths, or not actually fix the cause.[^metr]
  So green gates are the *early stop* and the *floor*, not proof of quality; keep a subjective review
  for changes where a missed defect is expensive.
- **Not worth it:** exploratory or design work with no crisp target yet — a gate there is just
  ceremony.

## What it costs you

- **Setup: Low** for in-prompt and after-edit-command versions; **Medium** for a Stop hook or goal
  gate you write and tune.
- **A broad or slow gate taxes every turn.** Running the full suite on each edit can cost more in test
  output than the polishing turns it saves — scope the check and filter its output.
- **A flaky or impossible gate loops.** A hard gate against a check that never goes green burns turns
  up to the cap. Claude Code overrides a Stop hook after 8 consecutive blocks;[^cc] set your own
  attempt cap regardless.
- **False confidence is the real risk.** If the team reads "tests green" as "done," the objective
  layer quietly becomes the only layer — and that is exactly the case METR measured as
  under-merging.[^metr] Keep the gate honest about what it does and doesn't cover.

## How to verify

- **Turns after first green.** Trace a set of runs and count the turns taken *after* the gate first
  passed — the number this technique targets. It should drop toward zero once green is the stop
  signal. Langfuse (or Claude Code `/usage` / `ccusage`) gives per-turn tool and token data to see
  this.[^langfuse]
- **Cost per passing task** (input + output tokens ÷ tasks that reach green), so a run that stops
  earlier shows up as a lower cost, not just fewer turns.
- **Gate output tokens per turn**, to catch a check that's too verbose or too broad and is eating the
  saving.

## Measured impact

_Not yet measured by us._ Benchmark: run the same fixed tasks two ways on one repo — a baseline where
the agent stops on its own "looks done," and a variant where the build/test/lint/scope gate is the
stop condition — and compare turns-to-stop, turns-after-first-green, and cost per passing task. The
saving is inherently the tail past done, so the task set must include cases the agent would otherwise
keep polishing. Note this is a *turns* lever with a quality guardrail, not a direct input-token cut:
the honest headline is what it buys — a defined, cheap stop line — not a fixed percentage. The
load-bearing external evidence is a caution, not a saving: METR found roughly half of test-passing
SWE-bench Verified PRs would not be merged by maintainers, with the automated grader scoring about 24
points above maintainer acceptance,[^metr] so this technique's benchmark should also record how often
a green-gated run produced a change a human reviewer would reject — the gate's blind spot, measured.

[^cc]: Claude Code docs, "Best practices — Give Claude a way to verify its work" — <https://code.claude.com/docs/en/best-practices>
[^aider]: Aider docs, "Linting and testing" — <https://aider.chat/docs/usage/lint-test.html>
[^metr]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^swebench]: SWE-bench Verified leaderboard (bash-only / mini-SWE-agent, $ per instance) — <https://www.swebench.com/verified.html>
[^mini]: mini-SWE-agent — <https://github.com/SWE-agent/mini-swe-agent>
[^langfuse]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^harbor]: Harbor, "Running Terminal-Bench" — <https://www.harborframework.com/docs/tutorials/running-terminal-bench>
