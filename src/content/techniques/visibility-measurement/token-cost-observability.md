---
title: "Token & Cost Observability"
category: visibility-measurement
maturityLevel: 0
maturityProvisional: false
shortDescription: "Capture per-request token counts (broken out by type), cost, and latency for every LLM call so spend becomes measurable — the precondition for every other optimization."
effort: Low
gain: Medium
riskToQuality: Low
effortWhy: "Low — one SDK wrapper or a single gateway/proxy hop emits the data; providers already return the token breakdown, so you only read it."
gainWhy: "Medium — observability saves no tokens itself; it is an enabler that unlocks every downstream lever (right-sizing, caching, capping, batching)."
riskWhy: "Low — it only reads what the provider already returns and never alters an output, so there is no quality risk."
detectionSignals:
  - "No per-call logging — spend is only visible on the monthly provider invoice."
  - "Can't slice spend — no way to answer which feature, model, or customer costs what without exporting and guessing."
  - "Single-number usage — token usage is logged as one figure, with no breakdown of cached vs. reasoning vs. plain input/output."
  - "Spike found late — a cost jump is noticed days later at billing time rather than when it happens."
measurementMethods:
  - "Instrumentation coverage — percentage of LLM calls emitting token, cost, and latency vs. total calls."
  - "Token-type breakdown — presence of a per-type split (input / output / cached / reasoning / audio / image) on each record."
  - "Reconciliation gap — logged spend vs. the provider invoice, with a target within a few percent."
  - "Time-to-detect — lag from when a cost change happens to when someone can see it."
status: published
lastUpdated: "2026-06-29"
related:
  - "visibility-measurement/cost-dashboards"
  - "visibility-measurement/tag-based-cost-attribution"
  - "visibility-measurement/budget-limits-guardrails"
  - "visibility-measurement/unit-economics-cost-per-outcome"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: otel-genai-attrs
    title: "Gen AI — semantic convention attributes registry"
    publisher: "OpenTelemetry"
    year: 2026
    url: "https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/"
    accessed: "2026-06-29"
    kind: docs
    note: "Defines gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, gen_ai.token.type (values input|output), gen_ai.request.model, gen_ai.provider.name, gen_ai.operation.name. GenAI conventions are still experimental and moving to a dedicated repo."
  - id: otel-genai-spans
    title: "Semantic conventions for generative AI spans"
    publisher: "OpenTelemetry"
    year: 2026
    url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
    accessed: "2026-06-29"
    kind: docs
    note: "Span-level conventions for GenAI client calls; gen_ai.client.token.usage histogram filterable by gen_ai.token.type. Conventions in transition / experimental."
  - id: langfuse-cost
    title: "Token & cost tracking"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/token-and-cost-tracking"
    accessed: "2026-06-29"
    kind: docs
    note: "Usage types are arbitrary strings: input, output, cached_tokens, audio_tokens, image_tokens, reasoning_tokens. Reasoning tokens are billed as output tokens. Cost inferred from model name + price map, or ingested directly."
  - id: openai-pc-docs
    title: "Prompt caching — usage object (cached_tokens, reasoning_tokens)"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-06-29"
    kind: docs
    note: "usage.prompt_tokens_details.cached_tokens and usage.completion_tokens_details.reasoning_tokens are returned per call; cached_tokens is 0 for prompts under 1,024 tokens."
  - id: anthropic-pc-usage
    title: "Prompt caching — tracking cache performance (usage fields)"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-06-29"
    kind: docs
    note: "usage reports cache_creation_input_tokens and cache_read_input_tokens separately; input_tokens counts only tokens after the last cache breakpoint, so total input = cache_read + cache_creation + input."
  - id: datadog-otel
    title: "Datadog LLM Observability natively supports OpenTelemetry GenAI Semantic Conventions"
    publisher: "Datadog"
    year: 2026
    url: "https://www.datadoghq.com/blog/llm-otel-semantic-convention/"
    accessed: "2026-06-29"
    kind: blog
    note: "Maps gen_ai.* attributes (model, provider, input/output/total tokens, operation) natively; derives cost from span duration and provider metadata; instrument once with OTel, no vendor SDK."
  - id: litellm-cost
    title: "Spend tracking"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/cost_tracking"
    accessed: "2026-06-29"
    kind: docs
    note: "Gateway auto-tracks spend per key/user/team/model into LiteLLM_SpendLogs from a built-in model cost map; request-level tags and spend_logs_metadata enable attribution with no app code change."
  - id: helicone-cost
    title: "Cost tracking & optimization"
    publisher: "Helicone Docs"
    year: 2026
    url: "https://docs.helicone.ai/guides/cookbooks/cost-tracking"
    accessed: "2026-06-29"
    kind: docs
    note: "One-line proxy integration captures tokens, cost, and latency per request; costs computed from an open-source price repository covering 300+ models, or exactly via the gateway model registry."
---

## Overview

You cannot optimize what you cannot see. Before any cost technique in this catalog —
right-sizing a model, caching a prefix, capping output length, moving work to a batch tier —
a team needs to know, for **every LLM call**, how many tokens it consumed, what those tokens
cost, and how long it took. **Token & cost observability** is that foundational layer: the
per-request (and per-trace) capture of token counts, computed cost, latency, model, and the
identifying metadata needed to slice spend later.

The specific cost problem it solves is *invisibility*. When the only artifact of spend is the
provider's end-of-month invoice, a team is flying blind: a retry storm, an agent that began
looping, a prompt that quietly doubled in length, or a feature shipped on a flagship model
when a mini tier would do — none of these are observable until the bill arrives, and even then
the invoice is a single undifferentiated number. Observability turns that opaque monthly figure
into a per-call stream you can measure, attribute, alert on, and act against.

This is a **Level 0** technique — obvious-waste hygiene every product should have on day one —
because it is genuinely low effort (one SDK wrapper or one proxy hop) and carries no quality
risk: it only *reads* what the provider already returns. Its gain is scored **Medium** and
honestly so: observability does not by itself save a single token. It is an **enabler**. Its
value is that it unlocks every downstream lever — cost dashboards, tag-based attribution,
budget guardrails, and unit economics all consume the data this layer produces.[^langfuse-cost]

## Detailed Approach & Techniques

### Capture all 2026 token types — a single number is no longer enough

In 2024 a usable record was "prompt tokens, completion tokens, cost." In 2026 that is actively
misleading, because tokens of different *types* are priced very differently and frequently
**dominate or distort** the bill. The minimal record must break usage out by type:

- **Input** and **output** tokens (output is billed several times input on frontier rate cards).
- **Cached** input tokens, billed at a steep discount (often ~10% of the input rate). A workload
  with a high cache-hit rate can pay a fraction of what naive input-token counts imply — and you
  only know your hit rate if you log cached tokens separately.
- **Reasoning ("thinking") tokens**, generated by reasoning models and **billed at the output
  rate** even though they never appear in the response. They routinely exceed the visible answer
  in size, so omitting them understates cost dramatically.[^langfuse-cost]
- **Audio** and **image** tokens, priced on their own schedules for multimodal calls.

The good news: the providers already return this breakdown in the response's usage object, so
capturing it is a matter of *reading the right fields* rather than estimating:

- **OpenAI** returns `usage.prompt_tokens_details.cached_tokens` and
  `usage.completion_tokens_details.reasoning_tokens` alongside `prompt_tokens` /
  `completion_tokens` on every call (cached is 0 below the 1,024-token cache threshold).[^openai-pc-docs]
- **Anthropic (Claude)** reports `cache_creation_input_tokens` and `cache_read_input_tokens`
  separately from `input_tokens` (note: Claude's `input_tokens` counts only tokens *after* the
  last cache breakpoint, so total input = `cache_read + cache_creation + input` — a classic
  double-counting footgun if you sum naively).[^anthropic-pc-usage]

Compute and store cost at capture time from a current price map keyed on `(model, token-type)`,
rather than deriving it later — pricing and the model mix change underneath you, and a cost
field frozen at the moment of the call is the one you can reconcile against the invoice.[^langfuse-cost][^helicone-cost]

### Attach identifying metadata at the call site

Raw counts answer "how much," not "for what." Capture, at minimum, the **model**, the
**operation** (chat / embedding / tool call), **latency**, and **status / error**. Then attach
the business dimensions that make the data sliceable downstream — feature, customer, environment,
prompt version, agent-run id. That metadata is what later powers attribution and dashboards; this
page captures it, *Tag-Based Cost Attribution* turns it into a discipline.

### Build vs. buy

Three implementation paths, in rough order of effort:

1. **SDK wrapper / instrumentation library.** Wrap the provider client (or drop in an OpenTelemetry
   GenAI auto-instrumentation) to emit a span per call. The **OpenTelemetry GenAI semantic
   conventions** define portable attribute names — `gen_ai.usage.input_tokens`,
   `gen_ai.usage.output_tokens`, `gen_ai.request.model`, `gen_ai.provider.name`,
   `gen_ai.operation.name`, and a `gen_ai.client.token.usage` histogram filterable by
   `gen_ai.token.type` — so you can instrument **once** and send to any backend.[^otel-genai-attrs][^otel-genai-spans]
   The caveat: these conventions are still **experimental** and shifting (the spec is mid-migration),
   so expect minor churn. Datadog LLM Observability maps `gen_ai.*` natively and derives cost from
   span duration and provider metadata, which keeps you off a proprietary SDK.[^datadog-otel]

2. **Dedicated LLM-observability SDK.** Tools like Langfuse capture per-call usage with full
   per-token-type support — `input`, `output`, `cached_tokens`, `reasoning_tokens`, `audio_tokens`,
   `image_tokens` — and infer cost from the model name against a maintained price map (or accept
   costs you ingest).[^langfuse-cost] Higher fidelity for LLM-specific concerns; some coupling to the tool's SDK.

3. **Gateway / proxy auto-emit.** Route traffic through an AI gateway and get observability for
   essentially **zero application code**. LiteLLM auto-writes spend per key/user/team/model into a
   spend-log table from a built-in cost map and supports request-level tags for attribution;[^litellm-cost]
   Helicone is a one-line base-URL change that logs tokens, cost, and latency per request using an
   open-source price repository covering 300+ models.[^helicone-cost] Lowest effort and uniform across
   providers — at the cost of putting a hop in your request path and some lock-in to the gateway.

**The lock-in tradeoff** comes down to the attribute substrate. Emitting OpenTelemetry `gen_ai.*`
keeps the *data* portable even if you switch backends; a proprietary SDK or a gateway's bespoke
schema is faster to adopt but harder to migrate off. For most product teams the pragmatic path is
a gateway or LLM-obs SDK now, with an eye on OTel conventions as they stabilize.

### What raw capture enables downstream — the foundation case

The payoff is concrete. Once every call carries typed tokens + cost + metadata, you can:

- **Attribute** spend by feature, customer, or agent-run (kill or re-price a costly feature) —
  *Tag-Based Cost Attribution*.
- **Visualize** trends and breakdowns by model and feature — *Cost Dashboards*.
- **Compute cache-hit rate** (cached ÷ total input) to prove caching is working — *Prompt Caching*.
- **Set guardrails** that trip on a spend threshold before the invoice does — *Budget Limits & Guardrails*.
- **Derive unit economics** — cost per resolved ticket, per generated report — *Unit Economics: Cost per Outcome*.

None of these are possible without the capture layer; all of them are trivial once it exists. That
is the whole argument for doing it first.

## Example Where It Works

A SaaS product ships three AI features — a chat assistant, a document summarizer, and a background
enrichment job — all on the same flagship model, all calling the provider directly. The bill jumps
40% one month and nobody can say why. There is no per-call logging; the only data is the invoice.

The team routes all traffic through an AI gateway (a one-line base-URL change) so every call now
records typed tokens, computed cost, latency, model, and a `feature` tag with **no application
changes**.[^litellm-cost][^helicone-cost] Within a day the picture is clear: the enrichment job had
started running on a reasoning model after a config change, and its **reasoning tokens** — invisible
in the response but billed at the output rate — were the entire spike.[^langfuse-cost] Because the
record now breaks tokens out by type, the cost is attributable to one feature and one token type in
minutes instead of being lost in a lump-sum invoice. The fix (right-sizing that job) is a different
technique, but it was only *findable* because the observability layer existed. The same data also
revealed the chat assistant's cache-hit rate was high — cached tokens were a large share of its
input — confirming prompt caching was already paying off.[^openai-pc-docs][^anthropic-pc-usage]

## Example Where It Would NOT Work

Observability is an enabler, so it disappoints whenever a team expects it to *be* the savings.

- **Capture without action.** A startup instruments every call, builds a beautiful per-token-type
  record, and... changes nothing. The spend is now perfectly *visible* and exactly as high as before.
  Observability only pays off when it feeds a decision (right-size, cache, cap, batch); on its own it
  is overhead, which is precisely why its gain is scored Medium rather than High.

- **A tiny, single-call product.** A side project that makes a handful of LLM calls a day against one
  model has a bill small enough to read straight off the provider's own usage dashboard. Standing up
  spans, a price map, and a backend is effort out of proportion to a few dollars a month — the
  provider's built-in console is enough until volume grows.

- **Naive counting that double-counts cached tokens.** A team logs "input tokens" by summing every
  usage field and ends up *overstating* spend — Anthropic's `input_tokens` already excludes cached
  tokens, which live in `cache_read_input_tokens` / `cache_creation_input_tokens`.[^anthropic-pc-usage]
  Bad instrumentation is worse than none: a cost model that doesn't reconcile to the invoice erodes
  trust in every downstream dashboard. The fix is to read the documented usage breakdown per provider,
  not to invent a counting scheme.

- **Betting on an unstable substrate prematurely.** A team standardizes hard on the OpenTelemetry
  `gen_ai.*` conventions expecting them to be frozen, then eats churn when attribute names shift —
  the GenAI conventions are still experimental in 2026.[^otel-genai-attrs] OTel is the right long-term
  bet, but treat it as a moving target and isolate the mapping rather than wiring it everywhere.

[^otel-genai-attrs]: OpenTelemetry, "Gen AI — semantic convention attributes registry" — <https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/>
[^otel-genai-spans]: OpenTelemetry, "Semantic conventions for generative AI spans" — <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/>
[^langfuse-cost]: Langfuse Docs, "Token & cost tracking" — <https://langfuse.com/docs/observability/features/token-and-cost-tracking>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" (usage object: cached_tokens, reasoning_tokens) — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^anthropic-pc-usage]: Anthropic, "Prompt caching — tracking cache performance," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^datadog-otel]: Datadog, "LLM Observability natively supports OpenTelemetry GenAI Semantic Conventions" — <https://www.datadoghq.com/blog/llm-otel-semantic-convention/>
[^litellm-cost]: LiteLLM Docs, "Spend tracking" — <https://docs.litellm.ai/docs/proxy/cost_tracking>
[^helicone-cost]: Helicone Docs, "Cost tracking & optimization" — <https://docs.helicone.ai/guides/cookbooks/cost-tracking>
