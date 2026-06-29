---
title: "Output Length Control"
category: output
maturityLevel: 0
maturityProvisional: false
shortDescription: "Use prompt-side instructions (be concise, answer in N sentences, bounded list lengths) to stop the model from generating more tokens than the task needs — directly cutting the output tokens that frontier rate cards bill at roughly 4–8× the input rate."
effort: Low
gain: High
riskToQuality: Medium
effortWhy: "A few words in the prompt — no code, no infrastructure, no new model."
gainWhy: "Brevity instructions realistically cut output tokens 40–70% on tasks that were over-answering, on the most expensive token class."
riskWhy: "Over-terse instructions can compress needed reasoning — one study saw a ~28% math accuracy drop on a weaker model."
detectionSignals:
  - "Verbose padding — outputs routinely longer than the task needs, with preambles, restated questions, 'Certainly! Here is...' filler, and closing summaries."
  - "Oversized simple answers — a yes/no, a classification, or a single value comes back as multiple paragraphs."
  - "Output-heavy bill — output tokens are a large share of spend even though each request needs only a short answer."
  - "No length bound — nothing in the prompt constrains the response length or format."
measurementMethods:
  - "Output tokens per request — completion tokens tracked before vs. after adding brevity instructions."
  - "Output-to-consumed ratio — output tokens versus what the downstream consumer (UI, parser, next step) actually uses."
  - "Held-constant quality score — an eval set or human rating confirming brevity did not degrade answers."
  - "Per-task length percentiles — p50/p95 output length per task type, to catch terseness silently truncating needed detail."
status: published
lastUpdated: "2026-06-29"
related:
  - "output/max-token-policies"
  - "output/verbosity-controls"
  - "model-routing/reasoning-token-budgeting"
sources:
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Output tokens cost 5× input across current Claude models (Opus 4.8 $5 in / $25 out; Sonnet 4.6 $3 / $15; Haiku 4.5 $1 / $5)."
  - id: openai-pricing
    title: "Pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Output ≈ 6× input on the GPT-5.x family (GPT-5.5 $5 in / $30 out; GPT-5.4 $2.50 / $15; nano ~6.25×)."
  - id: gemini-pricing
    title: "Gemini Developer API pricing"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Gemini 2.5 Pro $1.25 in / $10 out (≤200k context) — an 8× output:input ratio, the top of the asymmetry range."
  - id: ccot
    title: "The Benefits of a Concise Chain of Thought on Problem-Solving in Large Language Models"
    publisher: "arXiv:2401.05618"
    authors: "Renze & Guven"
    year: 2024
    url: "https://arxiv.org/abs/2401.05618"
    accessed: "2026-06-29"
    kind: paper
    note: "A 'be concise' instruction cut average response length by 48.70% (per-token cost −22.67%) with negligible general accuracy impact — but a 27.69% math accuracy drop on GPT-3.5: the over-terseness risk."
  - id: chain-of-draft
    title: "Chain of Draft: Thinking Faster by Writing Less"
    publisher: "arXiv:2502.18600"
    authors: "Xu et al."
    year: 2025
    url: "https://arxiv.org/abs/2502.18600"
    accessed: "2026-06-29"
    kind: paper
    note: "Minimalist 'draft' reasoning steps reach comparable or better accuracy using as little as 7.6% of standard Chain-of-Thought tokens — brevity applied to the reasoning style itself."
  - id: caveman
    title: "Caveman: Reducing LLM Output Tokens with a Prompt Skill"
    publisher: "Better Stack Community"
    year: 2026
    url: "https://betterstack.com/community/guides/ai/caveman-llm/"
    accessed: "2026-06-29"
    kind: blog
    note: "A structured brevity prompt cut output tokens 45% vs. baseline and 39% vs. simply asking the model to 'be terse' — naive brevity instructions leave savings on the table."
  - id: anthropic-thinking
    title: "Extended thinking"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"
    accessed: "2026-06-29"
    kind: docs
    note: "Thinking tokens are billed as output tokens; brevity instructions shorten the visible response only, not the hidden reasoning trace — so length control has partial leverage on reasoning models."
---

## Overview

By default, most chat-tuned models are verbose. Ask a yes/no question and you get a
paragraph; ask for a value and you get the value wrapped in a preamble ("Certainly! Here is
the information you requested…"), a restatement of the question, and a closing summary. None
of that padding is free: every word of it is an **output token**, and on frontier rate cards
output tokens are the single most expensive thing you buy.

**Output Length Control** is the prompt-side discipline of telling the model how long the
answer should be — "be concise," "answer in one sentence," "return at most five bullet
points," "no preamble, just the value" — so it stops generating tokens the task does not need.
It is the cheapest possible lever: a few words in the prompt, no code, no infrastructure, no
new model. That is why it sits at **Level 0** — obvious-waste hygiene every product should
have on day one.

The reason it matters so much in 2026 is the **output/input price asymmetry**. Across the
major providers, output tokens are billed at roughly **4–8× the input rate**: Anthropic's
current models charge output at a flat **5×** input (Opus 4.8 is $5/M in, $25/M out),[^anthropic-pricing]
OpenAI's GPT-5.x family runs about **6×** ($5/M in, $30/M out on GPT-5.5),[^openai-pricing]
and Gemini 2.5 Pro sits at **8×** ($1.25/M in, $10/M out).[^gemini-pricing] A token you stop
the model from emitting is therefore worth several input tokens you trim. Practitioner and
academic measurements put the realistic savings from brevity instructions in the **40–70%
output-token** range with little quality cost on most tasks.[^ccot][^caveman]

This page is specifically about **prompt-side brevity**. It is distinct from — and complementary
to — two siblings in this category: *Max-Token Policies* sets a hard API cap (`max_tokens`)
that *truncates* rather than shapes,[^anthropic-thinking] and *Verbosity Controls* uses a
provider-tuned length parameter (e.g. a `verbosity` knob) instead of an instruction. Use all
three together; this one is the zero-effort first move.

## Detailed Approach & Techniques

### The core instructions

Output length control is a small family of prompt directives, ordered roughly from blunt to
precise:

- **Global terseness:** "Be concise. Omit preambles, restatements, and summaries." A blanket
  "be concise" alone already cuts average response length by roughly half on general tasks.[^ccot]
- **Explicit length targets:** "Answer in one sentence." / "Respond in at most 3 bullet
  points." / "Limit the explanation to ~50 words." Numeric targets are more reliable than
  vague adjectives because the model has something concrete to hit.
- **Format constraints that imply length:** ask for *just* the answer ("Return only the
  category name, nothing else"), a single value, or a fixed-shape list. Bounding the *shape*
  bounds the length.
- **Suppress the boilerplate:** explicitly forbid the common padding — "No introduction. Do
  not restate the question. Do not add a closing summary." A surprising fraction of output
  tokens on simple tasks are pure ceremony.

A naive "be terse" leaves money on the table: a *structured* brevity instruction measured at
**45% fewer output tokens than baseline and 39% fewer than a plain 'be terse'** prompt, because
it removes specific verbose patterns rather than gesturing at the idea.[^caveman] It is worth
investing a few sentences in *how* to be brief, not just *that* it should be.

### Brevity applied to the reasoning style

On tasks that need step-by-step work, you do not have to choose between "show all reasoning"
(expensive) and "no reasoning" (less accurate). You can constrain the *form* of the reasoning:
"think in terse shorthand notes, ~5 words per step." The **Chain of Draft** result is the
strong version of this — minimalist draft-style reasoning reached comparable or better accuracy
while using **as little as 7.6%** of the tokens of verbose chain-of-thought.[^chain-of-draft]
This is still prompt-side length control; it just targets the visible reasoning rather than
the final answer.

### The reasoning-model caveat — partial leverage

Here is the one place output length control loses some of its power. On **reasoning models**
(extended-thinking / "thinking" modes), the model emits a hidden reasoning trace *before* the
visible answer, and **those thinking tokens are billed at the output rate**.[^anthropic-thinking]
A prompt instruction to "be concise" shortens the **visible answer only** — it does **not**
shrink the hidden trace, which the model generates according to its own internal budget.[^anthropic-thinking]
So if a reasoning model "thinks" 4,000 tokens and then answers in 200, telling it to answer in
100 saves you 100 output tokens out of 4,100 — a rounding error.

The takeaway is not "don't do it" (the visible-answer savings are still real) but **"don't
expect full leverage on reasoning models."** To actually bound the expensive part, you need to
control the *thinking budget itself* — a `budget_tokens` / effort parameter — which is the
subject of *Reasoning-Token Budgeting*. Output length control and reasoning-token budgeting are
the two halves of "make a reasoning model emit fewer tokens"; this page covers the visible half.

### The quality risk — where terseness hurts

Brevity is not free of risk, which is why this technique is scored **Medium** on quality rather
than Low. The same study that found a ~49% length cut with negligible *general* accuracy impact
also found a **27.69% accuracy drop on math problems** for the weaker model when forced to be
concise — because compressing the answer also compressed the reasoning the model needed to get
it right.[^ccot] The failure mode is real:

- **Truncated reasoning:** on multi-step problems, an over-terse instruction can cut the working
  the model needs, lowering accuracy. (Constrain reasoning *style*, per Chain of Draft, rather
  than banning it.[^chain-of-draft])
- **Dropped caveats and edge cases:** "answer in one sentence" can suppress an important
  qualification, hedge, or safety note.
- **Lost structure** that a downstream consumer actually parsed.

The discipline is to apply length targets **per task type** and **verify with an eval that
quality holds**, not to slap "be brief" on every prompt globally. Measure output tokens *and*
a quality score together; only the pair tells you whether you optimized or just degraded.

## Example Where It Works

A SaaS product runs an **email-categorization** feature: for each incoming message it asks the
model to pick one of eight categories and a priority. The prompt never constrained the output,
so the model returns something like: *"Thank you for your question! Based on the content of this
email, I would categorize it as **Billing**. This is because the message mentions an invoice and
a payment dispute… I would assign it a **High** priority because the customer appears frustrated…"*
— around **120 output tokens** for what the application needs as two fields.

Adding one line — *"Respond with only the category and priority as `Category | Priority`. No
explanation."* — collapses the output to about **6 tokens**, a ~95% cut on this endpoint. On a
flagship model at an 8× output multiplier, output was the dominant cost of the call, so the
feature's per-request cost drops sharply.[^gemini-pricing] Because the downstream consumer is a
parser that only ever read the two fields, **quality is unchanged** — the eliminated tokens were
pure ceremony. This is the ideal case: a high-volume, narrow-output task where verbosity was
100% waste. Practitioner data shows this generalizes: 40–70% output savings on tasks that were
over-answering.[^ccot][^caveman]

## Example Where It Would NOT Work

- **Genuinely long-form output.** A feature whose *product value is* a thorough answer — a legal
  memo, a detailed code explanation, a long-form draft — cannot be made cheaper by "be concise"
  without making it worse. Here the output length *is* the deliverable; the lever to pull instead
  is a cheaper model (*Model Right-Sizing*) or batch pricing, not brevity.

- **Reasoning-heavy tasks on a weak model.** Forcing conciseness on math/logic work cut accuracy
  ~28% on a weaker model in controlled testing, because the answer and the reasoning were
  compressed together.[^ccot] On these tasks, constrain reasoning *style* (Chain of Draft) rather
  than banning it,[^chain-of-draft] and verify accuracy held.

- **Reasoning models where the cost lives in the hidden trace.** A model that "thinks" for
  thousands of tokens before a short answer gets almost no benefit from shortening the visible
  answer — the thinking tokens, billed as output, are untouched by a brevity instruction.[^anthropic-thinking]
  The right lever there is *Reasoning-Token Budgeting* (control the thinking budget), with output
  length control as a minor add-on.

- **When a typed knob or hard cap is the better tool.** If the provider exposes a tuned length
  parameter, *Verbosity Controls* gives more predictable length without spending prompt tokens or
  risking the model ignoring an instruction; and to *guarantee* a ceiling against runaways you
  still want a `max_tokens` cap from *Max-Token Policies*. Prompt brevity shapes the typical
  answer; it does not hard-bound the worst case.

[^anthropic-pricing]: Anthropic, "Pricing," Claude Platform Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^openai-pricing]: OpenAI API Docs, "Pricing" — <https://developers.openai.com/api/docs/pricing>
[^gemini-pricing]: Google, "Gemini Developer API pricing" — <https://ai.google.dev/gemini-api/docs/pricing>
[^ccot]: Renze & Guven, "The Benefits of a Concise Chain of Thought on Problem-Solving in Large Language Models," arXiv:2401.05618 — <https://arxiv.org/abs/2401.05618>
[^chain-of-draft]: Xu et al., "Chain of Draft: Thinking Faster by Writing Less," arXiv:2502.18600 — <https://arxiv.org/abs/2502.18600>
[^caveman]: Better Stack Community, "Caveman: Reducing LLM Output Tokens with a Prompt Skill" — <https://betterstack.com/community/guides/ai/caveman-llm/>
[^anthropic-thinking]: Anthropic, "Extended thinking," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
