---
title: "Output Length Control"
category: output
maturityLevel: 1
maturityProvisional: false
shortDescription: "Combine prompt-side brevity instructions with deliberate per-task max_token ceilings to stop the model from generating more tokens than the task needs — directly cutting the most expensive token class on every frontier rate card."
effort: Low
gain: High
riskToQuality: Medium
effortWhy: "A few words in the prompt plus one config field per endpoint — no code, no infrastructure, no new model."
gainWhy: "Brevity instructions realistically cut output tokens 40–70% on tasks that were over-answering; max_token caps eliminate runaway-completion tail cost on the expensive per-output rate."
riskWhy: "Over-terse instructions can compress needed reasoning (one study saw a ~28% math accuracy drop on a weaker model); a too-low cap on a reasoning model truncates the visible answer while you still pay for the thinking tokens."
detectionSignals:
  - "Verbose padding — outputs routinely longer than the task needs, with preambles, restated questions, 'Certainly! Here is...' filler, and closing summaries."
  - "Oversized simple answers — a yes/no, a classification, or a single value comes back as multiple paragraphs."
  - "Output-heavy bill — output tokens are a large share of spend even though each request needs only a short answer."
  - "No length bound — nothing in the prompt constrains the response length or format, and no max_tokens cap is set per endpoint."
  - "Unbounded calls — one large default max_tokens copied to every endpoint regardless of task, or no cap at all."
  - "Runaway completions — a classifier or extractor that should return a few tokens sometimes emits hundreds or thousands."
  - "Paid-for-nothing truncation — on reasoning models, answers come back truncated or empty (finish_reason 'length' / status 'incomplete') yet the bill still shows reasoning tokens."
  - "Heavy long tail — p95/p99 output-token length per endpoint sits far above the median, an expensive tail nobody bounded."
measurementMethods:
  - "Output tokens per request — completion tokens tracked before vs. after adding brevity instructions."
  - "Output-to-consumed ratio — output tokens versus what the downstream consumer (UI, parser, next step) actually uses."
  - "Held-constant quality score — an eval set or human rating confirming brevity did not degrade answers."
  - "Per-task length percentiles — p50/p95 output length per task type, to catch terseness silently truncating needed detail."
  - "Percentile vs. cap — p95/p99 output tokens per endpoint compared against the configured ceiling (which should sit comfortably above p99 of legitimate answers)."
  - "Truncation rate — fraction of responses ending with finish_reason 'length' / status 'incomplete', which should be near zero on normal traffic."
  - "Reasoning-token share — reasoning_tokens ÷ total output on capped calls, to confirm the cap leaves room for the visible answer."
  - "Tail cost — spend from the top 1% longest completions, before vs. after caps."
status: published
lastUpdated: "2026-07-14"
related:
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
    title: "API pricing"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Output ≈ 6× input on the GPT-5.x family (GPT-5.5 $5 in / $30 out; GPT-5.4 $2.50 / $15; nano ~6.25×). Output dominance is why an unbounded completion is the expensive failure mode."
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
    title: "Extended thinking — max_tokens and budget_tokens"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/extended-thinking"
    accessed: "2026-06-29"
    kind: docs
    note: "Thinking tokens are billed as output tokens; brevity instructions shorten the visible response only, not the hidden reasoning trace. budget_tokens must be set to a value less than max_tokens (except with interleaved thinking). usage.output_tokens_details.thinking_tokens reports the share."
  - id: anthropic-messages
    title: "Messages API — max_tokens parameter"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/api/messages"
    accessed: "2026-06-29"
    kind: docs
    note: "max_tokens is 'the maximum number of tokens to generate before stopping'; the model may stop before reaching it. Different models have different maximum values for this parameter."
  - id: openai-reasoning
    title: "Reasoning models — controlling costs with max_output_tokens"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning"
    accessed: "2026-06-29"
    kind: docs
    note: "max_output_tokens limits the total tokens generated INCLUDING reasoning, visible output, and non-visible formatting tokens. If the cap is hit before visible output starts, you get status 'incomplete' — paying for input and reasoning but receiving no answer. OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when starting."
  - id: openai-length
    title: "Controlling the length of OpenAI model responses"
    publisher: "OpenAI Help Center"
    year: 2026
    url: "https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses"
    accessed: "2026-06-29"
    kind: docs
    note: "Token caps help manage cost (you pay per token) and latency. Reasoning models (o-series, GPT-5) require max_completion_tokens (alias of max_tokens). There is no minimum-tokens setting — specify a minimum in the prompt if needed."
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

By default, most chat-tuned models are verbose. Ask a yes/no question and you get a
paragraph; ask for a value and you get the value wrapped in a preamble ("Certainly! Here is
the information you requested…"), a restatement of the question, and a closing summary. None
of that padding is free: every word of it is an **output token**, and on frontier rate cards
output tokens are the single most expensive thing you buy.

**Output Length Control** combines two complementary mechanisms that should always travel
together:

1. **Prompt-side brevity** — telling the model how long the answer should be ("be concise,"
   "answer in one sentence," "return only the category name"), so it stops generating tokens
   the task does not need.
2. **Hard max_token caps** — setting a deliberate per-task ceiling on the API call so a
   single malformed input or model digression cannot run away into thousands of billed output
   tokens.

Both address the same root cost, but from different angles: brevity instructions shape the
*typical* answer; max_token caps bound the *worst case*. Neither alone is sufficient —
prompt brevity doesn't prevent rare runaways, and a hard cap doesn't reduce median verbosity.

The reason they both matter so much in 2026 is the **output/input price asymmetry**. Across
the major providers, output tokens are billed at roughly **4–8× the input rate**: Anthropic's
current models charge output at a flat **5×** input (Opus 4.8 is $5/M in, $25/M out),[^anthropic-pricing]
OpenAI's GPT-5.x family runs about **6×** ($5/M in, $30/M out on GPT-5.5),[^openai-pricing]
and Gemini 2.5 Pro sits at **8×** ($1.25/M in, $10/M out).[^gemini-pricing] A token you stop
the model from emitting is worth several input tokens you trim. Practitioner and academic
measurements put the realistic savings from brevity instructions in the **40–70% output-token**
range with little quality cost on most tasks.[^ccot][^caveman]

This technique sits at **Level 1** because it is low effort — a few words in the prompt and
one config field per endpoint, no code, no infrastructure, no new model — but the reasoning-model
footguns (discussed below) require some care.

## Detailed Approach & Techniques

### Part 1: Prompt-side brevity instructions

Output length control through the prompt is a small family of directives, ordered roughly
from blunt to precise:

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

### Part 2: Hard max_token caps per task type

Every chat/completion endpoint exposes a hard ceiling on how many tokens the model may
generate in one response — `max_tokens` on Anthropic, `max_completion_tokens` /
`max_output_tokens` on OpenAI's reasoning models, and the equivalent on Gemini and
Bedrock.[^anthropic-messages][^openai-length] The cap is not a single global number. Size it
per endpoint from the observed output-length distribution of *legitimate* answers, then place
the ceiling comfortably above the p99 of that distribution so normal traffic never trips it
but a runaway is bounded:

- **Classification / routing / yes-no:** tens of tokens.
- **Structured extraction / short answers:** low hundreds.
- **Summaries / drafted messages:** several hundred to a couple thousand.
- **Long-form generation:** a few thousand, sized to the actual artifact.

Because there is **no "minimum tokens" setting**, a cap only ever *truncates* — if you need a
floor, ask for it in the prompt.[^openai-length] When the cap is hit, the provider signals it
(OpenAI: `finish_reason: "length"` / `status: "incomplete"` with `incomplete_details` reason
`max_output_tokens`), which is the signal to monitor for mis-set caps.[^openai-reasoning]

The cap is the runaway guard; it does not shrink median outputs. That day-to-day shrinking
comes from the prompt-side instructions above and from verbosity parameters (the
*Verbosity Controls* technique). Think of the cap as the safety rail that sits behind both.

### The 2026 footgun: reasoning/thinking tokens and max_tokens

This is the fact that makes max_token policies require care on reasoning models, and it
behaves **differently across providers**:

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

The unifying failure mode: **a cap set for the visible answer alone, applied to a model that
thinks, truncates the answer while you still pay for the thinking.** A worked example: a
request with `max_tokens: 10` came back with **empty content but a non-zero thinking-token
bill** — money out, no answer.[^tokenmix-trap]

On a reasoning model, set the cap to roughly **4× the expected visible output**: thinking
typically consumes 1–2× the visible output, so a 4× ceiling leaves headroom for the model
to finish reasoning *and* emit the full answer.[^tokenmix-trap] Track the **reasoning-token share**
of capped calls and raise the cap if thinking is eating a large fraction. Note that older
`max_tokens` is **deprecated for OpenAI reasoning models** — they require
`max_completion_tokens`.[^openai-length]

### The reasoning-model caveat for prompt brevity — partial leverage

The same reasoning-model dynamic also limits what prompt brevity can do. On **reasoning models**
(extended-thinking / "thinking" modes), the model emits a hidden reasoning trace *before* the
visible answer, and **those thinking tokens are billed at the output rate**.[^anthropic-thinking]
A prompt instruction to "be concise" shortens the **visible answer only** — it does **not**
shrink the hidden trace, which the model generates according to its own internal budget. So if
a reasoning model "thinks" 4,000 tokens and then answers in 200, telling it to answer in
100 saves you 100 output tokens out of 4,100 — a rounding error.

The takeaway is not "don't do it" (the visible-answer savings are still real) but **"don't
expect full leverage on reasoning models."** To actually bound the expensive part, you need to
control the *thinking budget itself* — a `budget_tokens` / effort parameter — which is the
subject of *Reasoning-Token Budgeting*. Output length control and reasoning-token budgeting are
the two halves of "make a reasoning model emit fewer tokens"; this page covers the visible half.

### The quality risk — where terseness hurts

Brevity is not free of risk, which is why this technique carries a **Medium** quality risk rating.
The same study that found a ~49% length cut with negligible *general* accuracy impact also found a
**27.69% accuracy drop on math problems** for the weaker model when forced to be concise — because
compressing the answer also compressed the reasoning the model needed to get it right.[^ccot] The
failure modes are real:

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
feature's per-request cost drops sharply.[^gemini-pricing][^ccot][^caveman]

Completing the picture: the team also sets `max_tokens: 16` on this endpoint — well above the
longest legitimate label, far below any runaway. Normal traffic never trips it (the model stops
on its own after the two fields), the truncation rate stays at zero, and the expensive long tail
simply disappears.[^anthropic-messages] Because the downstream consumer is a parser that only
ever reads the two fields, **quality is unchanged** — all the eliminated tokens were pure
ceremony. This is the ideal case for both levers working together: a high-volume, narrow-output
task on a non-reasoning model.

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
  answer via prompt instruction — the thinking tokens, billed as output, are untouched.[^anthropic-thinking]
  And a tight max_token cap on such a model can backfire: set `max_completion_tokens: 400` on a
  hard analytical question and the reasoning phase may exhaust the entire budget before the
  visible answer starts, returning **`incomplete` with no usable content — yet the reasoning
  tokens are billed at the output rate.**[^openai-reasoning][^tokenmix-trap] The right moves are
  a correctly sized cap (≥4× expected visible output, never below the provider's reasoning
  reservation) combined with *Reasoning-Token Budgeting* to actually reduce the thinking.

- **Miscalibrated caps on reasoning models — the silent money-loser.** A well-meaning engineer
  copies a tight classifier cap onto a reasoning-model endpoint and ends up paying more, not less:
  the model burns its budget on internal reasoning, returns nothing visible, and a user retry
  triggers another full-priced call. A hard ceiling is a guard rail, not a cost lever; treating
  it as the latter on a model that thinks is how a "savings" change becomes a regression.[^openai-reasoning][^tokenmix-trap]

[^anthropic-pricing]: Anthropic, "Pricing," Claude Platform Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^openai-pricing]: OpenAI API Docs, "API pricing" — <https://developers.openai.com/api/docs/pricing>
[^gemini-pricing]: Google, "Gemini Developer API pricing" — <https://ai.google.dev/gemini-api/docs/pricing>
[^ccot]: Renze & Guven, "The Benefits of a Concise Chain of Thought on Problem-Solving in Large Language Models," arXiv:2401.05618 — <https://arxiv.org/abs/2401.05618>
[^chain-of-draft]: Xu et al., "Chain of Draft: Thinking Faster by Writing Less," arXiv:2502.18600 — <https://arxiv.org/abs/2502.18600>
[^caveman]: Better Stack Community, "Caveman: Reducing LLM Output Tokens with a Prompt Skill" — <https://betterstack.com/community/guides/ai/caveman-llm/>
[^anthropic-thinking]: Anthropic, "Extended thinking," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
[^anthropic-messages]: Anthropic, "Messages API," Claude Platform Docs — <https://platform.claude.com/docs/en/api/messages>
[^openai-reasoning]: OpenAI API Docs, "Reasoning models" — <https://developers.openai.com/api/docs/guides/reasoning>
[^openai-length]: OpenAI Help Center, "Controlling the length of OpenAI model responses" — <https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses>
[^tokenmix-trap]: TokenMix, "Thinking Tokens Trap: How Reasoning Models Burn max_tokens" — <https://tokenmix.ai/blog/thinking-tokens-billing-trap-2026>
