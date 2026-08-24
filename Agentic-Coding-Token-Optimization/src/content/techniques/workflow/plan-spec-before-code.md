---
title: "Plan / spec before code"
group: workflow
level: 1
costLever: [turns, calls]
effort: Low
savingEstimate: "varies — avoids wrong-direction rework"
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
  - "workflow/deterministic-orchestration"
  - "context/keep-rules-file-small"
sources:
  - id: tokenomics
    title: "Tokenomics: Quantifying Where Tokens Are Used in Agentic Software Engineering"
    publisher: "Salim, Latendresse, Khatoonabadi, Shihab (arXiv 2601.14470)"
    url: "https://arxiv.org/abs/2601.14470"
    accessed: "2026-08-10"
    kind: paper
    note: "Iterative Code Review stage = ~59.4% of tokens; initial code generation is comparatively cheap. General multi-agent (ChatDev/GPT-5) setting, not a coding-CLI harness."
  - id: telin
    title: "Spec Driven Development Is Wasting Tokens"
    publisher: "Jamie Telin — IT Chronicles (Medium)"
    url: "https://medium.com/it-chronicles/is-your-safe-choice-burning-your-budget-1cfddf8782e4"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Spec-Kit vs OpenSpec: ~97–109% more total tokens for Spec-Kit across two tests; planning phase up to +152%. Practitioner benchmark, single author, two tasks."
  - id: cc-plan
    title: "Claude Code — interactive mode / plan mode"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/interactive-mode"
    accessed: "2026-08-10"
    kind: docs
    note: "Shift+Tab cycles to plan mode; also /plan and --permission-mode plan."
  - id: cursor-plan
    title: "Plan Mode"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/agent/plan-mode"
    accessed: "2026-08-10"
    kind: docs
    note: "Shift+Tab from chat to Plan Mode; produces a reviewable/editable plan saved by default to home dir."
  - id: cline-plan
    title: "Plan & Act Mode"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/core-workflows/plan-and-act"
    accessed: "2026-08-10"
    kind: docs
    note: "Plan/Act toggle in the chat input (keyboard shortcut Cmd/Ctrl+Shift+A)."
  - id: aider-modes
    title: "Chat modes"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/modes.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/ask to discuss a plan read-only; /architect to plan-then-edit; /code to implement."
  - id: codex-plan
    title: "Plan Mode mechanics"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/08/plan-mode-mechanics/"
    accessed: "2026-08-10"
    kind: blog
    note: "Shift+Tab cycles Plan → Pair → Execute; /plan at the prompt. Read-only until the plan is approved."
  - id: opencode-agents
    title: "Agents"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/agents/"
    accessed: "2026-08-10"
    kind: docs
    note: "Plan and Build are two agents; Tab (agent_cycle) switches between them. Plan is restricted from editing files."
  - id: grok-build
    title: "Introducing Grok Build"
    publisher: "xAI"
    url: "https://x.ai/news/grok-build-cli"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Plan-first execution loop: plan → review/approve → build. (URL from vendor announcement — link-check.)"
  - id: openspec
    title: "OpenSpec — spec-driven development for AI coding assistants"
    publisher: "Fission-AI (GitHub)"
    url: "https://github.com/Fission-AI/OpenSpec"
    accessed: "2026-08-10"
    kind: repo
    note: "Leaner spec workflow: draft short spec + task list, review, then build."
  - id: spec-kit
    title: "spec-kit — Spec-Driven Development toolkit"
    publisher: "GitHub (github/spec-kit)"
    url: "https://github.com/github/spec-kit"
    accessed: "2026-08-10"
    kind: repo
    note: "Multi-artifact spec/plan/tasks pipeline; heavier per-feature token footprint."
---

## What & why

Before the agent edits any files, have it produce a short plan — or write a brief spec — and approve
it. The cheapest tokens are the ones spent generating code in the wrong direction, which you then
throw away and regenerate. In agentic sessions the expensive part is not the first draft of the code
but the iterative review-and-refinement loop that follows; one measurement of multi-agent software
work put the review/refinement stage at ~59.4% of all tokens, with initial code generation
comparatively cheap.[^tokenomics] A wrong first draft feeds straight into that loop, so a five-minute
plan check that catches a wrong approach avoids many expensive turns of correcting it. The lever is
**turns and calls** (fewer rework round-trips), not input size.

## How to do it

The portable habit is the same across tools: run the agent read-only first, have it state the
approach and the files it will touch, correct it in plain language, then let it implement.

1. **Start read-only.** Put the agent in a plan/ask mode where it can read and search but not write.
   It proposes the approach, the files, and the order of operations.
2. **Review and correct before any edit.** This is where the saving happens — a wrong plan is cheap
   to fix in prose; wrong code is expensive to unwind. Push back until the plan matches intent.
3. **Approve, then execute.** Switch to the build/act mode and let it implement the approved plan.
4. **For larger or recurring work, write a short spec instead of a one-off plan.** A brief spec
   (what changes, acceptance criteria, a task list) gives the agent a stable reference and is worth
   reusing across sessions. Keep it lean — see the cost note on spec pipelines below.

Every first-class harness has a native read-only planning step — Claude Code's plan mode
(Shift+Tab or `/plan`),[^cc-plan] Cursor Plan Mode,[^cursor-plan] Cline's Plan/Act toggle,[^cline-plan]
Aider `/ask` and `/architect`,[^aider-modes] Codex plan mode,[^codex-plan] OpenCode's read-only Plan
agent,[^opencode-agents] and Grok Build's plan-first loop[^grok-build] — see this technique's row in
`TOOL_MATRIX.md` for the exact key or command per tool.

## When it's worth it / when not

- **Worth it:** medium-to-large changes, unfamiliar code, anything touching multiple files, and any
  task where the agent could plausibly pick the wrong approach. The bigger the blast radius of a
  wrong first attempt, the more a plan pays off.
- **Worth it as a spec:** work you'll repeat or hand between sessions/teammates — the spec is reusable
  and keeps successive runs on the same rails.
- **Not worth it:** trivial, well-scoped edits (rename, one-line fix, obvious change) where the plan
  step costs more turns than it saves. Don't gate a typo fix behind a plan review.
- **Watch the spec-pipeline tradeoff:** a heavyweight spec-driven pipeline reads the spec, plan, and
  task files on every turn, so it can cost more per feature than the rework it prevents. One
  practitioner benchmark found a heavy pipeline (Spec-Kit)[^spec-kit] used roughly 2x the tokens of a
  leaner spec workflow (OpenSpec)[^openspec] with no better outcome.[^telin] Use the lightest spec that removes the
  ambiguity — often an approved plan, not a full spec suite.

## What it costs you

- **A few planning turns up front.** You pay some tokens to plan that you would not pay if the first
  attempt happened to be right. On small, unambiguous tasks that's pure overhead.
- **Spec upkeep.** A spec you keep around is another artifact to maintain; a stale spec misleads the
  agent. Treat specs as living or delete them.
- **Pipeline bloat.** Spec-driven toolchains that reload multiple artifacts every turn inflate input
  on every call — the opposite of the saving — if the spec is heavier than the task needs.[^telin]
- **Failure mode to watch:** approving a plan you didn't actually read. An unread plan gives false
  confidence and still lets the agent run in the wrong direction.

## How to verify

- Watch **turns (or tool calls) per completed task** and the **rate of discarded/reverted edits**
  before and after adopting a plan-first habit — fewer correction round-trips is the signal.
- Watch **cost per completed task**, not cost per session: planning adds a little to the session but
  should lower the total-to-done by cutting rework.
- If you adopt a spec pipeline, compare **tokens per feature** against a plain approved-plan run so
  you catch the case where the pipeline costs more than it saves.[^telin]

## Measured impact

_Not yet measured by us._ Benchmark: run the same medium task on the same repo two ways — baseline
(agent implements directly from the prompt) versus the variant that approves a read-only plan first —
and compare turns, discarded edits, and cost per passing task. A third variant runs a full
spec-driven pipeline to size the spec-pipeline overhead. Cited so far: a token study of agentic
software work puts the iterative review/refinement stage at ~59.4% of tokens while initial code
generation is comparatively cheap, which is the mechanism this technique targets;[^tokenomics] ⚠ a
practitioner benchmark reports a heavy spec pipeline using ~2x the tokens of a leaner one with no
quality gain.[^telin] ⚠ Both are external data (one general multi-agent paper, one single-author
two-task benchmark), not yet independently verified on coding CLIs.

[^tokenomics]: Salim, Latendresse, Khatoonabadi, Shihab, "Tokenomics: Quantifying Where Tokens Are Used in Agentic Software Engineering" (arXiv 2601.14470) — <https://arxiv.org/abs/2601.14470>
[^telin]: Jamie Telin, "Spec Driven Development Is Wasting Tokens" — <https://medium.com/it-chronicles/is-your-safe-choice-burning-your-budget-1cfddf8782e4>
[^cc-plan]: Claude Code docs, "Interactive mode / plan mode" — <https://code.claude.com/docs/en/interactive-mode>
[^cursor-plan]: Cursor docs, "Plan Mode" — <https://cursor.com/docs/agent/plan-mode>
[^cline-plan]: Cline docs, "Plan & Act Mode" — <https://docs.cline.bot/core-workflows/plan-and-act>
[^aider-modes]: Aider docs, "Chat modes" — <https://aider.chat/docs/usage/modes.html>
[^codex-plan]: Codex Knowledge Base (Daniel Vaughan), "Plan Mode mechanics" — <https://codex.danielvaughan.com/2026/04/08/plan-mode-mechanics/>
[^opencode-agents]: OpenCode docs, "Agents" — <https://opencode.ai/docs/agents/>
[^grok-build]: xAI, "Introducing Grok Build" — <https://x.ai/news/grok-build-cli>
[^openspec]: Fission-AI, "OpenSpec — spec-driven development for AI coding assistants" (GitHub) — <https://github.com/Fission-AI/OpenSpec>
[^spec-kit]: GitHub, "spec-kit — Spec-Driven Development toolkit" — <https://github.com/github/spec-kit>
