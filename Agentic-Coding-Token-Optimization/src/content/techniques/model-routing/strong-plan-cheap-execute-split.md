---
title: "Strong-plan / cheap-execute split"
group: model-routing
level: 2
costLever: [model-price]
effort: Low
savingEstimate: "varies — depends on the execution-model price gap"
savingBasis: estimate
qualityRisk: Medium
appliesTo:
  - claude-code
  - cline
  - aider
  - codex
  - opencode
  - goose
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/deterministic-orchestration"
sources:
  - id: cc-model-config
    title: "Model configuration"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/model-config"
    accessed: "2026-08-10"
    kind: docs
    note: "opusplan alias: Opus in plan mode, Sonnet for execution. Also `/model`, subagent `model:`."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Reserve Opus for architecture/reasoning; Sonnet handles most coding at lower cost. Plan mode prevents expensive re-work."
  - id: aider-modes
    title: "Chat modes — architect/editor"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/modes.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--architect: main model proposes, --editor-model applies the edits. Two requests per task; also --weak-model for commit/summary."
  - id: cline-planact
    title: "Plan & Act Mode"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/core-workflows/plan-and-act"
    accessed: "2026-08-10"
    kind: docs
    note: "\"Use different models for Plan and Act\" toggle: strong reasoning model for Plan, faster model for Act."
  - id: opencode-agents
    title: "Agents"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/agents/"
    accessed: "2026-08-10"
    kind: docs
    note: "Built-in plan/build agents; per-agent `model` in opencode.json (provider/model-id)."
  - id: codex-planmode
    title: "Plan mode reasoning effort + plan_mode_model request"
    publisher: "openai/codex (issue #19343, docs)"
    url: "https://github.com/openai/codex/issues/19343"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "plan_mode_reasoning_effort shipped (0.105.0); a separate plan_mode_model override is an open request, not shipped."
  - id: goose-lead
    title: "Multi-model in goose (lead/worker)"
    publisher: "Goose docs blog"
    url: "https://goose-docs.ai/blog/2025/06/16/multi-model-in-goose"
    accessed: "2026-08-10"
    kind: docs
    note: "GOOSE_LEAD_MODEL (strong) leads/plans the first turns, then hands off to a cheaper worker model that executes; turn-based switch. (Since superseded by Planning Mode / `/plan`.)"
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "ICLR 2026 (Rice University)"
    url: "https://arxiv.org/abs/2510.00202"
    accessed: "2026-08-10"
    kind: paper
    note: "Auto query-routers get ~35% cost savings at best (under 2% accuracy loss); most over-rely on the strongest model. Manual task-class right-sizing is the reliable lever."
  - id: swebench-verified
    title: "SWE-bench Verified (bash-only, mini-SWE-agent) — cost per instance"
    publisher: "SWE-bench"
    url: "https://swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Cheaper models resolve tasks at a fraction of the per-task cost; anchors the execution-model price gap."
---

## What & why

In an agentic coding session most tokens are spent in **execution** — reading files, writing edits,
running the dev loop, iterating — not in the short planning phase up front. This technique reasons and
plans on a strong (expensive) model, then runs the token-heavy execution on a cheaper model. The lever
is the **model unit price on the execution phase**: you keep the strong model where judgment matters
(architecture, ambiguous requirements, the plan) and pay the cheap model's per-token rate for the bulk
of the work.[^cc-costs] Because a well-specified plan makes execution largely mechanical, a cheaper
model can usually carry it without a large quality drop.

## How to do it

The portable version is a two-phase loop:

1. **Plan on the strong model.** Have the expensive model explore the codebase and produce a concrete,
   file-level plan (which files change, in what order, with what interfaces) — and stop before editing.
   Review the plan; correcting it here is cheap.[^cc-costs]
2. **Execute on the cheap model.** Hand the approved plan to a cheaper model to implement, run tests,
   and iterate. The cheap model does the high-token work; the strong model only re-engages if execution
   hits something the plan didn't anticipate.

Two things make this pay off rather than backfire: the **plan has to be specific enough** that the cheap
model isn't re-deriving decisions (a vague plan pushes reasoning back into the expensive phase — or, worse,
into a cheap model that isn't good at it), and you want a **defined escalation path** back to the strong
model for the cases execution can't resolve.

Most tools ship this as a named mode rather than something you wire up by hand. See this technique's row in
`TOOL_MATRIX.md` for the exact per-tool switch — an alias (Claude Code `opusplan`),[^cc-model-config] a
two-model toggle (Cline Plan/Act),[^cline-planact] an architect/editor pairing (Aider), a per-agent model
(OpenCode plan/build agents),[^opencode-agents] or a lead/worker env var (Goose).[^goose-lead] Where a tool
has plan mode but **not** a native model split (Cursor, Copilot, Grok Build, and Codex — whose `plan_mode_model`
override is still an open request),[^codex-planmode] you get the plan/execute structure but have to switch the
model by hand, so the cost saving is manual and easy to forget.

## When it's worth it / when not

- **Worth it:** large, well-scoped tasks where the plan is short and the execution is long — the typical
  shape of a feature or refactor. The bigger the execution-to-planning token ratio, and the wider the
  price gap between the two models, the more this saves.
- **Worth it:** teams already using plan mode. Adding a cheaper execution model is then almost free.
- **Not worth it:** small edits and quick fixes where planning and execution are both tiny — the split adds
  ceremony and a second model's setup for no real saving.
- **Not worth it:** exploratory or genuinely hard work where execution keeps surfacing design decisions.
  If the cheap model bounces back to the strong one repeatedly, you pay the strong model anyway *plus* the
  wasted cheap turns.
- **Caution on auto-routers:** a per-turn automatic router is a different, weaker thing. Benchmarks put
  automatic query-routing at only ~35% cost savings at best, and most routers over-rely on the strongest
  model.[^routerarena] The plan/execute split is a deliberate, manual phase boundary, which is the reliable
  version of the same idea.

## What it costs you

- **Quality risk (Medium).** The cheap model can misread an under-specified plan and produce edits that pass
  no tests, forcing a re-run. The plan's specificity is the control; a thin plan is the main failure mode.
- **Setup effort (Low).** For tools with a built-in mode it's one alias or toggle. Aider's architect mode
  and multi-model tools cost a bit more to configure (two model choices, and the editor model must be good
  at applying edits).
- **Latency.** Architect/editor-style splits issue **two model requests per step** (propose, then apply),
  which adds round-trips even as it cuts per-token cost.[^aider-modes]
- **Escalation leakage.** If execution escalates back to the strong model often, the saving erodes — watch
  how often that happens.

## How to verify

- **Share of tokens/cost on the cheap model.** After the split, the majority of a task's tokens should be
  billed at the execution model's rate. Claude Code `/usage` breaks spend down by model; `ccusage` does the
  same across CLIs. If the strong model still dominates, either the plan phase is too heavy or execution is
  escalating too often.
- **Cost per passing task, before vs after.** The only number that matters is whether cost per *green* task
  dropped. If pass rate falls and re-runs climb, the cheap execution model is too weak for this plan quality —
  raise plan specificity or the execution model tier.

## Measured impact

_Not yet measured by us._ Benchmark: run tasks T1–T3 on the same repo with a single strong model end-to-end
(**arm R0**) versus strong-plan / cheap-execute (**arm R2** — e.g. Opus plan + Sonnet execute via Claude Code
`opusplan`), and compare cost per passing task and pass rate. Public anchors for the price gap: SWE-bench
Verified's bash-only board publishes **$ per instance**, where cheaper models resolve tasks at roughly a tenth
of the top model's per-task cost[^swebench-verified] — the headroom this technique targets. ⚠ The routing
ceiling (~35% for *automatic* routers) is from a general-domain benchmark, not coding-specific, and the
plan/execute split has no independent coding-team before/after number yet — treat the saving as
configuration-plausible, not measured.[^routerarena]

[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cc-model-config]: Claude Code docs, "Model configuration" (`opusplan`) — <https://code.claude.com/docs/en/model-config>
[^aider-modes]: Aider docs, "Chat modes — architect/editor" — <https://aider.chat/docs/usage/modes.html>
[^cline-planact]: Cline docs, "Plan & Act Mode" (separate Plan/Act models) — <https://docs.cline.bot/core-workflows/plan-and-act>
[^opencode-agents]: OpenCode docs, "Agents" (per-agent `model` in opencode.json) — <https://opencode.ai/docs/agents/>
[^codex-planmode]: openai/codex issue #19343, "add `plan_mode_model` config override for Plan mode" — <https://github.com/openai/codex/issues/19343>
[^goose-lead]: Goose docs blog, "Multi-model in goose" (`GOOSE_LEAD_MODEL` lead/worker) — <https://goose-docs.ai/blog/2025/06/16/multi-model-in-goose>
[^routerarena]: RouterArena, ICLR 2026 (Rice University) — <https://arxiv.org/abs/2510.00202>
[^swebench-verified]: SWE-bench Verified (bash-only, mini-SWE-agent), cost per instance — <https://swebench.com/verified.html>
