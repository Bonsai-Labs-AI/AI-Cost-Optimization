---
title: "Few-Shot Example Pruning"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Cut the number and length of in-context examples to the minimum that holds quality — every few-shot example is input tokens re-billed on every single call, and modern reasoning models often need fewer or zero."
effort: Medium
gain: Medium
riskToQuality: Medium
effortWhy: "Pruning safely requires an eval set to ablate examples against; the change itself is trivial once you can measure quality."
gainWhy: "Removes fixed input tokens from every call — modest per call, but compounds across high volume and stacks with caching."
riskWhy: "Over-pruning can quietly drop accuracy on rare/edge classes or break output format; the eval gate is what keeps it Medium not High."
detectionSignals:
  - "A long, static block of 10+ few-shot examples that was set once and never revisited."
  - "Many-shot example blocks sent to a reasoning/instruction-following model (o-series, GPT-5.x, Claude 4.x)."
  - "Examples that merely restate what the instructions or the output schema already specify."
  - "Few-shot examples dominate the input token count while the actual user input is short."
  - "No evaluation ever ran to justify how many examples are included."
measurementMethods:
  - "Input tokens per call before vs. after pruning (the fixed example block is pure savings)."
  - "Task quality on a held-out eval suite at each example count (ablation curve) — confirm quality holds at the bar."
  - "Per-class / edge-case accuracy, not just aggregate score, to catch rare-case regressions."
  - "Blended cost per request, and cache-write savings if the example block was being cached."
status: published
lastUpdated: "2026-07-02"
related:
  - "prompt-context/prompt-cleanup"
  - "prompt-context/dynamic-few-shot-selection"
  - "visibility-measurement/quality-cost-evaluation-suite"
  - "prompt-context/context-window-budgeting"
sources:
  - id: openai-reasoning
    title: "Reasoning best practices"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning-best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "\"Reasoning models often don't need few-shot examples to produce good results, so try to write prompts without examples first.\" Few-shot is a fallback for complex output requirements; misaligned examples can degrade results."
  - id: anthropic-multishot
    title: "Prompting best practices (multishot / examples)"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/multishot-prompting"
    accessed: "2026-07-02"
    kind: docs
    note: "\"Include 3–5 examples for best results.\" Examples should be relevant, diverse (cover edge cases without teaching unintended patterns), and wrapped in <example>/<examples> tags."
  - id: openai-prompt-guidance
    title: "Prompt guidance"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-guidance"
    accessed: "2026-07-02"
    kind: docs
    note: "OpenAI's eval-driven prompt guidance: start from a prompt/tool set that works, then remove one group of instructions, examples, or tools at a time and rerun the same evals — the subtractive, eval-driven principle behind empirical pruning."
  - id: manyshot-icl
    title: "Many-Shot In-Context Learning"
    publisher: "arXiv:2404.11018 (NeurIPS 2024)"
    authors: "Agarwal, Singh, Zhang, et al."
    year: 2024
    url: "https://arxiv.org/abs/2404.11018"
    accessed: "2026-07-02"
    kind: paper
    note: "Scaling from few-shot to hundreds/thousands of examples gives significant gains on hard generative/discriminative tasks and can override pretraining biases — the counter-case where MORE examples earn their tokens. Inference cost grows linearly in shots."
  - id: deepmind-manyshot
    title: "Many-Shot In-Context Learning (publication page)"
    publisher: "Google DeepMind"
    year: 2024
    url: "https://deepmind.google/research/publications/88349/"
    accessed: "2026-07-02"
    kind: paper
    note: "Publisher landing page for the many-shot ICL work; harder tasks benefit most from many examples."
---

## Overview

Few-shot (or *multishot*) prompting — pasting worked input→output examples into the
prompt — is one of the most reliable ways to steer an LLM's format, tone, and
accuracy.[^anthropic-multishot] But every example is **input tokens that are re-billed
on every single call**. A block of a dozen examples can quietly become the largest,
most-repeated line item in a prompt, paid tens of thousands of times a day while the
actual user input is a single short sentence.

Few-shot example pruning is the discipline of **cutting the example set down to the
minimum that still holds quality** — trimming redundant examples, shortening verbose
ones, and (increasingly) dropping the block entirely when clear instructions plus an
output schema already do the job. The lever is empirical: ablate examples against an
evaluation suite and keep only the ones that carry marginal value.

The reason this sits at **Level 2** rather than being a trivial cleanup is the **2026
shift in what models need**. Instruction-following and reasoning models are far better
at following a written spec than the GPT-3.5-era models whose prompts most teams
inherited. OpenAI's guidance for reasoning models is now explicit: *"Reasoning models
often don't need few-shot examples to produce good results, so try to write prompts
without examples first."*[^openai-reasoning] Worse, for reasoning-heavy tasks, examples
can *actively hurt* by biasing the model toward the surface pattern of the
demonstrations instead of letting it reason to the answer.[^openai-reasoning] Many
prompts are still carrying a large few-shot block that predates the current model and
now costs tokens for zero — or negative — benefit.

## Detailed Approach & Techniques

### Start from the model, not the prompt

The first question is which regime you are in:

- **Reasoning / strong instruction-followers** (OpenAI o-series and GPT-5.x reasoning,
  Claude Opus/Sonnet 4.x with thinking). Default to **zero-shot**: write the
  instructions and the schema, run the eval, and add examples only if a *measured*
  failure mode appears.[^openai-reasoning] This mirrors OpenAI's own eval-driven prompt
  guidance: start from a prompt and tool set that already works, then **remove** one group of
  instructions, examples, or tools at a time and rerun the same evals to find what actually
  earns its place.[^openai-prompt-guidance]
- **Classic completion / lighter models.** Examples still pull real weight here, but
  Anthropic's own guidance caps the useful count low: **"Include 3–5 examples for best
  results."**[^anthropic-multishot] If a prompt has 15 examples, that is a strong prior
  that 10+ of them are redundant.

### Prune empirically against an eval set

Pruning "by feel" is how quality silently regresses. Do it as a measured experiment
(this is why a *quality-cost evaluation suite* is the hard prerequisite):

1. **Baseline.** Run the current prompt with all N examples against the eval set; record
   aggregate quality **and per-class / edge-case accuracy** and input tokens/call.
2. **Ablate.** Remove examples one at a time (or in halves — bisect for speed) and
   re-score. An example whose removal doesn't move the metric is not earning its tokens.
3. **Try zero.** Explicitly test the no-example prompt. On modern models it frequently
   ties the few-shot version — which converts the entire block to savings.
4. **Keep the survivors.** Retain the smallest set that holds quality at the bar,
   biasing retention toward examples that cover **rare/edge classes** the instructions
   can't easily describe.
5. **Re-check per-class metrics**, not just the average — over-pruning shows up as a
   cliff on the tail classes long before it dents the headline score.

### Shorten, don't just delete

Beyond dropping whole examples, compress the ones you keep: trim examples to the minimal
input needed to demonstrate the pattern, strip prose commentary that repeats the
instructions, and remove examples that merely re-teach the output schema (the schema
already enforces that). Wrapping the survivors in `<example>`/`<examples>` tags keeps
them parseable and lets the model distinguish them from instructions.[^anthropic-multishot]

### Where few-shots still earn their tokens

Pruning is not "always remove examples." Keep them where they demonstrably pay:

- **Format-locking.** When you need an exact, hard-to-describe output shape, one or two
  examples are cheaper and more reliable than a paragraph of formatting rules.[^anthropic-multishot]
- **Rare / edge classes.** A demonstration of the unusual case (an empty result, a
  refusal, an ambiguous input) teaches behavior that is awkward to specify in prose.
- **Style / voice transfer.** Matching a specific tone is often learned faster from
  examples than described.[^anthropic-multishot]
- **The many-shot counter-case.** For genuinely hard tasks, scaling *up* to hundreds or
  thousands of examples can beat few-shot and even rival fine-tuning, and can override
  pretraining biases.[^manyshot-icl][^deepmind-manyshot] If your task is in that regime,
  the right move may be *more* examples plus **prompt caching** to make the fixed block
  cheap — not pruning. Note that inference cost grows linearly with shots,[^manyshot-icl]
  so many-shot is a deliberate quality-for-cost trade, not a default.

### Sequencing with related techniques

Pruning removes examples that don't help *any* query. When examples do help but *which*
ones depends on the query, the Level-3 move is **dynamic few-shot selection** — retrieve
only the most relevant K examples per request rather than shipping a static block. Prune
first (cheap, static), then graduate to selection if a static minimal set still can't
cover a diverse query distribution.

## Example Where It Works

A support-ticket classifier was migrated from an older completion model to a current
reasoning model but kept its original prompt: **14 few-shot examples** (~2,600 tokens)
in front of each ticket. It handles ~400,000 tickets/day.

Running the existing eval suite, the team finds the reasoning model scores **within
noise** on a zero-shot prompt (clear label definitions + a JSON schema) versus the
14-shot prompt — except two rare labels ("legal escalation", "data-deletion request")
that drop a few points without a demonstration. They keep **2 examples** for those edge
classes and delete the other 12.

The static block goes from ~2,600 to ~450 tokens — roughly **2,150 tokens removed from
every one of ~400,000 calls/day**. Aggregate quality holds at the bar; the tail-class
accuracy is protected by the two retained examples. Because the example block had been a
cached prefix, they also stop paying the cache-write cost on the deleted portion. Low
risk here precisely *because* the eval gated the change.

## Example Where It Would NOT Work

- **No eval, high stakes.** Pruning a medical-coding or legal-classification prompt "to
  save tokens" without a held-out eval that measures **per-class** accuracy is how you
  ship a silent regression on exactly the rare cases few-shots were protecting. Without
  the measurement gate, don't prune.
- **Genuinely hard tasks in the many-shot regime.** For difficult reasoning or
  distribution-shifted tasks, the research shows performance climbing well past a handful
  of examples, sometimes into the hundreds — even overriding pretraining
  biases.[^manyshot-icl][^deepmind-manyshot] Aggressively cutting to 3–5 here trades away
  real accuracy; the correct lever is caching the large block, not pruning it.
- **Tiny, already-minimal prompts.** If a prompt has one format-locking example on a
  short input, the savings are negligible and the risk of breaking output structure
  outweighs it — spend the effort elsewhere (e.g. *context-window-budgeting* on the
  retrieved-document side, which usually dwarfs the example block).
- **Query-dependent relevance.** If different queries genuinely need different examples,
  a single pruned static set will underperform; that is the signal to move to **dynamic
  few-shot selection** rather than to keep cutting.

[^openai-reasoning]: OpenAI API Docs, "Reasoning best practices" — <https://developers.openai.com/api/docs/guides/reasoning-best-practices>
[^anthropic-multishot]: Anthropic, "Prompting best practices" (multishot / examples), Claude API Docs — <https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/multishot-prompting>
[^openai-prompt-guidance]: OpenAI API Docs, "Prompt guidance" — <https://developers.openai.com/api/docs/guides/prompt-guidance>
[^manyshot-icl]: Agarwal, Singh, Zhang, et al., "Many-Shot In-Context Learning," arXiv:2404.11018 (NeurIPS 2024) — <https://arxiv.org/abs/2404.11018>
[^deepmind-manyshot]: Google DeepMind, "Many-Shot In-Context Learning" (publication page) — <https://deepmind.google/research/publications/88349/>
