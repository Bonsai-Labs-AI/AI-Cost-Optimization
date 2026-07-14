---
title: "Fallback Routing"
category: model-routing
maturityLevel: 2
maturityProvisional: false
shortDescription: "Automatically retry a failed, timed-out, or rate-limited request on a backup model or provider — so a cheap primary can serve most traffic and spill over to a pricier backup only on failure, while the hidden cost of dropped requests and manual retries disappears."
effort: Low
gain: Medium
riskToQuality: Low
detectionSignals:
  - "A single provider is a hard dependency: when it 429s or 5xxs, requests fail and users see errors."
  - "Engineers manually re-run failed jobs or flip an API key during outages."
  - "No defined backup model/provider, so a rate-limit spike drops or stalls traffic."
  - "The opposite failure mode: aggressive, uncapped retries that replay large requests and inflate the bill during transient blips."
measurementMethods:
  - "Share of requests served by a fallback vs. the primary (fallback hit rate)."
  - "Blended $/request across primary + fallback traffic, and the marginal cost of fallback traffic specifically."
  - "Failed / dropped request rate before vs. after adding the fallback chain."
  - "Retry attempts per request (to catch retry-storm cost creep)."
status: published
lastUpdated: "2026-07-02"
related:
  - "model-routing/provider-routing"
  - "model-routing/dynamic-model-routing"
  - "visibility-measurement/budget-limits-guardrails"
sources:
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
  - id: openrouter-fallbacks
    title: "Model Fallbacks — Reliable AI with Automatic Failover"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/routing/model-fallbacks"
    accessed: "2026-07-02"
    kind: docs
    note: "models array in priority order; any error can trigger a fallback (rate limits, downtime, context-length, moderation); requests are priced using the model that was ultimately used, returned in the response `model` field."
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

Every AI product depends on an upstream model API that will, eventually, fail: a
`429` rate-limit during a traffic spike, a `503`/`5xx` while the provider degrades, a
timeout, or a regional outage. Without a plan, each of those becomes a **dropped request** —
a failed user action, an abandoned agent run, or an engineer paged to manually re-run a job
or hot-swap an API key.

**Fallback routing** turns that single point of failure into a chain: on a retryable error,
the request is automatically re-issued against a **backup model or provider**, in a defined
priority order, usually behind a gateway (LiteLLM, Portkey, OpenRouter) that abstracts the
providers behind one API.[^litellm-reliability][^portkey-fallbacks][^openrouter-fallbacks]

This technique is reliability-first, but it earns its place in a cost taxonomy on three cost
arguments:

1. **Cheap primary, spillover-only-on-failure.** Run the lowest-cost model that meets the
   quality bar as the primary, and reserve a pricier, more-available backup for the small
   slice of traffic the primary can't serve. You pay the premium only on the exceptions, not
   the base load.
2. **Avoided cost of failed and manually-retried requests.** A dropped request still cost you
   the input tokens (and the user the outcome); the manual scramble to recover it — an
   engineer re-running a batch, a support ticket, a re-prompt — is real, uncounted spend that
   fallback deletes.[^maxim-429]
3. **A place where careless configuration *raises* cost.** Aggressive, uncapped retries that
   replay large requests to a more expensive model on every transient blip are the classic
   way a "reliability" feature becomes a runaway bill (see below) — which is exactly why this
   sits at **Level 2**: it's a config toggle, but doing it *safely* takes deliberate tuning.

## Detailed Approach & Techniques

### The mechanism: a prioritized fallback chain

All the major gateways implement the same core idea — an ordered list of targets tried until
one succeeds:

- **LiteLLM** exposes a `fallbacks` list (`fallbacks=["gpt-4o-mini", "claude-haiku", …]`) tried
  **in order**; it also splits out `context_window_fallbacks` (retry on a larger-context model
  when the input overflows) and `content_policy_fallbacks`. General fallbacks trigger on the
  retryable errors — **429, 5xx, and timeouts**. `num_retries` controls how many times each
  model is retried *before* moving to the next in the chain, and a failed deployment is put in
  a **60-second cooldown** and skipped so you don't keep hammering a dead endpoint.[^litellm-reliability][^litellm-reliable-completions]
- **Portkey** uses `"strategy": {"mode": "fallback"}` with a prioritized `targets` array; you
  can restrict the trigger with `on_status_codes` (default: any non-2xx) — e.g. `[429, 503]` for
  just rate-limits and unavailability — and targets are composable (a fallback target can itself
  be a load-balancer or another fallback).[^portkey-fallbacks] Its retry layer defaults to the
  status codes **[429, 500, 502, 503, 504, 529]**, up to **5 attempts**, with exponential
  backoff (**1s → 2s → 4s → 8s → 16s**).[^portkey-retries]
- **OpenRouter** takes a `models` array in priority order; **any error** can trigger the next
  model (rate limits, downtime, context-length, moderation refusals).[^openrouter-fallbacks]

### The cost design: cheap primary, expensive spillover — and who pays for the failed attempt

The cost-optimal pattern is a **cheap primary + pricier backup**: route the base load to the
lowest-cost model that passes your eval bar, and let it spill over to a more expensive or more
available model only on failure. Portkey documents exactly this — falling back from a primary
to a *different* (or cheaper) provider/model when the primary errors.[^portkey-fallbacks]

The natural worry is **double-billing**: do you pay for the failed primary attempt *and* the
successful fallback? The honest answer is provider-dependent, and this is the number to verify
for your stack:

- On a **gateway that bills you for the model that actually served the request**, you pay once.
  OpenRouter is explicit: *"Requests are priced using the model that was ultimately used"*,
  returned in the response's `model` field — so a fast-failing primary (a `429` with no tokens
  generated) adds nothing.[^openrouter-fallbacks]
- On **direct provider APIs**, a request that errors *before* generating output tokens (a
  `429`/`5xx`) is effectively free of token charges, but it **still counts against your
  per-minute rate limit** — so a storm of failing retries can itself trigger *more* rate-limit
  errors.[^maxim-429] The dangerous case is a request that partially generates and then fails or
  times out: you may be billed for the tokens produced, then billed again on the retry. Prefer
  fast-failing triggers (`429`/`5xx`/connect-timeout) over retrying long, partially-completed
  generations.

### Where fallback *raises* cost if misconfigured

Fallback and retry are the same underlying primitive, and the failure mode is a **retry
storm**: uncapped, unbackoffed retries that replay a large request — often escalating to a more
expensive model — on every transient blip. Because unsuccessful requests still consume
rate-limit quota, naive retries can *manufacture* the very `429`s they're reacting to, turning
one hiccup into a self-amplifying cascade against a pricier backup.[^maxim-429] Guardrails that
keep this cheap:

- **Cap total retries** and use **exponential backoff with jitter** (Portkey's ≤5-attempt,
  1→16s schedule; the `tenacity` `wait_random_exponential(max=60)` pattern) so a spike doesn't
  become a thundering herd.[^portkey-retries][^gcp-429]
- **Honor `Retry-After`** — that value reflects the real reset window; retrying sooner just
  burns quota.[^maxim-429]
- **Only fall back on retryable errors** (`429`/`5xx`/timeout). A `400` is a malformed request;
  retrying it — or escalating it to a flagship model — wastes tokens with no chance of
  success.[^portkey-fallbacks][^maxim-429]
- **Cool down dead endpoints** so you don't keep paying to probe a provider that's down.[^litellm-reliable-completions]
- **Cap the spend.** Fallback should live *behind* a budget/rate cap so a runaway chain trips a
  guardrail rather than the invoice — this is the direct tie to *Budget Limits & Guardrails*.

## Example Where It Works

A support-automation product runs ~2M classification+reply calls/month. The primary is a small,
cheap model (say ~$0.15/M input) that handles it fine. During a mid-morning provider
rate-limit event, roughly **3% of requests** `429`.

- **Without fallback:** those ~60k requests/month fail. Users see errors, tickets pile up, and
  an on-call engineer spends an afternoon re-running the failed batch by hand and rotating keys
  — pure uncounted cost, plus the reputational hit.
- **With a fallback chain (cheap primary → equivalent-tier model on a second provider):** the
  gateway retries the `429`s on the backup with backoff, and the vast majority succeed. Only the
  ~3% spillover pays the backup's price; since you're billed for the model that served each
  request, the 97% base load stays on the cheap primary.[^openrouter-fallbacks][^portkey-fallbacks]
  A 5-request stress test in Google's own write-up went from **80% failure to 100% success**
  purely by adding backoff+retry — the same primitive fallback builds on.[^gcp-429] Net effect:
  the failed-request rate drops toward zero, the blended price barely moves, and nobody gets
  paged.

## Example Where It Would NOT Work

- **The "backup" is as unreliable and just as expensive.** If both targets share a real
  dependency (same underlying accelerator supply, same region) or the fallback is a flagship
  model at 10–30× the price, an outage flips *all* traffic to the expensive model and the bill
  spikes exactly when you're already degraded. Fallback only helps if the backup is genuinely
  independent and priced sanely.[^portkey-fallbacks]
- **Non-retryable failures.** Falling back on a `400` (bad request), a schema-validation
  failure, or a content-policy refusal that the backup will also refuse just adds latency and a
  second charge for no benefit — restrict the trigger to `429`/`5xx`/timeout.[^litellm-reliability][^maxim-429]
- **Uncapped retries on long generations.** For requests that partially generate before timing
  out, replaying them retries the *whole* expensive generation (and you may be billed for the
  first attempt's tokens too). Without a retry cap, backoff, `Retry-After` respect, and a spend
  guardrail, the "reliability" feature becomes the most expensive bug in the app — the retry
  storm.[^maxim-429][^gcp-429]
- **A cost problem masquerading as a reliability one.** If you're constantly hitting `429`s, the
  fix is often higher rate limits, request smoothing, or caching — not routing ever more traffic
  to a pricier backup, which treats the symptom at premium prices.[^maxim-429]

[^litellm-reliability]: LiteLLM Documentation, "Fallbacks (Proxy Reliability)" — <https://docs.litellm.ai/docs/proxy/reliability>
[^litellm-reliable-completions]: LiteLLM Documentation, "Reliability - Retries, Fallbacks" — <https://docs.litellm.ai/docs/completion/reliable_completions>
[^portkey-retries]: Portkey Docs, "Automatic Retries" — <https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries>
[^portkey-fallbacks]: Portkey Docs, "Fallbacks" — <https://portkey.ai/docs/product/ai-gateway/fallbacks>
[^openrouter-fallbacks]: OpenRouter Documentation, "Model Fallbacks — Reliable AI with Automatic Failover" — <https://openrouter.ai/docs/guides/routing/model-fallbacks>
[^gcp-429]: Google Cloud Blog, "Learn how to handle 429 resource exhaustion errors in your LLMs" — <https://cloud.google.com/blog/products/ai-machine-learning/learn-how-to-handle-429-resource-exhaustion-errors-in-your-llms>
[^maxim-429]: Maxim AI, "Handle 429 Errors in Production LLM Applications" — <https://www.getmaxim.ai/articles/handle-429-errors-in-production-llm-applications/>
