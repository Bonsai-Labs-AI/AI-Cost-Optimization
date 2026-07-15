---
title: "Provider & Fallback Routing"
category: model-routing
maturityLevel: 2
maturityProvisional: false
shortDescription: "Route every request to the cheapest quality-equivalent provider for a given model tier, and configure an automatic fallback chain so rate limits, outages, or latency spikes spill to the next provider — not to a dropped request or a paged engineer."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Single-provider lock-in: one API key, one endpoint, list price paid with no cross-host comparison."
  - "An open-weight model (Llama, Qwen, DeepSeek) is pinned to one host that isn't the cheapest for those exact weights."
  - "Same closed model consumed on a pricier cloud (Azure/Bedrock/Vertex) purely by default, not for a contractual or data-residency reason."
  - "No gateway/router in front of model calls, so switching hosts means a code change."
  - "A single provider is a hard dependency: when it 429s or 5xxs, requests fail and users see errors."
  - "Engineers manually re-run failed jobs or flip an API key during outages."
  - "Aggressive, uncapped retries that replay large requests and inflate the bill during transient blips."
measurementMethods:
  - "Blended $/M tokens vs. single-provider baseline for the same model."
  - "Share of traffic served by the cheapest quality-equivalent host."
  - "Fallback hit rate (share of requests served by a non-primary provider)."
  - "Marginal cost of fallback traffic specifically vs. the primary."
  - "Failed / dropped request rate before vs. after adding the fallback chain."
  - "Quality-parity check (eval score, output fingerprint/format drift) across hosts before and after a route change."
  - "Retry attempts per request (to catch retry-storm cost creep)."
  - "Effective price after the gateway's own fee/markup is included."
status: published
lastUpdated: "2026-07-14"
related:
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
  - id: openrouter-fallbacks
    title: "Model Fallbacks — Reliable AI with Automatic Failover"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/routing/model-fallbacks"
    accessed: "2026-07-02"
    kind: docs
    note: "models array in priority order; any error can trigger a fallback (rate limits, downtime, context-length, moderation); requests are priced using the model that was ultimately used, returned in the response `model` field."
  - id: litellm-routing
    title: "Router — Load Balancing (cost-based-routing)"
    publisher: "LiteLLM Documentation"
    year: 2026
    url: "https://docs.litellm.ai/docs/routing"
    accessed: "2026-07-02"
    kind: docs
    note: "routing_strategy:\"cost-based-routing\" picks the lowest-cost healthy deployment; one model_name maps to many provider deployments; input_cost_per_token/output_cost_per_token allow custom pricing."
  - id: litellm-reliability
    title: "Fallbacks (Proxy Reliability)"
    publisher: "LiteLLM Documentation"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/reliability"
    accessed: "2026-07-02"
    kind: docs
    note: "fallbacks / context_window_fallbacks / content_policy_fallbacks keys; fallbacks run in-order; general fallbacks trigger on 429, 5xx, and timeouts; num_retries per model before moving on."
  - id: litellm-reliable-completions
    title: "Reliability - Retries, Fallbacks"
    publisher: "LiteLLM Documentation"
    year: 2026
    url: "https://docs.litellm.ai/docs/completion/reliable_completions"
    accessed: "2026-07-02"
    kind: docs
    note: "num_retries uses tenacity; fallback list of models or api_key/api_base sets; failed deployments cooldown for 60s and are skipped; fallback routing bounded to a ~45s window."
  - id: portkey-routing
    title: "Combining Routing Strategies: Conditional, Load Balancing & Fallbacks"
    publisher: "Portkey Documentation"
    year: 2026
    url: "https://portkey.ai/docs/guides/use-cases/combining-routing-strategies"
    accessed: "2026-07-02"
    kind: docs
    note: "A single model alias (e.g. claude-sonnet) is load-balanced with weights across Anthropic, Vertex AI, and Bedrock, each with independent rate-limit buckets."
  - id: portkey-retries
    title: "Automatic Retries"
    publisher: "Portkey Docs"
    year: 2026
    url: "https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries"
    accessed: "2026-07-02"
    kind: docs
    note: "Default retry status codes [429, 500, 502, 503, 504, 529]; up to 5 attempts; exponential backoff 1s/2s/4s/8s/16s; on_status_codes overrides defaults."
  - id: portkey-fallbacks
    title: "Fallbacks"
    publisher: "Portkey Docs"
    year: 2026
    url: "https://portkey.ai/docs/product/ai-gateway/fallbacks"
    accessed: "2026-07-02"
    kind: docs
    note: "strategy.mode = 'fallback' with a prioritized targets array; on_status_codes restricts the trigger (default any non-2xx); can fall back to a cheaper provider/model; a single request may invoke multiple LLMs, raising latency and cost."
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
  - id: gcp-429
    title: "Learn how to handle 429 resource exhaustion errors in your LLMs"
    publisher: "Google Cloud Blog"
    year: 2025
    url: "https://cloud.google.com/blog/products/ai-machine-learning/learn-how-to-handle-429-resource-exhaustion-errors-in-your-llms"
    accessed: "2026-07-02"
    kind: blog
    note: "Random exponential backoff with jitter (wait_random_exponential, cap 60s) took a 5-request test from 80% failure to 100% success; recommends fallback to alternative models/providers and hard-stop quota caps."
  - id: maxim-429
    title: "Handle 429 Errors in Production LLM Applications"
    publisher: "Maxim AI"
    year: 2026
    url: "https://www.getmaxim.ai/articles/handle-429-errors-in-production-llm-applications/"
    accessed: "2026-07-02"
    kind: blog
    note: "Unsuccessful requests still count against the per-minute rate limit; honor Retry-After; cap total retries; backoff+jitter is necessary but insufficient — prefer gateway pooling + automatic provider fallback to absorb load rather than retry it."
---

## Overview

The same model does not cost the same everywhere, and no single provider is available
100% of the time. These two facts define a single strategy that belongs together in
production: **route to the cheapest quality-equivalent host** for every request, and
**fall back automatically** when that host rate-limits, errors, or goes dark.

**Provider routing** treats a model tier — say, "a fast mid-size model for classification"
— as an abstract capability and lets a gateway pick the cheapest host that serves it. The
same Llama 3.3 70B weights, for example, range from roughly **$0.32/M output
(DeepInfra)** to **$1.04/M (Together)** — a **3×+ spread for identical
weights**.[^openrouter-lowcost] For closed models the lever is often contractual rather
than list-price: Claude is available directly from Anthropic and via Amazon Bedrock and
Google Vertex; GPT runs on both OpenAI and Azure OpenAI, where deployment type (Global /
Data Zone / Regional) adds a **10–25% premium** over the cheapest option.[^azure-faq]

**Fallback routing** handles what happens when the primary host fails. A `429` rate
limit, a `503`, or a timeout automatically re-issues the request against the next
provider in a priority chain — usually behind the same gateway, using the same
API.[^litellm-reliability][^portkey-fallbacks][^openrouter-fallbacks] The cost argument
for fallback is less obvious but real: it removes the hidden cost of dropped requests
(failed user actions, manual re-runs, support tickets) and enables a **cheap-primary /
spillover-only-on-failure** pattern where the premium backup is paid only on the
exceptions, not the base load.

The two primitives live on the same infrastructure — gateways like LiteLLM, Portkey, and
OpenRouter expose both in the same configuration object — and they compose: the primary
slot in a fallback chain *is* the cheapest host the provider router selected, and the
fallback slots are the next-cheapest vetted alternatives. Separating them is a conceptual
convenience; deploying them together is how production AI systems actually run.

Both sit at **Level 2** because each is a config-level change with a gotcha that requires
deliberate engineering: provider routing has a quality-parity risk ("same model" is not
always "same behavior" across hosts), and fallback routing has a cost-amplification risk
(uncapped retries on expensive backups turn a reliability feature into a runaway
bill).[^openrouter-lowcost][^maxim-429]

## Detailed Approach & Techniques

### The gateway: one API, many providers

Neither technique requires hand-coded provider-switching logic. A gateway abstracts
multiple providers behind a single API and handles selection per request:

- **OpenRouter** — default behavior load-balances across providers weighted by the
  **inverse square of price** (a host 3× cheaper is ~9× more likely to be chosen), skipping
  any endpoint with a recent outage. `sort: "price"` or the **`:floor`** model-slug suffix
  forces absolute-lowest-price routing; `:nitro` / `sort: "throughput"` optimizes for
  speed instead. The `models` array doubles as a fallback chain in priority order: any error
  (rate limit, downtime, context overflow, moderation refusal) triggers the next entry.
  Requests are **priced by the model that ultimately served them**, so a fast-failing primary
  `429` (no tokens generated) adds nothing to the bill.[^openrouter-routing][^openrouter-fallbacks]
- **LiteLLM** — `routing_strategy: "cost-based-routing"` maps a single `model_name` to
  multiple provider deployments and picks the lowest-cost healthy one, using LiteLLM's cost
  map or per-deployment `input_cost_per_token` / `output_cost_per_token` overrides. A
  parallel `fallbacks` list (`fallbacks=["gpt-4o-mini", "claude-haiku", …]`) is tried
  in order on `429`, `5xx`, and timeouts; `context_window_fallbacks` and
  `content_policy_fallbacks` handle specific error classes. `num_retries` controls attempts
  per model before moving on; failed deployments enter a **60-second cooldown** and are
  skipped automatically.[^litellm-routing][^litellm-reliability][^litellm-reliable-completions]
- **Portkey** — a single model alias (e.g. `claude-sonnet`) is load-balanced with weights
  across Anthropic, Vertex AI, and Bedrock, each with its own rate-limit bucket, under a
  conditional routing wrapper that selects the model first and then spreads across
  providers.[^portkey-routing] Fallback mode (`strategy.mode = "fallback"`) accepts a
  prioritized `targets` array; `on_status_codes` restricts the trigger (default: any
  non-2xx, typically narrowed to `[429, 503]`); targets are composable (a fallback target
  can itself be a load-balancer). The retry layer defaults to status codes
  **[429, 500, 502, 503, 504, 529]**, up to **5 attempts**, with exponential backoff
  (**1s → 2s → 4s → 8s → 16s**).[^portkey-fallbacks][^portkey-retries]

### The two price-dispersion opportunities

**1. Same open-weight model, many hosts.** Identical weights are served by Together,
Fireworks, Groq, DeepInfra, Novita, and others at very different prices. OpenRouter's
worked example shows Llama 3.3 70B **output** running from **$0.32/M (DeepInfra)** and
**$0.40/M (Novita)** through **$0.79/M (Groq)** to **$1.04/M (Together)** — a **3×+ spread
for the same weights**.[^openrouter-lowcost] Together's catalog spans roughly **$0.05–$9.00
per million tokens**,[^together-pricing] while discount hosts sit at the floor of that
range for the same SKUs.[^deepinfra-pricing] Pinning to one (pricier) host leaves that
spread on the table.

**2. Same closed model, many clouds.** Azure OpenAI deploys "the same models as OpenAI"
but bills by deployment type — **Global** (lowest) → **Data Zone** (~10% premium) →
**Regional** (10–25% premium) — so cloud and region selection shifts the price without
changing the model.[^azure-faq] Claude runs on Anthropic, Bedrock, and Vertex; base
per-token rates match the direct API at list price, but enterprise discounts, committed-use
agreements, and existing cloud credits can tilt the effective price toward whichever route
your organization already has negotiated.[^bedrock-pricing] The lever here is often
*contractual* as much as list price.

### The cost design for fallback: cheap primary, expensive spillover

The cost-optimal fallback pattern is a **cheap primary / pricier-but-available backup**:
route the base load to the lowest-cost host that passes your eval bar, and pay the premium
backup only on the failures the primary can't handle. Because each gateway bills for the
model that actually served the request — not the ones that failed fast — a `429`
with no generated tokens costs nothing extra from the primary; the fallback bill appears
only when tokens are actually produced by the backup.[^openrouter-fallbacks]

The natural worry is **double-billing** on partial generations: if a request partially
generates output and then times out before completing, some providers bill for the tokens
produced, and a retry re-bills the whole generation. Prefer triggering fallback on
**fast-failing signals** (`429` / `5xx` / connect-timeout) rather than on long, partially
completed requests to avoid this.[^maxim-429]

### Guarding quality parity across providers

"Same model" is a claim to verify, not assume:

- **Quantization.** The cheapest endpoints frequently serve FP8/FP4/INT8 weights rather
  than full precision. This is not automatically worse — some quantized endpoints match
  full-precision competitors on benchmarks — but quality *can* drop and **"nothing in your
  logs tells you why."** Filter to acceptable precisions (OpenRouter's `quantizations`
  parameter) or pin known-good hosts, and re-run your eval when a route changes.[^openrouter-lowcost]
- **Context limits.** Cheaper endpoints sometimes expose a **smaller context window** than
  the paid or full-precision equivalent — a silent failure mode for long-context
  workloads.[^openrouter-lowcost]
- **Fingerprint/format drift.** Different serving stacks, tokenizers, and sampler defaults
  can shift output formatting; pipelines that parse model output strictly should be
  re-validated per host before routing to it.
- **Data residency and compliance.** Price is not the only axis. When data must stay
  in-region or under a specific cloud processor, restrict routing accordingly — use
  OpenRouter's `data_collection: "deny"` / `zdr: true` filters, Azure's Data Zone/Regional
  deployments, or pin to the compliant cloud.[^openrouter-routing][^azure-faq]

The practical recipe: define the capability tier, enumerate the acceptable hosts, gate
them with a **quality–cost evaluation suite**, then let the gateway route on price within
that vetted set. The fallback chain is ordered from cheapest to most-available within that
same vetted set.

### Where fallback raises cost if misconfigured

Fallback and retry share the same underlying primitive, and the failure mode is a **retry
storm**: uncapped, un-backoffed retries replay a large request — often escalating to a
more expensive model — on every transient blip. Because unsuccessful requests still consume
rate-limit quota, naive retries can *manufacture* the very `429`s they are reacting to,
turning one hiccup into a self-amplifying cascade against a pricier backup.[^maxim-429]
Guardrails that keep this cheap:

- **Cap total retries** and use **exponential backoff with jitter** (Portkey's 1→16s
  schedule; the `tenacity` `wait_random_exponential(max=60)` pattern) so a spike doesn't
  become a thundering herd.[^portkey-retries][^gcp-429]
- **Honor `Retry-After`** — that value reflects the real reset window; retrying sooner
  just burns quota.[^maxim-429]
- **Only fall back on retryable errors** (`429` / `5xx` / timeout). A `400` is a malformed
  request; retrying it — or escalating it to a flagship model — wastes tokens with no
  chance of success.[^portkey-fallbacks][^maxim-429]
- **Cool down dead endpoints** so you don't keep paying to probe a provider that is
  down.[^litellm-reliable-completions]
- **Cap the spend.** The fallback chain should sit behind a budget guardrail so a runaway
  chain trips a hard limit rather than the invoice.

## Example Where It Works

A document-enrichment product classifies and tags ~20M chunks/month using Llama 3.3 70B,
currently pinned to a single mid-tier host at roughly **$1.04/M output**.[^openrouter-lowcost]
During peak hours the host occasionally `429`s, stalling the batch until an engineer
intervenes. The task is high-volume, quality-tolerant, and already eval-covered.

The team deploys OpenRouter (or LiteLLM cost-based routing) in front of the call,
restricts candidates to hosts that pass the tagging-accuracy eval at bf16/FP8, and sets
`sort: "price"` / `:floor`. The primary now routes to DeepInfra/Novita-class endpoints at
roughly **$0.32–$0.40/M output** — a **~2.5–3× unit-price cut** on the dominant cost
driver.[^openrouter-lowcost][^deepinfra-pricing] The `models` fallback array then lists
the next cheapest vetted host: when the primary `429`s, the request retries on that backup
automatically with backoff, the vast majority succeed, and nobody gets paged. A comparable
5-request stress test in Google's own write-up went from **80% failure to 100% success**
purely by adding backoff + retry — the same primitive the fallback chain builds
on.[^gcp-429]

The combined result: the unit price drops ~2.5–3×, the dropped-request rate falls toward
zero, and the on-call load disappears — all for the cost of a gateway config and one eval
run.

## Example Where It Would NOT Work

- **Data-residency or compliance lock-in.** A healthcare product contractually required to
  process EU customer data on a specific in-region Azure deployment cannot route to
  whichever open-weight host is cheapest this week. The "acceptable host" set is narrowed
  to one compliant endpoint, so there is nothing to shop.[^azure-faq]
- **A model with a single source.** A frontier closed model available from exactly one
  provider has no alternative host to route to, and no fallback to a different host. The
  lever there is dynamic model routing or model right-sizing, not provider/fallback
  routing.
- **Strict output-parity requirements.** A regulated pipeline that must reproduce
  byte-identical outputs or depends on a specific system fingerprint cannot tolerate
  quantization or serving-stack drift across hosts. The quality-parity risk outweighs the
  price slice, and the team should pin one host.[^openrouter-lowcost]
- **The backup is as unreliable as the primary, or far more expensive.** If both targets
  share a real dependency (same underlying accelerator supply, same region) or the fallback
  is a flagship model at 10–30× the price, an outage flips all traffic to the expensive
  model and the bill spikes exactly when you're already degraded. Fallback only helps if
  the backup is genuinely independent and priced
  sanely.[^portkey-fallbacks]
- **Non-retryable failures being escalated.** Falling back on a `400` (bad request), a
  schema-validation failure, or a content-policy refusal that the backup will also refuse
  adds latency and a second charge for no benefit.[^litellm-reliability][^maxim-429]
- **A rate-limit problem masquerading as a reliability one.** If you are constantly hitting
  `429`s, the fix is often higher rate limits, request smoothing, or caching — not routing
  ever more traffic to a pricier backup, which treats the symptom at premium
  prices.[^maxim-429]
- **Tiny or low-volume workloads.** If model spend is a few dollars a month, the
  engineering and eval overhead of standing up a multi-provider gateway — plus the
  gateway's own fee/markup — can exceed the saving. The price dispersion only pays off at
  volume.[^litellm-routing]

[^openrouter-routing]: OpenRouter Documentation, "Provider Routing — Intelligent Multi-Provider Request Routing" — <https://openrouter.ai/docs/guides/routing/provider-selection>
[^openrouter-lowcost]: OpenRouter Blog, "Lowest-Cost LLM Inference: The Complete OpenRouter Guide" — <https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/>
[^openrouter-fallbacks]: OpenRouter Documentation, "Model Fallbacks — Reliable AI with Automatic Failover" — <https://openrouter.ai/docs/guides/routing/model-fallbacks>
[^litellm-routing]: LiteLLM Documentation, "Router — Load Balancing (cost-based-routing)" — <https://docs.litellm.ai/docs/routing>
[^litellm-reliability]: LiteLLM Documentation, "Fallbacks (Proxy Reliability)" — <https://docs.litellm.ai/docs/proxy/reliability>
[^litellm-reliable-completions]: LiteLLM Documentation, "Reliability - Retries, Fallbacks" — <https://docs.litellm.ai/docs/completion/reliable_completions>
[^portkey-routing]: Portkey Documentation, "Combining Routing Strategies: Conditional, Load Balancing & Fallbacks" — <https://portkey.ai/docs/guides/use-cases/combining-routing-strategies>
[^portkey-retries]: Portkey Docs, "Automatic Retries" — <https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries>
[^portkey-fallbacks]: Portkey Docs, "Fallbacks" — <https://portkey.ai/docs/product/ai-gateway/fallbacks>
[^azure-faq]: Microsoft Learn, "Azure OpenAI frequently asked questions" — <https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq>
[^bedrock-pricing]: Amazon Web Services, "Amazon Bedrock Pricing" — <https://aws.amazon.com/bedrock/pricing/>
[^deepinfra-pricing]: DeepInfra, "Pricing" — <https://deepinfra.com/pricing>
[^together-pricing]: AI Pricing Guru, "Together.ai API Pricing 2026 — All Models, Live Rates" — <https://www.aipricing.guru/together-pricing/>
[^gcp-429]: Google Cloud Blog, "Learn how to handle 429 resource exhaustion errors in your LLMs" — <https://cloud.google.com/blog/products/ai-machine-learning/learn-how-to-handle-429-resource-exhaustion-errors-in-your-llms>
[^maxim-429]: Maxim AI, "Handle 429 Errors in Production LLM Applications" — <https://www.getmaxim.ai/articles/handle-429-errors-in-production-llm-applications/>
