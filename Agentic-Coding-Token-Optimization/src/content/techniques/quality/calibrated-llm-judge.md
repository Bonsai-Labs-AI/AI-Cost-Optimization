---
title: "Calibrated LLM-as-judge"
group: quality
level: 3
costLever: [plan]
effort: High
savingEstimate: "no direct token cut — a reliable quality gate that lets you cut cost safely"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - langfuse
  - braintrust
  - harbor
  - claude-code
  - cursor
  - copilot
  - codex
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/open-cheap-model-substitution"
  - "quality/regression-gated-model-swaps"
  - "workflow/best-of-n-tradeoff"
sources:
  - id: norman-reliability
    title: "Reliability without Validity: A Systematic, Large-Scale Evaluation of LLM-as-a-Judge Models Across Agreement, Consistency, and Bias"
    publisher: "Norman, Rivera & Hughes (UC Berkeley School of Information), arXiv:2606.19544"
    url: "https://arxiv.org/abs/2606.19544"
    accessed: "2026-08-10"
    kind: paper
    verify: true
    note: "21 models, 9 providers, 3 benchmarks, ~541k judgments. Raw exact-match overstates chance-corrected agreement (Cohen's κ) by 33.8–41.3 pp on MT-Bench across all models ('kappa deflation'). Recommends reporting κ / Krippendorff's α as the primary reliability metric, not raw agreement."
  - id: metr-prs
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: benchmark
    verify: true
    note: "4 active maintainers from 3 repos (scikit-learn, Sphinx, pytest) reviewed 296 SWE-bench-passing patches; ~half would not have been merged; maintainer merge rate ~24 pp below the automated grader's score; code quality among top rejection reasons. Motivates a quality layer beyond passing tests."
  - id: langfuse-judge
    title: "LLM-as-a-Judge"
    publisher: "Langfuse docs"
    url: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
    accessed: "2026-08-10"
    kind: docs
    note: "Managed LLM-as-a-judge evaluators; run on live production observations (recommended target) or offline experiments; evaluators are versioned ('creating one under an existing name produces the next version'); pin a dedicated model per evaluator."
  - id: langfuse-coding-agents
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Langfuse traces Claude Code (Stop hook, runs after each response), Codex (plugin/Stop hooks in ~/.codex/config.toml), GitHub Copilot (native OpenTelemetry export), and Cursor / OpenCode via dedicated integrations. Gives the judge a real stream of coding-agent traces to score."
  - id: braintrust-judge
    title: "LLM-as-a-judge scorers and classifiers"
    publisher: "Braintrust docs"
    url: "https://www.braintrust.dev/docs/evaluate/llm-as-a-judge"
    accessed: "2026-08-10"
    kind: docs
    note: "LLM-as-a-judge scorers (numeric) / classifiers (categorical) for subjective judgments (tone, helpfulness); defined inline in the SDK, pushed via CLI, or built in the UI. Open-source autoevals library ships prebuilt scorers. Docs cover implementation, not human calibration — you add that yourself."
  - id: harbor-agents
    title: "harbor-framework/terminal-bench — supported agents"
    publisher: "Harbor / Terminal-Bench (Laude Institute)"
    url: "https://github.com/harbor-framework/terminal-bench"
    accessed: "2026-08-10"
    kind: repo
    note: "Harbor harness runs Terminal-Bench tasks against popular agents directly, including Claude Code, Codex CLI, OpenHands, and mini-SWE-agent (harbor run --agent claude-code ...). Lets you build the golden-task run the judge scores against a fixed harness."
---

## What & why

An LLM-as-judge scores the subjective part of code quality — readability, design, idiomatic style,
absence of dead code — that tests can't check. On its own it doesn't cut tokens; its job is to give
you a **quality signal reliable enough to gate the cost cuts** on the rest of this project. Swapping in
a cheaper model, trimming context, or shrinking the plan step is only safe if you can tell that quality
held, and passing tests alone don't tell you that: when maintainers of scikit-learn, Sphinx, and pytest
reviewed 296 SWE-bench-**passing** patches, about **half would not have been merged**, mostly on code
quality.[^metr-prs] The judge fills that gap — but only if it's calibrated. An uncalibrated judge
number looks authoritative and means nothing; one Berkeley study of 21 judge models found raw
agreement overstates chance-corrected agreement by **34–41 points**, so a judge that looks like it
agrees with people often barely does.[^norman-reliability]

## How to do it

This is a method, not a per-tool flag. The work is building the judge and proving it tracks humans
before you trust it to gate anything.

1. **Write a rubric, not a vibe.** Score explicit dimensions — readability, design/structure, idiomatic
   use of the language and framework, no dead or duplicated code — each on a small fixed scale (e.g.
   1–4) with a one-line definition per level. Vague criteria are where judges and humans diverge.
2. **Sample real traces.** Pull **100–300** actual coding-agent traces (diffs plus context) from
   production, not toy examples. An eval/observability platform that traces your harness gives you this
   stream directly — Langfuse traces Claude Code, Codex, Copilot, Cursor, and OpenCode;[^langfuse-coding-agents]
   Braintrust and its open-source `autoevals` library hold the same role in that ecosystem.[^braintrust-judge]
3. **Have 2–3 engineers label the same sample on the same rubric.** This is the ground truth. First
   check the **humans agree with each other** — compute inter-annotator agreement (Cohen's κ for two
   labelers, Krippendorff's α for three or more). If the people can't agree (κ below ~0.4), the rubric
   is ambiguous; rewrite it before you automate anything, because the judge will only inherit the
   ambiguity.
4. **Score the same traces with the judge and measure judge-human agreement.** Use the *chance-corrected*
   metric (κ / α), never raw percent-agreement — raw agreement flatters the judge by 30-plus points.[^norman-reliability]
   Rule of thumb: **κ below 0.4 → the rubric or judge prompt is broken, rewrite it; 0.6 and up →
   usable as a gate.** In between, tune the prompt and rubric and re-measure.
5. **Bias-correct.** Judges have known, measurable biases — length (longer answers score higher),
   position/order, and self-preference (a model rates its own family's output higher). Test for them on
   your sample and correct: randomize order, control for length, and don't judge a model with a member
   of its own family.
6. **Pin the judge model and prompt version, and freeze them.** A judge is only a stable ruler if it
   doesn't move. Pin the exact judge model and the exact rubric/prompt version; treat any change to
   either as a new judge that has to be re-calibrated. Platforms that version evaluators and let you pin
   a dedicated judge model (Langfuse) make this bookkeeping automatic.[^langfuse-judge]

Then wire it as a gate: run the calibrated judge over a fixed **golden-task set** whenever you change a
cost lever, and only ship the change if the quality score holds. Running the golden set through a fixed
harness keeps the comparison honest — Harbor/Terminal-Bench can drive Claude Code, Codex, and
mini-SWE-agent directly, so the only thing that changes between runs is the lever you're testing.[^harbor-agents]
See this technique's row in `TOOL_MATRIX.md` for where each harness plugs into a tracing/eval platform;
most coding tools have no per-tool judge knob — the judge lives in the eval framework, not the harness.

## When it's worth it / when not

- **Worth it:** any team about to make a cost cut whose downside is quality — an open/cheap-model swap,
  aggressive context trimming, a smaller plan step. The judge is what tells you the cheaper setup is
  still good enough, so it pays for itself by de-risking every other technique in this project.
- **Worth it:** high-volume agent output where human review can't scale, but "did tests pass" clearly
  isn't enough (the METR gap).[^metr-prs]
- **Not worth it (yet) as a gate:** if calibration comes back below κ ~0.4 and you can't get it up. An
  uncalibrated judge is worse than none — it gives a false green light. Use it as advisory only until
  it clears the bar.
- **Not the right tool** for things you can check deterministically. Tests, linters, type-checkers, and
  build gates are cheaper and exact; reserve the judge for the genuinely subjective layer they can't
  cover.

## What it costs you

- **Setup effort is High and it's mostly human.** The labeling pass (2–3 engineers on 100–300 traces)
  and the rubric iteration are the real cost — the code to run a judge is trivial by comparison.
- **Ongoing maintenance.** A pinned judge drifts the moment the underlying model is updated or the
  rubric changes; both force a re-calibration. Budget for periodic re-checks, not a one-time setup.
- **Token cost of judging.** Each judged trace is an extra model call. It's small next to the coding
  run, but on live production traces it's continuous — sample rather than judge everything if volume is
  high.
- **Failure modes to watch:** uncorrected length/position/self-preference bias inflating scores; a
  golden set that goes stale or leaks into training; treating a judge tuned on one task class as valid
  for another; and — the quiet one — letting the pinned model or prompt change without re-calibrating,
  which silently invalidates every downstream gate decision.

## How to verify

- **Judge-human agreement (κ / α) is the headline metric** — it's the number that says the judge is
  trustworthy at all. Track it at calibration and re-check it after any judge/model/rubric change.
  Report chance-corrected agreement, not raw exact-match.[^norman-reliability]
- **Inter-annotator agreement among your humans** — the floor. If it's low, no judge built on that
  rubric can be reliable; fix the rubric first.
- **Bias diagnostics** — score vs. output length, score vs. presentation order, self-preference — should
  be flat after correction.
- **Gate stability** — the same golden run scored twice by the pinned judge should give the same result.
  Drift there means the judge isn't actually pinned.

## Measured impact

_Not a token cut, and not yet measured by us._ The measurable outcome of this technique is **eval
reliability**, not a saving: the deliverable is a judge whose agreement with your engineers (Cohen's κ
/ Krippendorff's α) clears the bar to gate cost changes — target κ ≥ 0.6, rewrite below 0.4. Benchmark:
on our D3 golden-task set, calibrate the judge against 2–3 engineers' labels and report the judge-human
κ, then use that gated judge as the quality check in the open/cheap-model-substitution and
context-trimming arms — the judge is the instrument those arms are measured *with*, not an arm itself.
Cited anchors: the METR review found ~half of SWE-bench-passing patches would not be merged, a ~24-point
gap over the automated grader, which is the quality blind spot the judge is meant to close;[^metr-prs]
the Berkeley study of 21 judge models found raw agreement overstates chance-corrected agreement by
33.8–41.3 points, which is why calibration uses κ/α and not raw match.[^norman-reliability] ⚠ Both are
external findings (a maintainer-review study and a general-domain judge study), directional for coding
agents until D3 reproduces the calibration on our own repos.

[^metr-prs]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^norman-reliability]: Norman, Rivera & Hughes (UC Berkeley), "Reliability without Validity: A Systematic, Large-Scale Evaluation of LLM-as-a-Judge Models," arXiv:2606.19544 — <https://arxiv.org/abs/2606.19544>
[^langfuse-coding-agents]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^braintrust-judge]: Braintrust docs, "LLM-as-a-judge scorers and classifiers" — <https://www.braintrust.dev/docs/evaluate/llm-as-a-judge>
[^langfuse-judge]: Langfuse docs, "LLM-as-a-Judge" — <https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge>
[^harbor-agents]: Harbor / Terminal-Bench (Laude Institute), supported agents — <https://github.com/harbor-framework/terminal-bench>
