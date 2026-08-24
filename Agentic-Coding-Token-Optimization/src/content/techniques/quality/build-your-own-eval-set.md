---
title: "Build your own eval set from your repos"
group: quality
level: 3
costLever: [model-price, model, calls]
effort: High
savingEstimate: "enables safe cost cuts (no direct token cut)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - mini-swe-agent
  - swe-bench-harness
  - harbor
  - langfuse
  - braintrust
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/task-class-model-tier-map"
  - "quality/calibrated-llm-judge"
sources:
  - id: metr-merge
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: paper
    note: "296 AI PRs, 4 maintainers, 3 repos: maintainer merge rate ~24.2 pp below SWE-bench grader score; ~half of test-passing PRs would not be merged."
  - id: swebench-verified
    title: "Introducing SWE-bench Verified"
    publisher: "OpenAI"
    url: "https://openai.com/index/introducing-swe-bench-verified/"
    accessed: "2026-08-10"
    kind: paper
    note: "FAIL_TO_PASS / PASS_TO_PASS: patch must flip the failing tests to pass and keep passing tests passing."
  - id: swebench-issue-287
    title: "How can I populate the FAIL_TO_PASS and PASS_TO_PASS fields? (issue #287)"
    publisher: "SWE-bench/SWE-bench"
    url: "https://github.com/swe-bench/SWE-bench/issues/287"
    accessed: "2026-08-10"
    kind: repo
    note: "How the objective test-based pass criterion is derived from a PR's own tests."
  - id: mini-swe-agent
    title: "mini-swe-agent — the ~100-line bash-only agent (>74% SWE-bench Verified)"
    publisher: "SWE-agent"
    url: "https://github.com/SWE-agent/mini-swe-agent/"
    accessed: "2026-08-10"
    kind: repo
    note: "Minimal fixed scaffold; bash-only, no tool-calling API; used for like-for-like model comparison."
  - id: swebench-board
    title: "SWE-bench Verified leaderboard ($/instance next to resolved-%)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Cost-per-instance published only for mini-SWE-agent submissions; never compare cost across harnesses."
  - id: harbor
    title: "Harbor — evaluate arbitrary agents (Claude Code, Codex CLI, OpenHands…)"
    publisher: "harbor-framework/harbor"
    url: "https://github.com/harbor-framework/harbor"
    accessed: "2026-08-10"
    kind: repo
    note: "Runs Claude Code and Codex CLI directly as adapters; official harness for Terminal-Bench 2.0."
  - id: langfuse-agents
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Per-tool tracing: Claude Code / Codex hooks, Copilot native OTel, Cursor / OpenCode dedicated integrations; no proxy required."
---

## What & why

Every cheaper-model or trimmed-context change you make needs a way to prove it didn't quietly
degrade quality. A public benchmark won't do that for your codebase — it wasn't built from your
code, and its scores overstate real quality. This technique builds a small, private eval set from
your own merged pull requests, where the merge is a human's approval of the answer. That eval set
is the regression gate that makes the cost cuts elsewhere in this playbook safe to ship: it doesn't
lower token cost itself, it's what lets you switch to a cheaper or open-weight model without flying
blind.

## How to do it

The method is the same regardless of which harness you wire it into. Frameworks are named where
they do the work.

1. **Mine golden tasks from merged PRs.** Take PRs that closed a linked issue and merged to main.
   The merge is human-approved ground truth — someone accepted this as the correct change. For each,
   record the issue text (the task), the repo state at the parent commit, and the merged patch (the
   reference answer).

2. **Make the pass criterion a test, not a diff.** Copy SWE-bench's rule: identify a `FAIL_TO_PASS`
   test — one that failed before the change and passed after — plus the `PASS_TO_PASS` tests that
   must stay green so nothing else broke.[^swebench-verified][^swebench-issue-287] A task "passes"
   only when the agent's patch flips the failing test and breaks none of the others. Don't score on
   patch similarity — there are many correct diffs; the test is the objective judge. Prefer PRs that
   already shipped tests; skip issues you can't pin to a test.

3. **Replay the issue against the agent and diff.** Reset the repo to the parent commit, hand the
   agent the issue, let it produce a patch, then run the tests. Keep the merged patch as the
   reference for review, but the tests decide pass/fail.

4. **Add a "would this actually be merged?" filter.** Passing the tests is necessary, not
   sufficient. METR had maintainers review 296 AI PRs that passed SWE-bench's automated grader;
   roughly half would not have been merged — the maintainer merge rate ran about 24 percentage
   points below the grader score, on code-quality, breaks-other-code, and doesn't-really-solve-it
   grounds.[^metr-merge] So keep tasks where a passing patch is also a mergeable one, and spot-check
   with a reviewer (or a calibrated LLM judge) so your gate tracks real acceptance, not just green
   tests.

5. **Freeze a versioned, held-out suite and stratify by difficulty.** Fix the task list, version it,
   and hold it out of any prompt or fine-tune so it can't leak in. Group tasks by difficulty (small
   bug fix / cross-file change / needs design judgment) so a regression shows up where it happens
   rather than washing out in one average.

6. **Wire it into a harness.** A minimal fixed scaffold keeps model-to-model comparisons honest —
   `mini-swe-agent` is bash-only, about 100 lines, no tool-calling API, so any model runs under the
   same conditions.[^mini-swe-agent] To evaluate the actual off-the-shelf tools your team uses,
   Harbor runs Claude Code and Codex CLI directly as adapters (it's the official Terminal-Bench 2.0
   harness).[^harbor] For scoring, review, and tracking judge-vs-human agreement over time, an eval
   platform such as Braintrust or Langfuse holds the dataset and runs; Langfuse can also trace the
   live coding agents (Claude Code and Codex via hooks, Copilot via native OpenTelemetry, Cursor and
   OpenCode via dedicated integrations) with no proxy.[^langfuse-agents]

See this technique's row in `TOOL_MATRIX.md` for how each harness integrates.

## When it's worth it / when not

- **Worth it:** you're about to move real spend onto a cheaper or open-weight model, change routing,
  or trim context, and you need proof the change is safe. The eval set pays for itself the first time
  it blocks a bad swap.
- **Worth it:** your repo has a decent test culture, so PRs ship with tests you can turn into
  `FAIL_TO_PASS` cases.
- **Not worth it:** tiny or exploratory codebases with few merged, test-backed PRs — there isn't
  enough ground truth to mine, and a public benchmark plus manual review is a cheaper start.
- **Not worth it as a token cut on its own.** This is a gate that enables cuts elsewhere; if you're
  not planning any model/context change, the build cost isn't justified yet.

## What it costs you

- **Setup effort is High.** Mining PRs, deriving `FAIL_TO_PASS`/`PASS_TO_PASS` sets, containerizing
  each task, and wiring a harness is real engineering — the largest build in this playbook.
- **Running it costs tokens.** Each eval run replays every task through an agent; a broad suite on a
  frontier model isn't free. Keep the held-out suite small and stratified rather than large.
- **Failure modes to watch:** contamination (a task leaking into a prompt or fine-tune inflates
  scores — hold the suite out and version it); a green-tests-only gate that passes unmergeable code
  (the METR gap — keep the realism filter); and harness drift, where the same model scores
  differently under a different scaffold. Fix the scaffold and never compare costs across harnesses —
  SWE-bench's own cost figures are only valid within `mini-swe-agent` runs.[^swebench-board]

## How to verify

- **The gate does its job:** run a known-worse configuration (e.g. a model you expect to regress)
  through the suite and confirm the pass rate drops. A gate that never fails isn't measuring
  anything.
- **Judge-vs-human agreement:** track how often the automated pass/fail (and any LLM reviewer) agrees
  with a human's merge decision on a sample. That agreement number is the real health metric for this
  technique — not a token count. Braintrust and Langfuse both track scores and human review over
  time.[^langfuse-agents]
- **Then read cost off the gate:** with the suite in place, compare cost per passing task between your
  current model and a candidate cheaper one, and ship the swap only if the pass rate holds.

## Measured impact

_Not a token cut, so there's no before/after saving to report — this technique is scored on eval
reliability and the safety it buys, not tokens._ The load-bearing evidence is that a private,
test-based, merge-filtered eval set catches regressions a public score misses: METR found roughly
half of SWE-bench-passing AI PRs would not have been merged, with maintainer acceptance about 24
percentage points below the automated grader.[^metr-merge] Our benchmark will use this same eval set
as the gate for the model-substitution arms (cheaper/open-weight vs frontier): the reported number
there is cost per passing task at held quality, and this page is what makes "held quality"
measurable. The metric to publish for this technique itself is judge-vs-human agreement on the
suite, not a percentage saving.

[^metr-merge]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^swebench-verified]: OpenAI, "Introducing SWE-bench Verified" — <https://openai.com/index/introducing-swe-bench-verified/>
[^swebench-issue-287]: SWE-bench/SWE-bench, issue #287 — <https://github.com/swe-bench/SWE-bench/issues/287>
[^mini-swe-agent]: SWE-agent, "mini-swe-agent" — <https://github.com/SWE-agent/mini-swe-agent/>
[^swebench-board]: SWE-bench, "Verified leaderboard" — <https://www.swebench.com/verified.html>
[^harbor]: harbor-framework/harbor — <https://github.com/harbor-framework/harbor>
[^langfuse-agents]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
