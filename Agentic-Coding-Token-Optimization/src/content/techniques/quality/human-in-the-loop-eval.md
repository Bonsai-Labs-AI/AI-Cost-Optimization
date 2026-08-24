---
title: "Human-in-the-loop review sampling"
group: quality
level: 2
costLever: [plan]
effort: Medium
savingEstimate: "enables safe cost cuts (not a direct token cut)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - langfuse
  - braintrust
  - terminal-bench
  - claude-code
  - codex
  - copilot
  - cursor
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/code-review-bot-cost-discipline"
  - "model-routing/open-cheap-model-substitution"
  - "model-routing/task-class-model-tier-map"
sources:
  - id: metr-prs
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: paper
    note: "296 PRs, 4 maintainers, 3 SWE-bench Verified repos. Automated grader ~24.2 pp (SE 2.7) higher than maintainer merge decision; roughly half of test-passing PRs would not be merged. Reasons: code quality, breaks other code, core functionality failure."
  - id: braintrust-hitl
    title: "How to run human-in-the-loop evals for LLM apps"
    publisher: "Braintrust"
    url: "https://www.braintrust.dev/articles/human-in-the-loop-evals-for-llm-apps"
    accessed: "2026-08-10"
    kind: blog
    note: "Sample 50–100 traces/week (random / priority / stratified / edge-case); score on low-precision scales (0–3 or pass/fail); use human labels as ground truth to calibrate the judge; compare judge vs human on the same traces and refine the scorer prompt on disagreements."
  - id: braintrust-platforms
    title: "8 best human-in-the-loop LLM evaluation platforms in 2026"
    publisher: "Braintrust"
    url: "https://www.braintrust.dev/articles/best-human-in-the-loop-llm-evaluation-platforms-2026"
    accessed: "2026-08-10"
    kind: blog
    note: "Periodic calibration: pull a fresh sample, have a domain expert score it, compare to the judge; if agreement drops below ~80% the scorer needs work. Threshold is practitioner guidance, not a hard rule."
  - id: langfuse-coding-agents
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Traces Claude Code (Stop hook), Codex (plugin Stop hook), Copilot (native OpenTelemetry), Cursor, OpenCode, Kiro, Augment; turns grouped by session_id. Gives the trace layer human review attaches to."
  - id: terminal-bench-harbor
    title: "Running Terminal-Bench (Harbor harness, --agent claude-code)"
    publisher: "Harbor / Laude Institute"
    url: "https://www.harborframework.com/docs/tutorials/running-terminal-bench"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Harbor runs Terminal-Bench with real coding harnesses as agent adapters (e.g. -a claude-code); the repo lists Claude Code, Codex CLI, OpenHands, mini-SWE-agent adapters. Lets you re-run a golden set through the same harness a human labelled."
  - id: swebench-verified
    title: "SWE-bench Verified — resolved-% and $/instance (mini-SWE-agent board)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Public cost-per-passing-task anchors used to shortlist a cheaper model; the human sample is what confirms the shortlist held on your own repo. Cost data only within the mini-SWE-agent harness; never compare across harnesses."
---

## What & why

Once a cheaper model, a trimmed context, or a shorter agent loop is in place, the thing standing
between you and a bad merge is the automated gate — CI plus, often, an LLM-as-a-judge scoring the
diff. Both drift: a judge that agreed with your reviewers in March can quietly grade easier by
August, and a green test suite is not the same as a merge-worthy change. METR had maintainers review
296 agent PRs that *passed* their tests and found the automated grade sat about **24 percentage
points** above the human merge decision — roughly half of test-passing PRs would not have been
merged.[^metr-prs] This technique is the cheap insurance against that gap: randomly sample a small
percentage of agent-authored merged PRs for structured human review, track the accept/rework rate as
a drift signal, and periodically re-label a fresh sample to re-anchor the judge. It doesn't cut
tokens directly; it's what lets you *keep* a cost cut instead of quietly trading spend for defects.

## How to do it

This is a method, not a per-harness flag. The steps hold across whatever eval stack you run:

1. **Sample from merged output, not a static benchmark.** Draw a random slice of agent-authored PRs
   that already merged — say 5–10%, or a fixed count per week. Random keeps it an unbiased drift
   signal; add a stratified or edge-case slice on top if you want coverage of risky areas, but keep
   a random core so the number stays comparable over time.[^braintrust-hitl] The merge itself is a
   weak label; human review is the ground truth you're really after.
2. **Review against a fixed rubric on a coarse scale.** Score accept / needs-rework (or 0–3), not a
   1–10 scale — coarse scales are far more consistent between reviewers.[^braintrust-hitl] Capture
   the *reason* on a rework, in METR's categories: code quality / breaks other code / core
   functionality failure.[^metr-prs] That turns the sample into a diagnosis, not just a pass rate.
3. **Track accept/rework rate over time as the drift signal.** Plot it. A rising rework rate after a
   model swap or a context change is the erosion the automated gates missed — the whole point of the
   sample.
4. **Re-anchor the judge on the same labels.** Put the human score and the LLM-judge score side by
   side on the same PRs and compute agreement. Use the human labels as ground truth and refine the
   judge prompt on the disagreements.[^braintrust-hitl] Practitioner guidance treats **agreement
   below ~80%** on a fresh sample as "the scorer needs work"; re-label periodically so you catch the
   judge drifting or the rubric going stale.[^braintrust-platforms] ⚠ The 80% figure is a rule of
   thumb, not a hard line — pick a threshold your team can defend.
5. **Wire it to your trace layer so review is cheap to do.** Langfuse traces the major harnesses —
   Claude Code and Codex via stop hooks, Copilot via native OpenTelemetry, plus Cursor and OpenCode
   — and groups turns by session, so a sampled PR opens with its full trajectory instead of just the
   final diff.[^langfuse-coding-agents] Braintrust keeps the human label and the judge score on the
   same row for the agreement comparison.[^braintrust-hitl] If you keep a frozen golden set, Harbor
   (the Terminal-Bench harness) can re-run it through the *actual* coding harness — `-a claude-code`,
   or the Codex adapter — so the re-label reflects the tool devs use, not a toy scaffold.[^terminal-bench-harbor]

Most coding harnesses have no per-tool "review sampling" knob — the mechanism lives in the eval/trace
stack, so `TOOL_MATRIX.md` lists the trace integration per harness rather than a setting on the tool
itself.

## When it's worth it / when not

- **Worth it:** any team that has made — or is about to make — a cost cut it can't fully see the
  quality effect of: an open/cheaper-model swap, a trimmed rules file, a shorter loop, or a raised
  autonomy level. The sample is how you prove the cut was free rather than paid for in rework.
- **Worth it:** teams leaning on an LLM-as-a-judge in CI. Judges drift; a periodic human re-label is
  the only thing that catches it.
- **Not worth it (yet):** very low PR volume — a 5% sample of 20 PRs a month is noise. Sample a fixed
  count and accept a slower signal, or skip until volume justifies it.
- **Not a substitute for review of high-risk changes.** This is a *drift signal* on the aggregate, not
  a gate on the individual PR. Security-sensitive or irreversible changes still get full human review
  regardless of whether they land in the sample.

## What it costs you

- **Reviewer time, not tokens.** The cost is human hours: budget ~50–100 reviews per week at the top
  end, less for smaller teams.[^braintrust-hitl] That's the whole bill — it adds no model spend.
- **Rubric maintenance.** A stale rubric drifts as fast as a stale judge. Someone owns re-reading the
  disagreements and updating the rubric/judge prompt each cycle, or the agreement number stops meaning
  anything.
- **False comfort from a lazy sample.** If the sample isn't actually random (e.g. reviewers cherry-pick
  the easy PRs), the accept rate looks healthy while quality erodes. Keep the draw automatic and the
  scale coarse.
- **Lag.** It's a sampled, periodic signal — it tells you a swap degraded quality *this week*, not on
  the PR that merged this morning. Pair it with the always-on automated gate; this backstops that gate,
  it doesn't replace it.

## How to verify

- **Accept/rework rate on the random sample, tracked over time** — the headline number. A stable or
  falling rework rate after a cost cut is the evidence the cut was safe; a rise is the flag.
- **Judge–human agreement on the same sampled PRs** — the calibration number. Watch it against your
  threshold (~80% is the common line[^braintrust-platforms]) and inspect disagreements when it slips.
- **Where to see it:** the human label and judge score side by side in Braintrust (or your eval tool),
  with the underlying agent trajectory in Langfuse traces for the sampled sessions.[^braintrust-hitl][^langfuse-coding-agents]

## Measured impact

_Not a token number — this technique buys eval reliability, so "impact" is measured as the gap it
catches._ The load-bearing datapoint is METR's: across 296 test-passing agent PRs (4 maintainers, 3
repos), the automated grade ran about **24.2 pp** (SE 2.7) above the maintainer merge decision, and
roughly **half** of test-passing PRs would not have been merged — the exact quality erosion a
green-CI-plus-judge gate reports as fine.[^metr-prs] Our benchmark won't produce a token saving here;
it will produce a *reliability* number: judge–human agreement on a fresh sample before and after a
model swap (arm to be named in D3), reported alongside the cost-per-passing-task swap it's guarding.
The cost anchors that swap is chasing come off the SWE-bench Verified `mini-SWE-agent` board; the
human sample is what confirms the board's ranking held on your own repo.[^swebench-verified] ⚠ METR's
gap is measured on SWE-bench Verified repos with mid-2024–late-2025 agents; treat the magnitude as
directional for your stack, not a constant.

[^metr-prs]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^braintrust-hitl]: Braintrust, "How to run human-in-the-loop evals for LLM apps" — <https://www.braintrust.dev/articles/human-in-the-loop-evals-for-llm-apps>
[^braintrust-platforms]: Braintrust, "8 best human-in-the-loop LLM evaluation platforms in 2026" — <https://www.braintrust.dev/articles/best-human-in-the-loop-llm-evaluation-platforms-2026>
[^langfuse-coding-agents]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^terminal-bench-harbor]: Harbor / Laude Institute, "Running Terminal-Bench" — <https://www.harborframework.com/docs/tutorials/running-terminal-bench>
[^swebench-verified]: SWE-bench, "Verified — resolved-% and $/instance (mini-SWE-agent board)" — <https://www.swebench.com/verified.html>
