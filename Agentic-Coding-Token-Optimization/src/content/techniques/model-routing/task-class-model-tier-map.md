---
title: "Task-class → model-tier map (+ escalate on failure)"
group: model-routing
level: 1
costLever: [model-price]
effort: Low
savingEstimate: "large"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - aider
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/strong-plan-cheap-execute-split"
sources:
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "Rice University (ICLR 2026)"
    url: "https://arxiv.org/abs/2510.00202"
    accessed: "2026-08-10"
    kind: paper
    note: "Best routers (vLLM-SR, CARROT) ~35% cost cut at <2% accuracy loss; most over-rely on the strongest model; all routers fall short of the oracle; commercial ≯ open-source."
  - id: swebench
    title: "SWE-bench Verified leaderboard ($/instance, mini-SWE-agent)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "MiniMax M2.5 75.8% @ $0.073 vs Opus 4.5 76.8% @ $0.754 — ~1pt lower at ~1/10th per-task cost. Cost data only for mini-SWE-agent runs."
  - id: cc-model-config
    title: "Model configuration"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/model-config"
    accessed: "2026-08-10"
    kind: docs
    note: "/model switches Opus/Sonnet/Haiku live; opusplan uses Opus in plan mode, Sonnet to execute; CLAUDE_CODE_SUBAGENT_MODEL sets subagent model."
  - id: cursor-router
    title: "Introducing Cursor Router (Auto mode: Intelligence / Balance / Cost)"
    publisher: "Cursor"
    url: "https://cursor.com/blog/router"
    accessed: "2026-08-10"
    kind: docs
    note: "Auto routes per request; Intelligence/Balance/Cost bias; vendor claims 60% lower cost at matched quality (classifier on 600K+ requests)."
  - id: copilot-billing
    title: "Usage-based billing for individuals (auto model 10% discount)"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals"
    accessed: "2026-08-10"
    kind: docs
    note: "\"you qualify for a 10% discount on model costs while using auto model selection in Copilot Chat, Copilot CLI, GitHub Copilot app, or Copilot cloud agent.\""
  - id: aider-modes
    title: "Options reference (--model, --weak-model, --editor-model, --architect)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/config/options.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--weak-model handles commit messages / history summaries; architect mode pairs a reasoning model with a cheaper editor model."
  - id: swe-router
    title: "SWE-Router: Routing in Multi-turn Agentic Software Engineering Tasks"
    publisher: "arXiv 2607.00053"
    url: "https://arxiv.org/abs/2607.00053"
    accessed: "2026-08-10"
    kind: paper
    note: "Cheap model runs exploratory turns; partial trajectory decides whether to escalate. Coding-native; chase for numbers."
---

## What & why

Different coding tasks need different amounts of model. Renaming a symbol, writing a commit message,
or adding a test does not need your most expensive model; a subtle concurrency bug does. This
technique assigns each **task class** to a **model tier** — cheap for edits/tests/commit messages,
mid for routine features, top tier for hard reasoning and debugging — and starts every task on the
cheaper tier, bumping up a tier only when you see it fail. The lever is model unit price: you stop
paying flagship per-token rates on work a cheaper model finishes correctly. Public leaderboard data
shows the gap is real — on SWE-bench Verified's cost board, an open-weight model resolves ~1 point
below the top model at roughly one-tenth the per-task cost.[^swebench]

## How to do it

The portable version is two rules plus one escalation step:

1. **Set a default tier per task class.** Cheap tier: edits, refactors, test scaffolding, commit
   messages, doc strings, boilerplate. Mid tier: routine feature work and multi-file changes. Top
   tier: architecture decisions, tricky debugging, anything where you expect several wrong turns.
2. **Start cheap.** Open each task on the cheaper tier you think can plausibly do it, not the safest
   expensive one. The cost of one cheap attempt that fails is small next to running everything on the
   flagship.
3. **Escalate on visible failure, not on a hunch.** Bump one tier when there's a concrete signal —
   tests still red after a couple of tries, the model loops, it says it's stuck, or the diff is
   clearly wrong. One tier at a time; most tasks never leave the cheap tier.

Two ways to run it. **Manual** (reliable, the default): you or a per-repo convention pick the tier,
using the tool's model switch. **Automatic** ("Auto" modes): the tool's router picks per request.
Auto is a fine cheap-tier default for everyday work, but treat its ceiling modestly — the best
query-routers in RouterArena cut cost only ~35% at <2% accuracy loss, and most over-rely on the
strongest model rather than routing down.[^routerarena] The emerging coding-specific variant routes
on the agent's own partial trajectory (run a few cheap turns, then decide whether to escalate), which
fits agents better than routing on the task description alone — but it's still frontier.[^swe-router]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool switch (Claude Code `/model` and
`opusplan`;[^cc-model-config] Cursor Auto with Intelligence/Balance/Cost;[^cursor-router] Copilot
Auto's 10% discount;[^copilot-billing] Aider `--weak-model` / architect;[^aider-modes] Codex `/model`
+ reasoning effort; and the rest).

## When it's worth it / when not

- **Worth it:** almost always. Most sessions are dominated by cheap-tier work (edits, tests, commit
  messages), so defaulting those away from the flagship is a large, low-risk saving.
- **Best fit:** teams that currently run one expensive model for everything — the map alone reclaims
  the easy work.
- **Not worth it:** if your task mix is genuinely hard-reasoning-heavy, the cheap tier will fail often
  and re-escalation churn eats the saving. And don't hard-route away from the top tier on tasks you
  already know are hard — start those there.
- **Watch the router:** an "Auto" mode that quietly over-uses the strongest model gives you the
  convenience without the saving.[^routerarena]

## What it costs you

- **Setup effort: Low.** It's a convention plus one switch per tool, not infrastructure.
- **Re-run tax on failure.** A cheap attempt that fails costs its tokens plus the escalated re-run.
  This stays cheap only if failures are the minority — keep the cheap tier's task classes conservative
  and escalate promptly rather than letting a weak model thrash.
- **Quality risk: Low, if you escalate on real signals.** The failure mode is a cheap model that
  produces *plausible-but-wrong* output that passes a shallow check — mitigate with tests/CI so
  "failure" is visible, not judged by eye.
- **Non-parity on substituted models.** If a cheap tier means a different provider via a gateway,
  it may lack extended thinking, web search, or citations — confirm the task class doesn't need them.

## How to verify

- **Cost per passing task**, split by task class, before and after — the headline metric. Watch that
  cheap-tier tasks actually stay on the cheap tier.
- **Tier mix / escalation rate.** What share of tasks finish on the cheap tier vs escalate. A high
  escalation rate means your cheap-tier boundary is set too ambitiously (or the router is mis-routing).
- **Where to see it:** per-model token and cost breakdowns in `ccusage` or Claude Code's OpenTelemetry
  metrics (`claude_code.cost.usage`, split by model); Copilot's AI-credit usage by model.

## Measured impact

_Not yet measured by us._ Benchmark: run tasks T1–T3 three ways on the same repo — (a) flagship-only,
(b) fixed cheap-tier default, (c) cheap-default-plus-escalate-on-failure — and compare cost per
passing task and resolve rate (arm A0 flagship-only vs a routing arm A2). The escalation arm is the
one to watch: it should approach flagship resolve rate at well below flagship cost. Cited anchors so
far: SWE-bench Verified's cost board shows MiniMax M2.5 at 75.8% @ $0.073 vs Opus 4.5 at 76.8% @
$0.754 (~1 pt lower, ~1/10th the per-task cost);[^swebench] RouterArena caps automatic routing at
~35% cost savings at <2% accuracy loss.[^routerarena] ⚠ The SWE-bench cost figures are only valid
within the `mini-SWE-agent` harness — never compare costs across harnesses — and the Cursor "60%
lower cost" and SWE-Router escalation claims are practitioner/vendor-sourced and not independently
verified.

[^swebench]: SWE-bench Verified leaderboard ($/instance, mini-SWE-agent) — <https://www.swebench.com/verified.html>
[^routerarena]: RouterArena, ICLR 2026 (Rice University) — <https://arxiv.org/abs/2510.00202>
[^cc-model-config]: Claude Code docs, "Model configuration" — <https://code.claude.com/docs/en/model-config>
[^cursor-router]: Cursor, "Introducing Cursor Router" — <https://cursor.com/blog/router>
[^copilot-billing]: GitHub Docs, "Usage-based billing for individuals" — <https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals>
[^aider-modes]: Aider docs, "Options reference" — <https://aider.chat/docs/config/options.html>
[^swe-router]: "SWE-Router: trajectory-based escalation routing for coding agents", arXiv 2607.00053 — <https://arxiv.org/abs/2607.00053>
