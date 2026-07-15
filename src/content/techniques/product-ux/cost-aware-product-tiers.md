---
title: "Cost-Aware Product Tiers"
category: product-ux
maturityLevel: 2
maturityProvisional: false
shortDescription: "Bound AI spend per plan by attaching hard usage caps, rate limits, and model-access gating to each product tier — with an abuse-limited free tier — so no single user or leaked key can run up an unbounded bill."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "An AI feature is exposed on an unlimited (or generously capped) free tier with no per-user usage ceiling."
  - "Every tier — including free and trial — can invoke the most expensive flagship/reasoning models."
  - "No per-key or per-user budget/rate limit is enforced at the gateway; a runaway loop or leaked key can spend without bound."
  - "AI cost is not tracked or capped per plan; you can't answer 'what does one free user cost us in AI.'"
  - "A small minority of heavy free/trial users drives a disproportionate share of AI infrastructure spend."
measurementMethods:
  - "AI cost per tier and AI cost per free-tier user per month."
  - "% of total AI spend attributable to free/trial users vs. paying users."
  - "Share of requests hitting a per-user quota or rate-limit ceiling (cap-bind rate)."
  - "Worst-case bounded spend per key = per-key budget cap × active keys (the abuse ceiling)."
  - "Distribution of expensive-model calls by tier (should be ~0 below the gating tier)."
status: published
lastUpdated: "2026-07-03"
related:
  - "product-ux/ai-feature-gating"
  - "prompt-context/user-controlled-quality-mode"
  - "agent-workflow/agent-budget-guardrails"
sources:
  - id: litellm-budgets
    title: "Budgets, Rate Limits"
    publisher: "LiteLLM — Proxy Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/users"
    accessed: "2026-07-03"
    kind: docs
    note: "Per-key/per-user max_budget with budget_duration reset window; tpm_limit/rpm_limit/max_parallel_requests and per-model model_rpm_limit/model_tpm_limit. Over-budget requests fail (ExceededTokenBudget); over-rate requests return 429."
  - id: litellm-tiers
    title: "Budget / Rate Limit Tiers"
    publisher: "LiteLLM — Proxy Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/rate_limit_tiers"
    accessed: "2026-07-03"
    kind: docs
    note: "Define named budget tiers via /budget/new (budget_id, rpm_limit) and attach keys with budget_id at /key/generate — reuse one cap/rate config across many keys, i.e. one per product tier."
  - id: portkey-budgets
    title: "Usage & Rate Limit Policies"
    publisher: "Portkey — Enterprise Docs"
    year: 2026
    url: "https://portkey.ai/docs/product/enterprise-offering/budget-policies"
    accessed: "2026-07-03"
    kind: docs
    note: "USD credit_limit per api_key/virtual_key with weekly/monthly periodic_reset; over-budget returns 412 Precondition Failed and blocks requests; rate limits (rpm/rph/rpd/rpw, requests or tokens) return 429 when exceeded."
  - id: revenuecat-margins
    title: "Subscription App Economics: The Hidden Cost of AI Features"
    publisher: "RevenueCat Blog"
    year: 2026
    url: "https://www.revenuecat.com/blog/growth/ai-feature-cost-subscription-app-margins/"
    accessed: "2026-07-03"
    kind: blog
    note: "300k MAU × 15% AI engagement = 45k active users; at $0.10/active user/mo = $4,500/mo ($54k/yr). Trial users generated large output, consumed API cost, then churned before paying. Recommends daily/monthly usage caps and initial-credit quotas on free access."
  - id: transputec-llmsec
    title: "LLM API Security: How Hackers Exploit AI APIs"
    publisher: "Transputec"
    year: 2026
    url: "https://www.transputec.com/blogs/llm-api-security/"
    accessed: "2026-07-03"
    kind: blog
    note: "Feb 2026: a stolen Google Cloud API key ran up $82,314.44 in a single 24-hour window vs. a $180/mo baseline; 376% rise in AI credential theft Q4'25→Q1'26. Recommends hard spend caps, billing alerts, per-project keys, and application-level rate limiting as the mitigation."
  - id: vicarius-keys
    title: "8,000+ ChatGPT API keys exposed across GitHub & production sites"
    publisher: "Vicarius"
    year: 2026
    url: "https://www.vicarius.io/articles/8-000-chatgpt-api-keys-exposed-across-github-production-sites"
    accessed: "2026-07-03"
    kind: blog
    note: "OpenAI keys exposed across 5,000+ GitHub repos and 3,000+ production sites; attackers 'execute high-volume inference workloads under the victim's billing umbrella,' causing ruinous overnight bills."
  - id: openrouter-free
    title: "Free LLM APIs in 2026: 13 Options Ranked and Compared"
    publisher: "OpenRouter Blog"
    year: 2026
    url: "https://openrouter.ai/blog/tutorials/free-llm-apis-compared/"
    accessed: "2026-07-03"
    kind: blog
    note: "Free tiers ship hard rate/usage caps as the abuse control — e.g. OpenRouter free models 20 req/min and 50 req/day (1,000/day after a $10 top-up); Groq 30 req/min, 1,000/day; Google AI Studio 5–15 req/min."
  - id: pecollective-freetiers
    title: "11 AI Free Tiers Compared: Limits and Catches (2026)"
    publisher: "PE Collective"
    year: 2026
    url: "https://pecollective.com/blog/ai-free-tiers-compared/"
    accessed: "2026-07-03"
    kind: blog
    note: "In early 2026 OpenAI, Anthropic, and Google restricted flagship reasoning/pro models to paid tiers and tightened free-tier message caps — model-access gating by plan as the dominant consumer pattern."
---

## Overview

An AI feature has a **variable, per-use marginal cost** that a traditional software
feature does not: every free-tier session, every trial user, and every automated loop
consumes tokens that cost real money. If a product tier is defined only by *which
features* it unlocks — and not by *how much AI it may consume* — then AI spend is
effectively uncapped from the demand side. The dangerous case is the free tier: a
free tier without hard limits is a **cost bomb**, because it invites exactly the users
who generate cost without ever generating revenue.[^revenuecat-margins]

**Cost-aware product tiers** attach *spend-bounding* controls to each plan:

1. **Per-tier usage quotas / rate limits** — a hard ceiling on requests, tokens, or
   AI-actions per user per period, tightest on free/trial.
2. **An abuse-limited free tier** — the free plan gets the strictest caps precisely
   because it is the largest uncontrolled-cost surface.
3. **Model-access gating by plan** — expensive flagship / reasoning models are
   reserved for higher tiers; free and low tiers can only invoke cheaper models.[^pecollective-freetiers]

Done well, this converts an open-ended liability into a **bounded, predictable
maximum**: worst-case AI spend per user is capped by that user's quota, and worst-case
spend per credential is capped by its gateway budget — no matter how the user behaves,
or whether a key leaks.

> **Scope boundary — this is spend control, not monetization.** This page is only
> about *bounding* AI cost per tier (caps, quotas, abuse limits, model gating). How
> you *price* those tiers, set margins, or design usage-based billing is a separate
> business decision and explicitly **out of scope** here. You can cap free-tier AI
> spend without having decided anything about your price list.

## Detailed Approach & Techniques

### Lever 1 — Per-tier usage quotas and rate limits

The primitive is a **per-user (or per-key) budget with a reset window** plus a
**rate limit**, enforced at an AI gateway so it applies before a request ever reaches
a provider. Both mainstream gateways expose exactly these controls:

- **LiteLLM** sets a `max_budget` (in dollars) with a `budget_duration` reset window
  (`30s`/`30m`/`30d`) on each key *or* user, and rate limits via `tpm_limit`,
  `rpm_limit`, and `max_parallel_requests`. When a key crosses its budget the request
  **fails** (`ExceededTokenBudget`); when it exceeds its rate it returns **429**.[^litellm-budgets]
- **Portkey** sets a USD `credit_limit` per `api_key` / `virtual_key` with
  `weekly`/`monthly` `periodic_reset`; over-budget requests return **412 Precondition
  Failed** and are blocked, and rate limits (`rpm`/`rph`/`rpd`/`rpw`, counted as
  requests *or* tokens) return **429** when exceeded.[^portkey-budgets]

The tier structure comes from **reusing one cap/rate config across many keys**. In
LiteLLM you define a named tier once with `/budget/new` (a `budget_id` carrying its
`rpm_limit` / budget) and attach every key on that plan to it via `budget_id` at
`/key/generate`.[^litellm-tiers] So "free," "pro," and "enterprise" each become a budget
tier, and issuing a user their tier is a one-field assignment. The result: each tier
has a **defined maximum AI spend per user per period**, enforced automatically.

### Lever 2 — The abuse-limited free tier (the dominant uncontrolled-cost source)

Free access is where uncontrolled cost concentrates, for two structural reasons:

1. **Free users are the ones who don't pay.** One team stopped offering a traditional
   free trial entirely because "trial users were able to generate large volumes of
   output, consume API cost, then churn before ever paying" — i.e. the free path was
   *funding churn*, not activation.[^revenuecat-margins]
2. **A free/leaked credential is an attacker's dream.** This is not hypothetical:
   researchers found **OpenAI keys exposed across 5,000+ GitHub repos and 3,000+
   production sites**, which attackers use to "execute high-volume inference
   workloads under the victim's billing umbrella."[^vicarius-keys] In one Feb-2026
   case a single leaked cloud API key ran up **$82,314.44 in a 24-hour window** against a
   $180/month baseline, and credential theft targeting AI services rose **376%** quarter
   over quarter — with the standard mitigation being **hard spend caps and
   application-level rate limiting**.[^transputec-llmsec]

Both problems have the *same* control: a hard per-user quota + per-key budget on the
free tier. That is exactly why every managed free tier ships tight caps — OpenRouter's
free models allow **20 requests/min and 50 requests/day** (only 1,000/day after a paid
top-up), Groq allows **30/min and 1,000/day**, and Google AI Studio **5–15/min**.[^openrouter-free]
The cap *is* the abuse control.

### Lever 3 — Model-access gating by plan

The final lever caps the **per-call** cost, not just the call count: restrict which
models each tier may invoke. Reserve expensive flagship / reasoning models for higher
tiers, and let free / low tiers reach only cheaper models. This became the dominant
consumer pattern in early 2026, when OpenAI, Anthropic, and Google all **restricted
flagship reasoning / pro models to paid tiers** and tightened free-tier message
caps.[^pecollective-freetiers] At the gateway, this is a per-tier allow-list of model
names (and, in LiteLLM, per-model `model_rpm_limit` / `model_tpm_limit` so premium
models can carry *stricter* quotas than economy ones even inside the same
tier).[^litellm-budgets]

### How the three levers compose into a bounded maximum

Together they give a hard ceiling that survives worst-case behavior:

- **Quota** bounds volume per user per period.
- **Model gating** bounds cost per call.
- **Per-key budget** bounds total spend per credential even if the quota logic is
  bypassed (e.g. a leaked key hitting the gateway directly) — the request simply fails
  once the budget is exhausted.[^litellm-budgets][^portkey-budgets]

Worst-case AI spend is then `per-user quota × cheapest-reachable-model price`, summed
over users, and can never exceed `per-key budget × active keys` — a number you can
state in advance rather than discover on an invoice.

## Example Where It Works

A note-taking app adds an "AI summarize" feature and exposes it on a free tier to
300,000 monthly active users. Suppose 15% engage with AI (**45,000 active AI users**);
at just **$0.10 per active AI user per month** that is already **$4,500/month
($54,000/year)** of pure free-tier cost — and that figure scales linearly with any
heavy-user tail or any abuse.[^revenuecat-margins]

Applying cost-aware tiers:

- **Free tier:** a hard quota of, say, 20 summaries/day per user, enforced as a
  gateway `rpm_limit` + daily `max_budget` with `budget_duration: "1d"`; free users can
  only invoke a small/cheap model (model gating).[^litellm-budgets][^litellm-tiers][^pecollective-freetiers]
- **Pro tier:** a much higher quota and access to the flagship model.
- **Every key** carries a per-key USD budget, so a scripted loop or a leaked free-tier
  token **fails closed** at its cap instead of billing tens of thousands of dollars
  overnight — directly averting the $82K-in-24-hours class of incident.[^transputec-llmsec][^portkey-budgets]

The free-tier cost is now bounded by `(users × 20 summaries × cheap-model price)`, a
fixed, forecastable number, and the abuse tail is eliminated — all without touching the
price of any plan.

## Example Where It Would NOT Work

- **A single-tier product with no free/trial surface and homogeneous paying users.**
  If every user is a paying customer on essentially the same plan doing the same
  workload, there is no *tier* structure to bound and no free-tier abuse surface; the
  right levers are per-account `budget-limits-guardrails` and simple rate limiting,
  not a tier system. Building tier machinery here is over-engineering.
- **A truly interactive workload where a hard cap breaks the core experience.** If the
  product's value depends on unlimited back-and-forth (e.g. a paid coding assistant
  whose users expect it to keep going), a mid-task quota cutoff produces a worse
  outcome than the marginal token cost — a badly-placed cap harms UX. Prefer a
  softer control (a `user-controlled-quality-mode` toggle, or a cheaper model) over a
  hard wall.
- **When caps become a monetization lever rather than a cost control.** If you find
  yourself tuning free-tier limits to *drive upgrades* rather than to *bound spend*,
  you have crossed into pricing strategy — a legitimate business decision, but outside
  this technique's scope, and one that trades off conversion against user goodwill
  rather than cost against risk.[^revenuecat-margins]

[^litellm-budgets]: LiteLLM Proxy Docs, "Budgets, Rate Limits" — <https://docs.litellm.ai/docs/proxy/users>
[^litellm-tiers]: LiteLLM Proxy Docs, "Budget / Rate Limit Tiers" — <https://docs.litellm.ai/docs/proxy/rate_limit_tiers>
[^portkey-budgets]: Portkey Enterprise Docs, "Usage & Rate Limit Policies" — <https://portkey.ai/docs/product/enterprise-offering/budget-policies>
[^revenuecat-margins]: RevenueCat Blog, "Subscription App Economics: The Hidden Cost of AI Features," 2026 — <https://www.revenuecat.com/blog/growth/ai-feature-cost-subscription-app-margins/>
[^transputec-llmsec]: Transputec, "LLM API Security: How Hackers Exploit AI APIs," 2026 — <https://www.transputec.com/blogs/llm-api-security/>
[^vicarius-keys]: Vicarius, "8,000+ ChatGPT API keys exposed across GitHub & production sites," 2026 — <https://www.vicarius.io/articles/8-000-chatgpt-api-keys-exposed-across-github-production-sites>
[^openrouter-free]: OpenRouter Blog, "Free LLM APIs in 2026: 13 Options Ranked and Compared," 2026 — <https://openrouter.ai/blog/tutorials/free-llm-apis-compared/>
[^pecollective-freetiers]: PE Collective, "11 AI Free Tiers Compared: Limits and Catches (2026)," 2026 — <https://pecollective.com/blog/ai-free-tiers-compared/>
