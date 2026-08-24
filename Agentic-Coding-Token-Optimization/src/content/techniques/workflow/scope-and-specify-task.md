---
title: "Scope and specify the task up front"
group: workflow
level: 1
costLever: [turns, input]
effort: Low
savingEstimate: "varies — cuts rework loops"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - aider
  - codex
  - opencode
  - grok-build
  - copilot
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/plan-spec-before-code"
  - "context/keep-rules-file-small"
sources:
  - id: prompt-waste
    title: "Prompt-Induced Waste in Large Reasoning Models: A Preregistered Two-Harness Benchmark of Coding Agents"
    publisher: "Weinberger & Hozez (PointFive), arXiv:2608.01347v1"
    url: "https://arxiv.org/html/2608.01347v1"
    accessed: "2026-08-10"
    kind: paper
    verify: true
    note: "Preprint, not peer-reviewed. 'Develop several approaches and compare' multiplied reasoning tokens 2.4–7.4x with zero correctness gain; a bounded template (explicit scope, acceptance criteria, stop condition) was free on all six models. Misleading architectural hints = costliest defect (2.61x reasoning)."
  - id: jonsch
    title: "The Hidden Cost of Agentic Coding: When AI Agents Spin Their Wheels on Your Dime"
    publisher: "jonsch.dev (Medium)"
    url: "https://medium.com/@jonschdev/the-hidden-cost-of-agentic-coding-when-ai-agents-spin-their-wheels-on-your-dime-8e2be518ae3b"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Practitioner anecdotes: 47 iterations on one command turned a $0.50 problem into a $30 spend; a stuck sprint cost ~$2,000 vs ~$200 when the loop went cleanly."
  - id: cc-plan
    title: "Plan mode — press Shift+Tab twice to activate"
    publisher: "Boris Cherny (Claude Code)"
    url: "https://www.threads.com/@boris_cherny/post/DKxKMUjPYty/how-it-works-press-shifttab-twice-to-activate-plan-mode-then-prompt-claude-code-"
    accessed: "2026-08-10"
    kind: other
    verify: true
    note: "Shift+Tab twice enters plan mode; agent explores, writes a plan, and asks for approval before editing."
  - id: cline-plan
    title: "Plan & Act Mode"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/core-workflows/plan-and-act"
    accessed: "2026-08-10"
    kind: docs
    note: "Plan mode reads code and defines acceptance criteria before Act mode is granted edit/execute rights."
  - id: aider-modes
    title: "Chat modes — architect/editor"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/modes.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/architect (or /chat-mode architect) proposes a plan; the editor model only applies it after approval (auto_accept_architect defaults False)."
  - id: codex-plan
    title: "Codex CLI — plan mode"
    publisher: "OpenAI Codex docs"
    url: "https://developers.openai.com/codex/cli"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Plan mode toggled with /plan or Shift+Tab: gather context, ask clarifying questions, build a plan before implementation."
  - id: opencode-agents
    title: "Agents — built-in Plan and Build agents"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/agents/"
    accessed: "2026-08-10"
    kind: docs
    note: "Plan is a read-only agent that reads AGENTS.md and produces a step-by-step plan without writing files."
  - id: grok-build
    title: "Introducing Grok Build"
    publisher: "xAI"
    url: "https://x.ai/news/grok-build-cli"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Plan mode: approve/comment/rewrite the plan before execution. Docs example contrasts 'Build a user dashboard' (too vague) with a scoped route + existing-service prompt."
---

## What & why

The cost of a coding task tracks how many turns it takes, not just how big the final diff is. A
vague first turn — "build the whole feature" — forces the agent to guess intent, explore blind, and
redo work when the guess is wrong; each of those loops re-pays for the context already in the window.
Putting the full task, exact file paths, and acceptance criteria in the **first** turn removes the
guessing and cuts the rework loops that dominate spend on ambiguous work. A preregistered benchmark
found that a bounded template — explicit scope, acceptance criteria, and a stop condition — added no
token cost, while open-ended framing ("develop several approaches and compare") multiplied reasoning
tokens 2.4–7.4x with no gain in correctness.[^prompt-waste]

## How to do it

Write the first turn so the agent could hand it to a teammate and they'd know when they were done.
The portable pieces:

1. **State the task and its boundary.** What to change and, just as important, what not to touch.
2. **Name the files/paths.** Point at the code (`src/auth/session.ts`, the failing test) instead of
   making the agent search for it — and don't feed it a hint you're unsure of; a misleading
   architectural pointer was the single costliest input defect measured (2.61x reasoning).[^prompt-waste]
3. **Give acceptance criteria.** The concrete "done" test: which tests pass, the expected behaviour,
   the interface it must match.
4. **Set a stop condition** so the agent doesn't wander into extra work or thrash on a dead end.
5. **Use the tool's plan step for anything non-trivial.** Plan/architect modes make the agent write
   the plan and get your approval before it edits — you catch a wrong approach in one cheap read
   instead of unwinding a bad multi-file change. Most tools ship this: Claude Code plan
   mode,[^cc-plan] Cline's Plan/Act,[^cline-plan] aider's architect/editor,[^aider-modes] Codex
   CLI,[^codex-plan] OpenCode's Plan agent,[^opencode-agents] and Grok Build.[^grok-build] See this
   technique's row in `TOOL_MATRIX.md` for the exact plan/scope mechanism per tool.

The nuance is **granularity**. Scoped tasks beat mega-prompts, but over-splitting trivial work is its
own tax: every new session re-loads the rules file, re-reads the same files, and re-pays fixed session
overhead. Keep a task to one coherent unit of work — small enough to specify precisely, large enough
that the setup cost is worth paying once.

## When it's worth it / when not

- **Worth it:** almost always, and most of all on ambiguous or multi-file work where a wrong guess is
  expensive to unwind. It's a zero-cost habit — the specification is prose you'd have to supply
  eventually anyway, just moved earlier.
- **Biggest wins:** features touching several files, changes with a real interface contract, anything
  where "done" is easy to state but hard for the agent to infer.
- **Not worth it — over-splitting:** don't shard a small, coherent change into many tiny sessions to
  "scope" it. Each session re-pays session overhead (rules file, re-reading context), so slicing a
  one-shot task into five sessions can cost more than doing it once.
- **Not worth it — genuine exploration:** if you don't yet know the acceptance criteria, that's a
  planning/spike task, not an implementation task. Do the exploration first (a plan-mode session),
  then specify.

## What it costs you

- **A minute of writing.** The only real cost is the time to write the scope and criteria up front —
  and that pays for itself the first time it avoids a rework loop.
- **Over-specification risk.** A wrong or stale file hint actively misleads the agent and costs more
  than saying nothing; only point at code you're sure of.[^prompt-waste]
- **Over-splitting risk.** Slicing too finely re-pays fixed per-session overhead each time — the
  failure mode to watch is many short sessions on what was really one task.
- Quality risk is low: tighter scope generally *improves* output because the agent stops guessing.

## How to verify

- **Turns (or messages) to a passing task** — the headline metric here. Track it before and after you
  start specifying up front; fewer turns is the win.
- **Rework rate** — how often the agent's first attempt is thrown away or heavily redone.
- **Cost per completed task** — read per-session cost from `ccusage` or Claude Code's OpenTelemetry
  metrics and compare a scoped run to a "build it all" run on comparable work.

## Measured impact

_Not yet measured by us._ Benchmark: run the same feature task two ways on one repo — a scoped
first turn (task + paths + acceptance criteria + stop condition) versus an unscoped mega-prompt — and
compare turns-to-pass, total tokens, and cost per passing task. Cited so far: a preregistered
two-harness benchmark found open-ended "explore several approaches" framing multiplied reasoning
tokens 2.4–7.4x over a bounded template that specified scope, acceptance criteria, and a stop
condition, with no correctness gain, and that a misleading file/architecture hint was the costliest
input defect at 2.61x reasoning.[^prompt-waste] ⚠ Practitioner reports echo the direction but only
anecdotally: one command looping 47 times turned a ~$0.50 problem into ~$30, and a sprint where the
agent got stuck cost ~$2,000 against ~$200 for one that ran cleanly.[^jonsch] ⚠ Both the preprint
(not peer-reviewed) and the blog are unverified by us; treat as directional until the benchmark lands.

[^prompt-waste]: Weinberger & Hozez (PointFive), "Prompt-Induced Waste in Large Reasoning Models" (arXiv:2608.01347v1, preprint) — <https://arxiv.org/html/2608.01347v1>
[^jonsch]: jonsch.dev, "The Hidden Cost of Agentic Coding: When AI Agents Spin Their Wheels on Your Dime" — <https://medium.com/@jonschdev/the-hidden-cost-of-agentic-coding-when-ai-agents-spin-their-wheels-on-your-dime-8e2be518ae3b>
[^cc-plan]: Boris Cherny (Claude Code), "Plan mode — press Shift+Tab twice to activate" — <https://www.threads.com/@boris_cherny/post/DKxKMUjPYty/how-it-works-press-shifttab-twice-to-activate-plan-mode-then-prompt-claude-code->
[^cline-plan]: Cline docs, "Plan & Act Mode" — <https://docs.cline.bot/core-workflows/plan-and-act>
[^aider-modes]: Aider docs, "Chat modes — architect/editor" — <https://aider.chat/docs/usage/modes.html>
[^codex-plan]: OpenAI Codex docs, "Codex CLI — plan mode" — <https://developers.openai.com/codex/cli>
[^opencode-agents]: OpenCode docs, "Agents — built-in Plan and Build agents" — <https://opencode.ai/docs/agents/>
[^grok-build]: xAI, "Introducing Grok Build" — <https://x.ai/news/grok-build-cli>
