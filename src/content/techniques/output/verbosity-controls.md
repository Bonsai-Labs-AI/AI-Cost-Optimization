---
title: "Verbosity Controls"
category: output
maturityLevel: 1
maturityProvisional: false
shortDescription: "Use the provider's typed length/effort knob (GPT-5 verbosity, Claude effort) to scale the model's answer length down — cutting expensive output tokens — without rewriting the prompt or touching reasoning quality."
effort: Low
gain: Medium
riskToQuality: Low
effortWhy: "One line of config — flip a typed enum per task and leave the prompt untouched; no rewriting required."
gainWhy: "Output is the 5–6×-priced side of the bill and low verbosity roughly halves it, but output is only a bounded fraction of most bills."
riskWhy: "The model was post-trained to produce a coherently shorter answer, not a truncated one, and you can dial it per task and measure."
detectionSignals:
  - "Default everywhere — every call runs on the provider's default (medium verbosity / high effort), even simple lookups and classifications that need one line."
  - "Stripped padding — answers carry preambles, restated questions, and 'let me explain…' scaffolding the product discards anyway."
  - "Prompt-only brevity — conciseness is enforced via prompt text ('be brief') while the typed verbosity/effort parameter is left unset."
  - "Short-answer features — output tokens dominate the bill on read-heavy features (Q&A, extraction) where the useful answer is short."
measurementMethods:
  - "Output tokens per level — average output tokens at low vs. default verbosity/effort, with the quality eval held constant."
  - "Blended output cost — cost per request before vs. after lowering the knob."
  - "Explicit-set coverage — share of traffic running at an explicitly-set (vs. default) verbosity/effort level."
  - "Quality at each level — task-eval score per level, to find the lowest setting that still passes the bar."
status: published
lastUpdated: "2026-06-29"
related:
  - "output/output-length-control"
  - "output/output-length-control"
  - "model-routing/reasoning-token-budgeting"
sources:
  - id: openai-gpt5-dev
    title: "Introducing GPT-5 for developers"
    publisher: "OpenAI"
    year: 2025
    url: "https://openai.com/index/introducing-gpt-5-for-developers/"
    accessed: "2026-06-29"
    kind: blog
    note: "Introduces the verbosity parameter: takes low, medium (default), high; steers the default length of answers. Explicit instructions in the prompt take precedence over the verbosity parameter. reasoning_effort also gains a 'minimal' value."
  - id: openai-cookbook-params
    title: "GPT-5: New Params and Tools"
    publisher: "OpenAI Cookbook"
    year: 2025
    url: "https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_new_params_and_tools"
    accessed: "2026-06-29"
    kind: docs
    note: "verbosity controls output length/depth (not reasoning) — low=terse, medium=default, high=verbose. Same poem task: low 560, medium 849, high 1,288 output tokens. 'Keep prompts stable and use the parameter instead of re-writing.'"
  - id: openai-latest-model
    title: "Using the latest model (GPT-5.5)"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/latest-model"
    accessed: "2026-06-29"
    kind: docs
    note: "text.verbosity: medium is default, low is a better starting point for concise responses; on GPT-5.5 'low' is proportionally more concise than 'low' on GPT-5.4. Default style is more concise/direct. 'Treat final answer length as separate from reasoning quality.'"
  - id: anthropic-effort
    title: "Effort"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/effort"
    accessed: "2026-06-29"
    kind: docs
    note: "effort (output_config.effort): low/medium/high(default)/xhigh/max. Trades response thoroughness vs. token efficiency; affects ALL response tokens — text responses and explanations, tool calls, and thinking — not only the reasoning trace. Lower effort = fewer tokens / more terse confirmations."
  - id: anthropic-adaptive
    title: "Adaptive thinking"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking"
    accessed: "2026-06-29"
    kind: docs
    note: "effort is set via output_config.effort and acts as soft guidance; combined with adaptive thinking it controls how much Claude thinks AND, via the effort page, how many tokens it spends on the answer. max_tokens is the hard cap on thinking + response."
  - id: openai-pricing-asymmetry
    title: "OpenAI API pricing — GPT-5.5 / GPT-5.4 per-token rates"
    publisher: "OpenAI API Docs (model pages)"
    year: 2026
    url: "https://developers.openai.com/api/docs/models/gpt-5.5"
    accessed: "2026-06-29"
    kind: pricing
    note: "Output is billed several times input — e.g. GPT-5.5 $5/M input vs $30/M output (6x); GPT-5.4 $2.50 vs $15 (6x). Reasoning tokens bill at the output rate. Verbosity acts on the expensive output side of the rate card."
---

## Overview

On every frontier rate card, **output tokens cost several times more than input** — roughly
5–6× on the GPT-5.x line (e.g. \$5/M input vs. \$30/M output on GPT-5.5).[^openai-pricing-asymmetry]
So the single most direct way to cut spend on a read-heavy feature is to make the model's
*answer* shorter — without making it worse. **Verbosity controls** are the providers' built-in,
typed knob for exactly that: a parameter that scales how long and expansive the final answer is,
left as a first-class API field rather than buried in prompt text.

The two canonical 2026 examples are **OpenAI's `verbosity`** (`low` / `medium` / `high`, with
`medium` the default) and **Anthropic's `effort`** (`low` / `medium` / `high` / `xhigh` / `max`,
with `high` the default).[^openai-gpt5-dev][^anthropic-effort] OpenAI's parameter is purpose-built
for the length axis — it "steers the default length of GPT-5's answers" and explicitly controls
*output length and depth* rather than reasoning quality.[^openai-gpt5-dev][^openai-cookbook-params]
Anthropic's `effort` is a broader token-economy dial that "affects **all tokens** in the response,
including text responses and explanations, tool calls … and extended thinking," so lowering it
makes the *answer* terser too, not just the hidden trace.[^anthropic-effort]

The cost problem this solves is **default verbosity**: a product that never sets the knob pays for
the provider's middle-of-the-road answer length on every call, including the many simple lookups,
classifications, and extractions where one line would do. Flipping a single enum to `low` reclaims
that waste on the most expensive token class. It sits at **Level 1 (Basic Optimization)** because
it is genuinely one line of config, low risk (you can dial it per task and measure), and the gain
is real but bounded — it shrinks output, which is a meaningful but not unlimited fraction of most
bills.

## Detailed Approach & Techniques

### What the knob actually does (and why it's distinct)

This technique is easy to confuse with two neighbours; the distinction is the whole point:

- **Output Length Control** is *prompt-side brevity* — "answer in two sentences," bounded list
  lengths, "be concise." It works, but it spends prompt tokens, competes with your other
  instructions, and can be overridden or ignored mid-generation.
- **Max-Token Policies** is a *hard cap* (`max_tokens`) — a guillotine that truncates the
  completion at N tokens regardless of whether the thought was finished, risking a cut-off answer.
- **Verbosity controls** are a *typed, model-tuned knob*. The model was post-trained to respond to
  the parameter, so `low` produces a coherently shorter answer (not a truncated one), it consumes
  **no prompt tokens**, and it leaves your instructions untouched. You set the dial once in config
  and "keep prompts stable and use the parameter instead of re-writing."[^openai-cookbook-params]

A key nuance on the reasoning axis: OpenAI deliberately decouples the two. `verbosity` changes the
*visible answer's* length while leaving reasoning depth to a **separate** `reasoning_effort`
parameter — OpenAI's own guidance is to "treat final answer length as separate from reasoning
quality."[^openai-latest-model] So you can keep deep reasoning *and* a one-line answer. Anthropic's
`effort` bundles both axes into one dial — lower effort means both less thinking *and* a more
concise reply — which is why it doubles as this catalog's reasoning-budget lever (see
*Reasoning-Token Budgeting*) and as a verbosity control.[^anthropic-effort]

### Measured effect on output tokens

OpenAI's cookbook runs the *same* prompt at all three verbosity levels and reports the output-token
scaling directly. On a poem-writing task: **low ≈ 560, medium ≈ 849, high ≈ 1,288** output
tokens — i.e. `low` is well under half of `high`, with no prompt change and correctness
preserved.[^openai-cookbook-params] Because output is the 5–6×-priced side of the bill, a 2–2.5×
swing in output length is a 2–2.5× swing on the expensive line item.[^openai-pricing-asymmetry] On
the Anthropic side, `effort` is documented as trading "response thoroughness" for "token
efficiency," with lower levels yielding "terse confirmation messages" and "fewer tokens" across the
whole response.[^anthropic-effort]

### Defaults are getting terser — but don't rely on that alone

A 2026 trend works in your favour: providers are shipping more concise default styles. OpenAI notes
GPT-5.5's "default style is more concise and direct," and that `low` verbosity on GPT-5.5 produces
"proportionally more concise responses than `low` verbosity with GPT-5.4."[^openai-latest-model]
Anthropic's newer models likewise default to a more direct, less verbose voice. That lowers the
floor, but it does **not** remove the lever: the default is still `medium` verbosity / `high` effort,
both tuned for general quality, not for the many high-volume calls where terse is correct. Setting
the knob explicitly per task is what captures the saving.[^openai-latest-model][^anthropic-effort]

### How to apply it safely

1. **Set it explicitly, per task type.** Default it to `low` verbosity / `low`–`medium` effort for
   short-answer features (classification, extraction, routing, voice turns, chat replies), and
   reserve higher levels for genuinely long-form output (reports, tutorials, detailed
   explanations).[^openai-latest-model][^anthropic-effort]
2. **Hold reasoning where you need it.** On OpenAI, lower `verbosity` *without* lowering
   `reasoning_effort` when a task needs careful thinking but a short final answer.[^openai-gpt5-dev]
3. **Gate on an eval.** Lowering the knob is a length change, not a correctness change, but on some
   tasks brevity drops a needed caveat or step. Run the task eval at each level and pick the lowest
   setting that still passes the bar (the measurement methods above).
4. **Combine, don't substitute.** Verbosity (typed knob) + a light prompt nudge + a sane `max_tokens`
   safety cap is the belt-and-suspenders setup; the knob does the routine shrinking, the cap only
   catches runaways. On Claude, `max_tokens` is the hard limit on thinking *plus* response text,
   while `effort` is the soft guidance underneath it — set both together.[^anthropic-adaptive]

## Example Where It Works

A SaaS app runs a high-volume "explain this error message" helper: ~2M calls/month, each returning
a short, plain-language explanation. On the default `medium` verbosity the model wraps each answer
in a preamble, restates the error, and appends "hope this helps" boilerplate — averaging ~850 output
tokens when ~300 would carry the full answer.

Switching the endpoint to `verbosity: "low"` (one field) drops the average answer to the ~560-token
range observed in OpenAI's own benchmark while preserving the substance, because the model was tuned
to compress rather than truncate.[^openai-cookbook-params] At a 5–6× output multiplier, cutting
output roughly in half cuts the dominant cost line of this read-heavy feature by close to the same
proportion — with **no prompt rewrite, no quality regression on the eval, and no truncation
risk**.[^openai-pricing-asymmetry] The same pattern applies on Claude by running the endpoint at
`low` or `medium` effort: shorter explanations, fewer tokens, lower latency.[^anthropic-effort]

## Example Where It Would NOT Work

- **The output is supposed to be long.** A legal-brief drafter, a detailed code-generation tool, or
  a long-form tutorial writer *needs* the tokens. Forcing `low` verbosity here trades cost for a
  product that no longer does its job — these are exactly the cases where `high` verbosity / `xhigh`
  effort is correct.[^openai-cookbook-params][^anthropic-effort]
- **The cost is on the input side.** A feature dominated by a giant input prompt (a 100k-token
  document stuffed into context) with a one-line answer has almost nothing to gain from a verbosity
  knob — the answer is already short. The lever there is *prompt caching*, *long-context avoidance*,
  or a smaller model, not output verbosity.
- **You're on a provider/model without the parameter.** Verbosity (`verbosity`) and `effort` are
  specific to the GPT-5.x and Claude families; older models, some open-weight endpoints, and
  third-party gateways may not expose a typed length knob. There you fall back to prompt-side
  brevity (*Output Length Control*) and `max_tokens` discipline.
- **Brevity breaks the task.** On a few tasks — a multi-step proof, a safety-sensitive answer that
  must spell out caveats — over-compressing the *answer* drops content the user needs. The fix is
  to raise the level for that task (or hold reasoning high and only trim the final answer), and to
  catch it with the eval rather than discovering it in production.[^openai-gpt5-dev]

[^openai-gpt5-dev]: OpenAI, "Introducing GPT-5 for developers" — <https://openai.com/index/introducing-gpt-5-for-developers/>
[^openai-cookbook-params]: OpenAI Cookbook, "GPT-5: New Params and Tools" — <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_new_params_and_tools>
[^openai-latest-model]: OpenAI API Docs, "Using the latest model (GPT-5.5)" — <https://developers.openai.com/api/docs/guides/latest-model>
[^anthropic-effort]: Anthropic, "Effort," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/effort>
[^anthropic-adaptive]: Anthropic, "Adaptive thinking," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking>
[^openai-pricing-asymmetry]: OpenAI API Docs, "GPT-5.5 model" (per-token pricing) — <https://developers.openai.com/api/docs/models/gpt-5.5>
