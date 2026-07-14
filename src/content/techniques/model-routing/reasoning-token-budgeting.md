---
title: "Reasoning / Thinking-Token Budgeting"
category: model-routing
maturityLevel: 2
maturityProvisional: false
shortDescription: "Control the hidden reasoning/thinking tokens on reasoning models — dial effort down or off for easy tasks — because those tokens are billed as (expensive) output, often dominate the bill, and are NOT bounded by max_tokens."
effort: Low
gain: High
riskToQuality: Medium
detectionSignals:
  - "A reasoning model (GPT-5.x, o-series, Claude with extended thinking, Gemini 2.5) runs at default/high effort on trivial tasks like classification, extraction, or formatting."
  - "Output-token bills are large but the visible answers are short — the gap is invisible reasoning tokens."
  - "Occasional empty or truncated responses (status incomplete) where the request still billed for input + reasoning tokens."
  - "Effort/thinking level was never tuned per task type; every call uses the same default."
measurementMethods:
  - "Reasoning tokens as a % of output tokens (output_tokens_details.reasoning_tokens ÷ total output tokens)."
  - "$/request broken down by effort level or thinking budget on a fixed eval set."
  - "Accuracy held at the quality bar for each effort tier — the accuracy-vs-cost curve per task type."
  - "Rate of incomplete/empty responses caused by reasoning consuming the whole token budget."
status: published
lastUpdated: "2026-07-02"
related:
  - "model-routing/model-right-sizing"
  - "model-routing/dynamic-model-routing"
  - "output/output-length-control"
  - "output/max-token-policies"
  - "output/streaming-with-early-stop"
  - "product-ux/user-controlled-quality-mode"
sources:
  - id: openai-reasoning
    title: "Reasoning models"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning"
    accessed: "2026-07-02"
    kind: docs
    note: "reasoning.effort values none/minimal/low/medium/high/xhigh; reasoning tokens billed as output tokens and counted in output_tokens_details.reasoning_tokens; they count against max_output_tokens and can be exhausted before any visible output (status incomplete), so you pay for input+reasoning with no answer. Reserve ≥25,000 tokens for reasoning+output when starting."
  - id: anthropic-thinking
    title: "Extended thinking"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"
    accessed: "2026-07-02"
    kind: docs
    note: "thinking.budget_tokens minimum 1,024, must be < max_tokens, is a target not a hard limit. Billed for full thinking tokens, not the visible summary. budget_tokens deprecated on Opus 4.6 / Sonnet 4.6 in favour of the adaptive-thinking effort parameter. Interleaved thinking lets budget_tokens exceed max_tokens across a turn."
  - id: gemini-thinking
    title: "Gemini thinking"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/thinking"
    accessed: "2026-07-02"
    kind: docs
    note: "Current docs expose thinking_level (minimal/low/medium/high) with dynamic thinking by default; gemini-2.5-flash-lite defaults to thinking off. The earlier 2.5 interface used an integer thinkingBudget (0 disables on Flash/Flash-Lite; -1 requests dynamic thinking). Thought tokens billed as output."
  - id: openrouter-reasoning
    title: "Reasoning Tokens"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/best-practices/reasoning-tokens"
    accessed: "2026-07-02"
    kind: docs
    note: "Cross-provider: reasoning tokens are considered output tokens and charged accordingly. Unified effort→budget mapping: minimal ~10%, low ~20%, medium ~50%, high ~80%, max/xhigh ~95% of max_tokens."
  - id: overthink-eval
    title: "Do LLMs Overthink Basic Math Reasoning? Benchmarking the Accuracy-Efficiency Tradeoff in Language Models"
    publisher: "Srivastava, Hussain, Srinivasan, Wang — Virginia Tech (arXiv)"
    year: 2025
    url: "https://arxiv.org/html/2507.04023v3"
    accessed: "2026-07-02"
    kind: paper
    note: "On basic tasks reasoning models spend ~18× more tokens while sometimes scoring LOWER; Phi-4 78.92% at ~379 tokens vs Phi-4-reasoning 72.23% at ~6,066 tokens (~16× tokens, −6.69 pts); a division case used 1,456 vs 47 tokens (31×) with no benefit."
  - id: effort-benchmark
    title: "Reasoning Effort: Cost vs Quality Benchmarks 2026"
    publisher: "Digital Applied"
    year: 2026
    url: "https://www.digitalapplied.com/blog/reasoning-effort-cost-vs-quality-benchmarks-2026"
    accessed: "2026-07-02"
    kind: benchmark
    note: "GPT-5.5 Pro on AIME: low 69.3% → medium 79.3% → high 91.7% (+22.4 pts low→high) but ~17× cost and 5–60× latency; code-refactor quality peaks at medium ('high adds little'). Cost/quality crossover is task-specific."
---

## Overview

Reasoning models — OpenAI's GPT-5.x and o-series, Claude with extended thinking, and
Google's Gemini 2.5 — produce a hidden chain of **reasoning / thinking tokens** before
they emit the visible answer. Those hidden tokens are **billed as output tokens**, the
most expensive token class, and they routinely *dominate* a request's cost: a call that
returns a two-line answer can burn thousands of unseen reasoning tokens first.[^openai-reasoning][^anthropic-thinking][^openrouter-reasoning]

The trap is that this cost is invisible in the response body and — critically — is **not
bounded by `max_tokens`**. On OpenAI, reasoning tokens count *against* `max_output_tokens`,
so a request can spend the entire budget thinking and return a response with `status:
incomplete` and **no visible output at all**, while you still pay for the input and every
reasoning token.[^openai-reasoning] On Anthropic the thinking `budget_tokens` must be set
below `max_tokens` and you are billed for the **full** thinking process, not the short
summary you see.[^anthropic-thinking]

Reasoning-token budgeting is the deliberate practice of **matching reasoning effort to task
difficulty** — turning thinking down (or off) for easy work and reserving high effort for
genuinely hard problems. It is a *single parameter* to change (hence **Low effort**), but
the payoff is **High**, because on reasoning-model workloads the hidden output tokens are
often the single largest line on the bill. The risk is **Medium**: cut effort too far on a
hard task and accuracy drops, so it belongs at **Level 2** — a measured, eval-backed dial,
not a blind toggle.

## Detailed Approach & Techniques

### The knobs, provider by provider

- **OpenAI (GPT-5.x, o-series) — `reasoning.effort`.** A discrete dial with values
  `none`, `minimal`, `low`, `medium`, `high`, and `xhigh` (support varies by model; GPT-5.5
  defaults to `medium`). Lower effort favours speed and fewer tokens; higher effort thinks
  more completely. Reasoning tokens appear in `usage.output_tokens_details.reasoning_tokens`
  and are billed as output.[^openai-reasoning] For simple, latency-sensitive work, `minimal`
  gives you a reasoning model that behaves almost like a plain chat model.

- **Anthropic (Claude) — `thinking.budget_tokens` → adaptive `effort`.** Classic extended
  thinking takes an explicit token budget (minimum **1,024**, and it **must be less than
  `max_tokens`**). It is a *target*, not a hard cap — Claude may under-spend it, especially
  above ~32k. You are billed for the **full** thinking tokens, not the visible summary. On
  the newest models (Opus 4.6, Sonnet 4.6) `budget_tokens` is **deprecated** in favour of an
  adaptive-thinking **`effort`** parameter that controls depth without hand-tuning a token
  count.[^anthropic-thinking]

- **Google (Gemini) — `thinking_level` (with the legacy `thinkingBudget`).** Current Gemini
  models expose a **`thinking_level`** control — `minimal` / `low` / `medium` / `high` — and
  **think *dynamically* by default**, auto-scaling reasoning effort to request complexity;
  `gemini-2.5-flash-lite` ships with thinking **off** by default. (The earlier Gemini 2.5
  interface used an integer **`thinkingBudget`**, where `0` disabled thinking on Flash /
  Flash-Lite and `-1` requested dynamic thinking.) Thought tokens are billed as
  output.[^gemini-thinking] Setting `thinking_level: minimal` (or disabling thinking on
  Flash-Lite) for a classification job turns a reasoning model into a cheap, fast one with a
  single field.

A gateway view helps here: OpenRouter normalises all three behind one `reasoning` field and
maps effort to a fraction of the budget — **minimal ≈ 10%, low ≈ 20%, medium ≈ 50%, high ≈
80%, xhigh ≈ 95%** of `max_tokens` — and confirms that across every provider "reasoning
tokens are considered output tokens and charged accordingly."[^openrouter-reasoning]

### `max_tokens` does NOT bound reasoning — budget defensively

Because reasoning tokens are counted before the visible answer, `max_tokens` (or
`max_output_tokens`) is a cap on *reasoning + output combined*, not on the visible reply.
Two failure modes follow:

1. **Empty/incomplete responses that still bill.** If reasoning exhausts the budget you get
   `status: incomplete` with no answer, having paid for input plus all reasoning
   tokens.[^openai-reasoning] OpenAI's guidance is to **reserve at least 25,000 tokens** for
   reasoning + output when you start, tuning down once you know your patterns.[^openai-reasoning]
2. **Under-budgeting truncates the answer.** Set `max_tokens` too tight relative to the
   thinking budget and the model thinks, then has no room left to answer. Anthropic enforces
   the ordering explicitly: `budget_tokens` must be strictly below `max_tokens` (except with
   interleaved thinking, where the budget spans a whole turn).[^anthropic-thinking]

So "cap the cost with `max_tokens`" is a false comfort on reasoning models — the real lever
is the *effort/budget* dial itself.

### Task-matching: where effort earns its tokens (and where it's waste)

The accuracy-vs-effort curve is steep and **task-specific**. On a benchmark of GPT-5.5 Pro,
AIME math accuracy climbed **69.3% → 79.3% → 91.7%** from low to medium to high effort — a
real **+22.4 point** gain — but at roughly **17× the cost** and **5–60× the latency**; a
code-refactor task, by contrast, **peaked at medium** with "high adds little."[^effort-benchmark]
The rule: pay for high effort only where hard reasoning moves the score.

The opposite extreme is where the savings live. On *basic* tasks, reasoning models
**overthink dramatically** with no accuracy benefit — one study found reasoning variants
generating **~18× more tokens while sometimes scoring lower**, e.g. Phi-4 at 78.92%/~379
tokens vs its reasoning variant at 72.23%/~6,066 tokens (≈16× tokens, worse accuracy), and a
simple division that took **1,456 tokens vs 47** (a 31× multiplier) "with no
benefit."[^overthink-eval] Classification, extraction, formatting, routing, and short
factual lookups should run at **minimal / thinking-off**.

### A practical budgeting policy

1. **Default low or minimal; escalate on evidence.** Start each task type at the lowest
   effort and raise it only if an eval shows accuracy below the bar (see
   *Model Right-Sizing* and *Quality–Cost Evaluation Suite*).
2. **Turn thinking off for deterministic/structured tasks** — `reasoning.effort: minimal`,
   `thinking_level: minimal` (Gemini), or a plain non-reasoning model.
3. **Route by difficulty**, not one global setting: cheap/minimal for the easy majority,
   high effort for the hard tail (this is the effort analogue of *Dynamic Model Routing*).
4. **Measure reasoning tokens as a share of output** and watch for incomplete responses;
   both are the instrumentation that keeps the dial honest.

## Example Where It Works

A support-ticket pipeline classifies ~500,000 tickets/day into 20 categories and extracts a
few structured fields. The team shipped it on a reasoning model at the **default (medium)**
effort. Each classification returns ~15 visible tokens — but `reasoning_tokens` averages
~1,200 per call, so the bill is ~99% invisible thinking on a task with a single correct
label.

Setting **`reasoning.effort: minimal`** (OpenAI) or **`thinking_level: minimal`** (Gemini)
collapses reasoning to near zero. Accuracy holds — classification is exactly the kind of
task where the "overthinking" literature shows extra reasoning **doesn't** help and can even
hurt.[^overthink-eval][^openai-reasoning][^gemini-thinking] Output tokens per call drop from
~1,215 to ~15, cutting the dominant cost line by well over 90% across half a million daily
calls, and latency drops too. The change is one parameter, gated by an eval that confirms
label accuracy is unchanged.

## Example Where It Would NOT Work

A competition-math tutor and a multi-file code-refactoring agent both live at the **hard end**
of the curve. Here, dialling effort down is a false economy: dropping GPT-5.5 Pro from high
to low effort on AIME-style problems sheds **~22 accuracy points**, and the refactor task
needs at least medium to pass its integration tests.[^effort-benchmark] The wrong answers
produced at low effort trigger retries, human rework, or a bad merge — costing far more than
the reasoning tokens saved.

Reasoning-token budgeting also gives little on **output-bound, low-reasoning** workloads —
e.g. long-form drafting where the visible generation, not hidden thinking, is the bulk of the
output; there *Output-Length Control* and template-based generation are the right levers.
And note that streaming or early-stop tricks can't recover reasoning cost: on these models
the reasoning tokens are **already spent before the first visible token streams**, so the
only real control is the effort/budget dial itself.[^openai-reasoning][^anthropic-thinking]

[^openai-reasoning]: OpenAI API Docs, "Reasoning models" — <https://developers.openai.com/api/docs/guides/reasoning>
[^anthropic-thinking]: Anthropic, "Extended thinking," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
[^gemini-thinking]: Google, "Gemini thinking," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/thinking>
[^openrouter-reasoning]: OpenRouter Documentation, "Reasoning Tokens" — <https://openrouter.ai/docs/guides/best-practices/reasoning-tokens>
[^overthink-eval]: Srivastava, Hussain, Srinivasan, Wang (Virginia Tech), "Do LLMs Overthink Basic Math Reasoning? Benchmarking the Accuracy-Efficiency Tradeoff in Language Models," arXiv — <https://arxiv.org/html/2507.04023v3>
[^effort-benchmark]: Digital Applied, "Reasoning Effort: Cost vs Quality Benchmarks 2026" — <https://www.digitalapplied.com/blog/reasoning-effort-cost-vs-quality-benchmarks-2026>
