---
title: "Cost per quality-passing task"
group: quality
level: 2
costLever: [calls, model-price, turns]
effort: Medium
savingEstimate: "varies — decision metric, not a direct cut"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - langfuse
  - braintrust
  - harbor
  - hal
  - claude-code
  - cursor
  - copilot
  - codex
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "quality/regression-gated-model-swaps"
  - "model-routing/open-cheap-model-substitution"
sources:
  - id: swebench-cost
    title: "SWE-bench Verified leaderboard (bash-only, mini-SWE-agent — publishes $/instance)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Bash-only board reports resolved-% next to $/instance; cost data exists only for mini-SWE-agent submissions, so cross-harness cost comparison is invalid."
  - id: mini-swe-agent
    title: "mini-swe-agent — the 100-line agent used for the bash-only cost board"
    publisher: "SWE-agent / Princeton"
    url: "https://github.com/SWE-agent/mini-swe-agent"
    accessed: "2026-08-10"
    kind: repo
    note: "~100-line, bash-only, linear-history agent; fixed minimal scaffold so the score reflects the model, not scaffold tuning."
  - id: metr-paper
    title: "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity"
    publisher: "METR (Becker, Rush, Barnes, Rein) — arXiv:2507.09089"
    url: "https://arxiv.org/abs/2507.09089"
    accessed: "2026-08-10"
    kind: paper
    note: "RCT: experienced devs 19% slower with AI while believing they were 20% faster — the developer-time cost the naive cost-per-task number misses."
  - id: metr-merge
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "4 maintainers from scikit-learn/Sphinx/pytest reviewed 296 SWE-bench-passing patches; ~half would not have been merged; maintainer merge rate ~24.2 pp below the automated grader's score; code quality among top rejection reasons."
  - id: hal
    title: "Holistic Agent Leaderboard: The Missing Infrastructure for AI Agent Evaluation"
    publisher: "Kapoor et al. — arXiv:2510.11977"
    url: "https://arxiv.org/abs/2510.11977"
    accessed: "2026-08-10"
    kind: paper
    note: "Cost-controlled evals by default; parallel eval across hundreds of VMs, weeks→hours; tracks token usage and traces per run."
  - id: harbor
    title: "Harbor — run Terminal-Bench with Claude Code, Codex CLI, mini-SWE-agent as the agent"
    publisher: "Harbor / Laude Institute"
    url: "https://github.com/harbor-framework/harbor"
    accessed: "2026-08-10"
    kind: repo
    note: "harbor run --agent claude-code / codex — evaluates model + harness together, so scores move when you change either."
  - id: langfuse-tracing
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Per-session cost+trace capture: Claude Code/Codex via Stop hook, Copilot via native OTel, Cursor/OpenCode dedicated integrations; supports LLM-as-a-judge scoring on traces."
  - id: braintrust
    title: "Braintrust — datasets, experiments, and LLM-as-a-judge scorers"
    publisher: "Braintrust"
    url: "https://www.braintrust.dev/docs"
    accessed: "2026-08-10"
    kind: docs
    note: "Build golden datasets, run scorer functions (incl. LLM-as-a-judge), and compare model outputs across experiments."
---

## What & why

Cost per quality-passing task is dollars spent divided by the number of tasks that pass every
objective gate — tests, type-checks, lint, and whatever review bar you enforce — with the
developer-time cost of fixing bad patches added into the denominator's failures. It is the one
number that puts cost and quality on the same axis: a cheap model that fails a gate, or needs three
retries, or produces a patch a human has to rewrite, can cost more per *passing* task than a premium
model that succeeds on the first try. This is the metric that decides whether any other technique on
this site is actually saving money, so it gates every cost cut you make. It is the operational
sibling of the Foundations cost-per-outcome metric ($/merged PR, $/completed task); this page is the
method for measuring it on agentic coding work.

## How to do it

This is a method, not a per-tool flag. Four steps:

1. **Define "passing" as objective gates, not a vibe.** Pick gates a script can check with no human
   in the loop: the task's own tests pass, the full suite still passes, types/lint are clean, and —
   where you can automate it — a review rule (no unrelated files touched, diff within scope). If a
   gate needs a person, make the judge reproducible (see step 3). The gate set is the contract; write
   it down.

2. **Build a golden set of real tasks.** Twenty to fifty tasks drawn from your own backlog and repos,
   each with a known-good outcome and the gates above wired as pass/fail. This is the part worth
   paying for — public benchmarks tell you which models to *shortlist*, but only your own tasks tell
   you what a change does to *your* cost per passing task. Tools for the dataset/experiment plumbing:
   **Braintrust** (datasets + experiments + scorers) and **Langfuse** (traces + LLM-as-a-judge
   scoring).[^braintrust][^langfuse-tracing]

3. **Wire the harness so cost and pass/fail are captured on the same run.** Run each task through a
   fixed agent scaffold and record tokens (hence dollars) and gate results together. **HAL** does
   cost-controlled evals across many VMs (weeks to hours) and tracks token usage per run;[^hal]
   **Harbor / Terminal-Bench** can drive Claude Code or Codex CLI directly as the agent, so you
   measure the harness you actually ship, not a proxy.[^harbor] Keep the scaffold *fixed* — the
   minimal **mini-SWE-agent** (~100 lines, bash-only) exists precisely so the score reflects the
   model, not scaffold tuning, which is why the public $/instance board is built on it.[^mini-swe-agent][^swebench-cost]

4. **Calibrate the judge before you trust it.** If any gate is an LLM-as-a-judge, check its agreement
   with human labels on a sample before you let it gate spend — an uncalibrated judge just moves the
   error. Both Braintrust and Langfuse support scoring against a labelled set for this.[^braintrust][^langfuse-tracing]

Then compute: **cost per passing task = total dollars (all attempts, passing and failed) ÷ tasks that
passed all gates**, and add the human-fix cost of the failures. Compare variants (cheaper model,
trimmed context, fewer retries) on *this* number, not on raw token count. See this technique's row in
`TOOL_MATRIX.md` — for most coding harnesses there is no per-tool knob; the cells point at the
eval/tracing integration (Langfuse, Harbor) where one genuinely exists.

## When it's worth it / when not

- **Worth it:** before and after any cost cut you are unsure about — a model swap, a context trim, a
  routing change. This is the metric that tells you whether the cut was real or whether it just moved
  the cost into retries and rework.
- **Worth it:** any time spend is rising and someone asks "are we getting more done, or just spending
  more?" Cost per passing task answers that; raw spend does not.
- **Not worth it as a daily dashboard number** — the golden-set run is a periodic gate (per model
  change, per quarter), not a per-commit metric. For live spend use the Foundations observability
  pages; use this to *decide*, not to *monitor*.
- **Not worth building for a team that ships no automated gates at all** — you have to fix that first,
  or "passing" means nothing.

## What it costs you

- **Setup effort is the main cost:** building and maintaining the golden set and wiring the harness is
  a Medium lift. It decays — tasks go stale, gates drift — so budget maintenance, not just a build.
- **The eval runs cost tokens.** Running 20–50 tasks across two or three model variants is real spend;
  HAL's own 21,730-rollout validation cost ~$40k, which sets scale expectations for a large sweep (a
  team's golden-set run is far smaller).[^hal] Treat the eval budget as the price of not guessing.
- **Cross-harness comparison is a trap.** Cost numbers are only comparable within the *same* scaffold —
  the public board's cost data exists only for mini-SWE-agent runs, and comparing $/instance across
  harnesses is invalid.[^swebench-cost] Fix your scaffold before you compare models.
- **A weak "passing" definition is the real failure mode.** Test-pass is not merge-worthy: when METR
  had maintainers review 296 SWE-bench-passing patches, the real merge rate ran ~24.2 points below
  what the automated grader implied, and about half of the test-passing patches would not have been
  merged — commonly for code-quality, repo-standard, or correctness reasons.[^metr-merge] If your
  gates stop at "tests green," your cost-per-passing-task number is optimistic by roughly that margin.

## How to verify

- **The number moved the right way:** cost per passing task should fall (or hold) when a cost cut is
  genuinely good, and *rise* when a cheaper model quietly trades quality for retries — that rise is
  the metric doing its job.
- **The denominator is honest:** spot-check that "passing" tasks would actually merge. If your gates
  are tests-only, sample a few against a human reviewer and expect a gap in the direction METR found
  (~24 points).[^metr-merge]
- **The judge agrees with humans:** if a gate is LLM-as-a-judge, track its agreement rate with labels
  on a held-out sample; if that drifts, the cost number drifts with it.[^braintrust][^langfuse-tracing]
- **Where to see it:** the eval harness (HAL/Harbor/Braintrust) reports pass/fail and per-run cost
  together; Langfuse gives per-session cost and traces for the coding tool you actually run.[^hal][^harbor][^langfuse-tracing]

## Measured impact

This is a decision metric, so its "impact" is the *reliability* it buys, not a token cut — it is the
denominator every other page's saving should be expressed against. The evidence here is about that
reliability, not a percentage we save:

- **The public board makes shortlisting measurable:** SWE-bench Verified's bash-only board publishes
  resolved-% next to $/instance on the fixed mini-SWE-agent scaffold, which is what lets a team read
  a cost-per-passing-task *shortlist* off a leaderboard before confirming on their own tasks.[^swebench-cost][^mini-swe-agent]
- **The gap this metric closes is large and real:** METR's RCT found experienced developers were 19%
  *slower* with AI while believing they were 20% faster — the developer-time cost a naive cost-per-task
  number omits;[^metr-paper] and maintainer review put the true merge rate ~24.2 points below the
  benchmark score.[^metr-merge] Both say the same thing: measure cost per *quality-passing* task, with
  human-fix cost in the denominator, or you will under-count.

_Not yet measured on our own repos._ Benchmark: run the golden set (tasks T1–T3) through a fixed
scaffold on a premium model vs a cheaper/open-weight model, capture tokens and gate results together
(HAL/Harbor), and report cost per passing task for each — the number that decides the eval-gated swap.

[^swebench-cost]: SWE-bench Verified leaderboard (bash-only, mini-SWE-agent) — <https://www.swebench.com/verified.html>
[^mini-swe-agent]: SWE-agent, "mini-swe-agent" — <https://github.com/SWE-agent/mini-swe-agent>
[^metr-paper]: Becker, Rush, Barnes, Rein (METR), "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity", arXiv:2507.09089 — <https://arxiv.org/abs/2507.09089>
[^metr-merge]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^hal]: Kapoor et al., "Holistic Agent Leaderboard", arXiv:2510.11977 — <https://arxiv.org/abs/2510.11977>
[^harbor]: Harbor / Laude Institute — <https://github.com/harbor-framework/harbor>
[^langfuse-tracing]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^braintrust]: Braintrust docs — <https://www.braintrust.dev/docs>
