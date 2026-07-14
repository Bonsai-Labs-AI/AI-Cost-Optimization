---
title: "Constrained Decoding / Grammars"
category: output
maturityLevel: 3
maturityProvisional: false
shortDescription: "Constrain generation to a formal grammar or schema at decode time (GBNF/Outlines/XGrammar on self-hosted models, or provider structured-outputs) so output is always structurally valid — killing the invalid-output retry/validate/repair tax rather than saving tokens."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Retry loops that re-call the model when its output fails to parse (invalid JSON, missing fields, wrong enum)."
  - "Regex/repair passes or a second 'fix this JSON' LLM call to clean up malformed structured output."
  - "Self-hosted or open-weight models emitting structurally invalid output at a non-trivial rate."
  - "A downstream parser that throws on model output, gated behind try/except with a re-prompt."
measurementMethods:
  - "Invalid-output rate (parse failures ÷ calls) before vs. after — target ~0%."
  - "Retries eliminated per 1k calls, and the $ + latency saved on those reruns."
  - "Decode throughput (tokens/sec) with vs. without the grammar backend enabled — confirm ~0 overhead."
  - "Schema-compliance / valid-first-generation rate at the held quality bar."
status: published
lastUpdated: "2026-07-03"
related:
  - "output/structured-outputs"
  - "output/template-plus-fill"
  - "output/post-processing-instead-of-generation"
  - "fine-tuning/local-model-deployment"
sources:
  - id: xgrammar-paper
    title: "XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models"
    publisher: "arXiv (MLSys '25)"
    authors: "Dong, Ruan, et al."
    year: 2024
    url: "https://arxiv.org/abs/2411.15100"
    accessed: "2026-07-03"
    kind: paper
    note: "Splits the vocabulary into context-independent tokens (prechecked into an adaptive token-mask cache) and context-dependent tokens (checked at runtime with a persistent stack); co-designs the grammar engine with the inference engine to overlap mask computation with GPU work. Up to 100x speedup over prior grammar engines and near-zero-overhead structured generation end-to-end."
  - id: xgrammar2
    title: "XGrammar-2: Fast and Customizable Structured Generation for Tool Calling and Agents"
    publisher: "MLC Blog"
    year: 2026
    url: "https://blog.mlc.ai/2026/05/04/xgrammar-2-fast-customizable-structured-generation"
    accessed: "2026-07-03"
    kind: blog
    note: "Purpose-built for agent tool-calling; near-zero overhead in serving, 100% structural correctness, up to 80x efficiency gain over XGrammar via cross-grammar caching."
  - id: outlines-repo
    title: "Outlines — Structured generation from LLMs"
    publisher: "dottxt-ai / GitHub"
    year: 2026
    url: "https://github.com/dottxt-ai/outlines"
    accessed: "2026-07-03"
    kind: repo
    note: "Guarantees structured outputs during generation by constraining to JSON schema / regex / CFG / choices; prevents invalid outputs at generation time rather than fixing them after. Works across transformers, vLLM, Ollama, and hosted APIs."
  - id: llamacpp-gbnf
    title: "GBNF Grammars in llama.cpp"
    publisher: "ggml-org / GitHub"
    year: 2026
    url: "https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md"
    accessed: "2026-07-03"
    kind: docs
    note: "GBNF (GGML BNF) constrains model output to a formal grammar; masks tokens that would cause a parse failure by setting their logits to -inf. Passed via --grammar / --grammar-file, --json (json_schema_to_grammar), or the grammar / response_format fields on llama-server. The schema constrains output only; it is not injected into the prompt."
  - id: vllm-structured
    title: "Structured Outputs"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/latest/features/structured_outputs.html"
    accessed: "2026-07-03"
    kind: docs
    note: "vLLM supports guided_json / guided_regex / guided_grammar / guided_choice with xgrammar (default 'auto'), outlines, or lm-format-enforcer backends. XGrammar offers low time-per-output-token and performs best when grammars are reused (cached)."
  - id: openai-structured
    title: "Introducing Structured Outputs in the API"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/introducing-structured-outputs-in-the-api/"
    accessed: "2026-07-03"
    kind: blog
    note: "Managed constrained decoding: converts a JSON Schema to grammar rules and masks invalid tokens' probability to 0. With Structured Outputs (strict), gpt-4o-2024-08-06 scores 100% schema compliance vs. <40% for gpt-4-0613 without it."
  - id: aidan-guide
    title: "A Guide to Structured Outputs Using Constrained Decoding"
    publisher: "Aidan Cooper"
    year: 2025
    url: "https://www.aidancooper.co.uk/constrained-decoding/"
    accessed: "2026-07-03"
    kind: blog
    note: "Constrained decoding guarantees precise outputs even with relatively weak models on complex tasks, and can reduce inference cost / improve throughput by skipping boilerplate scaffolding; regex grammars are tedious to write and can incur compilation time on first init."
---

## Overview

An LLM asked to return JSON (or any structured format) via prompting alone will *usually*
comply — but not always. It occasionally emits a trailing comma, a hallucinated field, an
unclosed bracket, prose before the JSON, or an invalid enum value. At scale, "usually" is a
cost: every malformed output triggers a **retry** (re-call the model), a **repair** pass (a
second "fix this JSON" LLM call), or a **regex/parser workaround** — each of which costs
tokens, latency, and engineering complexity, and each of which can itself fail.

**Constrained decoding** eliminates the failure at the source. Instead of hoping the model
produces valid structure, it makes invalid structure *impossible to generate*: at every
decoding step a grammar/schema is used to compute which next tokens are legal, and the
logits of all illegal tokens are set to −∞ (masked out) before sampling. The model can only
ever pick a token that keeps the output on a valid path through the grammar.[^llamacpp-gbnf][^openai-structured]

The important reframe for 2026: **this is a reliability technique, not a token-savings
technique.** The savings do not come from generating fewer tokens per call — a valid JSON
object is roughly the same length whether it was constrained or not. The savings come from
**killing the retry/validate/repair tax**: invalid-output rate goes to ~0%, so the reruns,
repair calls, and defensive parsing that surrounded a flaky structured endpoint simply
disappear. Managed providers report the reliability jump directly — OpenAI's Structured
Outputs scores **100% schema compliance vs. under 40%** for a comparable model without
constrained decoding.[^openai-structured] And thanks to modern engines like XGrammar, the
guarantee is now **essentially free at decode time** (near-zero added overhead).[^xgrammar-paper]

This page is **Level 3** because its native home is **self-hosting**: running your own
grammar-constrained serving stack (GBNF / Outlines / XGrammar on vLLM, SGLang, or
llama.cpp) is real engineering. Where a managed API already offers structured outputs, that
is the Level 1 feature and you should use it — see the boundary line below.

## Detailed Approach & Techniques

### How grammar-constrained decoding works

Normal decoding samples the next token from the model's full probability distribution over
the vocabulary. Constrained decoding inserts a **logit processor** between the model's raw
logits and the sampler:

1. A **grammar** (a context-free grammar, regex, or JSON schema compiled to one) defines the
   set of valid strings. The parser tracks the current state — where you are inside the
   grammar's production rules.[^llamacpp-gbnf]
2. At each step, the processor computes the set of tokens that would keep the output valid
   from the current state, and **masks every other token to −∞** so it can never be
   sampled.[^openai-structured][^llamacpp-gbnf]
3. The sampler picks from only the legal tokens; the parser advances; repeat.

Because invalid paths are structurally unreachable, the output is **guaranteed** to parse.
Outlines states the philosophy plainly: rather than fixing malformed output after
generation, it "prevents invalid outputs from being generated in the first place."[^outlines-repo]

### The overhead problem — and why it's now near-zero

The catch used to be *speed*. Naively, computing the legal-token mask means testing the
grammar against all ~100k+ vocabulary tokens **every single decode step**, which added
non-negligible latency. Modern engines removed this:

- **XGrammar** partitions the vocabulary into **context-independent tokens** — which can be
  pre-checked once and stored in an **adaptive token-mask cache** — and the small set of
  **context-dependent tokens** that need a runtime check with an efficient persistent stack.
  It further **co-designs the grammar engine with the inference engine so mask computation
  overlaps GPU execution.** The result: up to **100× speedup** over prior grammar engines
  and **near-zero-overhead** structured generation end-to-end.[^xgrammar-paper] XGrammar-2
  (2026) extends this to complex agent tool-calling schemas, keeping near-zero overhead with
  100% structural correctness.[^xgrammar2]

The practical takeaway: on a modern stack, turning constrained decoding **on** costs you
almost nothing at decode time, and there is often a small one-time **compilation** cost when
a new schema/grammar is first seen (the FSM/automaton is built), which is then cached and
reused across requests.[^vllm-structured][^aidan-guide]

### The self-hosted stack (this is the L3 work)

- **llama.cpp / GBNF.** Define a grammar in GBNF (BNF + regex-like extensions) and pass it
  via `--grammar` / `--grammar-file`, or convert a JSON schema with `--json` /
  `json_schema_to_grammar`. On `llama-server` it's the `grammar` body field or
  `response_format`. Notably the schema **constrains output only — it is not injected into
  the prompt**, so it costs no input tokens.[^llamacpp-gbnf]
- **vLLM / SGLang.** vLLM exposes `guided_json`, `guided_regex`, `guided_grammar`, and
  `guided_choice`, backed by **XGrammar (default), Outlines, or lm-format-enforcer**. The
  XGrammar backend gives low time-per-output-token and is fastest when grammars are reused
  (cached).[^vllm-structured]
- **Outlines** is the portable library layer: JSON schema / Pydantic model / regex / CFG /
  `Literal` choices, working across transformers, vLLM, Ollama, and hosted
  APIs.[^outlines-repo]

### The boundary: L3 self-hosted vs. L1 managed structured outputs

Draw the line honestly:

- **If you call a managed API** (OpenAI, and the equivalent structured-output/JSON-schema
  modes on other major providers), the provider already runs constrained decoding for you.
  Enabling `strict` structured outputs is a **config flag, not a system** — that is the
  **Level 1** technique (*Structured Outputs*), and you should just turn it on. OpenAI's
  own numbers (100% vs. <40% compliance) show what it buys.[^openai-structured]
- **You reach Level 3 when you self-host** an open-weight model and must **stand up the
  grammar-serving stack yourself** — pick and wire a backend (XGrammar/Outlines/GBNF),
  compile and cache grammars, handle backend fallbacks, and validate that constraints don't
  distort outputs. That build/ops effort is the reason this is Medium effort and an L3 line
  item, even though the runtime cost is ~0.

### Watch the one real quality risk

Constrained decoding can only *guarantee structure*, not *correctness of content*. An
**over-tight grammar** can force the model down a path that truncates or distorts a valid
answer (e.g. an enum that omits a legitimate value, or a regex too strict for real inputs),
and occasionally a hard constraint fights the model's natural continuation. Keep grammars
**as permissive as the downstream parser allows**, and eval the constrained outputs at the
quality bar — don't assume "valid" means "right."[^aidan-guide]

## Example Where It Works

A self-hosted extraction service runs an **open-weight 8B model on vLLM** to pull structured
records (`{name, date, amount, category}`) from ~2M documents/day. On prompting alone the
model returns un-parseable JSON on roughly **3–5%** of calls — a truncated object here, a
stray markdown fence there. The pipeline handles this with a **retry-then-repair** loop: on
a parse failure it re-calls the model, and if that also fails it makes a second "fix this
JSON" call.

That failure tail is pure waste: at 4% invalid and ~2M calls/day, that's **~80,000
extra model calls/day** spent purely on reruns and repairs — plus the latency spikes and the
brittle parsing code around them.

Switching vLLM to `guided_json` with the **XGrammar** backend makes the JSON schema a hard
constraint. Invalid-output rate drops to **~0%**, so the retry and repair calls **disappear
entirely** — eliminating those ~80k daily reruns — and the downstream parser's error path
becomes dead code.[^vllm-structured][^openai-structured] Critically, because XGrammar adds
**near-zero decode overhead**, the constrained path runs at essentially the same throughput
as the unconstrained one — you get the reliability for free.[^xgrammar-paper] The win here is
the *eliminated retry tax*, not fewer tokens per successful call.

## Example Where It Would NOT Work

- **You're already on a managed API with structured outputs.** If you call a provider that
  offers strict JSON-schema structured outputs, building your own grammar-serving stack is
  redundant effort — just enable the provider's flag. That's the L1 technique, not this
  one.[^openai-structured] Standing up self-hosted grammar serving only pays off once you've
  *chosen* to self-host (for volume, residency, or model-choice reasons).
- **The output isn't structured / has no formal grammar.** Free-form prose, creative
  writing, summaries, or open-ended chat have no schema to constrain. Forcing a grammar buys
  nothing and an over-tight one only risks distorting the text.
- **The problem is content accuracy, not format validity.** If the model returns *valid*
  JSON with the *wrong* values, constrained decoding cannot help — it guarantees shape, not
  truth. A too-strict grammar can even mask a real problem by forcing plausible-but-wrong
  structure. Reach for evals, better prompts/models, or verification instead.[^aidan-guide]
- **You expected it to cut token cost.** A constrained response is about the same length as
  an unconstrained valid one; the savings are retry-elimination, not per-call tokens. If your
  cost is dominated by long generations or large inputs, target output-length or
  caching/context techniques, not this.

[^xgrammar-paper]: Dong, Ruan, et al., "XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models," arXiv / MLSys '25 — <https://arxiv.org/abs/2411.15100>
[^xgrammar2]: MLC Blog, "XGrammar-2: Fast and Customizable Structured Generation for Tool Calling and Agents," 2026 — <https://blog.mlc.ai/2026/05/04/xgrammar-2-fast-customizable-structured-generation>
[^outlines-repo]: dottxt-ai, "Outlines — Structured generation from LLMs," GitHub — <https://github.com/dottxt-ai/outlines>
[^llamacpp-gbnf]: ggml-org, "GBNF Grammars in llama.cpp," GitHub — <https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md>
[^vllm-structured]: vLLM Documentation, "Structured Outputs" — <https://docs.vllm.ai/en/latest/features/structured_outputs.html>
[^openai-structured]: OpenAI, "Introducing Structured Outputs in the API," 2024 — <https://openai.com/index/introducing-structured-outputs-in-the-api/>
[^aidan-guide]: Aidan Cooper, "A Guide to Structured Outputs Using Constrained Decoding," 2025 — <https://www.aidancooper.co.uk/constrained-decoding/>
