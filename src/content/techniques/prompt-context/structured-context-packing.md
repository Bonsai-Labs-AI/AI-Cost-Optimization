---
title: "Structured Context Packing"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Lay out the context you send — format, ordering, delimiters, deduplication — so the model uses fewer tokens and attends better, without changing how much information you provide."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Prompts assembled ad-hoc with inconsistent or heavy delimiters (verbose JSON, repeated headers, decorative separators) rather than a deliberate format."
  - "The same context (a document, a rule set, a schema) is pasted more than once in a single prompt."
  - "Volatile per-request data (timestamps, user IDs, the query) is interleaved with or placed before the stable system/tool/document blocks, breaking the cacheable prefix."
  - "Prompt format ignores the target model's conventions (e.g. no XML structure for Claude, or heavy Markdown pushed onto a model that ignores it)."
  - "Long tabular data is sent as verbose prose or deeply-nested JSON instead of a compact table."
measurementMethods:
  - "Input tokens per call before vs. after re-packing the same information (tiktoken or the provider usage object)."
  - "Prefix-cache hit rate (cached input tokens ÷ total input tokens) before vs. after reordering static-first / volatile-last."
  - "Task quality held at bar on the eval suite while token count drops."
  - "Duplicate-content token share removed (tokens saved by deduplicating restated context)."
status: published
lastUpdated: "2026-07-02"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "prompt-context/context-window-budgeting"
  - "prompt-context/few-shot-example-pruning"
  - "caching-reuse/cache-aware-agent-design"
sources:
  - id: anthropic-bestpractices
    title: "Prompting best practices"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "XML tags help Claude parse complex prompts unambiguously; wrap each content type in its own tag; nest documents in <document> tags; put long-form data at the top — queries at the end can improve response quality by up to 30% in tests."
  - id: openai-gpt5
    title: "GPT-5 prompting guide"
    publisher: "OpenAI Cookbook"
    year: 2026
    url: "https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide"
    accessed: "2026-07-02"
    kind: docs
    note: "GPT-5 does not format final answers in Markdown by default; use Markdown only where semantically correct. Structured XML specs improve instruction adherence. Contradictory instructions are more damaging to GPT-5 because it spends reasoning tokens reconciling them."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Caching references the full prefix across tools, system, and messages in that order; the cached portion must be at the start of the input. Put stable content first, request-specific material later."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-07-02"
    kind: docs
    note: "Put static content (instructions, examples) at the beginning of the prompt and variable content at the end to maximize automatic prefix-cache hits."
  - id: openai-md-tokens
    title: "Markdown is 15% more token efficient than JSON"
    publisher: "OpenAI Developer Community"
    year: 2024
    url: "https://community.openai.com/t/markdown-is-15-more-token-efficient-than-json/841742"
    accessed: "2026-07-02"
    kind: benchmark
    note: "tiktoken measurement: the same data was 13,869 tokens as JSON and 11,612 as Markdown (~16% fewer); YAML 12,333, TOML 12,503."
---

## Overview

You have already decided *what* information the model needs. **Structured context
packing** is about *how* you lay that information out in the prompt so it costs fewer
input tokens and the model attends to it better — without dropping any of the content.
It is the sibling of context budgeting and pruning, but a distinct lever: budgeting and
pruning decide *how much* context to send; packing decides the *shape* of whatever you
do send.

The cost problem it solves is quiet but persistent. The same facts can be serialized in
ways that differ by 15–30% in token count — deeply-nested JSON with quotes and braces on
every field versus a compact Markdown table, for example.[^openai-md-tokens] The same
information can be restated two or three times across a system prompt, a tool description,
and a few-shot example. And the *order* in which the blocks are placed decides whether the
provider's prefix cache fires or misses — a purely mechanical choice that can swing input
cost by an order of magnitude.[^anthropic-pc][^openai-pc-docs] None of these change the
answer the model should give; they change what you pay to get it, and often the quality of
the parse on the way in.

Because doing it well requires knowing the target model's format conventions, reasoning
about cache prefixes, and verifying against an eval that quality held, it is a
**Level 2** technique — deliberate layout engineering, not a one-line config toggle.

## Detailed Approach & Techniques

### 1. Use the target model's native format

Format is not neutral: each model family has a serialization it parses most reliably, and
matching it improves both accuracy and, indirectly, token economy.

- **Claude → XML tags.** Anthropic's guidance is explicit: "XML tags help Claude parse
  complex prompts unambiguously, especially when your prompt mixes instructions, context,
  examples, and variable inputs." Wrap each content type in its own descriptive tag
  (`<instructions>`, `<context>`, `<input>`), and nest documents — `<document index="n">`
  with `<source>` and `<document_content>` subtags — so the model never confuses data with
  instructions.[^anthropic-bestpractices]
- **GPT-5 → Markdown / section specs.** GPT-5 "does not format its final answers in
  Markdown" by default, and the guide advises using "Markdown **only where semantically
  correct** (e.g. `inline code`, code fences, lists, tables)." For structuring the *prompt*
  itself, OpenAI reports that "structured XML specs like `<[instruction]_spec>` improved
  instruction adherence," used to label distinct behavioral domains.[^openai-gpt5]
- **JSON where code parses the output.** JSON earns its heavier syntax when a downstream
  parser consumes the result (structured outputs). For context you are *feeding in*, a
  compact table or key–value list is usually cheaper — one tiktoken comparison put the same
  data at 13,869 tokens as JSON versus 11,612 as Markdown, roughly 16% fewer.[^openai-md-tokens]

The takeaway is not "always use format X" but "pick the format the model is tuned for, and
pick the *lightest* representation that still parses" — verbose framing that the model
ignores is pure token waste.

### 2. Order for cache efficiency: static-first, volatile-last

Provider prefix caching only matches a **contiguous prefix from the start of the input**.
Anthropic caches "reference the full prefix across tools, system, and messages, in that
order," and the cached portion "must be at the start of the input."[^anthropic-pc] OpenAI's
automatic caching gives the same rule from the other side: "put static content at the
beginning of the prompt and variable content at the end."[^openai-pc-docs]

So the packing order that maximizes cache hits is:

> tool definitions → system instructions → long-lived shared context / documents →
> durable few-shot examples → **then** the per-request user query and any volatile data
> (timestamps, IDs, session state).

A single volatile token placed early — a request ID at the top of the system prompt —
diverges the prefix and forces everything after it to be re-billed at full price. This is
the direct tie-in to prompt/prefix caching: packing *order* is what makes that discount
reachable in the first place.

### 3. Deduplicate restated context

The same information often appears more than once in an assembled prompt: a rule stated in
the system prompt and again in a tool description; a document quoted in context and again
inside a few-shot example; boilerplate repeated across retrieved chunks. Every repetition
is input tokens paid on every call. State each fact **once**, in the block the model will
attend to, and reference it elsewhere rather than re-pasting.

Beyond cost, redundancy carries a quality tax on reasoning models: OpenAI warns that
"contradictory or vague instructions can be more damaging to GPT-5 than to other models, as
it expends reasoning tokens searching for a way to reconcile the contradictions."[^openai-gpt5]
Restated-but-slightly-different context is a common source of exactly those contradictions.

### 4. Use references and IDs instead of re-pasting

When the same entity, document, or record is needed in several places, assign it a short
identifier once and refer to it by ID afterward, rather than inlining the full text each
time. This is standard in multi-document prompts — Anthropic recommends indexing documents
(`<document index="1">`) precisely so later instructions can point to "document 1" instead
of quoting it again.[^anthropic-bestpractices] In agent loops, keep prior tool results
addressable by ID so a later step can cite a result instead of the model re-emitting it.

### 5. Compact representations and lean delimiters

- **Tables over prose for tabular data.** A list of records rendered as prose ("The first
  item is X, priced at Y, in category Z…") costs far more tokens than a Markdown or CSV
  table conveying the same rows, and models parse the table more reliably.[^openai-md-tokens]
- **Drop redundant delimiters.** Decorative separators, repeated section banners, and
  double-wrapping (JSON *inside* an XML tag *inside* Markdown) add tokens without adding
  signal. One clear delimiter per block is enough.
- **Put long-form data at the top, the query at the end** for long-context prompts.
  Anthropic notes this ordering, with the query last, "can improve response quality by up
  to 30% in tests, especially with complex, multi-document inputs" — a rare case where the
  cheaper layout is also the higher-quality one.[^anthropic-bestpractices]

### 6. Verify against an eval

Because packing changes both token count and how the model reads the prompt, confirm on a
quality-cost eval that the answer quality held while tokens dropped. This is why the
technique sits at L2: the gain is real but the safe version is measured, not assumed.

## Example Where It Works

A contract-analysis assistant on Claude assembles each prompt from a 2,000-token system
prompt, three retrieved clauses (~4,000 tokens), a 6-example few-shot block (~3,000 tokens),
and the user's question. As originally built, the retrieved clauses were pasted as prose,
the same governing-law rule appeared in both the system prompt and two of the examples, and
a per-request timestamp and matter ID were prepended to the system block "for logging."

Re-packing:

- Move the timestamp and matter ID to the **end**, after the question, restoring a stable
  prefix so tools + system + few-shots + documents cache; on Anthropic's cache the reused
  prefix now bills at 0.1× instead of full price.[^anthropic-pc]
- Wrap each clause in `<document index="n">` tags and render clause metadata as a compact
  table, cutting the retrieved-context tokens and improving parse reliability.[^anthropic-bestpractices]
- State the governing-law rule **once** and reference it by name in the examples, removing
  two full restatements.[^openai-md-tokens]

The result is a materially smaller, cache-friendly prompt whose answer quality is unchanged
or slightly better (the query now sits last, the layout Anthropic associates with up to a
30% quality lift on multi-document inputs).[^anthropic-bestpractices] All of the original
information is still present — only its shape changed.

## Example Where It Would NOT Work

- **Tiny, one-shot prompts.** A 200-token classification prompt with a short instruction
  and a single input has almost nothing to pack: no repeated blocks, no cache prefix worth
  protecting, no long tables. The engineering effort exceeds the few tokens saved.
- **Genuinely unstructured context.** If the payload is a single free-form document that
  must be sent verbatim (a legal filing that cannot be summarized or tabulated), there is
  no redundant framing to strip — the tokens are the content. Here *budgeting/pruning* or
  retrieval (send less) is the lever, not re-formatting.
- **When the real problem is volume, not layout.** Packing reduces overhead around the
  information; it does not reduce the information. A prompt that is expensive because it
  stuffs 100k tokens of marginally-relevant context needs `context-window-budgeting` and
  chunk reduction, not a tidier delimiter scheme — reordering a bloated prompt just yields a
  well-organized bloated prompt.
- **Chasing format micro-optimizations against quality.** Aggressively stripping delimiters
  or forcing an unnatural compact format can hurt parse accuracy; the ~16% token win from
  Markdown-over-JSON is worthless if it drops task quality below bar, which is why the
  eval gate is mandatory.[^openai-md-tokens]

[^anthropic-bestpractices]: Anthropic, "Prompting best practices," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>
[^openai-gpt5]: OpenAI, "GPT-5 prompting guide," OpenAI Cookbook — <https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^openai-md-tokens]: OpenAI Developer Community, "Markdown is 15% more token efficient than JSON" — <https://community.openai.com/t/markdown-is-15-more-token-efficient-than-json/841742>
