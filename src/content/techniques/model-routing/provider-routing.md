---
title: "Provider Routing"
category: model-routing
maturityLevel: 2
maturityProvisional: false
shortDescription: "Route the same model (or capability tier) across competing providers — OpenAI vs Azure, Claude via Anthropic/Bedrock/Vertex, or an open-weight model across Together/Fireworks/Groq/DeepInfra — to buy equivalent quality at the lowest available unit price."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Single-provider lock-in: one API key, one endpoint, list price paid with no cross-host comparison."
  - "An open-weight model (Llama, Qwen, DeepSeek) is pinned to one host that isn't the cheapest for those exact weights."
  - "Same model is consumed on a pricier cloud (e.g. Azure/Bedrock/Vertex) purely by default, not for a data-residency or contractual reason."
  - "No gateway/router in front of model calls, so switching hosts means a code change."
measurementMethods:
  - "Blended $/M tokens vs. the single-provider baseline for the same model."
  - "Share of traffic served by the cheapest quality-equivalent host."
  - "Quality-parity check (eval score, output fingerprint/format drift) across hosts before and after a route change."
  - "Effective price after the gateway's own fee/markup is included."
status: published
lastUpdated: "2026-07-02"
related:
  - "model-routing/fallback-routing"
  - "model-routing/dynamic-model-routing"
  - "model-routing/local-open-weight-substitution"
  - "model-routing/model-right-sizing"
sources:
  - id: openrouter-routing
    title: "Provider Routing — Intelligent Multi-Provider Request Routing"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/routing/provider-selection"
    accessed: "2026-07-02"
    kind: docs
    note: "Default behavior load-balances across providers weighted by inverse square of price; sort:\"price\" or the :floor slug forces absolute-lowest-price routing; quantizations, data_collection:\"deny\", and zdr:true filter endpoints."
  - id: openrouter-lowcost
    title: "Lowest-Cost LLM Inference: The Complete OpenRouter Guide"
    publisher: "OpenRouter Blog"
    year: 2026
    url: "https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/"
    accessed: "2026-07-02"
    kind: blog
    note: "Same Llama 3.3 70B weights range ~$0.32/M (DeepInfra) to >$1/M (Together) output — a 3x+ spread; cheapest endpoints may serve FP8/FP4/INT8 quant and smaller context; 'nothing in your logs tells you why' quality drops."
  - id: litellm-routing
    title: "Router — Load Balancing (cost-based-routing)"
    publisher: "LiteLLM Documentation"
    year: 2026
    url: "https://docs.litellm.ai/docs/routing"
    accessed: "2026-07-02"
    kind: docs
    note: "routing_strategy:\"cost-based-routing\" picks the lowest-cost healthy deployment; one model_name maps to many provider deployments; input_cost_per_token/output_cost_per_token allow custom pricing."
  - id: portkey-routing
    title: "Combining Routing Strategies: Conditional, Load Balancing & Fallbacks"
    publisher: "Portkey Documentation"
    year: 2026
    url: "https://portkey.ai/docs/guides/use-cases/combining-routing-strategies"
    accessed: "2026-07-02"
    kind: docs
    note: "A single model alias (e.g. claude-sonnet) is load-balanced with weights across Anthropic, Vertex AI, and Bedrock, each with independent rate-limit buckets."
  - id: azure-faq
    title: "Azure OpenAI frequently asked questions"
    publisher: "Microsoft Learn"
    year: 2026
    url: "https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq"
    accessed: "2026-07-02"
    kind: docs
    note: "Azure runs 'the same models as OpenAI' with data-residency options; per-token price varies by deployment type — Global (lowest) → Data Zone (~10% premium) → Regional (10–25% premium)."
  - id: bedrock-pricing
    title: "Amazon Bedrock Pricing"
    publisher: "Amazon Web Services"
    year: 2026
    url: "https://aws.amazon.com/bedrock/pricing/"
    accessed: "2026-07-02"
    kind: pricing
    note: "Third-party models (Claude, Llama, etc.) are billed per-token on Bedrock; base per-token rates for Claude match the direct Anthropic API at list price, with a batch API at 50% off."
  - id: deepinfra-pricing
    title: "DeepInfra Pricing — Cheapest Serverless LLM Inference"
    publisher: "Price Per Token"
    year: 2026
    url: "https://deepinfra.com/pricing"
    accessed: "2026-07-02"
    kind: pricing
    note: "Open-weight host pricing reference; illustrates that identical open-weight SKUs are offered well below flagship-host and full-precision list prices."
  - id: together-pricing
    title: "Together.ai API Pricing 2026 — All Models, Live Rates"
    publisher: "AI Pricing Guru"
    year: 2026
    url: "https://www.aipricing.guru/together-pricing/"
    accessed: "2026-07-02"
    kind: pricing
    note: "Together's open-model catalog spans ~$0.05 to $9.00 per million tokens; a mid-tier host for the same weights other providers list cheaper."
---

## Overview

The same model does not cost the same everywhere. An open-weight model such as Llama,
Qwen, or DeepSeek is served by a dozen different hosts, each with its own price, quantization,
context limit, and rate limits. A closed model is often available from several clouds — GPT
via OpenAI **and** Azure OpenAI; Claude via Anthropic **and** Amazon Bedrock **and** Google
Vertex — again at different prices, quotas, and data-residency guarantees. If your product
sends every request to a single hard-coded endpoint, you are paying whatever that one host
lists, with no comparison and no leverage.

**Provider routing** is the practice of treating "the model I want" as an abstract capability
and letting a gateway or router pick the **cheapest quality-equivalent host** for each request
(optionally also weighing latency and availability). It is a horizontal move: you stay on the
*same* model / capability tier and shop it across providers.

This is deliberately distinct from **dynamic model routing**, which is a *vertical* move —
sending easy requests to a cheaper *weaker* model and hard requests to a stronger one. Provider
routing changes *who serves the same weights*; dynamic model routing changes *which weights you
use*. The two compose: you can dynamically pick a capability tier and then provider-route within
that tier for the best price.

The gain is real but bounded — it shaves a slice off the unit price (frequently 2–3× on
open-weight models across hosts) rather than delivering an order-of-magnitude cut.[^openrouter-lowcost]
The risk is that "same model" is not always "same behavior": hosts quantize differently, cap
context differently, and can drift on output format — so provider routing sits at **Level 2**,
where a quality bar and an eval gate make the price shopping safe.

## Detailed Approach & Techniques

### The two price-dispersion opportunities

**1. Same open-weight model, many hosts.** Identical weights are re-sold by Together,
Fireworks, Groq, DeepInfra, Novita, and others, and the price spread is large. On OpenRouter's
own worked example, Llama 3.3 70B **output** ranges from about **$0.32/M (DeepInfra)** and
**$0.40/M (Novita)** up through **$0.79/M (Groq)** to **$1.04/M (Together)** — a **3×+ spread
for the same model weights**.[^openrouter-lowcost] Host catalogs confirm the range from the
other side: Together's open-model catalog alone spans roughly **$0.05–$9.00 per million
tokens**,[^together-pricing] while discount hosts like DeepInfra sit at the floor of that
range for the same SKUs.[^deepinfra-pricing] Pinning an open-weight model to one (pricier) host
is leaving that spread on the table.

**2. Same closed model, many clouds.** GPT models run on both OpenAI and Azure OpenAI — Azure
runs "the same models as OpenAI" but bills by *deployment type*: **Global** (lowest) →
**Data Zone** (~10% premium) → **Regional** (10–25% premium over Global), so cloud and region
choice moves the price without changing the model.[^azure-faq] Claude is available direct from
Anthropic and via **Amazon Bedrock** and **Vertex**; base per-token rates match the direct API
at list price, but enterprise discounts, committed-use agreements, and existing cloud credits
can tilt the effective price toward whichever route your organization already has.[^bedrock-pricing]
Here the lever is often *contractual* (spend commitments, credits) as much as list price.

### The mechanism: a gateway/router in front of the model

You do not switch providers by hand. A gateway abstracts many providers behind one API and
selects an endpoint per request:

- **OpenRouter** — the default behavior for a model is to **load-balance across providers
  weighted by the inverse square of price** (a provider 3× cheaper is ~9× more likely to be
  chosen), skipping any host that had a recent outage. To force the *absolute* lowest price with
  no load-balancing, set `sort: "price"` or append **`:floor`** to the model slug; `:nitro`
  /`sort:"throughput"` optimizes for speed instead.[^openrouter-routing]
- **LiteLLM** — set `routing_strategy: "cost-based-routing"`; a single `model_name` maps to
  several provider deployments in the `model_list`, and the router picks the lowest-cost healthy
  deployment, using either LiteLLM's cost map or per-deployment `input_cost_per_token` /
  `output_cost_per_token` overrides.[^litellm-routing]
- **Portkey** — a single model alias (e.g. `claude-sonnet`) is load-balanced with weights across
  **Anthropic, Vertex AI, and Bedrock**, each with its own rate-limit bucket, and can be nested
  under conditional routing to route by model first, then spread across providers.[^portkey-routing]

Because these gateways also implement retries and fallback chains, provider routing and
*fallback routing* usually ride on the same infrastructure — one is "pick the cheapest now,"
the other is "spill to a backup on failure."

### Guarding quality parity (why this is L2, not L1)

"Same model" is a claim to verify, not assume:

- **Quantization.** The cheapest endpoints frequently serve FP8/FP4/INT8 weights rather than
  full precision. That is not *automatically* worse — some quantized endpoints match
  full-precision competitors on benchmarks — but quality can drop and **"nothing in your logs
  tells you why."** Filter to acceptable precisions (OpenRouter's `quantizations` parameter) or
  pin known-good hosts, and re-run your eval when a route changes.[^openrouter-lowcost]
- **Context limits.** Cheaper endpoints sometimes expose a **smaller context window** than the
  paid/full equivalent — a silent failure mode for long-context workloads.[^openrouter-lowcost]
- **Fingerprint/format drift.** Different serving stacks, tokenizers, and sampler defaults can
  shift output formatting or system-fingerprint-dependent behavior; anything that parses model
  output strictly should be re-validated per host.
- **Data residency & compliance.** Price is not the only axis. When data must stay in-region or
  under a specific processor, restrict routing accordingly — use OpenRouter's
  `data_collection: "deny"` / `zdr: true` filters, Azure's Data Zone/Regional deployments for
  residency, or pin to the compliant cloud outright.[^openrouter-routing][^azure-faq]

The practical recipe: define the model tier, enumerate the acceptable hosts, gate them with the
**quality–cost evaluation suite**, then let the gateway route on price within that vetted set.

## Example Where It Works

A document-enrichment product classifies and tags ~20M chunks/month with an open-weight
Llama 3.3 70B model, currently pinned to a single mid-tier host at roughly **$1.04/M output**.[^openrouter-lowcost]
The task is high-volume, tolerant, and already eval-covered.

- The team puts OpenRouter (or LiteLLM cost-based routing) in front of the call and restricts
  the candidate set to hosts that pass their tagging-accuracy eval at bf16/FP8.
- With `sort: "price"` / `:floor`, the same weights now route to DeepInfra/Novita-class endpoints
  at roughly **$0.32–$0.40/M output** — a **~2.5–3× unit-price cut** on the dominant cost driver,
  with quality held at bar by the eval gate.[^openrouter-lowcost][^deepinfra-pricing]
- Availability improves as a side effect: if the cheapest host degrades, the router falls back
  to the next-cheapest healthy one instead of failing the batch.[^openrouter-routing]

At 20M chunks/month, trimming the unit price by ~2.5× on a workload dominated by this one model
is a large, low-risk saving for the cost of a gateway config and one eval run.

## Example Where It Would NOT Work

- **Data-residency or compliance lock-in.** A healthcare product contractually required to
  process EU customer data on a specific in-region Azure deployment cannot route to whichever
  open-weight host is cheapest this week — the "cheapest equivalent" set is narrowed to one
  compliant endpoint, so there is nothing to shop.[^azure-faq]
- **A model with a single source.** A frontier closed model available from exactly one provider
  (no second cloud, no open weights) has no alternative host to route to; provider routing has
  no purchase until a second source exists. The lever there is *dynamic model routing* or
  *model right-sizing*, not provider routing.
- **Strict output-parity requirements.** A regulated pipeline that must reproduce byte-identical
  outputs or depends on a specific system fingerprint cannot tolerate quantization/serving drift
  across hosts; the quality-parity risk outweighs the price slice, so it should pin one host.[^openrouter-lowcost]
- **Tiny or low-volume workloads.** If model spend is a few dollars a month, the engineering and
  eval overhead of standing up and maintaining a multi-provider gateway — plus the gateway's own
  fee/markup — can exceed the saving. The price dispersion only pays off at volume.[^litellm-routing]

[^openrouter-routing]: OpenRouter Documentation, "Provider Routing — Intelligent Multi-Provider Request Routing" — <https://openrouter.ai/docs/guides/routing/provider-selection>
[^openrouter-lowcost]: OpenRouter Blog, "Lowest-Cost LLM Inference: The Complete OpenRouter Guide" — <https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/>
[^litellm-routing]: LiteLLM Documentation, "Router — Load Balancing (cost-based-routing)" — <https://docs.litellm.ai/docs/routing>
[^portkey-routing]: Portkey Documentation, "Combining Routing Strategies: Conditional, Load Balancing & Fallbacks" — <https://portkey.ai/docs/guides/use-cases/combining-routing-strategies>
[^azure-faq]: Microsoft Learn, "Azure OpenAI frequently asked questions" — <https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq>
[^bedrock-pricing]: Amazon Web Services, "Amazon Bedrock Pricing" — <https://aws.amazon.com/bedrock/pricing/>
[^deepinfra-pricing]: DeepInfra, "Pricing" — <https://deepinfra.com/pricing>
[^together-pricing]: AI Pricing Guru, "Together.ai API Pricing 2026 — All Models, Live Rates" — <https://www.aipricing.guru/together-pricing/>
