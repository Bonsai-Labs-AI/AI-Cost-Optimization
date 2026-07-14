---
title: "User-Controlled Quality Mode"
category: product-ux
maturityLevel: 2
maturityProvisional: false
shortDescription: "Expose a fast-cheap vs. deep-expensive choice (a mode toggle, 'deep research' button, or model picker) so the expensive path is pulled only when the user actually wants it — and keep the cheap path as the default that most traffic takes."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "Every request runs the max-quality / most-expensive path by default; there is no fast/cheap option."
  - "Users routinely pay for depth (reasoning, deep research, a flagship model) they did not ask for."
  - "Expensive generated outputs are frequently discarded or regenerated because they were not what the user wanted."
  - "A single 'quality' setting is hard-coded for all users regardless of task difficulty."
measurementMethods:
  - "Share of traffic on the cheap default vs. the expensive mode (target: the large majority on the default)."
  - "Blended $/request across modes vs. an all-expensive baseline."
  - "Preview → commit rate for cheap-preview-then-commit flows (how often a cheap preview leads to a paid full run)."
  - "Discard/regeneration rate of expensive outputs before vs. after adding the gate."
status: published
lastUpdated: "2026-07-02"
related:
  - "model-routing/reasoning-token-budgeting"
  - "model-routing/model-right-sizing"
  - "product-ux/agent-scope-confirmation"
  - "product-ux/ai-feature-gating"
sources:
  - id: openai-deep-research
    title: "Introducing deep research"
    publisher: "OpenAI"
    year: 2025
    url: "https://openai.com/index/introducing-deep-research/"
    accessed: "2026-07-02"
    kind: blog
    note: "Deep research is an agentic mode that runs 5–30 minutes over hundreds of sources. Metered: 250 queries/mo (Pro), 25 (Plus/Team/Enterprise/Edu), 5 (Free); over-limit requests fall back to a lighter o4-mini version."
  - id: openai-gpt55-modes
    title: "GPT-5.5 in ChatGPT"
    publisher: "OpenAI Help Center"
    year: 2026
    url: "https://help.openai.com/en/articles/11909943-gpt-5-in-chatgpt"
    accessed: "2026-07-02"
    kind: docs
    note: "Modes: Instant (default, GPT-5.5 Instant), Thinking (Medium/High/Extra High), Pro. Instant can auto-escalate to Medium on hard requests; auto-switches don't consume manual Thinking limits."
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "gpt-5.4-nano $0.20/$1.25 per M in/out; gpt-5.4-mini $0.75/$4.50; gpt-5.5 $5/$30; o3-deep-research (Batch) $5/$20. Cheap default vs. deep path differ by an order of magnitude per token."
  - id: perplexity-deep-research
    title: "Introducing Perplexity Deep Research"
    publisher: "Perplexity"
    year: 2025
    url: "https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research"
    accessed: "2026-07-02"
    kind: blog
    note: "Deep Research 'performs dozens of searches, reads hundreds of sources' in 2–4 minutes; free for all but Pro gets a high query volume while non-subscribers get a limited number of answers per day."
  - id: anthropic-effort
    title: "Change the model, effort, and thinking settings"
    publisher: "Anthropic — Claude Help Center"
    year: 2026
    url: "https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings"
    accessed: "2026-07-02"
    kind: docs
    note: "User-facing effort dial (Low/Medium/High-default/Extra high/Max) + a Thinking toggle. 'Higher effort means more thorough responses, but they take longer and use more tokens, so you'll reach your usage limits faster.'"
  - id: anthropic-thinking
    title: "Extended thinking"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"
    accessed: "2026-07-02"
    kind: docs
    note: "Thinking tokens are billed in full as output regardless of display. Docs say skip extended thinking for simple queries and cost-sensitive scenarios; use it for complex multi-step reasoning."
  - id: anthropic-agents
    title: "Building effective agents"
    publisher: "Anthropic"
    year: 2025
    url: "https://www.anthropic.com/research/building-effective-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Find the simplest solution possible and only increase complexity when it demonstrably improves outcomes — the design principle behind a cheap default and an opt-in expensive path."
---

## Overview

The cost of an AI feature is dominated by *how much machine* you throw at each request:
a small model vs. a flagship, reasoning off vs. maximum reasoning effort, a single
answer vs. an agent that reads hundreds of sources. The common failure is picking the
**most expensive configuration for everyone, always** — every user gets deep reasoning
and the flagship model even when the overwhelming majority of their requests are trivial.

**User-controlled quality mode** flips that: you expose the quality/speed/cost choice to
the user (a fast-vs-thinking toggle, a "deep research" button, or a model picker) and make
the **cheap path the default**. Now the expensive path is pulled only when the user
explicitly signals it's worth it. Because most requests are ordinary, most traffic stays on
the cheap default, and the blended cost per request collapses toward the cheap tier's price
while the expensive tier is available on demand for the requests that justify it.

This is the pattern every major consumer AI product now ships. ChatGPT defaults to an
"Instant" mode and offers **Thinking** (Medium/High/Extra High) and **Pro** as opt-in
tiers.[^openai-gpt55-modes] Claude's apps expose an **effort** dial and a **Thinking**
toggle, telling users plainly that higher effort "take[s] longer and use[s] more
tokens."[^anthropic-effort] Both ChatGPT and Perplexity gate their most expensive capability
— **deep research**, an agent that runs for minutes over hundreds of sources — behind an
explicit button *and* a metered quota, precisely because it is far too costly to run on every
query.[^openai-deep-research][^perplexity-deep-research] The mode the user picks then maps
directly onto the underlying cost lever: a model tier (see *Model Right-Sizing*) or a
reasoning-effort setting (see *Reasoning-Token Budgeting*).

It sits at **Level 2** because doing it well is real product engineering — you must design
sensible defaults, wire modes to models/effort, frame the choice without overwhelming users,
and measure the traffic split — not just flip a config flag.

## Detailed Approach & Techniques

### The cost logic: a cheap default carries the traffic

The whole saving depends on one fact: **most requests are easy, and easy requests should
take the cheap path.** If a fast/cheap default handles, say, 85% of traffic and only 15%
escalates to the expensive mode, blended cost is close to the cheap tier — even though the
expensive tier is fully available. The per-token gaps are large enough that this matters:
on OpenAI's own pricing, `gpt-5.4-nano` is **$0.20 / $1.25** per million input/output tokens
while a flagship `gpt-5.5` is **$5 / $30** and the `o3-deep-research` agent is **$5 / $20**
(Batch) per million — roughly an **order of magnitude** per token between the cheap default
and the deep path, before you even count the deep path's far larger token *volume*.[^openai-pricing]

So the single most important design decision is **the default**, not the toggle. A bad
default (expensive-on) throws away the entire benefit because users rarely change defaults.
This is the product-UX expression of Anthropic's agent-design principle: start with the
simplest (cheapest) solution and only escalate when it "demonstrably improves
outcomes."[^anthropic-agents]

### Mapping modes to cost levers

The user-facing mode is just a friendly label over a technical knob:

- **Model tier.** "Fast" → a small/cheap model; "Pro/Best" → a flagship. This is a model
  picker (ChatGPT's Instant vs. Pro; Perplexity's model choice across the frontier).[^openai-gpt55-modes]
- **Reasoning effort.** "Quick" → reasoning off / low; "Think harder" → high effort. Claude
  exposes exactly this as an **effort** dial (Low → Max) plus a **Thinking** toggle, and warns
  that higher effort uses more tokens.[^anthropic-effort] Reasoning tokens are billed **in
  full as output**, so this dial moves real money — the docs explicitly say to skip extended
  thinking for "simple queries" and "cost-sensitive scenarios."[^anthropic-thinking]
- **Agentic depth.** "Answer" → one shot; "Deep research" → an agent that runs 5–30 minutes
  over hundreds of sources.[^openai-deep-research] This is the most expensive tier, which is
  why it's both button-gated *and* quota-metered (250/25/5 queries per month by plan on ChatGPT;
  a high volume for Pro vs. a limited daily number for free users on Perplexity).[^openai-deep-research][^perplexity-deep-research]

### Auto-escalation: the default that upgrades itself

The most powerful version keeps the cheap default *and* rescues hard requests
automatically. ChatGPT's Instant mode "can automatically escalate to more intensive
reasoning for difficult requests" — and crucially, those auto-switches don't consume the
user's manual Thinking quota.[^openai-gpt55-modes] This preserves the cost win (cheap by
default) without the quality risk of a too-weak default on a genuinely hard task. It overlaps
with automated *Dynamic Model Routing*, but here the difference is that the user still owns an
explicit override.

### Cheap-preview-then-commit (folded-in variant)

A two-stage form of the same idea for **generative** tasks (documents, images, videos, long
reports, code scaffolds) where the expensive output might be *unwanted*:

1. **Cheap preview.** Generate a fast, low-cost draft, outline, or thumbnail first (small
   model, low effort, or a partial generation).
2. **User commits.** The user only pays for the full, expensive generation if the preview
   looks right.

The waste this avoids is the full price of every output the user would have thrown away.
If, historically, one in three expensive generations is discarded as "not what I wanted,"
gating the expensive run behind a cheap preview eliminates roughly **a third of expensive
spend** while the preview itself costs a small fraction of a full run. This is the product
analogue of *Agent Scope / Plan Confirmation* — spend a few cheap tokens to confirm intent
before committing to an expensive run.

### Design pitfalls to avoid

- **Choice overload.** Don't surface five near-identical modes. Two or three well-named
  options (a clear default + "go deeper") is the ceiling; anything more and users default to
  ignoring it.
- **Unclear value framing.** Users need to know *why* they'd pay for the expensive mode
  ("deep research," "think harder") — vague labels get ignored, and the expensive tier
  becomes dead weight you built but nobody pulls.
- **Wrong default.** Defaulting to the expensive mode "to be safe" silently deletes the
  entire saving. Default cheap; escalate on demand (or auto-escalate on detected difficulty).

## Example Where It Works

A research/writing assistant serves 100,000 requests/day. Most are quick lookups and
edits; a minority are genuine "research this thoroughly" jobs.

- **All-expensive baseline:** route every request through a flagship model with high
  reasoning, at roughly flagship pricing ($5/$30 per M tokens).[^openai-pricing]
- **With a quality mode:** default to a small fast model / low effort. Suppose **85%** of
  traffic stays on the cheap default (≈ nano/mini pricing, an order of magnitude cheaper per
  token) and **15%** opts into the deep path. Blended per-request cost lands close to the
  cheap tier — a **large majority reduction** vs. all-expensive — while every user who needs
  depth still gets it on demand.[^openai-pricing][^openai-gpt55-modes]

Layer in **cheap-preview-then-commit** for the report generator: a cheap outline is shown
first; only reports the user approves trigger the full multi-source **deep research** run
(which, being an agent over hundreds of sources, is the single most expensive action in the
product).[^openai-deep-research] If a third of full reports were previously abandoned, the
preview gate removes that third of the most expensive spend outright. This is exactly why
providers meter deep research rather than run it freely.[^openai-deep-research][^perplexity-deep-research]

## Example Where It Would NOT Work

- **Uniformly hard workload.** If *every* request genuinely needs the expensive path — e.g.
  a specialist tool where each query is a hard reasoning task — there is no cheap majority to
  capture; a mode toggle just adds friction while nearly everyone (correctly) picks the
  expensive option. Right-size the single model to the real difficulty instead (*Model
  Right-Sizing*).
- **Users can't judge the trade-off.** In an embedded/back-end feature with no human in the
  loop (a batch pipeline, an autonomous agent step), there is no user to make the choice —
  the "mode" must be decided programmatically. That's *Dynamic Model Routing* /
  *Reasoning-Token Budgeting*, not a UX control.
- **A weak default that erodes trust.** If the cheap default is too weak and frequently
  produces wrong answers, users learn to always pick the expensive mode (defeating the
  saving) or churn. The saving is real only when the cheap default is *good enough* for the
  easy majority; auto-escalation on hard requests is the mitigation.[^openai-gpt55-modes]
- **Previews that don't predict the full output.** Cheap-preview-then-commit fails if the
  cheap preview doesn't faithfully represent the expensive result — users approve on the
  preview, then the full run diverges, and you've paid for both. The preview must be a
  reliable proxy (an outline the full text follows, a thumbnail the render matches) for the
  gate to avoid waste rather than add it.

[^openai-deep-research]: OpenAI, "Introducing deep research," 2025 — <https://openai.com/index/introducing-deep-research/>
[^openai-gpt55-modes]: OpenAI Help Center, "GPT-5.5 in ChatGPT" — <https://help.openai.com/en/articles/11909943-gpt-5-in-chatgpt>
[^openai-pricing]: OpenAI API Docs, "Pricing" — <https://developers.openai.com/api/docs/pricing>
[^perplexity-deep-research]: Perplexity, "Introducing Perplexity Deep Research," 2025 — <https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research>
[^anthropic-effort]: Anthropic Claude Help Center, "Change the model, effort, and thinking settings" — <https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings>
[^anthropic-thinking]: Anthropic Claude Platform Docs, "Extended thinking" — <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
[^anthropic-agents]: Anthropic, "Building effective agents," 2025 — <https://www.anthropic.com/research/building-effective-agents>
