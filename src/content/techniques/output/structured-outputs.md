---
title: "Structured Outputs"
category: output
maturityLevel: 1
maturityProvisional: false
shortDescription: "Have the provider guarantee schema-valid JSON (strict mode / JSON-schema output / function-call schemas) so you stop paying for the re-ask, retry, and format-repair loops that broken free-text parsing forces."
effort: Low
gain: Medium
riskToQuality: Medium
effortWhy: "Flip a flag — pass a JSON Schema or typed tool definition and switch on the provider's strict mode; grammar compiles once and caches."
gainWhy: "Indirect saving only — it removes the 5–15% parse-failure re-ask and repair calls, not raw tokens, so the gain is bounded."
riskWhy: "Forcing a rigid format before the model finishes thinking can degrade reasoning accuracy unless you reason in natural language first."
detectionSignals:
  - "Fragile parsing — model output is parsed with regex or string-slicing, and a non-trivial fraction of responses fail to parse."
  - "Re-ask loop — a retry / 'please return valid JSON' path exists, or a second 'repair' LLM call cleans up malformed output."
  - "Defensive scaffolding — downstream code wraps every parse in try/except and silently drops or re-requests failures."
  - "Pleading prompts — long 'respond ONLY with JSON, no prose' instructions the model still violates intermittently."
measurementMethods:
  - "Parse-failure rate — responses that don't validate against the expected schema ÷ total."
  - "Calls per success — calls-per-successful-structured-output (1.0 is the floor; >1.0 quantifies the re-ask/repair tax)."
  - "Retry/repair volume — count and token cost of retry and repair calls, before vs. after enabling strict output."
  - "Two-way quality eval — task-quality on a held-out set, run with and without the strict format, to catch reasoning regressions."
status: published
lastUpdated: "2026-06-29"
related:
  - "output/constrained-decoding"
  - "output/output-length-control"
  - "output/template-plus-fill"
sources:
  - id: openai-so-blog
    title: "Introducing Structured Outputs in the API"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/introducing-structured-outputs-in-the-api/"
    accessed: "2026-06-29"
    kind: blog
    note: "Strict Structured Outputs hits 100% schema adherence on OpenAI's eval vs <40% for gpt-4-0613 and worse for prompting alone. Implemented via constrained decoding over a context-free grammar compiled from the JSON Schema; first request with a new schema takes <10s (up to ~1 min for complex schemas), then the artifact is cached and repeat calls have no added latency."
  - id: openai-so-docs
    title: "Structured Outputs"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/structured-outputs"
    accessed: "2026-06-29"
    kind: docs
    note: "strict:true guarantees schema-valid output; the first request with a schema has extra latency to process it, subsequent identical-schema requests do not. Refusals and token-limit truncation are the documented edge cases that can still break validity. Not all JSON Schema features supported."
  - id: anthropic-so
    title: "Structured outputs"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
    accessed: "2026-06-29"
    kind: docs
    note: "Two mechanisms: JSON output via output_config.format (type json_schema, constrained sampling) and strict:true tool use. Grammar compilation is automatically cached for 24 hours. GA across current Claude models and on Bedrock / Vertex."
  - id: gemini-so
    title: "Structured output"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/structured-output"
    accessed: "2026-06-29"
    kind: docs
    note: "Configure a JSON response with a responseSchema / response_format of mime_type application/json over a supported JSON Schema subset; enum support for classification. Type-safe, parseable output for extraction and agentic workflows."
  - id: bedrock-so
    title: "Get validated JSON results from models (Structured outputs)"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html"
    accessed: "2026-06-29"
    kind: docs
    note: "JSON-schema output (outputConfig.textFormat / output_config.format / response_format) plus strict:true tool use across Converse + InvokeModel, batch and cross-region. New schemas compile (up to a few minutes), are cached 24h, after which latency is 'comparable to standard requests with minimal overhead.' Explicitly: eliminates retry loops and lowers operational cost."
  - id: tam-lmsf
    title: "Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models"
    publisher: "Tam, Wu, Tsai, Lin, Lee, Chen — arXiv:2408.02442"
    authors: "Zhi Rui Tam et al."
    year: 2024
    url: "https://arxiv.org/abs/2408.02442"
    accessed: "2026-06-29"
    kind: paper
    note: "Format restriction degrades reasoning: e.g. GPT-3.5-Turbo GSM8K 76.6% (free text) -> 49.25% (JSON-mode), ~27 pts; large drops on Last Letter Concatenation. Stricter formats hurt more. Mitigation: reason in natural language first, then convert to the format (NL-to-format)."
  - id: jsonschemabench
    title: "JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models"
    publisher: "Geng et al. — arXiv:2501.10868"
    authors: "Saibo Geng et al."
    year: 2025
    url: "https://arxiv.org/abs/2501.10868"
    accessed: "2026-06-29"
    kind: benchmark
    note: "Across 10K real-world schemas and 6 frameworks, constrained decoding can speed generation by ~50% (token fast-forwarding) and, with a good engine, *improved* downstream accuracy by up to ~4% on GSM8K / Last-Letter (e.g. GSM8K 80.1% -> 83.8%). Compliance/coverage varies widely by framework. Counterpoint to a blanket 'format hurts' claim — the engine and prompt design matter."
  - id: causal-so
    title: "Quantifying the Impact of Structured Output Format on Large Language Models through Causal Inference"
    publisher: "arXiv:2509.21791"
    year: 2025
    url: "https://arxiv.org/abs/2509.21791"
    accessed: "2026-06-29"
    kind: paper
    note: "Coarse metrics report positive, negative, or neutral effects of structured output; causal inference finds no causal impact in 43 of 48 scenarios on GPT-4o. Suggests reported reasoning regressions are often confounded by prompt/instruction effects, not the format per se."
---

## Overview

Many products need the model's answer as **data**, not prose: a JSON object to write to a
database, arguments for a function call, an extracted record, a classification label. The
naive way to get it is to *ask* — "respond only with JSON matching this shape" — and then
parse the text. That works most of the time and fails the rest of the time, and the failure
mode is expensive: a missing brace, a trailing comma, a stray markdown fence, or a
chatty preamble makes the parse throw, and the app responds with a **re-ask**, a **retry**,
or a **second "repair" LLM call** to clean up the mess.

**Structured Outputs** removes that failure class. Instead of asking nicely, you hand the
provider a **JSON Schema** (or a typed tool/function definition) and the provider
*guarantees* the response conforms to it, using constrained decoding — at each step the
sampler is restricted to tokens that keep the output valid against a grammar compiled from
your schema.[^openai-so-blog] OpenAI reports its strict mode hits **100% schema adherence**
on its own evaluation, versus **under 40%** for an older model and worse for prompting
alone.[^openai-so-blog] This same capability **absorbs JSON mode and function/tool-call
outputs** — those are just different delivery mechanisms for the same idea (a schema the
output must satisfy). It is distinct from **constrained decoding** as a self-hosted technique
(running your own grammar engine such as Outlines or XGrammar over an open-weight model — see
that page); here we mean the **managed, provider-side** feature you switch on with a flag.

The cost case must be framed honestly, because it is the most misunderstood part of this
technique:

- **The benefit is indirect.** Structured outputs do **not** reduce raw token counts. They
  remove the *re-ask / retry / repair* loops that broken parsing forces — each of which is a
  whole extra billed call. Eliminating a 5–15% parse-failure-and-retry rate is a 5–15%
  reduction in calls on that path, plus the deletion of any second "fix this JSON" model
  pass. That is the saving.[^bedrock-so]
- **The old "5–15% format overhead" claim is stale — delete it.** Constrained decoding used
  to imply a per-call tax. In 2026 the grammar is **compiled once and cached** (24h on
  Anthropic and Bedrock; a one-time per-schema processing step on OpenAI), so steady-state
  overhead is **effectively zero** — providers describe post-cache latency as "comparable to
  standard requests."[^anthropic-so][^bedrock-so][^openai-so-blog] Independent benchmarking
  finds constrained decoding can even be **~50% faster** than free generation via token
  fast-forwarding.[^jsonschemabench]

That low effort and zero steady-state overhead is why it sits at **Level 1**. The **Medium
risk** rating, and the reason it is not a slam-dunk, is a real quality caveat covered below.

## Detailed Approach & Techniques

### Provider support matrix (2026)

The feature is now broadly available; the surface differs slightly per provider but the
shape is the same — pass a schema, get guaranteed-valid output.

- **OpenAI — strict Structured Outputs.** Set `strict: true` with a JSON Schema (via
  `response_format`) or on a function/tool definition. Implemented as constrained decoding
  over a context-free grammar compiled from the schema. The **first** request with a new
  schema incurs processing latency (typically **<10s**, up to ~a minute for complex schemas);
  the compiled artifact is cached so **repeat calls have no added latency**. Not every JSON
  Schema feature is supported, and validity can still break on a **refusal** or a
  **token-limit truncation** — both are documented and programmatically detectable.[^openai-so-blog][^openai-so-docs]

- **Anthropic (Claude) — JSON output + strict tool use.** Two complementary mechanisms:
  `output_config.format` of type `json_schema` (constrained sampling to a schema), and
  `strict: true` on tool definitions (guarantees tool-name and tool-input validity). Grammar
  compilation is **automatically cached for 24 hours**, so overhead amortizes away. Generally
  available across current Claude models and on Bedrock / Vertex.[^anthropic-so]

- **Google Gemini.** Request a JSON response by setting a `responseSchema` / `response_format`
  with `mime_type: application/json` over a supported JSON Schema subset, with `enum` support
  for classification tasks — type-safe output aimed at extraction and agentic workflows.[^gemini-so]

- **Amazon Bedrock.** JSON-schema output (`outputConfig.textFormat` on Converse,
  `output_config.format` / `response_format` on InvokeModel) plus `strict: true` tool use,
  available across Converse, InvokeModel, **batch**, and cross-region inference. New schemas
  compile once (up to a few minutes), are **cached 24h**, after which latency is "comparable
  to standard requests with minimal overhead." Bedrock's own docs name the payoff: it
  "eliminates error rates and retry loops" and gives "lower operational costs."[^bedrock-so]

### How to capture the saving

1. **Define the schema once** and reuse it so the compiled grammar stays cache-warm.
   Constrain `additionalProperties: false`, mark `required` fields, and use `enum` for
   closed-set classifications — this is what makes the output trustworthy enough to **delete**
   the downstream try/except-and-retry scaffolding.
2. **Remove the parse-repair pass.** Once output is guaranteed valid, the second "fix this
   JSON" model call and the regex-cleanup heuristics can go. That deleted call is the
   clearest line-item saving.
3. **Handle the residual failure modes**, which are now *truncation* and *refusal*, not bad
   syntax: set `max_tokens` high enough that a valid object can complete (a cut-off object is
   still invalid JSON — see *Max-Token Policies*), and branch on the documented refusal
   signal rather than retrying blindly.[^openai-so-docs]

### The quality-risk caveat (this is the real catch)

Forcing a rigid format can **degrade reasoning accuracy** when the model is made to emit
schema fields *before* it has finished thinking. The Tam et al. "Let Me Speak Freely?" study
measured large drops on reasoning tasks under strict JSON formatting — e.g. GPT-3.5-Turbo on
GSM8K fell from **76.6% (free text) to 49.25% (JSON mode)**, roughly **27 points**, with
similarly steep drops on Last-Letter Concatenation, and stricter formats hurting more.[^tam-lmsf]
The mechanism: a schema like `{"answer": <int>}` invites the model to commit to the answer
token first, starving the chain-of-thought. When accuracy drops, you pay *again* in
retries, corrections, and human review — so a careless schema can **raise** total cost even
while every individual call is cheaper to parse.

The picture is genuinely **nuanced**, which is why this is a *caveat*, not a veto:

- **The engine and prompt matter.** JSONSchemaBench found that with a good constrained-decoding
  engine, structured generation **improved** downstream accuracy by up to ~4% on the same
  family of reasoning tasks (e.g. GSM8K **80.1% → 83.8%**), not degraded it.[^jsonschemabench]
- **Causal analysis is skeptical of a blanket effect.** A 2025 causal-inference study found
  that once you control for confounds, structured output had **no causal impact in 43 of 48
  scenarios** on GPT-4o — the swings reported by coarse metrics were largely driven by
  prompt/instruction differences, not the format itself.[^causal-so]

The robust, vendor-neutral rule that reconciles these: **let the model reason in natural
language first, then bind the result to the schema** — the "NL-to-format" mitigation the Tam
study recommends.[^tam-lmsf] In practice that means putting a free-text `reasoning` /
`scratchpad` field **first** in the schema (so the constrained format still leaves room to
think), or doing a reason-then-extract two-step. For pure extraction/classification with no
reasoning, strict output is close to free. For multi-step reasoning, design the schema to
preserve the chain-of-thought and **eval both ways before shipping**.

## Example Where It Works

A document-ingestion pipeline extracts a 14-field record (vendor, date, line items, totals)
from invoices at **200,000 docs/day**. Originally the prompt ended with "return only JSON,"
and roughly **8% of responses** failed to parse — a stray markdown fence, a hallucinated
extra field, or a truncated object — each triggering a re-ask, and a stubborn ~1% getting a
second "repair this JSON" model call. That is ~16,000 wasted full re-asks plus ~2,000 repair
calls **every day**, all pure overhead.

Switching to a strict JSON-schema output with `additionalProperties: false` and typed,
`required` fields makes the output **schema-valid by construction**, so the parse-failure
path — and the retry and repair calls on it — **goes away** almost entirely.[^openai-so-blog][^bedrock-so]
Because this is pure extraction with no reasoning to starve, there is no accuracy
penalty, the grammar compiles once and serves cache-warm with no per-call overhead, and the
team **deletes** the entire try/except-retry-repair subsystem. The saving is not fewer tokens
per call — it is ~18,000 fewer *calls* per day and a chunk of removed code.[^anthropic-so]

## Example Where It Would NOT Work

- **Reasoning forced into the schema first.** A math-tutoring or analytical-decision feature
  that wraps the answer in `{"answer": ...}` with no room to think can lose **10–30 points of
  accuracy** under strict formatting.[^tam-lmsf] Here strict output is a *false economy*:
  cheaper-to-parse calls but more wrong answers, which means more retries, escalations, and
  human review — net cost up. The fix isn't to drop structured output, it's to **reason in
  natural language first, then format** (a leading free-text field or a two-step pass).[^tam-lmsf][^jsonschemabench]

- **Low parse-failure baseline.** If your free-text JSON already parses **>99.5%** of the
  time on a simple shape with a capable model, there is almost no retry loop left to
  eliminate — the indirect saving is the retries you *avoid*, and there aren't many. The
  schema is still worth adding for type-safety and to delete defensive code, but don't expect
  a cost line to move.

- **Schema features the provider doesn't support, or self-hosting.** Providers support only a
  **subset** of JSON Schema (recursion, numeric/length constraints, and external `$ref` are
  commonly excluded), so a deeply nested or recursive schema may be rejected outright.[^openai-so-docs][^bedrock-so]
  And if you run your **own** open-weight models, the managed flag doesn't exist — you need a
  grammar engine in your serving stack, which is the separate *Constrained Decoding* technique.

- **Truncation masquerading as a "format bug."** With `max_tokens` set too low, a valid object
  gets cut mid-stream and fails to parse — so the guarantee appears to break. That's a
  budgeting problem, not a structured-output one; pair this with sane *Max-Token Policies*.[^openai-so-docs]

[^openai-so-blog]: OpenAI, "Introducing Structured Outputs in the API" — <https://openai.com/index/introducing-structured-outputs-in-the-api/>
[^openai-so-docs]: OpenAI API Docs, "Structured Outputs" — <https://developers.openai.com/api/docs/guides/structured-outputs>
[^anthropic-so]: Anthropic, "Structured outputs," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
[^gemini-so]: Google, "Structured output," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/structured-output>
[^bedrock-so]: Amazon Bedrock User Guide, "Get validated JSON results from models (Structured outputs)" — <https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html>
[^tam-lmsf]: Tam et al., "Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models," arXiv:2408.02442 — <https://arxiv.org/abs/2408.02442>
[^jsonschemabench]: Geng et al., "JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models," arXiv:2501.10868 — <https://arxiv.org/abs/2501.10868>
[^causal-so]: "Quantifying the Impact of Structured Output Format on Large Language Models through Causal Inference," arXiv:2509.21791 — <https://arxiv.org/abs/2509.21791>
