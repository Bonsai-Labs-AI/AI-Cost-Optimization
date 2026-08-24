---
title: "Drift monitoring"
group: quality
level: 2
costLever: [model-price, calls]
effort: Medium
savingEstimate: "prevents silent regressions (not a direct token cut)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - codex
  - copilot
  - cursor
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "quality/build-your-own-eval-set"
  - "model-routing/open-cheap-model-substitution"
sources:
  - id: chen-drift
    title: "How Is ChatGPT's Behavior Changing over Time?"
    publisher: "Chen, Zaharia, Zou (Stanford / UC Berkeley), arXiv 2307.09009"
    url: "https://arxiv.org/abs/2307.09009"
    accessed: "2026-08-10"
    kind: paper
    note: "Same GPT-4 endpoint: prime/composite accuracy fell 84% (Mar 2023) -> 51% (Jun 2023); more code-formatting errors in June. Behavior drifts under a stable model name."
  - id: metr-prs
    title: "Many SWE-bench-Passing PRs Would Not Be Merged into Main"
    publisher: "METR"
    url: "https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "4 maintainers reviewed 296 AI-generated PRs across 3 SWE-bench Verified repos; hypothetical merge rate ~24 pts below the automated SWE-bench score. A passing test is not the same as mergeable quality."
  - id: langfuse-evals
    title: "LLM-as-a-Judge / model-based evaluators (online evaluation)"
    publisher: "Langfuse docs"
    url: "https://langfuse.com/docs/scores/model-based-evals"
    accessed: "2026-08-10"
    kind: docs
    note: "Online evaluators score live traces; configurable sampling percentage (e.g. 5%), deterministic per observation; judge model set via LLM Connections; numeric/categorical/boolean scores."
  - id: langfuse-agents
    title: "Tracing coding agents: Claude Code, Codex, Copilot & more"
    publisher: "Langfuse"
    url: "https://langfuse.com/resources/engineering/coding-agent-tracing"
    accessed: "2026-08-10"
    kind: docs
    note: "Claude Code + Codex via Stop hooks; GitHub Copilot via native OpenTelemetry export; Cursor, Kiro, OpenCode, Augment via dedicated integrations."
  - id: langfuse-cc
    title: "Trace Claude Code with Langfuse"
    publisher: "Langfuse docs"
    url: "https://langfuse.com/integrations/developer-tools/claude-code"
    accessed: "2026-08-10"
    kind: docs
    note: "Stop-hook plugin: `claude plugin install langfuse-observability@langfuse-observability`; one span per turn, tool spans per call, grouped by session_id."
  - id: lc-judge
    title: "How to Calibrate LLM-as-Judge with Human Corrections"
    publisher: "LangChain"
    url: "https://www.langchain.com/resources/llm-as-a-judge"
    accessed: "2026-08-10"
    kind: blog
    note: "Strong LLM judges reach ~80% agreement with humans (about the level humans reach with each other); calibrate against human-labeled corrections and track agreement over time."
  - id: mini-swe
    title: "mini-SWE-agent"
    publisher: "SWE-agent (GitHub)"
    url: "https://github.com/SWE-agent/mini-swe-agent"
    accessed: "2026-08-10"
    kind: repo
    note: "~100-line bash-only agent scaffold, >74% on SWE-bench Verified. A fixed minimal harness so the model is the only variable when you re-run."
---

## What & why

Nothing you did changes when the provider updates the model behind a stable endpoint — but your
output does. The same GPT-4 endpoint that scored 84% on a prime/composite check in March 2023
scored 51% in June, with more code-formatting errors, on identical prompts.[^chen-drift] For a
coding team on a hosted model, a silent checkpoint update can quietly lower quality, and lower
quality shows up as rework: retries, longer sessions, more tokens. Drift monitoring is the standing
check that catches that regression early instead of paying for it a task at a time. It is not a
direct token cut — it is the safety net that lets you run a cheaper model or a hosted checkpoint
without being blindsided when it moves under you.

## How to do it

This is a method, not a per-tool flag. Three parts:

1. **A frozen internal suite, re-run on a cadence.** Keep a small fixed set of representative tasks
   from your own repos with pass/fail checks, and run it on a schedule (e.g. weekly, and on any
   provider changelog note). Freeze the harness too — a minimal fixed scaffold like `mini-SWE-agent`
   keeps the model as the only variable, so a score move means the model moved, not your
   plumbing.[^mini-swe] Pin the model snapshot where the provider lets you (e.g. a dated snapshot
   rather than a floating alias) so you control *when* it changes.

2. **Sample live traces and score them with a reference judge.** You cannot label every session, so
   sample 5–10% of real agent traces and score them with a high-capability reference model as judge
   (LLM-as-a-judge). Calibrate that judge against a small human-labeled set first — strong judges
   reach roughly 80% agreement with humans, about the level humans reach with each other, but only
   after you tune the rubric against real corrections.[^lc-judge] Keep the judge stronger than the
   model under test, use simple (binary/low-precision) scores, and re-check judge-human agreement
   periodically so the judge itself does not drift.

3. **Alert on the AND, not the OR.** Fire an alert only when the input distribution shifts *and* the
   eval score falls. Watching either signal alone is noisy: input drift alone often means nothing
   changed in quality, and score wobble alone is usually sampling noise. Requiring both cuts alert
   fatigue and points at real regressions.

**Where the harnesses plug in:** the trace-sampling half rides on your observability layer.
Langfuse traces Claude Code and Codex via their Stop hooks, GitHub Copilot via its native
OpenTelemetry export, and Cursor / OpenCode via dedicated integrations,[^langfuse-agents] then runs
model-based (LLM-as-a-judge) evaluators on those traces with a configurable sampling percentage
(e.g. 5%) and a judge model you pick.[^langfuse-evals] For Claude Code the sampling half is a
one-line plugin install.[^langfuse-cc] Braintrust and the SWE-bench / `mini-SWE-agent` harness cover
the frozen-suite half. See this technique's row in `TOOL_MATRIX.md` — most coding harnesses expose
no drift knob of their own; the integration is through the eval/observability tool.

## When it's worth it / when not

- **Worth it:** any team on a hosted model or checkpoint that can change without your say — which is
  most teams — especially if you have already right-sized to a cheaper model or open-weight
  substitute and are relying on it holding quality.
- **Worth it:** when rework is expensive (large blast radius per bad change), so catching a
  regression a week early pays for the eval runs many times over.
- **Not worth it yet:** before you have a golden-task suite at all — build that first (it is the
  prerequisite), then add the cadence and trace sampling on top.
- **Not worth it:** for a pinned, self-hosted open-weight model you never update — there is little to
  drift. Keep a light version, drop it if it never fires.

## What it costs you

- **Setup effort (Medium).** The frozen suite and a calibrated judge are the real work; wiring the
  trace sampling is low once observability exists.
- **Ongoing token spend.** Re-running the suite and judging sampled traces both cost tokens — keep
  the suite small and the sample at 5–10%, not 100%.
- **Judge reliability is the main failure mode.** An uncalibrated or too-weak judge gives false
  confidence or false alarms; a judge that itself drifts hides a real regression. Mitigate by
  calibrating against human labels, using a stronger judge than the model under test, and
  re-checking agreement on a cadence.[^lc-judge]
- **A passing suite is not proof of mergeable quality.** SWE-bench-passing PRs were judged mergeable
  ~24 points less often than the automated score implied.[^metr-prs] Treat the eval score as a
  regression *tripwire*, not a quality guarantee — pair it with the AND-gate on input drift and with
  human spot-checks.

## How to verify

- **Does it catch a planted regression?** Swap in a deliberately weaker model (or a known-bad
  checkpoint) and confirm the suite score drops and the alert fires. If it does not, the suite is too
  small or the judge too lenient.
- **Judge-human agreement.** On the calibration set, track agreement between judge and human labels
  over time; if it slips, re-tune before trusting the alerts.[^lc-judge]
- **Alert precision.** Count false alarms per month. If the AND-gate still fires on non-regressions,
  tighten the distribution-shift threshold or the score band.
- **Watch the downstream token/cost signal** (rework rate, tokens per passing task) alongside the
  eval score — a real regression should show up in both.

## Measured impact

_Not a token-cut technique, and not yet measured by us — the payoff is reliability and avoided
regressions, so state it as such._ The evidence this rests on: model behavior can shift materially
under a stable endpoint (GPT-4 prime accuracy 84% -> 51% over three months, same prompts);[^chen-drift]
a passing benchmark score overstates real mergeable quality by ~24 points;[^metr-prs] and a
calibrated LLM judge reaches ~80% agreement with humans, enough to use as a standing tripwire but
only after tuning.[^lc-judge] Benchmark plan: run the frozen suite (fixed `mini-SWE-agent` harness)
against a current vs. a deliberately regressed checkpoint and report detection latency (how many
tasks/days until the alert fires) and judge-human agreement — not a token delta. ⚠ The judge-human
agreement figure is practitioner-sourced; confirm against your own calibration set before relying on
it.

[^chen-drift]: Chen, Zaharia, Zou, "How Is ChatGPT's Behavior Changing over Time?" (arXiv 2307.09009) — <https://arxiv.org/abs/2307.09009>
[^metr-prs]: METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main" — <https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/>
[^langfuse-evals]: Langfuse docs, "LLM-as-a-Judge / model-based evaluators" — <https://langfuse.com/docs/scores/model-based-evals>
[^langfuse-agents]: Langfuse, "Tracing coding agents: Claude Code, Codex, Copilot & more" — <https://langfuse.com/resources/engineering/coding-agent-tracing>
[^langfuse-cc]: Langfuse docs, "Trace Claude Code with Langfuse" — <https://langfuse.com/integrations/developer-tools/claude-code>
[^lc-judge]: LangChain, "How to Calibrate LLM-as-Judge with Human Corrections" — <https://www.langchain.com/resources/llm-as-a-judge>
[^mini-swe]: SWE-agent, "mini-SWE-agent" (GitHub) — <https://github.com/SWE-agent/mini-swe-agent>
