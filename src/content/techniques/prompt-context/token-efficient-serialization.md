---
title: "Token-Efficient Serialization"
category: prompt-context
maturityLevel: 1
maturityProvisional: false
shortDescription: "Choose a compact wire format (CSV/TSV, markdown tables, YAML, or TOON) for structured/tabular data you put into a prompt or request back out, instead of verbose JSON whose repeated keys, braces, and quotes cost extra tokens for the same information."
effort: Low
gain: Medium
riskToQuality: Low
effortWhy: "A serialization step at the prompt boundary — encode records as CSV/TSV/TOON on the way in and parse the model's compact reply on the way out; no model, caching, or infra changes."
gainWhy: "Commonly 30–60% fewer tokens on tabular/uniform payloads (up to ~62% for TSV vs pretty JSON), but only on the structured-data portion of the prompt, so blended savings depend on how much of the bill is tabular."
riskWhy: "Format-only change that preserves information; the residual risk is parse fragility (CSV escaping) or losing structure on nested data — mitigated by keeping strict JSON where a schema-validated parse is required."
detectionSignals:
  - "Prompts carry large arrays of same-shape records (RAG rows, tool/function results, catalog rows, few-shot tables) serialized as pretty-printed JSON."
  - "The same field keys are repeated on every row/object, dominating the token count of the payload."
  - "The app asks the model to RETURN a JSON array of many objects that a downstream step will parse deterministically."
  - "Input tokens are dominated by injected data records rather than instructions or free text."
measurementMethods:
  - "Token-count the exact same data in each candidate format with the target model's tokenizer (tiktoken cl100k_base / o200k_base) and compare."
  - "Input-token cost per request before vs. after the format switch, on representative payloads."
  - "Parse-failure / repair rate of the model's output in the compact format vs. JSON (share of responses needing a retry or repair cycle)."
  - "Task accuracy on a held-out retrieval/extraction set to confirm the compact format did not hurt comprehension."
status: published
lastUpdated: "2026-07-21"
related:
  - "prompt-context/structured-context-packing"
  - "output/structured-outputs"
  - "prompt-context/context-reduction"
  - "rag/retrieval-chunk-deduplication"
sources:
  - id: toon-repo
    title: "TOON — Token-Oriented Object Notation (spec, benchmarks, TypeScript SDK)"
    publisher: "toon-format/toon — GitHub"
    year: 2025
    url: "https://github.com/toon-format/toon"
    accessed: "2026-07-21"
    kind: repo
    note: "TOON blends YAML-style indentation for nested objects with a CSV-style tabular layout for uniform arrays. Published benchmark: 39.9% fewer tokens than JSON with 76.4% vs 75.0% retrieval accuracy across 209 questions on 4 models (Claude Haiku, Gemini Flash, GPT-5 Nano, Grok-4). On flat-only data TOON uses ~5.9% MORE tokens than CSV; on non-uniform/deeply-nested data its advantage disappears."
  - id: finops-token-economics
    title: "Token Economics: The Atomic Unit of AI Value"
    publisher: "FinOps Foundation"
    year: 2025
    url: "https://www.finops.org/insights/token-economics-the-atomic-unit-of-ai-value/"
    accessed: "2026-07-21"
    kind: blog
    note: "Frames data format as a cost lever: 'CSV, TSV, and newer formats designed specifically for LLM consumption (such as TOON) consume thirty to sixty percent fewer tokens than JSON for equivalent tabular data.'"
  - id: jangwook-formats
    title: "Stop Feeding Raw JSON to Your LLM — I Measured Token Cost Across 9 Data Formats"
    publisher: "jangwook.net"
    year: 2025
    url: "https://jangwook.net/en/blog/en/llm-token-cost-data-format-experiment/"
    accessed: "2026-07-21"
    kind: benchmark
    note: "tiktoken o200k_base measurements. Flat data (50 records) vs pretty JSON baseline: TSV −62.0%, CSV −60.0%, markdown table −54.0%, compact JSON −37.5%, YAML −23.5%, XML +15.7%. Nested data (20 orders): compact JSON −45.7%, YAML −30.9% — tabular formats can't represent it."
  - id: gilbertson-tsv
    title: "LLM Output Formats: Why JSON Costs More Than TSV"
    publisher: "David Gilbertson — Medium"
    year: 2025
    url: "https://david-gilbertson.medium.com/llm-output-formats-why-json-costs-more-than-tsv-ebaf590bd541"
    accessed: "2026-07-21"
    kind: blog
    note: "Applies to OUTPUT: 'JSON uses twice as many tokens as TSV' on the same dataset (~50% reduction), and JSON output 'routinely takes four times as long.' Columnar formats save tokens because each key appears once instead of being repeated per record."
  - id: tiktoken-repo
    title: "tiktoken — a fast BPE tokeniser for use with OpenAI's models"
    publisher: "openai/tiktoken — GitHub"
    year: 2026
    url: "https://github.com/openai/tiktoken"
    accessed: "2026-07-21"
    kind: repo
    note: "OpenAI's byte-pair-encoding tokenizer; encodings cl100k_base (GPT-4-era) and o200k_base (GPT-4o / GPT-5 family). Explains why punctuation and repeated keys turn into billable tokens; ~4 bytes/token on average."
  - id: infoq-toon
    title: "New Token-Oriented Object Notation (TOON) Hopes to Cut LLM Costs by Reducing Token Consumption"
    publisher: "InfoQ"
    year: 2025
    url: "https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/"
    accessed: "2026-07-21"
    kind: blog
    note: "Reports a worked example: TOON ~55% fewer tokens vs pretty JSON, 25% vs compact JSON, 38% vs YAML; notes TOON adds ~5% header/declaration overhead to improve accuracy, and that for non-uniform data JSON may be more efficient, for deeply nested objects YAML may be more efficient, and for flat datasets CSV remains most compact."
  - id: toon-arxiv
    title: "Token-Oriented Object Notation vs JSON: A Benchmark of Plain and Constrained Decoding Generation"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/html/2603.03306v1"
    accessed: "2026-07-21"
    kind: paper
    note: "Benchmarks TOON, plain JSON, and JSON-with-constrained-decoding across 21 models. Compact-format savings can be eaten by a fixed instruction 'prompt tax'; on complex hierarchies TOON failed at first attempt (0% one-shot) and its repair cycles doubled token usage; constrained decoding rescues weak models but degraded a strong model's one-shot accuracy (92.5%→35% before repair)."
  - id: rotascale-structured
    title: "Structured Output Isn't Reliable Output"
    publisher: "Rotascale"
    year: 2026
    url: "https://rotascale.com/blog/structured-output-isnt-reliable-output/"
    accessed: "2026-07-21"
    kind: blog
    note: "Schema/JSON-mode compliance is not semantic correctness: 'these give you schema compliance, not semantic reliability.' Relevant when weighing a strict-JSON structured-output mode (reliable parse) against an ad-hoc compact format."
---

## Overview

Every value you put into a prompt is billed by the token, and every structured payload has
to be *serialized* to text before the model sees it. The default choice — pretty-printed
JSON — is one of the most token-expensive ways to encode the same information. JSON repeats
every field **key on every record**, wraps strings in quotes, and spends tokens on braces,
brackets, commas, colons, and indentation whitespace. None of that punctuation carries
information the model needs; it is pure structural overhead that a byte-pair tokenizer still
turns into billable tokens.[^tiktoken-repo]

Token-efficient serialization is the practice of choosing a **compact wire format** for the
structured or tabular data you inject into context (and, symmetrically, ask the model to
return). For flat arrays of same-shape records, CSV/TSV or a markdown table carries the
identical data in a fraction of the tokens; for uniform-but-nested arrays, purpose-built
formats like **TOON (Token-Oriented Object Notation)** hoist the keys into a single header
row and lay the values out CSV-style. The format itself is the lever — it is independent of
model, caching, and routing, and it changes nothing about *what* information is in the
prompt, only *how many tokens* it costs to express it.[^toon-repo][^finops-token-economics]
On client projects, a prompt stuffed with pretty-printed JSON records is a common source of
easy savings.

Using OpenAI's `tiktoken`, one head-to-head
benchmark of 50 flat records found TSV **62% cheaper** and CSV **60% cheaper** than
pretty-printed JSON, with a markdown table at **−54%** and even *compact* (minified) JSON at
**−37.5%**.[^jangwook-formats] The FinOps Foundation summarizes the field as CSV/TSV/TOON
consuming "thirty to sixty percent fewer tokens than JSON for equivalent tabular
data."[^finops-token-economics] That is why this is a **Level 1** technique: it is low
effort, information-preserving, and applies to any repeated-schema payload — RAG rows, tool
results, bulk-classification batches, and few-shot example tables. The catch, covered below,
is that the savings are concentrated on *uniform tabular* data and shrink or reverse on
nested/irregular data and on small payloads, and that a strict JSON-schema parse is
sometimes worth its extra tokens.

## Detailed Approach & Techniques

### Why JSON is token-heavy

A byte-pair tokenizer such as `tiktoken` maps text to tokens; punctuation and structural
characters are tokens too, and average text runs about four bytes per token.[^tiktoken-repo]
JSON pays this overhead three ways: (1) **repeated keys** — a 1,000-row array repeats every
field name 1,000 times; (2) **per-value punctuation** — quotes around every string key and
value, plus commas and colons; and (3) **whitespace** in pretty-printed form — the indent on
every line. Columnar/tabular formats attack all three: each key appears **once** in a header
row instead of once per record, and the delimiter (a comma, tab, or `|`) replaces the
quote-colon-comma cluster.[^gilbertson-tsv] The cheapest win is often just
**minifying** JSON: dropping indentation and inter-token whitespace measured **−37.5% vs
pretty JSON** on flat data and **−45.7%** on nested data in the same benchmark — no format
change, no parser change.[^jangwook-formats]

### The main alternatives and when each fits

- **CSV / TSV — flat, uniform tables.** The most compact option for arrays of same-shape
  rows with primitive values. TSV measured **−62%** and CSV **−60%** vs pretty JSON.[^jangwook-formats]
  On output the effect is just as large: JSON used "twice as many tokens as TSV" for the same
  result set (~50% reduction).[^gilbertson-tsv] Use when the data is genuinely rectangular and
  a downstream step can split on the delimiter.
- **Markdown tables — readability plus compactness.** A pipe-delimited table came in at
  **−54% vs pretty JSON**, between CSV and compact JSON, while staying human-readable in logs
  and prompts — a good default when a person will also read the context.[^jangwook-formats]
- **YAML — nested but key-repeating.** YAML drops braces and quotes but still repeats keys and
  spends tokens on indentation and `-`/`:` markers, so it lands only **−23.5% vs pretty JSON**
  on flat data and is *beaten by compact JSON*; it is competitive mainly for **deeply nested**
  structures.[^jangwook-formats][^infoq-toon]
- **TOON — uniform arrays, especially nested-uniform.** TOON hoists shared keys into one
  header and declares array lengths, combining YAML-style nesting with a CSV-style body. Its
  published benchmark reports **39.9% fewer tokens than JSON** while *matching or slightly
  beating* JSON on retrieval accuracy (76.4% vs 75.0% across 209 questions on four
  models).[^toon-repo] An InfoQ-cited worked example put it at ~55% vs pretty JSON, 25% vs
  compact JSON, and 38% vs YAML.[^infoq-toon] Note TOON adds a small (~5%) header/declaration
  overhead *on purpose* to improve LLM parsing accuracy, and on purely flat data it uses
  **~5.9% more tokens than plain CSV** — CSV still wins when there is no nesting.[^toon-repo][^infoq-toon]

### It applies to output too

Serialization is a two-way lever. When a downstream step will parse the model's response
deterministically, you can ask the model to **return** the compact format — a CSV/TSV block or
a TOON table — rather than a JSON array of objects. Because the model then *emits* far fewer
tokens, this saves on the (usually more expensive) **output** side and cuts latency: one
practitioner measured JSON output at twice the tokens *and* roughly **four times the wall-clock
time** of the equivalent TSV.[^gilbertson-tsv] This pairs naturally with output-side techniques
(see *Structured Outputs* and *Context Reduction*).

### Measure with the real tokenizer

Do not estimate from character counts — tokenization is non-linear across punctuation and
repeated substrings. Encode the *same* payload in each candidate format with the **target
model's tokenizer** (`tiktoken` `cl100k_base` for GPT-4-era, `o200k_base` for GPT-4o/GPT-5
family) and compare directly; the benchmarks above are reproducible this way.[^tiktoken-repo][^jangwook-formats]
Savings are a percentage of the *structured-data* tokens only, so also weigh how much of your
prompt is actually tabular before projecting a bill impact.

### Trade-offs and where it does NOT work

- **Nested or non-uniform data.** Tabular formats simply cannot represent hierarchy; forcing
  it in makes CSV fragile and TOON lose its edge. On nested order data, *compact JSON* was the
  cheapest option (−45.7%) and TOON's advantage vanished; for deeply nested objects YAML can
  even beat TOON.[^jangwook-formats][^infoq-toon][^toon-repo]
- **When a schema-validated parse is required.** If your pipeline depends on a strict JSON
  schema / structured-output mode for a reliable parse, weigh the token savings against
  parse-failure risk. A benchmark across 21 models found that on complex hierarchies TOON
  **failed at the first attempt (0% one-shot)** where JSON did not, and its repair cycles
  **doubled** token usage — erasing the savings.[^toon-arxiv] Constrained decoding onto a JSON
  schema is a genuine reliability net for weaker models (one went from 0% to 75%), though it
  can *degrade* a strong model's one-shot accuracy before repair.[^toon-arxiv] And schema
  compliance is not semantic correctness — a valid document can still be wrong.[^rotascale-structured]
  See *Structured Outputs* for that side of the trade.
- **Models sometimes follow JSON more reliably.** JSON and its schema mode are the most
  heavily represented format in training and tooling; an ad-hoc delimiter format can raise
  hallucinated-structure or mis-parse rates. TOON mitigates this with explicit length/field
  declarations, but the general point holds — validate accuracy, not just token count.[^toon-arxiv][^infoq-toon]
- **Escaping / delimiter pitfalls.** CSV breaks when a field contains the delimiter, a quote,
  or a newline; you must quote/escape correctly or the parse silently misaligns columns. TSV
  reduces (but does not eliminate) this by using tabs. Prefer TSV or a well-declared format
  over naive comma-splitting on free text.
- **Small payloads.** Overhead is amortized across rows; the per-format fixed cost (headers,
  instructions telling the model how to read/emit the format) can swamp the savings on a handful
  of records — the benchmark paper explicitly calls out this "prompt tax."[^toon-arxiv]

## Example Where It Works

A support-analytics feature injects the **500 most recent tickets** into context for the model
to cluster and summarize. Each ticket is a flat record — `id, created_at, product, priority,
status, subject` — a textbook uniform table.

- **Pretty-printed JSON** repeats all six keys, plus quotes/braces/commas, on all 500 rows.
- **Switching to TSV** puts the six field names in **one header row** and each ticket on one
  tab-delimited line. On comparable flat data this lands around **−60%** tokens versus pretty
  JSON (CSV −60%, TSV −62% in the measured benchmark), roughly *halving-to-better* the
  input-token cost of the injected block.[^jangwook-formats][^finops-token-economics]

Because the model also **returns** its cluster assignments as a small TSV (`ticket_id\tcluster`)
that the app splits on tabs, the output shrinks too — fewer output tokens and lower latency
than a JSON array of objects.[^gilbertson-tsv] The change is a serializer on the way in and a
`split('\t')` on the way out; the data, the model, and the task are unchanged. If the records
had *nested* fields (e.g. an array of message events per ticket), a uniform **TOON** encoding
would keep most of the savings while preserving that structure.[^toon-repo]

## Example Where It Would NOT Work

A document-understanding endpoint must return a **deeply nested, non-uniform** object per
invoice: header fields, a variable-length line-item array, nested tax breakdowns, and optional
sub-objects that differ from invoice to invoice — and a **strict JSON schema** downstream
validates and persists it.

- The data is **not rectangular**, so CSV/TSV and markdown tables cannot represent it without
  flattening that loses information; on nested data *compact JSON* was already the cheapest text
  format in the benchmark (−45.7%), and YAML's key-repetition makes it a weak win.[^jangwook-formats]
- Pushing this shape into **TOON** removes its advantage: the 21-model benchmark saw TOON
  **fail the first attempt (0% one-shot) on complex hierarchies** and its repair cycles
  **double** token usage — a net *loss*.[^toon-arxiv]
- The deciding factor: the pipeline needs a **guaranteed-parseable** result. A JSON-schema
  structured-output / constrained-decoding mode buys near-certain schema compliance that an
  ad-hoc format cannot, and the extra structural tokens are cheap insurance against
  parse-failure retries.[^toon-arxiv][^rotascale-structured]

Here the right move is **minify the JSON** (a free ~40–46% cut with zero parse risk) and keep
the schema, rather than chase a tabular format the data doesn't fit.[^jangwook-formats]

[^toon-repo]: toon-format/toon, "TOON — Token-Oriented Object Notation," GitHub — <https://github.com/toon-format/toon>
[^finops-token-economics]: FinOps Foundation, "Token Economics: The Atomic Unit of AI Value" — <https://www.finops.org/insights/token-economics-the-atomic-unit-of-ai-value/>
[^jangwook-formats]: jangwook.net, "Stop Feeding Raw JSON to Your LLM — I Measured Token Cost Across 9 Data Formats" — <https://jangwook.net/en/blog/en/llm-token-cost-data-format-experiment/>
[^gilbertson-tsv]: David Gilbertson, "LLM Output Formats: Why JSON Costs More Than TSV," Medium — <https://david-gilbertson.medium.com/llm-output-formats-why-json-costs-more-than-tsv-ebaf590bd541>
[^tiktoken-repo]: openai/tiktoken, "A fast BPE tokeniser for use with OpenAI's models," GitHub — <https://github.com/openai/tiktoken>
[^infoq-toon]: InfoQ, "New Token-Oriented Object Notation (TOON) Hopes to Cut LLM Costs by Reducing Token Consumption" — <https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/>
[^toon-arxiv]: arXiv, "Token-Oriented Object Notation vs JSON: A Benchmark of Plain and Constrained Decoding Generation" — <https://arxiv.org/html/2603.03306v1>
[^rotascale-structured]: Rotascale, "Structured Output Isn't Reliable Output" — <https://rotascale.com/blog/structured-output-isnt-reliable-output/>
