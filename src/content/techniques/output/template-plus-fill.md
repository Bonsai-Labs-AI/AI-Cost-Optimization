---
title: "Template-Plus-Fill Generation"
category: output
maturityLevel: 2
maturityProvisional: false
shortDescription: "Have the model emit only the variable fields of a document and let deterministic code render the fixed boilerplate around them — so the LLM writes ~50 tokens instead of ~800 on repetitive structured outputs."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "The model regenerates the same boilerplate (greeting, headings, legal footer, section scaffolding) on every call."
  - "Outputs are long but ~70–90% fixed structure with only a few genuinely variable values."
  - "Templated artifacts — confirmation emails, product descriptions, status reports, summaries with fixed sections — are produced by free-form generation."
  - "Output tokens dominate the bill on a high-volume, format-repetitive workload."
measurementMethods:
  - "Output tokens per document before vs. after (full generation vs. slots-only)."
  - "Share of the old output that was boilerplate (fixed text ÷ total output tokens)."
  - "Blended $/document, weighting output tokens at their (higher) price."
  - "Schema-validity / render-success rate of the slot payload."
status: published
lastUpdated: "2026-07-02"
related:
  - "output/structured-outputs"
  - "output/post-processing-instead-of-generation"
  - "output/output-length-control"
sources:
  - id: openai-so-guide
    title: "Structured model outputs"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/structured-outputs"
    accessed: "2026-07-02"
    kind: docs
    note: "Structured Outputs guarantees the response adheres to a supplied JSON Schema; strict:true constrains decoding to the schema. The delivery mechanism for emitting only defined slots."
  - id: openai-so-announce
    title: "Introducing Structured Outputs in the API"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/introducing-structured-outputs-in-the-api/"
    accessed: "2026-07-02"
    kind: blog
    note: "Constrained decoding masks schema-invalid tokens to zero probability; gpt-4o-2024-08-06 scores 100% on complex JSON-schema following vs <40% for gpt-4-0613."
  - id: anthropic-so
    title: "Structured outputs"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs"
    accessed: "2026-07-02"
    kind: docs
    note: "Constrained decoding with compiled grammars; additionalProperties:false makes Claude emit only the declared fields. JSON outputs + strict tool use."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Output tokens are billed at a multiple of input — Opus 4.8 is $5/M input vs $25/M output (5×); Sonnet 4.6 is $3 vs $15 (5×)."
  - id: msft-token-efficiency
    title: "Token efficiency with structured output from language models"
    publisher: "Microsoft — Data Science + AI at Microsoft"
    authors: "B. Williams"
    year: 2024
    url: "https://medium.com/data-science-at-microsoft/token-efficiency-with-structured-output-from-language-models-be2e51d3d9d5"
    accessed: "2026-07-02"
    kind: benchmark
    note: "Same task, GPT-4o: function calling used 213 completion tokens vs 370 for a JSON message — a 42% reduction; YAML 260 (−30%). Constraining the output shape cuts output tokens."
  - id: pristren-output
    title: "How to Reduce LLM Output Tokens by 40–60% Without Losing Quality"
    publisher: "Pristren"
    year: 2026
    url: "https://pristren.com/blog/reduce-output-tokens-guide/"
    accessed: "2026-07-02"
    kind: blog
    note: "Output tokens are 3–6× more expensive than input tokens across major providers; abbreviated JSON keys cut key-token overhead ~50–55%."
---

## Overview

A large share of "generated" text in production AI products is not really generated at
all — it is **boilerplate the code already knows**: the greeting and sign-off of a
confirmation email, the fixed section headings of a status report, the legal footer, the
scaffolding of a product description ("Material: … · Dimensions: … · Care: …"). Asking the
LLM to re-emit that fixed structure on every request means paying **output-token price**
to reproduce text that never changes.

Template-Plus-Fill inverts the responsibility. The **fixed template is owned by
deterministic code**; the model is asked to produce only the **variable slots** — usually
as a small structured payload — and the application renders the final document. The model
writes tens of tokens instead of hundreds, and code assembles the rest for free.

This targets the most expensive token category. **Output tokens are billed at a multiple
of input tokens** — Anthropic's Opus 4.8 is $5/M input vs **$25/M output** (5×), and Sonnet
is $3 vs $15 — so trimming generated text has an outsized effect on cost.[^anthropic-pricing][^pristren-output]
Because the template is deterministic and only slot *content* is model-generated, quality
risk is low: the boilerplate can no longer drift, be mis-formatted, or hallucinate. It sits
at **Level 2** because doing it well requires real (but modest) engineering — designing the
templates, defining a slot schema, and wiring structured outputs — rather than a config
toggle.

## Detailed Approach & Techniques

### The pattern

1. **Split the artifact into fixed vs. variable.** Everything that is constant across
   documents (labels, headings, disclaimers, layout) becomes a **code-owned template**.
   Everything that genuinely varies per request (a name, a price, a one-line summary, a
   sentiment label, a recommendation) becomes a **slot**.
2. **Ask the model only for the slots**, delivered as a structured object.
3. **Render deterministically.** Code drops the slot values into the template
   (string template, Jinja/Handlebars, JSX, etc.) and produces the final document.

The saving is the difference between generating the whole document and generating only the
slots. On a document that is, say, 800 output tokens of which ~750 are fixed structure and
~50 are variable, the model now emits **~50 tokens instead of ~800** — a ~90% output-token
cut on that document, with the fixed 750 rendered by code at zero marginal cost.

### Structured outputs are the delivery mechanism

The slots are best requested via **structured outputs**, which constrain the model to a
JSON Schema so the payload is always parseable and contains exactly the declared fields.
OpenAI's Structured Outputs "ensures the model will always generate responses that adhere
to your supplied JSON Schema"; enabling `strict: true` uses **constrained decoding** —
masking schema-invalid tokens to zero probability at each step — and the announcement
reports a **perfect 100%** score on complex JSON-schema following for
`gpt-4o-2024-08-06`, versus **under 40%** for an older model.[^openai-so-guide][^openai-so-announce]
Anthropic's structured outputs do the same with compiled-grammar constrained decoding, and
setting **`additionalProperties: false`** guarantees the model emits *only* the fields you
defined — no stray prose to pay for or strip.[^anthropic-so]

Constraining the output shape is itself a token saving even before templating: on the same
task with GPT-4o, **function calling used 213 completion tokens versus 370 for a free-form
JSON message — a 42% reduction** (YAML landed in between at 260, −30%).[^msft-token-efficiency]
Template-Plus-Fill compounds this by removing the boilerplate from the payload entirely, so
the slot object carries only values, not restated structure. Keeping slot **keys short**
("t" instead of "title") trims key-token overhead by a further ~50–55% where a schema has
many fields.[^pristren-output]

### Design notes

- **Keep judgment in the model, mechanics in code.** The model should produce the words and
  decisions that require language or reasoning; the template handles layout, ordering, and
  any fixed phrasing. (Pushing *all* mechanical work — sorting, math, formatting — out of
  the model is the sibling technique, *Post-Processing Instead of Generation*.)
- **Validate then render.** Because the payload is schema-constrained it is safe to parse
  directly; a render-success/validity metric catches the rare miss.
- **Versioned templates.** Since the template is code, copy changes ship as a deploy — no
  re-prompting, no regeneration cost, and every document updates consistently.
- **Small models suffice.** Filling a handful of well-specified slots is far easier than
  writing a whole document, so the workload often right-sizes down to a cheaper model,
  multiplying the output-token saving.

### Where it sits relative to neighbours

Template-Plus-Fill is the *output-shaping* step; **structured outputs** is how the slots are
delivered; and **post-processing instead of generation** is the next tier — moving *all*
deterministic work (formatting, arithmetic, sorting, dedup) out of the LLM into code.
Together they express one principle: **don't pay the model to produce anything code can
produce.**

## Example Where It Works

An e-commerce platform generates a **product description** for each of 200,000 SKUs and
refreshes them monthly. Each description follows a fixed house format: a headline, a
two-sentence blurb, and a bulleted spec table with fixed labels (Material, Dimensions,
Weight, Care, Warranty).

- **Free-form generation:** the model writes the whole description — headline + blurb +
  fully labelled spec block — at roughly **500 output tokens** each, re-emitting the fixed
  labels and layout every time.
- **Template-Plus-Fill:** code owns the layout and the labels; the model returns a strict
  JSON object with just `{headline, blurb, material, dimensions, weight, care, warranty}` —
  roughly **90 output tokens**. Code renders the rest.

That is an **~80% output-token reduction per description**. Because output tokens dominate
the bill and are billed at ~5× input on flagship models,[^anthropic-pricing] the monthly
generation cost falls by a large multiple — and, as a bonus, the labels and layout can no
longer be mangled by the model. Batching these slot-only calls through a cheaper model and
the Batch API compounds the win further.

## Example Where It Would NOT Work

- **Genuinely free-form generation.** A long-form blog post, an open-ended chat reply, a
  bespoke legal argument, or a nuanced customer-support message has **no fixed template** —
  nearly every token is variable. There is no boilerplate to hoist into code, so
  Template-Plus-Fill has nothing to save and would only straitjacket the output.
- **Low structure-to-variable ratio.** If a document is 90% unique prose and 10% fixed
  chrome, the template captures only the 10% — a marginal saving that rarely justifies
  building and maintaining the template + slot schema.
- **High template churn.** If the "fixed" structure actually changes constantly per request
  (different sections, different ordering, conditional blocks that the model must decide),
  the template stops being deterministic and you are back to letting the model generate the
  structure. Here *output-length control* and *reasoning-token budgeting* are the better
  levers, not template-fill.
- **Where format fidelity is safety-critical and the schema can't capture it.** If the exact
  wording of the variable content carries legal/medical weight, a constrained slot may drop
  nuance; the saving is real but should be gated behind an eval before shipping.

[^openai-so-guide]: OpenAI API Docs, "Structured model outputs" — <https://developers.openai.com/api/docs/guides/structured-outputs>
[^openai-so-announce]: OpenAI, "Introducing Structured Outputs in the API," 2024 — <https://openai.com/index/introducing-structured-outputs-in-the-api/>
[^anthropic-so]: Anthropic, "Structured outputs," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
[^anthropic-pricing]: Anthropic, "Pricing," Claude Platform Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^msft-token-efficiency]: B. Williams, "Token efficiency with structured output from language models," Data Science + AI at Microsoft — <https://medium.com/data-science-at-microsoft/token-efficiency-with-structured-output-from-language-models-be2e51d3d9d5>
[^pristren-output]: Pristren, "How to Reduce LLM Output Tokens by 40–60% Without Losing Quality" — <https://pristren.com/blog/reduce-output-tokens-guide/>
