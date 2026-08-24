---
title: "Eval harnesses to run your own"
group: quality
level: 2
costLever: [model-price, calls]
effort: Medium
savingEstimate: "enables safe cost cuts — not a direct token cut"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - mini-swe-agent
  - swe-bench-harness
  - hal
  - terminal-bench
  - openhands
  - braintrust
  - langfuse
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/open-cheap-model-substitution"
  - "model-routing/task-class-model-tier-map"
  - "workflow/test-driven-agent-work"
sources:
  - id: mini-swe-agent
    title: "mini-SWE-agent"
    publisher: "SWE-agent (Princeton NLP)"
    url: "https://github.com/SWE-agent/mini-swe-agent"
    accessed: "2026-08-10"
    kind: repo
    note: "~100-line agent core, bash-only, model-agnostic via litellm/openrouter, scores >74% on SWE-bench Verified; powers Ramp's SWE-bench evaluation platform. Runs your own tasks via CLI or Python."
  - id: swe-bench
    title: "SWE-bench (containerized evaluation harness)"
    publisher: "SWE-bench"
    url: "https://github.com/SWE-bench/SWE-bench"
    accessed: "2026-08-10"
    kind: repo
    note: "Fully containerized (Docker) evaluation harness for reproducibility; supports running its data-collection procedure on your own repositories to make new tasks."
  - id: hal
    title: "Holistic Agent Leaderboard: The Missing Infrastructure for AI Agent Evaluation"
    publisher: "Kapoor et al., arXiv:2510.11977 (ICLR 2026); code at princeton-pli/hal-harness"
    url: "https://arxiv.org/abs/2510.11977"
    accessed: "2026-08-10"
    kind: paper
    note: "Standardized harness orchestrating parallel evals across hundreds of VMs, weeks→hours; three-dimensional analysis over models × scaffolds × benchmarks; integrates Weave for cost tracking. 21,730 rollouts, 9 models, 9 benchmarks, ~$40k."
  - id: terminal-bench
    title: "Terminal-Bench / Harbor"
    publisher: "Harbor framework (Terminal-Bench 2.0 harness)"
    url: "https://github.com/harbor-framework/harbor"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Runs the ACTUAL agent via installed adapters — claude-code, codex, copilot-cli, cursor-cli, cline-cli, aider, opencode, gemini-cli, grok-build, openhands, mini-swe-agent, and more — not a proxy. Cloud sandbox scaling."
  - id: openhands-evals
    title: "OpenHands evaluation harness"
    publisher: "OpenHands (All-Hands-AI)"
    url: "https://github.com/OpenHands/benchmarks"
    accessed: "2026-08-10"
    kind: repo
    note: "Dedicated evaluation harness for OpenHands covering SWE-bench and many other benchmarks (GAIA, Terminal-Bench, SWE-bench Pro, Commit0, and more)."
  - id: braintrust
    title: "Evals (datasets, scorers, experiments, CI)"
    publisher: "Braintrust docs"
    url: "https://www.braintrust.dev/docs/start/eval-sdk"
    accessed: "2026-08-10"
    kind: docs
    note: "Dataset + scoring functions (built-in and custom) + experiments as permanent records; compare experiments; run evaluations in CI/CD to catch regressions."
  - id: langfuse-coding
    title: "Langfuse for coding agents (Claude Code, Codex, Cursor)"
    publisher: "Langfuse docs"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Traces Claude Code and Codex via lifecycle hooks (zero code change), GitHub Copilot via native OpenTelemetry, and Cursor/OpenCode via dedicated integrations; captures turns, tool calls, token usage and cost. Datasets + scores for evaluation."
  - id: swebench-verified
    title: "SWE-bench Verified leaderboard ($/instance, mini-SWE-agent board)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    verify: true
    note: "bash-only board (fixed mini-SWE-agent scaffold) publishes $/instance: MiniMax M2.5 75.8% @ $0.073 vs Opus 4.5 76.8% @ $0.754. Cost/trajectory data only for mini-SWE-agent submissions — cross-harness cost comparison invalid."
  - id: metr
    title: "Measuring the impact of AI on experienced open-source developer productivity"
    publisher: "METR"
    url: "https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/"
    accessed: "2026-08-10"
    kind: paper
    verify: true
    note: "Passing a public benchmark is not the same as being mergeable — public-benchmark success overstates real-repo usefulness. Reinforces evaluating on your own tasks."
---

## What & why

This technique is the safety net for every cost cut in this playbook. Before you swap in a cheaper
model, prune context, downgrade a task class, or change scaffolds, you need a way to prove the change
didn't quietly lower quality on **your** code. An eval harness runs a standardized agent over a fixed
set of your own tasks, reproducibly and cheaply, so you can compare a candidate config against your
current one and keep only the cuts that hold up. The lever it pulls is indirect: it doesn't reduce
tokens by itself, it's what lets you *take* the model-price and task-routing savings elsewhere without
flying blind. Public leaderboards get you a shortlist; your own harness confirms it on your repos —
because passing a public benchmark is not the same as producing a mergeable change.[^metr]

## How to do it

The method matters more than any one framework. The steps hold whichever harness you pick.

1. **Build a golden set from your own repos.** Collect 20–50 real, closed tasks (a merged PR, its
   issue, and the tests that gate it). Each task is: a repo state, an instruction, and an automatic
   pass check — ideally the tests that actually merged. This is the whole asset; the harness is
   plumbing around it. SWE-bench's data-collection procedure turns your merged PRs into tasks in its
   own format.[^swe-bench]

2. **Pick a harness for the job:**
   - **Reproducible, benchmark-grade, model-agnostic:** `mini-SWE-agent` — a ~100-line bash-only
     agent that runs any model through litellm/openrouter and scores >74% on SWE-bench Verified. Its
     minimalism is the point: nothing in the scaffold to confound a model-vs-model comparison.[^mini-swe-agent]
   - **On private repos, containerized:** the official **SWE-bench harness** runs each task in Docker
     for reproducibility and accepts custom task instances built from your own repositories.[^swe-bench]
   - **Many benchmarks at once, with cost tracking:** **HAL** orchestrates parallel evals across
     hundreds of VMs (weeks → hours) over models × scaffolds × benchmarks, and logs cost per run.[^hal]
   - **Eval the ACTUAL tool your devs use, not a proxy:** **Terminal-Bench / Harbor** ships adapters
     that drive the real agent — `claude-code`, `codex`, `copilot-cli`, `cursor-cli`, `cline-cli`,
     `aider`, `opencode`, `gemini-cli`, `grok-build`, `openhands`, `mini-swe-agent` — so you measure
     the harness your team ships with, including its scaffold, not a stand-in.[^terminal-bench] **OpenHands**
     also ships its own evaluation harness across SWE-bench and other benchmarks.[^openhands-evals]

3. **Wrap it in a dataset + scorer + experiment loop for A/B and CI.** **Braintrust** and **Langfuse**
   turn ad-hoc runs into repeatable experiments: a versioned dataset, scoring functions (built-in or
   custom, including an LLM judge), and side-by-side experiment comparison — plus a CI gate that fails
   a change if a score regresses.[^braintrust] Langfuse additionally *traces the coding agents
   themselves* — Claude Code and Codex via hooks with zero code change, Copilot via native
   OpenTelemetry, Cursor and OpenCode via dedicated integrations — capturing turns, tool calls, and
   token/cost per session, so your production traces can feed the golden set.[^langfuse-coding]

4. **Pin the scaffold, budget, and tools across every A/B run.** The single most important discipline:
   the harness itself moves the score. The same model scores differently under a different scaffold,
   step budget, or toolset — swings of **10–20 points** are common, which is why cross-harness cost
   comparisons on the SWE-bench board are invalid and only same-harness (`mini-SWE-agent`) numbers are
   comparable.[^swebench-verified] Change one variable at a time; hold the rest fixed.

5. **Calibrate the judge if you use one.** If pass/fail comes from an LLM judge rather than tests,
   spot-check it against human labels on a sample until agreement is high enough to trust; a
   miscalibrated judge silently approves regressions. Prefer real tests as the gate wherever you have
   them, and reserve the LLM judge for what tests can't check.

Most of these frameworks have no per-coding-tool knob — they *are* the tool. See this technique's row
in `TOOL_MATRIX.md` for the two places a coding harness genuinely integrates (Terminal-Bench/Harbor
running the real agent; Langfuse tracing it).

## When it's worth it / when not

- **Worth it:** the moment you're about to act on any cost lever that could touch quality — a
  cheaper-model swap (`model-routing/open-cheap-model-substitution`), a task-class downgrade
  (`model-routing/task-class-model-tier-map`), context pruning, or a scaffold change. The harness is
  what makes those safe to ship.
- **Worth it:** when a public board gives you a shortlist (e.g. an open-weight model at ~1/10th the
  per-task cost) and you need to confirm it holds on *your* repos before rolling it out.
- **Worth it as a standing CI gate** once built — it catches a silent quality regression from a model
  or config change before it reaches developers.
- **Not worth it** for a one-off, low-stakes change you can eyeball, or before you have any real tasks
  to evaluate on — a golden set of made-up tasks measures nothing useful.
- **Not a token-saver in itself.** It costs tokens to run. Its value is the savings it *unlocks
  safely* elsewhere; if you're not going to act on the result, don't run the eval.

## What it costs you

- **Setup effort (Medium).** Building the golden set is the real work — collecting real tasks with
  reliable pass checks. The harness plumbing is comparatively cheap, especially with an off-the-shelf
  one.
- **Compute/token cost to run.** Each eval run is N tasks × the agent's full trajectory; a broad sweep
  across models and configs adds up (HAL's own 21,730-rollout validation cost ~$40k[^hal]). Keep the
  golden set small and targeted, and only run the sweep when you're deciding something.
- **Maintenance.** The golden set drifts — tasks get stale, tests change. Budget periodic refresh, or
  it slowly stops reflecting your codebase.
- **Failure modes to watch:** an unpinned scaffold/budget/toolset making runs incomparable (the
  10–20-point swing[^swebench-verified]); an uncalibrated LLM judge passing regressions; benchmark
  contamination or over-fitting to the golden set; and reading a public-leaderboard pass as a
  merge-ready result when it isn't.[^metr]

## How to verify

- **Judge reliability first.** If you use an LLM judge, measure its agreement with human labels on a
  sample; only trust the harness once agreement is high. With a test-based gate, confirm the tests are
  deterministic and actually fail on a bad change.
- **Reproducibility.** Run the same config twice and confirm the score is stable within noise. A large
  run-to-run swing means the scaffold or environment isn't pinned.
- **The comparison you actually care about.** Report cost-per-passing-task (tokens or $ per resolved
  task) for the candidate config vs the incumbent, from the same harness. That single number tells you
  whether a cheaper model or leaner context kept quality while cutting spend — and it's what every
  other technique in this playbook is trying to move.

## Measured impact

This technique's "impact" is eval *reliability* and the safety it buys, not a token cut — so we
measure it as: does the harness let us keep a cost cut that we'd otherwise have shipped blind (or
caught only in production)? The concrete win it enables is visible on the public `mini-SWE-agent`
board: an open-weight model resolving 75.8% of SWE-bench Verified at **$0.073/instance** sits ~1 point
below Opus 4.5 at 76.8% and **$0.754/instance** — a ~10× per-task cost gap that a private harness lets
you confirm on your own repos before switching.[^swebench-verified] ⚠ Those are public-board figures
on a fixed scaffold; they are read-off-the-board anchors, not our measurement, and public-benchmark
success overstates real-repo mergeability.[^metr] Benchmark: build a 20–50-task golden set from our
repos, run the current and a candidate config under a pinned `mini-SWE-agent` scaffold, and report
pass rate and cost-per-passing-task for each — the reusable measuring stick for the model-routing and
context techniques.

[^metr]: METR, "Measuring the impact of AI on experienced open-source developer productivity" — <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>
[^mini-swe-agent]: SWE-agent (Princeton NLP), "mini-SWE-agent" — <https://github.com/SWE-agent/mini-swe-agent>
[^swe-bench]: SWE-bench, "SWE-bench (containerized evaluation harness)" — <https://github.com/SWE-bench/SWE-bench>
[^hal]: Kapoor et al., "Holistic Agent Leaderboard: The Missing Infrastructure for AI Agent Evaluation," arXiv:2510.11977 (ICLR 2026); code at princeton-pli/hal-harness — <https://arxiv.org/abs/2510.11977>
[^terminal-bench]: Harbor framework, "Terminal-Bench / Harbor" — <https://github.com/harbor-framework/harbor>
[^openhands-evals]: OpenHands (All-Hands-AI), "OpenHands evaluation harness" — <https://github.com/OpenHands/benchmarks>
[^braintrust]: Braintrust docs, "Evals (datasets, scorers, experiments, CI)" — <https://www.braintrust.dev/docs/start/eval-sdk>
[^langfuse-coding]: Langfuse docs, "Langfuse for coding agents (Claude Code, Codex, Cursor)" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^swebench-verified]: SWE-bench, "SWE-bench Verified leaderboard ($/instance, mini-SWE-agent board)" — <https://www.swebench.com/verified.html>
