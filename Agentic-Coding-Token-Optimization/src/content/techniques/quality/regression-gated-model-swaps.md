---
title: "Regression-gated model swaps"
group: quality
level: 3
costLever: [model-price, plan]
effort: Medium
savingEstimate: "enables the routing/substitution savings safely; no direct token cut"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - braintrust
  - langfuse
  - mini-swe-agent
  - swe-bench
  - claude-code
  - codex
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/open-cheap-model-substitution"
  - "model-routing/task-class-model-tier-map"
  - "model-routing/strong-plan-cheap-execute-split"
sources:
  - id: braintrust-action
    title: "Braintrust eval GitHub Action (braintrustdata/eval-action)"
    publisher: "Braintrust"
    url: "https://github.com/marketplace/actions/braintrust-eval"
    accessed: "2026-08-10"
    kind: repo
    note: "Runs Eval() functions in CI and posts/updates one PR comment with a result table showing improvements/regressions vs baseline. terminate_on_failure stops on runtime errors, not on score thresholds — a hard score gate is an assertion inside the eval script, not an action input."
  - id: langfuse-ci
    title: "Experiments in CI/CD (langfuse/experiment-action)"
    publisher: "Langfuse"
    url: "https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd"
    accessed: "2026-08-10"
    kind: docs
    note: "Runs an experiment against a named, version-pinned dataset; posts pass/regression/script-error on the PR; raise RegressionError and should_fail_on_regression (default true) fails the job and blocks merge. Needs Python SDK v4.6.0+ or JS SDK v5.3.0+."
  - id: langfuse-action-repo
    title: "langfuse/experiment-action"
    publisher: "Langfuse"
    url: "https://github.com/langfuse/experiment-action"
    accessed: "2026-08-10"
    kind: repo
    note: "Injects commit SHA / branch / actor as run metadata; result_json output for downstream steps."
  - id: metr-prs
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: paper
    note: "296 AI patches on scikit-learn/Sphinx/pytest, 95 of 500 SWE-bench Verified issues; maintainer merge rate ~24 percentage points below the automated grader's pass rate. A green test suite is not a merge decision — the case for gating on your own review-grade eval."
  - id: mini-swe-agent
    title: "mini-SWE-agent (~100-line fixed scaffold, bash-only)"
    publisher: "SWE-agent / Princeton"
    url: "https://github.com/SWE-agent/mini-SWE-agent"
    accessed: "2026-08-10"
    kind: repo
    note: "Minimal ~100-line agent, bash-only, subprocess per action, linear history — a fixed scaffold so score differences come from the model, not the harness. Basis for the SWE-bench Verified $/instance board."
  - id: swebench-cost
    title: "SWE-bench Verified — resolved-% and $/instance (mini-SWE-agent board)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Public board pairs resolved-% with $/instance; use it to shortlist a candidate model. Cost data is only for mini-SWE-agent runs; never compare cost across harnesses."
---

## What & why

A model swap — frontier to cheaper, or closed to open-weight — is where the routing and substitution
savings actually live, but it's also where quality quietly slips: a weaker backend resolves fewer
tasks, or produces code that passes tests yet would fail review. This technique makes the swap a
**gate, not a guess**: no candidate config ships without a passing run on a frozen internal eval
suite, wired as eval-gated CI so a pull request that drops pass-rate or judge score below threshold
can't merge. It doesn't cut tokens itself; it's the safety mechanism that lets you *take* the big
per-token savings from [open/cheap-model substitution](../model-routing/open-cheap-model-substitution.md)
without shipping a regression.

## How to do it

The method is the same regardless of which model you're swapping to. Four parts.

1. **Freeze a golden suite that reflects your code, not a public benchmark.** Collect 30–100 real
   tasks from your repos — issues the agent should resolve, with a check that decides pass/fail
   (the repo's own tests, a diff assertion, or an LLM judge for review-grade quality). Version it and
   pin it; a suite that drifts can't tell a model regression from a suite change. Public boards are
   for *shortlisting* a candidate (SWE-bench Verified pairs resolved-% with $/instance on the
   mini-SWE-agent board[^swebench-cost]) — they don't substitute for a run on your code, because a
   green benchmark is not a merge decision (see below).[^metr-prs]

2. **Hold the harness fixed so the model is the only variable.** Run current and candidate configs
   through one scaffold on identical tasks. A minimal fixed harness like **mini-SWE-agent**
   (~100 lines, bash-only, one subprocess per action) exists precisely so score differences come
   from the model, not the scaffold.[^mini-swe-agent] Change one thing at a time: same tasks, same
   harness, swap only the model slot.

3. **Wire it as a CI gate on the config change.** Put the model/gateway config under version control
   and run the suite in a GitHub Action on any PR that touches it. Two off-the-shelf paths:
   - **Braintrust eval-action** runs your `Eval()` functions in CI and posts one PR comment with a
     result table of improvements and regressions against the baseline. Note the gate itself is an
     **assertion inside the eval script** (fail the run if pass-rate or judge score drops below
     threshold) — the action's `terminate_on_failure` only stops on runtime errors, not on a score
     threshold.[^braintrust-action]
   - **Langfuse experiment-action** runs an experiment against a **named, version-pinned dataset**,
     comments pass / regression / script-error on the PR, and — this is the block — raise
     `RegressionError` in your script and `should_fail_on_regression` (default true) fails the job so
     the PR can't merge. Needs Python SDK v4.6.0+ or JS SDK v5.3.0+.[^langfuse-ci][^langfuse-action-repo]

4. **A/B current vs candidate on identical tasks and compare cost per *passing* task.** The number
   that matters is cost per solved task, not sticker unit price — a cheaper model that retries or
   fails the edit format erases its own saving. Only promote the swap when the candidate holds pass
   rate (and judge score, if you gate on quality) at a lower cost per passing task.

There is usually **no per-coding-harness knob** for this — the gate lives in your eval framework and
CI, not in Claude Code or Codex settings. Where a harness integrates is on the *tracing* side:
Langfuse can trace Claude Code, Codex, Copilot, and Cursor sessions into datasets you later gate on,
and fixed harnesses (mini-SWE-agent, and Terminal-Bench/Harbor) can drive Claude Code and Codex
directly for the A/B run. See this technique's row in `TOOL_MATRIX.md`.

## When it's worth it / when not

- **Worth it:** any time you're about to change the model behind a coding agent to save money —
  premium to cheaper, closed to open-weight, or flipping a routing rule. The gate is what makes that
  change reversible and safe.
- **Worth it:** teams running enough agent volume that a silent quality drop would cost more in
  retries and review churn than the eval suite costs to build.
- **Not worth it (yet):** if you have no golden suite at all, build that first — a gate on a suite
  that doesn't represent your code gives false confidence. Start with a handful of real tasks and grow it.
- **Not the right gate for everything:** it catches *regressions on tasks you've captured*. Novel
  failure modes outside the suite still get through, so keep the suite growing from production incidents.

## What it costs you

- **Setup effort is Medium.** Building and curating the golden suite is the real work; wiring the
  GitHub Action on top is a day. Both frameworks have a working PR-gate path out of the box.
- **Running cost.** Each PR that touches the model config re-runs the suite, which spends tokens.
  Keep the suite small and representative; run the full suite on config PRs, a smoke subset elsewhere.
- **Judge calibration is the sharpest failure mode.** If you gate on an LLM judge, an uncalibrated
  judge either waves through regressions or blocks good changes. Calibrate it against human labels
  before you trust it as a merge gate, and re-check agreement periodically.
- **Suite rot.** A frozen suite slowly stops reflecting the codebase. Version it, and treat "the
  suite passed but production broke" as a signal to add the missed case, not to loosen the gate.

## How to verify

- **The gate actually blocks.** Open a PR that swaps in a knowingly-worse model and confirm the CI
  check goes red and merge is blocked — a gate you haven't seen fail is not a gate.
- **Judge–human agreement**, if you gate on a judge: sample gated decisions and check them against
  human review. Below acceptable agreement, the gate is noise.
- **Cost per passing task, before vs after the swap**, on your own suite — the number that accounts
  for retries and the only honest measure of whether the swap saved money.
- Both frameworks surface the run: Braintrust's PR comment shows per-case improvements/regressions
  vs baseline;[^braintrust-action] Langfuse comments pass/regression and links the comparison view.[^langfuse-ci]

## Measured impact

_Not a token cut, and not measured by us as one — this technique's value is the **safety** it buys
for the substitution/routing techniques that do cut cost._ The impact to report is eval *reliability*
(judge–human agreement on your gate) and the regressions the gate catches before merge. The anchor
for why the gate is needed: METR reviewed 296 SWE-bench-passing AI patches on scikit-learn, Sphinx,
and pytest and found maintainer merge rates about **24 percentage points below** the automated
grader's pass rate — a green test suite is materially more optimistic than a real merge decision, so
gating a model swap on tests alone under-catches quality loss.[^metr-prs] Benchmark plan: on tasks
T1–T3, run the current config (arm A0) and a candidate cheap/open config through one fixed harness,
gate on the golden suite, and report pass-rate delta, judge–human agreement, and cost per passing
task — the safety number that lets the routing/substitution arms report their savings honestly.
⚠ The METR figure is a published study on three OSS repos, not a general guarantee; the SWE-bench
$/instance data is valid only within the mini-SWE-agent harness.

[^braintrust-action]: Braintrust, "eval GitHub Action (braintrustdata/eval-action)" — <https://github.com/marketplace/actions/braintrust-eval>
[^langfuse-ci]: Langfuse, "Experiments in CI/CD" — <https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd>
[^langfuse-action-repo]: Langfuse, "experiment-action" — <https://github.com/langfuse/experiment-action>
[^metr-prs]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^mini-swe-agent]: SWE-agent, "mini-SWE-agent" — <https://github.com/SWE-agent/mini-SWE-agent>
[^swebench-cost]: SWE-bench, "Verified — resolved-% and $/instance (mini-SWE-agent board)" — <https://www.swebench.com/verified.html>
