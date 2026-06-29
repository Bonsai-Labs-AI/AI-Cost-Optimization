---
title: "Prompt Caching / Prefix Caching"
category: caching-reuse
maturityLevel: 1
maturityProvisional: false
shortDescription: "Reuse the model's computation over a repeated prompt prefix (system prompt, tools, documents, few-shot examples) so you only pay full price for it once instead of on every request."
effort: Low
gain: Very High
riskToQuality: Low
detectionSignals:
  - "A large, near-identical prefix (system prompt, tool definitions, RAG documents, few-shot examples) is resent on most requests."
  - "Multi-turn chat or agent loops resend the entire growing history every turn."
  - "Input tokens dominate the bill while outputs are short."
  - "Average prompt length is high and stable across users."
measurementMethods:
  - "Cache hit rate (cached input tokens ÷ total input tokens)."
  - "Input-token cost per request before vs. after."
  - "Effective blended input price ($/M tokens) after cache discounts."
  - "Time-to-first-token (TTFT) latency reduction."
status: published
lastUpdated: "2026-06-24"
related:
  - "prompt-context/static-dynamic-prompt-separation"
  - "caching-reuse/cache-aware-agent-design"
  - "caching-reuse/exact-response-caching"
  - "caching-reuse/semantic-caching"
sources:
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-06-24"
    kind: docs
    note: "Cache writes cost 1.25× base input (5-min TTL) or 2× (1-hour TTL); cache reads cost 0.1× base input. Cache must be marked explicitly with cache_control breakpoints."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-24"
    kind: pricing
  - id: openai-pc-announce
    title: "Prompt Caching in the API"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/api-prompt-caching/"
    accessed: "2026-06-24"
    kind: blog
    note: "Automatic 50% input discount on cached prefixes; up to 80% latency reduction; applies to prompts ≥1,024 tokens in 128-token increments."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-06-24"
    kind: docs
    note: "Automatic, no code change. Put static content first, variable content last. Cache cleared after 5–10 min idle, within 1 hour max."
  - id: gemini-caching
    title: "Context caching"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/caching"
    accessed: "2026-06-24"
    kind: docs
    note: "Implicit caching is on by default for Gemini 2.5+. Explicit caching guarantees the discount (90% on 2.5+) but adds a per-hour storage charge."
  - id: gemini-pricing
    title: "Gemini Developer API pricing"
    publisher: "Google — Gemini API Docs"
    year: 2026
    url: "https://ai.google.dev/gemini-api/docs/pricing"
    accessed: "2026-06-24"
    kind: pricing
  - id: bedrock-pc
    title: "Prompt caching for faster model inference"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html"
    accessed: "2026-06-24"
    kind: docs
  - id: vllm-apc
    title: "Automatic Prefix Caching"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/stable/design/prefix_caching/"
    accessed: "2026-06-24"
    kind: docs
    note: "Self-hosting equivalent: reuses the KV cache of a shared prefix across requests. Reduces prefill, not decode. Enable with enable_prefix_caching=True."
---

## Overview

Every LLM request re-processes its **entire input** before generating a single output
token. In most production apps a large fraction of that input is *identical from one
request to the next*: the system prompt, the tool/function definitions, a long set of
few-shot examples, a retrieved document, or the accumulated history of a conversation.
Without caching, you pay full input price to re-encode that unchanged prefix on **every
single call**.

Prompt caching (also called *prefix caching* or *context caching*) stores the model's
internal representation (the attention **KV cache**) of a prompt prefix after the first
request, and reuses it on subsequent requests that begin with the same tokens. The
shared prefix is then billed at a steep discount — or skipped entirely on self-hosted
stacks — and time-to-first-token drops because the prefill work is already done.[^anthropic-pc][^openai-pc-announce]

This is one of the highest-leverage, lowest-risk optimizations available: on the major
providers it is **near-zero engineering effort**, it does **not change model outputs**
(the same tokens are processed; only billing and latency change), and the savings on a
cache hit are large — **50% off input on OpenAI**, **90% off on Anthropic and Gemini 2.5+**.[^openai-pc-announce][^anthropic-pc][^gemini-caching]
That combination is why it sits at **Level 1 (Basic Optimization)**: almost every product
with a stable prompt prefix should be doing it.

## Detailed Approach & Techniques

### The pricing mechanics (why prefix order matters)

Caching only works on a **contiguous prefix** measured from the start of the prompt. The
moment the token stream diverges from the cached version, the cache stops applying and
everything after the divergence point is recomputed at full price. The single most
important design rule follows directly:

> **Put static content first, volatile content last.**
> Order the prompt as: system instructions → tool definitions → long shared context /
> documents → few-shot examples → *then* the per-request user input.[^openai-pc-docs]

Putting a timestamp, a user name, or a request ID near the top of the prompt silently
destroys the cache for everything below it.

### Provider-by-provider

- **OpenAI — automatic.** Caching is applied automatically to prompts **≥ 1,024 tokens**,
  growing in 128-token increments, with **no code changes and no extra cost to opt in**.
  Cache reads are billed at **50% of the input price**; idle caches are evicted after
  ~5–10 minutes (and within an hour).[^openai-pc-announce][^openai-pc-docs]

- **Anthropic (Claude) — explicit breakpoints.** You mark cacheable spans with
  `cache_control` breakpoints. A **cache write costs 1.25×** the base input price (5-minute
  TTL) or **2×** (1-hour TTL); a **cache read costs only 0.1×** (a 90% discount). Break-even
  arrives after roughly **one** cache read for the 5-minute tier — so any prefix reused even
  twice in a few minutes already pays off.[^anthropic-pc][^anthropic-pricing]

- **Google Gemini — implicit + explicit.** **Implicit caching is on by default for Gemini
  2.5+** and automatically passes through savings on a hit. **Explicit caching** guarantees
  the discount (**90% on 2.5+**, 75% on 2.0) but adds a **per-hour storage charge** (e.g.
  ~$4.50/M tokens/hour for Pro), so it pays off only when a large context is reused many
  times within its lifetime.[^gemini-caching][^gemini-pricing]

- **Amazon Bedrock** exposes prompt caching across several hosted models with a similar
  write/read model, useful when you are standardized on Bedrock.[^bedrock-pc]

- **Self-hosted (vLLM / SGLang / TensorRT-LLM).** *Automatic Prefix Caching* reuses the KV
  cache of a shared prefix across requests, skipping recomputation of the shared part
  entirely. In vLLM it is a single flag (`enable_prefix_caching=True`). Note it reduces
  **prefill** time and cost, not **decode** — long generations still cost full price to
  produce.[^vllm-apc]

### Maximizing hit rate

1. **Separate the static and dynamic prompt** so the static block is byte-for-byte
   identical every call (see *Static / Dynamic Prompt Separation*). Even whitespace or JSON
   key-order changes break the prefix match.
2. **Cache the expensive, reused blocks**: tool definitions, system prompt, RAG documents,
   and long few-shot sets are the prime candidates.
3. **Design agents to be cache-friendly**: append new turns/observations to the *end* of a
   stable history rather than rewriting earlier context (see *Cache-Aware Agent Design*).
4. **Keep traffic warm**: provider caches expire after minutes of inactivity, so caching
   helps most for sustained or bursty-but-frequent traffic; for Anthropic's/Gemini's longer
   TTLs you can trade a higher write/storage cost for a longer window.[^openai-pc-docs][^anthropic-pc][^gemini-caching]

## Example Where It Works

A customer-support assistant has a **6,000-token** system prompt (policies, tone, tool
definitions, and 12 few-shot examples) and answers ~50,000 conversations/day, each
averaging 4 turns. The static block is identical on every turn of every conversation.

- **Without caching:** the 6k-token prefix is re-billed on all ~200,000 turns/day at full
  input price.
- **With caching (Anthropic):** the prefix is paid at full price once per cache window and
  then at **0.1×** on subsequent reads — a **~90% reduction on the prefix portion** of input
  cost, plus a noticeable **TTFT improvement** because prefill is skipped.[^anthropic-pc]
  Since the prefix dominates input tokens here, blended input spend drops dramatically with
  one line of `cache_control` configuration.

Agentic loops are an even stronger fit: the system prompt **and** the full tool schema
**and** the conversation-so-far form a long, stable prefix that is resent on every step of
the loop.[^anthropic-pc][^vllm-apc]

## Example Where It Would NOT Work

- **No shared prefix.** A bulk pipeline that classifies unrelated one-off documents with a
  *tiny* shared instruction and a *large unique* body per request has almost nothing
  cacheable — the unique body comes after the short shared instruction, so cache hits are
  negligible. (Here, *Batch API usage* and a *smaller model* are the right levers instead.)
- **Below the minimum / cold traffic.** OpenAI only caches prefixes **≥ 1,024 tokens**, and
  all provider caches evict after minutes of inactivity. Low-volume or long-idle endpoints
  rarely get hits, and on Anthropic you can even pay the **1.25× write penalty without ever
  reaching the break-even read**.[^openai-pc-announce][^anthropic-pc]
- **Volatile-first prompts.** If per-request data (user name, timestamp, session id) is
  placed *before* the static content, the prefix diverges immediately and caching buys
  nothing — a configuration bug that masquerades as "caching doesn't help."[^openai-pc-docs]
- **Output-bound costs.** Caching discounts **input** only. A workload dominated by long
  generations (e.g. long-form writing) sees little benefit; target *Output Optimization*
  techniques there. On self-hosted stacks this is explicit: prefix caching cuts prefill,
  not decode.[^vllm-apc]

[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^anthropic-pricing]: Anthropic, "Pricing," Claude API Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
[^openai-pc-announce]: OpenAI, "Prompt Caching in the API," 2024 — <https://openai.com/index/api-prompt-caching/>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^gemini-caching]: Google, "Context caching," Gemini API Docs — <https://ai.google.dev/gemini-api/docs/caching>
[^gemini-pricing]: Google, "Gemini Developer API pricing" — <https://ai.google.dev/gemini-api/docs/pricing>
[^bedrock-pc]: Amazon Bedrock User Guide, "Prompt caching for faster model inference" — <https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html>
[^vllm-apc]: vLLM Documentation, "Automatic Prefix Caching" — <https://docs.vllm.ai/en/stable/design/prefix_caching/>
