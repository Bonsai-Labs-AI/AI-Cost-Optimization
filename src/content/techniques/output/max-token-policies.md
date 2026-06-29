---
title: "Max-Token Policies by Task Type"
category: output
maturityLevel: 1
maturityProvisional: false
shortDescription: "Set a deliberate per-task max-token cap on every endpoint so a single call can't run away into thousands of billed output tokens — while avoiding the reasoning-model trap where a too-low cap truncates the visible answer but still bills the thinking."
effort: Low
gain: Low
riskToQuality: Medium
effortWhy: "One config field per endpoint — set the max-token ceiling deliberately rather than leaving it unset or copying one default everywhere."
gainWhy: "Bounds only the rare runaway, not the median call — most answers finish well under any sane cap, so day-to-day savings are small."
riskWhy: "A too-low cap on a reasoning model truncates the visible answer while you still pay for the thinking tokens — sometimes returning nothing."
detectionSignals:
  - "Unbounded calls — no max_tokens / max_completion_tokens set, or one large default copied to every endpoint regardless of task."
  - "Runaway completions — a classifier or extractor that should return a few tokens sometimes emits hundreds or thousands."
  - "Paid-for-nothing truncation — on reasoning models, answers come back truncated or empty (finish_reason 'length' / status 'incomplete') yet the bill still shows output/reasoning tokens."
  - "Heavy long tail — p95/p99 output-token length per endpoint sits far above the median, an expensive tail nobody bounded."
measurementMethods:
  - "Percentile vs. cap — p95/p99 output tokens per endpoint compared against the configured ceiling (which should sit comfortably above p99 of legitimate answers)."
  - "Truncation rate — fraction of responses ending with finish_reason 'length' / status 'incomplete', which should be near zero on normal traffic."
  - "Reasoning-token share — reasoning_tokens ÷ total output on capped calls, to confirm the cap leaves room for the visible answer."
  - "Tail cost — spend from the top 1% longest completions, before vs. after caps."
status: published
lastUpdated: "2026-06-29"
related:
  - "output/output-length-control"
  - "model-routing/reasoning-token-budgeting"
  - "output/verbosity-controls"
sources:
  - id: openai-reasoning
    title: "Reasoning models — controlling costs with max_output_tokens"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning"
    accessed: "2026-06-29"
    kind: docs
    note: "max_output_tokens limits the total tokens generated INCLUDING reasoning, visible output, and non-visible formatting tokens. If the cap is hit you get status 'incomplete' / incomplete_details reason max_output_tokens — and this can occur before any visible output, so you pay for input + reasoning with no answer. Recommends reserving at least 25,000 tokens for reasoning and outputs when starting."
  - id: anthropic-thinking
    title: "Extended thinking — max_tokens and budget_tokens"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"
    accessed: "2026-06-29"
    kind: docs
    note: "budget_tokens must be set to a value less than max_tokens (except with interleaved thinking, where it can exceed it as a per-turn total). Thinking tokens are billed as output tokens; you're charged for the full thinking generated, not the visible summary. usage.output_tokens_details.thinking_tokens reports the share."
  - id: anthropic-messages
    title: "Messages API — max_tokens parameter"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/api/messages"
    accessed: "2026-06-29"
    kind: docs
    note: "max_tokens is 'the maximum number of tokens to generate before stopping'; the model may stop before reaching it. Different models have different maximum values for this parameter."
  - id: openai-length
    title: "Controlling the length of OpenAI model responses"
    publisher: "OpenAI Help Center"
    year: 2026
    url: "https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses"
    accessed: "2026-06-29"
    kind: docs
    note: "Token caps help manage cost (you pay per token) and latency. Reasoning models (o-series, GPT-5) require max_completion_tokens (alias of max_tokens). There is no minimum-tokens setting — specify a minimum in the prompt if needed."
  - id: openai-pricing
    title: "API pricing — input vs. output token rates"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Output tokens are priced ~6x input across the GPT-5 family (e.g. $5/M input vs $30/M output). Output dominance is why an unbounded completion is the expensive failure mode."
  - id: tokenmix-trap
    title: "Thinking Tokens Trap: How Reasoning Models Burn max_tokens"
    publisher: "TokenMix Blog"
    year: 2026
    url: "https://tokenmix.ai/blog/thinking-tokens-billing-trap-2026"
    accessed: "2026-06-29"
    kind: blog
    note: "Rule of thumb: set max_tokens ≈ 4x expected visible output on reasoning models; thinking typically consumes 1–2x the visible output, so 4x leaves headroom. Worked example: a request with max_tokens:10 returned empty content but still billed thinking tokens. Detect with finish_reason == 'length'."
---

## Overview

Every chat/completion endpoint exposes a hard ceiling on how many tokens the model may
generate in one response — `max_tokens` on Anthropic, `max_completion_tokens` /
`max_output_tokens` on OpenAI's reasoning models, and the equivalent on Gemini and
Bedrock.[^anthropic-messages][^openai-length] A **max-token policy** is the simple discipline of
choosing that ceiling *deliberately, per task type* — a few dozen tokens for a classifier,
a few hundred for an extraction, a few thousand for a drafted email — rather than leaving
it unset or copying one large default onto every call.

The cost problem it solves is the **runaway completion**. Output tokens are the expensive
side of the bill: on current frontier rate cards output is priced roughly **6× input**
(e.g. \$5/M input vs \$30/M output on a GPT-5-class model).[^openai-pricing] An LLM that
loops, over-explains, repeats itself, or gets stuck producing a wall of text turns that
6× multiplier loose on a request that should have been cheap. A per-task cap puts a firm
ceiling on the damage from any single call — the model "may stop before reaching this
maximum," so a well-set cap costs nothing on normal traffic and only bites the pathological
tail.[^anthropic-messages]

It sits at **Level 1** because it is one config field, but its gain is honestly **Low**:
on healthy traffic most answers finish well under any sane cap, so the cap saves money only
on the rare runaway, not on the median call. The day-to-day shrinking of outputs comes from
*prompt brevity* (output-length-control) and *verbosity parameters* (verbosity-controls) —
this technique is the **safety rail**, not the optimizer. And it carries real **Medium**
risk, because in 2026 a carelessly low cap can *cost* you money on reasoning models. The
rest of this page is mostly about getting that right.

## Detailed Approach & Techniques

### Set a cap per task type, sized from real output distributions

The cap is not a single global number. Size it per endpoint from the observed output-length
distribution of *legitimate* answers, then place the ceiling comfortably above the p99 of
that distribution so normal traffic never trips it but a runaway is bounded:

- **Classification / routing / yes-no:** tens of tokens.
- **Structured extraction / short answers:** low hundreds.
- **Summaries / drafted messages:** several hundred to a couple thousand.
- **Long-form generation:** a few thousand, sized to the actual artifact.

Because there is **no "minimum tokens" setting**, a cap only ever *truncates* — if you need a
floor, ask for it in the prompt.[^openai-length] When the cap is hit, the provider signals it
(OpenAI: `finish_reason: "length"` / `status: "incomplete"` with `incomplete_details` reason
`max_output_tokens`), which is the signal to monitor for mis-set caps.[^openai-reasoning]

### The 2026 footgun: `max_tokens` and reasoning/thinking tokens

This is the fact that makes the technique risky rather than free, and it behaves **differently
across providers** — so a cap that is safe on one is a money-loser on another.

**Reasoning ("thinking") tokens are billed at the output rate even though they never appear in
the response,** and they routinely run **1–2× the size of the visible answer**.[^anthropic-thinking][^tokenmix-trap]
The question is whether your cap controls them:

- **OpenAI (o-series, GPT-5):** `max_output_tokens` / `max_completion_tokens` is the **total**
  budget — it bounds *reasoning + visible output + non-visible formatting tokens together*. The
  danger is that reasoning is generated **first**: if the cap is too low, the model can exhaust
  it during thinking and return a response that is **`incomplete` before a single visible token
  is produced** — *"you could incur costs for input and reasoning tokens without receiving a
  visible response."*[^openai-reasoning] You set a cap to save money and instead paid for thinking
  and got nothing. OpenAI recommends **reserving at least 25,000 tokens for reasoning and
  outputs** when starting with these models.[^openai-reasoning]

- **Anthropic (extended thinking):** thinking is controlled by a **separate** `budget_tokens`
  knob, and the constraint is `budget_tokens` **must be less than** `max_tokens` (except with
  interleaved thinking, where `budget_tokens` is a per-turn total that can exceed it). So
  `max_tokens` here is the cap on the visible answer *on top of* the thinking budget — set it
  too low relative to the budget and you again truncate the answer after paying for the full
  thinking.[^anthropic-thinking] You're charged for the full thinking generated, not the visible
  summary, and `usage.output_tokens_details.thinking_tokens` reports the share.[^anthropic-thinking]

The unifying failure mode is the same on both: **a cap set for the visible answer alone, applied
to a model that thinks, truncates the answer while you still pay for the thinking.** A worked
example: a request with `max_tokens: 10` came back with **empty content but a non-zero thinking-token
bill** — money out, no answer.[^tokenmix-trap]

### Rule of thumb for reasoning models

On a reasoning model, set the cap to roughly **4× the expected visible output**: thinking
typically consumes **1–2×** the visible output, so a 4× ceiling leaves headroom for the model
to finish reasoning *and* emit the full answer.[^tokenmix-trap] Then verify against telemetry —
track the **reasoning-token share** of capped calls and raise the cap if thinking is eating a
large fraction of it.[^tokenmix-trap] Note that older `max_tokens` is **deprecated for OpenAI
reasoning models** — they require `max_completion_tokens`.[^openai-length]

### Where this stops and a sibling technique starts

A max-token cap **bounds** the trace; it does not **shrink** it. If thinking is genuinely too
large, you don't fix that with a hard ceiling (which only truncates the *answer*) — you lower the
reasoning effort/budget, which is the job of **reasoning-token-budgeting**. Likewise, to make the
*visible* answer shorter day-to-day, reach for prompt brevity (output-length-control) or a
provider verbosity parameter (verbosity-controls). This technique is the runaway guard that sits
behind all three.

## Example Where It Works

A document-processing pipeline runs a **classification** step — "label this support ticket as
billing / technical / account / other" — on a non-reasoning model, millions of calls a month.
The correct answer is one word. With no cap, a malformed input or an occasional model digression
sometimes produces a paragraph of explanation before the label, and once in a while the model
loops into hundreds of tokens of restated context. Each runaway is small individually, but at
output's ~6× price multiplier across millions of calls the long tail is real money, and it's
invisible until someone looks at p99 output length.[^openai-pricing]

Setting `max_tokens` to **16** on this endpoint — well above the longest legitimate label, far
below any runaway — caps the worst case at a rounding error per call. Normal traffic never trips
it (the model stops on its own after the label), the truncation rate stays at zero, and the
expensive tail simply disappears.[^anthropic-messages] One config field, no quality change, a
bounded bill.

## Example Where It Would NOT Work

A research-assistant feature runs on a **reasoning model** and produces multi-paragraph analyses.
A well-meaning engineer, trying to "control cost," copies the classifier's tight discipline and
sets `max_completion_tokens: 400` — about the length of the prose they expect to see.

It backfires on two fronts. First, **400 is below the model's own thinking** for a hard analytical
question: the reasoning phase consumes the entire budget before the visible answer starts, so the
response comes back **`incomplete` with reason `max_output_tokens` and no usable content — yet the
reasoning tokens are billed at the output rate.** They paid more, not less, and got nothing.[^openai-reasoning][^tokenmix-trap]
Second, even when some answer squeaks through, it is **truncated mid-thought**, which often triggers
a user retry — another full-priced call. The cap punished the wrong thing.

The right move here is not a tighter cap but a *correctly sized* one — at least 4× the expected
visible output, and never below the provider's reasoning reservation (OpenAI suggests ~25,000
tokens for reasoning + output to start) — combined with **reasoning-token-budgeting** to actually
reduce the thinking, and **verbosity-controls** to shorten the prose.[^openai-reasoning][^tokenmix-trap]
A hard ceiling is a guard rail, not a cost lever; treating it as the latter on a model that thinks
is how a "savings" change becomes a regression.

[^openai-reasoning]: OpenAI API Docs, "Reasoning models" (controlling costs with max_output_tokens) — <https://developers.openai.com/api/docs/guides/reasoning>
[^anthropic-thinking]: Anthropic, "Extended thinking" (max_tokens vs budget_tokens; thinking billed as output) — <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
[^anthropic-messages]: Anthropic, "Messages API" (max_tokens parameter) — <https://platform.claude.com/docs/en/api/messages>
[^openai-length]: OpenAI Help Center, "Controlling the length of OpenAI model responses" — <https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses>
[^openai-pricing]: OpenAI API Docs, "API pricing" (input vs. output token rates) — <https://developers.openai.com/api/docs/pricing>
[^tokenmix-trap]: TokenMix, "Thinking Tokens Trap: How Reasoning Models Burn max_tokens" — <https://tokenmix.ai/blog/thinking-tokens-billing-trap-2026>
