---
title: "Agent Scope / Plan Confirmation"
category: product-ux
maturityLevel: 2
maturityProvisional: false
shortDescription: "Gate an expensive autonomous agent run behind a cheap up-front clarifying question or plan preview, so the agent never burns a long multi-step run on the wrong interpretation of an ambiguous request."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Agents launch long autonomous runs directly on ambiguous prompts with no clarify or plan-preview step."
  - "Frequent 'that's not what I meant' reruns after the agent finishes on a wrong interpretation."
  - "Users abandon or re-issue tasks partway through because the agent went the wrong direction."
  - "Post-hoc token logs show whole multi-step runs that were discarded or redone."
measurementMethods:
  - "Rerun / wrong-direction rate (share of runs the user rejects and re-issues) before vs. after."
  - "Wasted-run cost avoided: (rejected runs × average run cost) × reduction in rejection rate."
  - "Clarify/confirm rate and its outcome — how often a clarification or plan edit changed the run's direction."
  - "Cost of the gate itself (added clarifying-question / plan-preview tokens + user latency)."
status: published
lastUpdated: "2026-07-02"
related:
  - "agent-workflow/human-in-the-loop-checkpoints"
  - "product-ux/user-controlled-quality-mode"
  - "agent-workflow/agent-budget-guardrails"
sources:
  - id: anthropic-effective-agents
    title: "Building Effective AI Agents"
    publisher: "Anthropic"
    year: 2024
    url: "https://www.anthropic.com/research/building-effective-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Agents begin with a command from — or interactive discussion with — the human; once the task is clear they plan and operate independently, and can pause for clarification or human feedback at checkpoints."
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "A single subagent may explore extensively, 'using tens of thousands of tokens or more,' before returning a condensed summary — establishes the scale of an autonomous run."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Claude Opus 4.8 = $5/MTok input, $25/MTok output; Haiku 4.5 = $1/$5. Worked agent example: a 50k-input / 15k-output session costs ~$0.63 in tokens."
  - id: openai-model-spec
    title: "Model Spec (2025/12/18)"
    publisher: "OpenAI"
    year: 2025
    url: "https://model-spec.openai.com/2025-12-18.html"
    accessed: "2026-07-02"
    kind: docs
    note: "When intent is unclear, provide a safe guess stating assumptions and asking clarifying questions as appropriate; in agentic contexts err toward caution and confirm before potentially costly actions — but don't require confirmations for trivial actions."
  - id: openai-codex-best-practices
    title: "Best practices — Codex"
    publisher: "OpenAI Developers"
    year: 2026
    url: "https://developers.openai.com/codex/learn/best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "For complex/ambiguous tasks, use Plan mode so the agent gathers context, asks clarifying questions, and builds a stronger plan before implementation."
  - id: openai-gpt5-guide
    title: "GPT-5 prompting guide"
    publisher: "OpenAI Developers — Cookbook"
    year: 2025
    url: "https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide"
    accessed: "2026-07-02"
    kind: docs
    note: "For autonomous coding, guidance biases toward acting on the most reasonable assumption rather than deferring to the user — the friction counter-argument to over-gating."
  - id: active-questioning
    title: "When agents learn to ask: Active questioning in agentic AI"
    publisher: "Miles K. — Medium"
    year: 2025
    url: "https://medium.com/@milesk_33/when-agents-learn-to-ask-active-questioning-in-agentic-ai-f9088e249cf7"
    accessed: "2026-07-02"
    kind: blog
    note: "Reported ambiguity-induced retries dropping from 4.1 to 1.3 per session after adding a clarify step; frames a question as control that 'prevents silent failures, reduces wasted compute, lowers retry counts.'"
---

## Overview

An autonomous agent turns one instruction into a long, self-directed loop: it plans,
calls tools, reads results, and iterates until it decides the task is done.[^anthropic-effective-agents]
That loop is where the money is spent. A single subagent can "explore extensively, using
**tens of thousands of tokens or more**," before it returns an answer,[^anthropic-context-eng]
and a full multi-agent or long-horizon run routinely reaches **hundreds of thousands to
millions of tokens**. The catch: the agent commits all of that spend based on its *first
interpretation* of the request. If the interpretation is wrong — the user meant a different
repo, a different date range, a different output format — the entire run is wasted and has
to be redone.

**Agent scope / plan confirmation** is the cheap gate in front of that expensive loop.
Before launching, the agent either (a) asks a short clarifying question when the request is
ambiguous, or (b) shows the plan it is about to execute and waits for a "go." Both steps
cost a few hundred tokens; the run they protect costs thousands to millions. The cost lever
is simple: **avoided wasted, wrong-direction agent spend**. A "that's not what I meant"
caught in one sentence up front is free; the same misunderstanding caught after the run is
a full re-run.

This is the *up-front* gate. It is distinct from — and complementary to — mid-run human
approval gates (see *Human-in-the-Loop Checkpoints*) and from letting the user pick a
cheap-vs-expensive effort tier (see *User-Controlled Quality Mode*). Those decide *how* and
*whether to continue*; this decides *whether the run is even pointed the right way* before a
single expensive step happens.

## Detailed Approach & Techniques

### The cost asymmetry (why the gate pays for itself)

The whole technique rests on one lopsided ratio: the gate is tiny relative to the run it
guards. Concretely, on Claude Opus 4.8 at **$5 / MTok input and $25 / MTok output**:[^anthropic-pricing]

- **A wrong-direction autonomous run** of ~500k input + ~50k output tokens costs
  `500,000 × $5/M + 50,000 × $25/M` = **$2.50 + $1.25 ≈ $3.75** — and that is a *modest*
  run; long-horizon agents go far higher. Anthropic's own worked example bills a single
  50k-in/15k-out agent session at ~$0.63,[^anthropic-pricing] and real agent loops chain
  many such turns.
- **A clarifying question** is ~200 input + ~150 output tokens:
  `200 × $5/M + 150 × $25/M` ≈ **$0.005** — half a cent.

That is a **~700×** asymmetry. If the clarify/plan step changes the run's direction even a
few percent of the time, it pays for itself many times over, because each avoided re-run
saves a *whole* run, not a fraction of one. The math only gets more favorable as agents get
longer and as reasoning/thinking tokens (billed as expensive output) grow.

### The two gate patterns

**1. Clarify-first (for ambiguous requests).** When the request is under-specified, ask
1–3 targeted questions before planning. OpenAI's Model Spec codifies exactly this: when
intent is unclear, the assistant should "provide a robust answer or a safe guess if it can,
stating assumptions and asking clarifying questions as appropriate," and in agentic contexts
should "err on the side of caution, minimizing expected irreversible costs that could arise
from a misunderstanding."[^openai-model-spec] The key discipline is to ask only about the
*load-bearing* ambiguity (which repo, which date range, which of two plausible goals) — not
to interrogate the user about trivia.

**2. Plan-preview (for complex but clear requests).** When the goal is clear but the
execution is long or expensive, have the agent emit its plan and gate the run on
confirmation. OpenAI's Codex guidance recommends exactly this for "complex, ambiguous, or
hard to describe" tasks: a Plan mode that lets the agent "gather context, ask clarifying
questions, and build a stronger plan before implementation."[^openai-codex-best-practices]
Anthropic frames the same lifecycle: agents "begin their work with either a command from,
or interactive discussion with, the human user. Once the task is clear, agents plan and
operate independently," pausing "for human feedback at checkpoints" as
needed.[^anthropic-effective-agents] The plan preview turns an implicit, invisible
interpretation into an explicit artifact the user can correct in one line.

### Evidence that clarify/plan-first wastes less

The intuition is backed by reported results. One practitioner write-up on active questioning
found that adding a self-questioning / clarify step cut **ambiguity-induced retries from 4.1
to 1.3 per session**, and frames a clarifying question as a control mechanism that "prevents
silent failures, reduces wasted compute, lowers retry counts, and exposes uncertainty at the
exact point where correction is cheap."[^active-questioning] Fewer retries is a direct
token saving: each avoided retry is an avoided run.

### Implementation

- **Detect ambiguity, don't always ask.** Gate on a cheap up-front check: does the request
  contain the fields the plan needs (target, scope, format, constraints)? If yes, proceed
  and *state assumptions*; if a load-bearing field is missing, ask.[^openai-model-spec]
- **Make the plan an editable artifact.** Render the plan as a short numbered list the user
  can approve or tweak, rather than a wall of prose. Approval should be one click / one word.
- **Fold assumptions into the output when you don't ask.** For low-stakes tasks, proceed on
  the most reasonable assumption and document it, so a wrong guess is visible and cheap to
  correct without having blocked the user.[^openai-model-spec][^openai-gpt5-guide]
- **Scope the gate to expensive runs.** The confirmation earns its friction only in front of
  long/costly/irreversible work; don't gate a 2-second lookup.

## Example Where It Works

A "deep research" agent lets users ask open-ended questions and then runs a multi-step
loop — decomposing the question, spawning sub-searches, reading dozens of pages, and
synthesizing a report — easily consuming **hundreds of thousands of tokens** per
run.[^anthropic-context-eng] A user types: *"Summarize the competitive landscape for our
product."* This is ambiguous on at least three load-bearing axes: which product, which
competitors, and which dimensions (pricing? features? market share?).

Without a gate, the agent picks an interpretation, spends ~$3–4 of Opus 4.8 tokens on a full
run,[^anthropic-pricing] and hands back a report about the wrong competitor set — which the
user rejects and re-issues, doubling the cost. With a scope-confirmation gate, the agent
first asks: *"Which product, and should I focus on pricing, features, or market share?"* —
a ~half-cent exchange[^anthropic-pricing] — then previews a three-step plan for approval.
The expensive loop now runs **once, in the right direction**. Even a modest rejection rate
(say 20% of ambiguous requests previously going the wrong way) makes the ~700× cost
asymmetry overwhelmingly positive, while the reported retry reduction (4.1 → 1.3 per
session) shows the effect is real, not hypothetical.[^active-questioning]

## Example Where It Would NOT Work

The gate is friction, and friction has to be earned by the size of the run it protects. It
backfires when a wrong guess is *cheap to redo*:

- **Cheap, fast, reversible tasks.** For a single quick completion, a short summary, or an
  autocomplete, the "run" costs a fraction of a cent — less than the clarifying exchange
  itself. Here the correct move is to make the safe guess, state the assumption, and let the
  user re-run if wrong. OpenAI's agentic-coding guidance is explicit that the model should
  usually act on the most reasonable assumption rather than defer to the user, because
  premature clarification "created unnecessary friction."[^openai-gpt5-guide]

- **Over-gating habituates rubber-stamping.** If every trivial action demands a
  confirmation, users stop reading and reflexively approve everything — at which point the
  gate provides no protection while still adding latency. The Model Spec warns that scopes
  should "not be so narrow as to require multiple confirmations by the user for trivial
  actions, which could habituate the user to automatically confirming all
  requests."[^openai-model-spec] A gate that is always clicked "yes" is pure friction with
  no savings.

- **Unambiguous requests.** When the request already contains every load-bearing field, a
  clarifying question wastes a round-trip and annoys the user; a silent, correct run is
  cheaper than the gate. Reserve the gate for genuine ambiguity or genuinely expensive plans.

[^anthropic-effective-agents]: Anthropic, "Building Effective AI Agents" — <https://www.anthropic.com/research/building-effective-agents>
[^anthropic-context-eng]: Anthropic Engineering, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^openai-model-spec]: OpenAI, "Model Spec (2025/12/18)" — <https://model-spec.openai.com/2025-12-18.html>
[^openai-codex-best-practices]: OpenAI Developers, "Best practices — Codex" — <https://developers.openai.com/codex/learn/best-practices>
[^openai-gpt5-guide]: OpenAI Developers, "GPT-5 prompting guide" — <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide>
[^active-questioning]: Miles K., "When agents learn to ask: Active questioning in agentic AI," Medium — <https://medium.com/@milesk_33/when-agents-learn-to-ask-active-questioning-in-agentic-ai-f9088e249cf7>
