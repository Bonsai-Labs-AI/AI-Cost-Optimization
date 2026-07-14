---
title: "Post-Processing Instead of Generation"
category: output
maturityLevel: 2
maturityProvisional: false
shortDescription: "Move deterministic work — formatting, sorting, arithmetic, date/currency math, JSON shaping — out of the LLM and into code, so you stop paying output tokens (and error risk) for what code does perfectly and for free."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "The prompt asks the model to sort, filter, deduplicate, or count items that code could handle."
  - "The model is doing arithmetic, date math, unit conversion, or currency formatting inline in its answer."
  - "Long, highly-structured output blocks (Markdown tables, HTML, JSON, headers) are regenerated verbatim every call."
  - "You run regexes or string surgery to reformat/repair the model's output after the fact."
  - "Bugs traced to the model miscalculating a total, mis-sorting a list, or emitting slightly-wrong format."
measurementMethods:
  - "Output tokens per request before vs. after moving mechanical work to code."
  - "Error rate on the mechanical task (arithmetic/format/sort) — should fall to ~0 once code owns it."
  - "Share of output tokens that were deterministic/boilerplate vs. genuinely model-generated content."
  - "Post-hoc reformatting/repair passes eliminated per response."
status: published
lastUpdated: "2026-07-02"
related:
  - "output/template-plus-fill"
  - "output/structured-outputs"
  - "output/output-length-control"
  - "product-ux/ai-non-ai-hybrid-ux"
sources:
  - id: openai-so-announce
    title: "Introducing Structured Outputs in the API"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/introducing-structured-outputs-in-the-api/"
    accessed: "2026-07-02"
    kind: blog
    note: "Model behavior is inherently non-deterministic; constrained decoding guarantees schema-valid output (100% vs <40% for a non-strict model), removing the need for fragile post-processing to repair format."
  - id: openai-so-docs
    title: "Structured model outputs"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/structured-outputs"
    accessed: "2026-07-02"
    kind: docs
    note: "Reliable type-safety: no need to validate or retry incorrectly formatted responses; downstream code consumes the parsed object directly."
  - id: anthropic-tooluse
    title: "Tool use with Claude — Overview"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/tool-use/overview"
    accessed: "2026-07-02"
    kind: docs
    note: "Claude responds directly for stable knowledge and calls out to code/tools for work that maps to a tool's capability; strict:true guarantees schema-conformant tool calls."
  - id: anthropic-advanced-tools
    title: "Introducing advanced tool use on the Claude Developer Platform"
    publisher: "Anthropic — Engineering"
    year: 2026
    url: "https://www.anthropic.com/engineering/advanced-tool-use"
    accessed: "2026-07-02"
    kind: blog
    note: "Code is a natural fit for orchestration logic — loops, conditionals, data transformations; keeping intermediate results in code (not the model's tokens) cut a task's tokens from ~200KB to ~1KB."
  - id: anthropic-calc
    title: "Using a calculator tool with Claude"
    publisher: "Anthropic — Claude Cookbook"
    year: 2026
    url: "https://platform.claude.com/cookbook/tool-use-calculator-tool"
    accessed: "2026-07-02"
    kind: repo
    note: "Worked example of handing arithmetic to a deterministic calculator instead of asking the model to compute it."
  - id: moveo-why
    title: "Why LLMs Struggle: Math, Structured Data & AI Reasoning Limits"
    publisher: "Moveo.ai"
    year: 2025
    url: "https://moveo.ai/blog/why-llm-struggle"
    accessed: "2026-07-02"
    kind: blog
    note: "\"Language is statistical. Arithmetic is rule based.\" Tokenization breaks numbers; recommendation: do not ask an LLM to be a calculator, ask it to plan, explain, and call one."
  - id: scale-gsm1k
    title: "A Careful Examination of LLM Performance on Grade School Arithmetic (GSM1k)"
    publisher: "Scale AI — Labs / SEAL"
    year: 2024
    url: "https://labs.scale.com/papers/llm-performance-grade-school-arithmetic"
    accessed: "2026-07-02"
    kind: paper
    note: "On a fresh grade-school-math set, several models drop up to ~13% vs GSM8k — evidence LLM arithmetic is fragile/overfit rather than robustly correct."
  - id: dataiku-structured
    title: "Taming LLM outputs: your guide to structured text generation"
    publisher: "Dataiku"
    year: 2025
    url: "https://www.dataiku.com/stories/blog/your-guide-to-structured-text-generation"
    accessed: "2026-07-02"
    kind: blog
    note: "Decompose: generate the answer without formatting constraints, then translate it into the properly-formatted response in a second (code) step."
---

## Overview

An LLM is charged by the token, and **output tokens are the most expensive tokens it
produces**. Yet a large fraction of what many prompts ask the model to *emit* is not
reasoning or language at all — it is mechanical work: sort this list, add up these
numbers, format the total as USD, wrap the result in a Markdown table, upper-case the
headings, reshape the fields into JSON. Every one of those tokens is (a) paid for on
every call and (b) a place the model can get it subtly wrong.

**Post-processing instead of generation** means drawing a hard line: the model produces
only the *judgment* and *language* that genuinely require a model, and **deterministic
code does everything mechanical afterwards**. The model returns a small structured
payload — the facts, the decisions, the raw values — and your application sorts,
computes, formats, and renders it.

This is a rare **double win**. Code is deterministic and correct; an LLM is a statistical
text predictor that "language is statistical, arithmetic is rule based"[^moveo-why] — it
pattern-matches numbers and formats and is *unreliable* at exactly the tasks code nails.
So moving mechanical work into code **cuts cost** (fewer output tokens, no repair passes)
**and raises quality** (the arithmetic is now always right, the format always valid) at
the same time.[^openai-so-announce][^moveo-why] It sits at **Level 2** because doing it
well is deliberate engineering — you have to identify the deterministic seams, design the
structured payload, and build the rendering code — not a config toggle.

## Detailed Approach & Techniques

### The catalogue: "don't make the LLM do this"

Each item below is a task where an LLM spends output tokens *and* introduces error risk,
while a few lines of code are free and exact. Delete the model's involvement:

- **Formatting / markup.** Markdown tables, HTML, bullet layout, headings, indentation,
  code fences. Have the model emit the *data*; a template or serializer emits the markup.
- **Sorting, filtering, ranking, deduplication, counting.** Ordering a list, dropping
  duplicates, top-N selection, tallying. These are one-liners in code and a classic place
  models drift (miscount, mis-order, drop an item on long lists).[^anthropic-advanced-tools]
- **Arithmetic & aggregation.** Sums, percentages, averages, totals, line-item math. LLMs
  "genuinely can't do deterministic arithmetic reliably" because tokenization fractures
  numbers and long carry chains are rare in training data.[^moveo-why]
- **Date, time, currency, and unit math.** "Days until", timezone conversion, `$1,234.50`
  formatting, kg↔lb. Locale-aware libraries do this perfectly; the model does not.
- **JSON / schema shaping.** Renaming keys, nesting, type coercion, enum mapping. Constrain
  the *shape* with structured outputs, then reshape in code — don't prompt-engineer JSON by
  hand.[^openai-so-docs]
- **Case, whitespace, and string surgery.** Capitalization, trimming, slugifying, escaping.
  Deterministic string functions, not tokens.

### The pattern

1. **Separate judgment from mechanics.** Ask: *does this step need language understanding
   or a decision?* If yes, keep it in the model. If it is a rule you could write down
   exactly, it belongs in code.[^moveo-why]
2. **Have the model return a minimal structured payload**, not a finished document — the
   raw facts and decisions only. **Structured outputs / strict tool schemas** make that
   payload reliable: the provider constrains decoding so the object always matches your
   schema (OpenAI reports 100% schema adherence with Structured Outputs vs <40% without),
   so downstream code can consume it directly with "no need to validate or retry
   incorrectly formatted responses."[^openai-so-announce][^openai-so-docs][^anthropic-tooluse]
3. **Do the mechanical work in code**: sort, compute, format, render into the final
   Markdown/HTML/JSON/prose skeleton. This is the "generate first, format second"
   decomposition — produce the answer without formatting constraints, then translate it
   into the formatted response in a deterministic step.[^dataiku-structured]
4. **For live agents, push the mechanics to a tool/code step instead of the context.**
   "Code is a natural fit for orchestration logic, such as loops, conditionals, and data
   transformations"; keeping those intermediate results in code rather than the model's
   token stream cut one task from ~200KB to ~1KB of tokens.[^anthropic-advanced-tools] A
   calculator or code-execution tool is the canonical way to hand arithmetic to a
   deterministic engine.[^anthropic-calc]

### The boundary: what MUST stay in the LLM

The line is **judgment and language vs. mechanics**. Keep in the model: understanding a
messy request, extracting entities/sentiment, deciding *which* items matter, writing
genuinely free-form prose, summarizing. Push to code: everything downstream that follows a
fixed rule.[^moveo-why] The model should "plan, explain, and call" the deterministic
engine — not *be* the engine.[^moveo-why] Crossing the line the wrong way is the failure
mode: asking the model to be a calculator, when a fresh grade-school-math benchmark shows
models dropping **up to ~13%** in accuracy versus a memorized set — evidence their
arithmetic is fragile, not robust.[^scale-gsm1k]

**Where this pushes to L3.** Simple offloading is L2. When the post-processing becomes a
*sophisticated pipeline* — a validation/repair layer with schema checks and retries, a
rules engine, deterministic aggregation over model-extracted structured data at scale,
programmatic tool-calling where the model writes and runs code — you are into
Level-3 territory. The technique is the same seam; the engineering investment is larger.

## Example Where It Works

A finance app generates a **monthly account summary**: total spend, per-category
breakdown, top 5 merchants, month-over-month change, all in a formatted Markdown report.

- **Generation approach (before):** the prompt sends every transaction and asks the model
  to *compute* the totals and percentages, *sort* categories, pick the *top 5*, and *emit*
  the full ~800-token Markdown report. It pays for every one of those output tokens, and it
  periodically ships a wrong total or a mis-sorted list — arithmetic errors dominate exactly
  this kind of multi-step calculation.[^moveo-why][^scale-gsm1k]
- **Post-processing approach (after):** code aggregates the transactions (sums, sorts,
  top-N, MoM delta — all exact and free). The LLM is used *only* for the parts that need
  language — e.g. a one-sentence natural-language insight ("spending on travel rose sharply
  this month") — returned as a tiny structured payload via structured outputs.[^openai-so-docs]
  A template renders the report. Output tokens collapse from ~800 to a few dozen, the
  numbers are now **always correct**, and no regex repair pass is needed. Cost down,
  quality up.[^openai-so-announce][^dataiku-structured]

## Example Where It Would NOT Work

- **Genuinely free-form generation.** A creative brief, a nuanced email reply, an
  open-ended explanation — there is no deterministic rule to extract; the "mechanical" and
  the "language" are the same thing. Trying to template it produces rigid, worse output.
  (When the doc is *mostly* boilerplate with a few variable slots, *Template-Plus-Fill* is
  the right adjacent technique; pure prose is not.)
- **The formatting itself requires judgment.** Deciding *how* to structure an ambiguous
  answer, choosing what to emphasize, or laying out content whose shape depends on meaning
  is a model decision, not a code rule — forcing it into a fixed template loses fidelity.
- **One-off / low-volume work.** If a mechanical step runs rarely, the engineering to
  extract the payload, build the renderer, and maintain it can cost more than the tokens it
  saves. Post-processing pays off at **volume and repetition**; for a handful of calls,
  letting the model format inline is cheaper to *build*.
- **When the model's tool/code call is heavier than the task.** Spinning up a code
  interpreter for a single trivial addition can be more expensive (latency and tokens) than
  the addition it replaces[^anthropic-calc] — reserve the offload for work that is either
  error-prone in the model or token-heavy to emit.

[^openai-so-announce]: OpenAI, "Introducing Structured Outputs in the API," 2024 — <https://openai.com/index/introducing-structured-outputs-in-the-api/>
[^openai-so-docs]: OpenAI API Docs, "Structured model outputs" — <https://developers.openai.com/api/docs/guides/structured-outputs>
[^anthropic-tooluse]: Anthropic, "Tool use with Claude — Overview," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/tool-use/overview>
[^anthropic-advanced-tools]: Anthropic Engineering, "Introducing advanced tool use on the Claude Developer Platform" — <https://www.anthropic.com/engineering/advanced-tool-use>
[^anthropic-calc]: Anthropic Claude Cookbook, "Using a calculator tool with Claude" — <https://platform.claude.com/cookbook/tool-use-calculator-tool>
[^moveo-why]: Moveo.ai, "Why LLMs Struggle: Math, Structured Data & AI Reasoning Limits" — <https://moveo.ai/blog/why-llm-struggle>
[^scale-gsm1k]: Scale AI Labs (SEAL), "A Careful Examination of LLM Performance on Grade School Arithmetic (GSM1k)" — <https://labs.scale.com/papers/llm-performance-grade-school-arithmetic>
[^dataiku-structured]: Dataiku, "Taming LLM outputs: your guide to structured text generation" — <https://www.dataiku.com/stories/blog/your-guide-to-structured-text-generation>
