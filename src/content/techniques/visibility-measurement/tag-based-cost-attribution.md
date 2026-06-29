---
title: "Tag-Based Cost Attribution"
category: visibility-measurement
maturityLevel: 1
maturityProvisional: false
shortDescription: "Stamp every LLM call with one set of dimension tags (feature, customer, agent-run, prompt version, user) so a single undifferentiated bill can be sliced by any business dimension — the basis for killing a costly feature or pricing a heavy customer."
effort: Low
gain: Medium
riskToQuality: Low
effortWhy: "Low — one metadata field at the call site, or a virtual key at a gateway, applied at a single chokepoint; the seam is narrow on a centralized client."
gainWhy: "Medium — like observability, attribution saves no token itself; it is a targeting enabler every downstream lever needs before it can be aimed."
riskWhy: "Low — it only labels calls and never changes them, so there is no quality risk."
detectionSignals:
  - "No feature/customer answer — you can't say what feature X or customer Y costs without exporting logs and guessing."
  - "One lump per model — spend arrives undifferentiated, with no way to split it across features, tenants, or product surfaces."
  - "Invisible agent fan-out — you can't tie a multi-step run back to the request or user that triggered it."
  - "No before/after — prompt or model changes ship with no way to compare cost-per-call across the change."
  - "Guesswork pricing — an AI feature is priced by gut feel because per-customer unit cost is unknown."
measurementMethods:
  - "Attribution coverage — share of total spend carrying a feature/customer/agent-run tag, targeting near 100%."
  - "Rollup reconciliation — per-feature and per-customer cost totals matched against the provider invoice within a few percent."
  - "Dimension count — distinct axes you can slice spend by from one tagging primitive (feature, customer, agent-run, prompt version, user)."
  - "Time-to-answer — minutes from a dashboard vs. days of manual log work to say which customer or feature drove an increase."
status: published
lastUpdated: "2026-06-29"
related:
  - "visibility-measurement/token-cost-observability"
  - "visibility-measurement/cost-dashboards"
  - "visibility-measurement/unit-economics-cost-per-outcome"
sources:
  - id: cloudzero-finops
    title: "FinOps in the AI Era: A Critical Recalibration (press release: 40% of companies now spend more than $10M a year on AI)"
    publisher: "CloudZero (with Benchmarkit)"
    year: 2026
    url: "https://www.cloudzero.com/press-releases/20260212/"
    accessed: "2026-06-29"
    kind: blog
    note: "Just 43% of companies track costs by customer; fewer than a quarter (22%) track by transaction — so accurate pricing for AI offerings is 'largely guesswork.' AI spend now exceeds $10M/yr at 40% of surveyed companies."
  - id: cloudzero-state
    title: "The State of AI Costs"
    publisher: "CloudZero"
    year: 2026
    url: "https://www.cloudzero.com/state-of-ai-costs/"
    accessed: "2026-06-29"
    kind: blog
    note: "Stresses complete cost allocation — cost per feature, product, team, customer, microservice; 15% of companies have no formal cost-tracking system; vendor-native tools lack granular attribution."
  - id: langfuse-metadata
    title: "Metadata"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/metadata"
    accessed: "2026-06-29"
    kind: docs
    note: "Traces/observations carry tags, metadata (key-value), userId, sessionId. propagate_attributes() applies metadata to all nested observations in a context, so one stamp covers a whole agent run."
  - id: langfuse-cost
    title: "Token & cost tracking"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/token-and-cost-tracking"
    accessed: "2026-06-29"
    kind: docs
    note: "Metrics API retrieves aggregated usage/cost filterable by application type, user, or tags; prompt management links a prompt version to generations so cost can be sliced by prompt version."
  - id: litellm-tags
    title: "Request Tags for Spend Tracking"
    publisher: "LiteLLM Docs"
    year: 2026
    url: "https://docs.litellm.ai/docs/proxy/request_tags"
    accessed: "2026-06-29"
    kind: docs
    note: "Per-request tags via x-litellm-tags header, request body 'tags' array, or config; tags land in LiteLLM_SpendLogs.request_tags; multiple dimensions per request (e.g. engineering, project-alpha, customer-acme). spend_logs_metadata header logs custom JSON metadata."
  - id: bifrost-vkeys
    title: "Managing Virtual Keys and Budgets in Bifrost: A Complete Guide"
    publisher: "Maxim AI"
    year: 2026
    url: "https://www.getmaxim.ai/articles/managing-virtual-keys-and-budgets-in-bifrost-a-complete-guide/"
    accessed: "2026-06-29"
    kind: blog
    note: "Virtual keys (sk-bf-*) are drop-in SDK replacements; four nested scopes — Customer/business unit, Team, Virtual Key, Provider config. One key per team/customer means every request carries clean attribution at the gateway with no app-code change; costs deduct across levels at real-time pricing."
  - id: truefoundry-attr
    title: "LLM Cost Attribution at Scale: Metadata Tagging, Team Budgets, and Chargeback Reports"
    publisher: "TrueFoundry"
    year: 2026
    url: "https://www.truefoundry.com/blog/llm-cost-attribution-team-budgets"
    accessed: "2026-06-29"
    kind: blog
    note: "Attribution belongs at the gateway 'because that is where every provider call routes through anyway'; one metadata header carries team/app/feature/env/user; low-cardinality fields become metric labels, high-cardinality stay on traces; unlocks chargeback, budget enforcement, and per-feature/customer cost identification."
  - id: particula-tenant
    title: "Per-Tenant LLM Cost Attribution for Multi-Tenant SaaS"
    publisher: "Particula Tech"
    year: 2026
    url: "https://particula.tech/blog/per-tenant-llm-cost-attribution-multi-tenant-saas"
    accessed: "2026-06-29"
    kind: blog
    note: "Multi-tenant SaaS needs per-tenant cost to set margins and price; tagging each call with a tenant id is the mechanism; without it a shared key hides which customers are unprofitable."
---

## Overview

Token & cost observability gives you a per-call stream of *how much* each LLM request cost.
**Tag-based cost attribution** answers the next, harder question — ***for what?*** It is the
discipline of stamping every call with a small, consistent set of **dimension tags** —
`feature`, `customer_id`, `agent_run_id`, `prompt_version`, and `user` — so that the one
undifferentiated provider bill can be sliced along whatever axis a decision needs.

The cost problem it solves is *un-allocatable spend*. A growing AI bill that cannot be broken
down is a number you can watch rise but cannot act on. You cannot tell whether one runaway
feature, one heavy enterprise customer, or one verbose prompt version is responsible; you
cannot price an AI feature whose per-customer cost is unknown; and you cannot kill or re-route
the 5% of usage driving 60% of spend because you cannot see it. This is not a hypothetical gap:
in CloudZero's 2026 *FinOps in the AI Era* survey, **just 43% of companies track AI costs by
customer** and **fewer than a quarter (22%) track by transaction**, which the report concludes
makes pricing AI offerings "largely guesswork" — even as AI spend now exceeds **$10M/year at
40% of surveyed companies**.[^cloudzero-finops]

The reason this is **one Level-1 technique and not five** is the central insight: per-feature,
per-customer, per-agent-run, and per-prompt-version cost tracking are **the same mechanism
applied to different dimensions**. You build the call-site tagging primitive *once*; each new
question is just a new tag key or a new filter on data you are already capturing. It sits at
**Level 1** because it is low-to-medium effort (a metadata field at the call site, or a virtual
key at a gateway) and carries no quality risk — it only *labels* calls, it never changes them.
Its gain is **Medium**: like observability, attribution does not by itself save a token. It is a
**targeting enabler** — but a decisive one, because every downstream lever (right-sizing,
gating, batching, re-pricing) needs to know *where* the money goes before it can be aimed.

## Detailed Approach & Techniques

### The canonical 2026 tag set

Attach the same small schema to every call. The dimensions that earn their place:

- **`feature`** — which product surface or capability made the call (chat, summarizer, autocomplete).
  Answers "what does this feature cost?" → kill, gate, or right-size it.
- **`customer_id` / `tenant`** — the account the work was done for. The basis for per-customer
  unit economics, margins, and pricing in any multi-tenant SaaS; without it a shared API key
  hides which customers are unprofitable.[^particula-tenant]
- **`agent_run_id`** — the new first-class dimension in 2026. Agentic workloads fan out across
  many tool calls and sub-steps; a run id ties that whole tree of spend back to the one request
  (and user) that triggered it, so a $4 agent run is attributable rather than smeared across
  hundreds of anonymous calls.
- **`prompt_version`** (and model version) — lets you compare cost-per-call **before vs. after** a
  prompt or model change, catching a "harmless" edit that quietly doubled token usage.
- **`user`** / **`environment`** — round out the schema for abuse detection and keeping prod and
  eval traffic from contaminating each other.

The implementation rule of thumb mirrors what production gateways do: keep **low-cardinality**
fields (feature, env, customer-tier) as aggregatable metric labels, and keep **high-cardinality**
fields (user id, agent-run id) on the individual trace for drill-down — projecting every
high-cardinality value into a dashboard dimension explodes your metrics store.[^truefoundry-attr]

### Two mechanisms: call-site metadata vs. gateway virtual keys

There are two standard ways to make the tag travel with the call, and they are complementary.

**1. Metadata at the call site (instrumentation).** Pass the tags as structured metadata on each
request through your observability SDK. In **Langfuse**, every trace and observation carries
`tags`, `metadata` (key-value), `userId`, and `sessionId`; the Metrics API then returns
aggregated usage and cost **filterable by user, application type, or tags**, and prompt
management links a **prompt version** to its generations so spend can be sliced by prompt
iteration.[^langfuse-metadata][^langfuse-cost] The agent-run case is handled elegantly by
*propagation*: `propagate_attributes()` stamps a context so **all nested observations inherit the
tag automatically** — you label the run once at the top and every downstream tool call is
attributed without threading the id through your code.[^langfuse-metadata]

**2. Virtual keys / request tags at a gateway.** Route traffic through an AI gateway and let the
attribution happen at the hop every call already passes through — "attribution belongs at the
gateway, because that is where every provider call routes through anyway."[^truefoundry-attr]
Two flavors:

- **Per-request tags.** **LiteLLM** accepts tags via an `x-litellm-tags` header, a `tags` array in
  the request body, or model config; they land in `LiteLLM_SpendLogs.request_tags`, and you can
  apply **several dimensions to one call** — e.g. `["engineering", "project-alpha",
  "customer-acme"]` — to slice spend across cost centers simultaneously. A
  `spend_logs_metadata` header carries arbitrary custom JSON for finer attribution.[^litellm-tags]
- **Virtual keys.** **Bifrost** issues scoped credentials (`sk-bf-*`) as drop-in SDK replacements,
  so issuing **one key per team, project, or customer** means every request carries clean
  attribution from the moment it enters the gateway — **with no application-code change** — across
  four nested scopes: **Customer / Team / Virtual Key / Provider**, with costs deducting across
  levels at real-time pricing.[^bifrost-vkeys]

The build line: the gateway path gives you attribution for essentially zero app code (at the cost
of a hop and some coupling); call-site metadata gives finer, in-process control (feature and
agent-run ids your gateway can't infer) at the cost of threading tags through your code. Most
teams combine them — virtual keys for the coarse customer/team axis, call-site metadata for
`feature` / `agent_run_id` / `prompt_version`.

### Retrofitting onto an existing codebase

This is cheap to add later because the seam is narrow. If you already centralize calls behind a
client wrapper or a gateway (the observability foundation), there is **one place** to inject the
tags; the dimensions then flow into the same spend logs you already keep. The effort is in
**defining a consistent schema** (a fixed enum of feature names, a reliable customer-id source)
and threading the agent-run id through long workflows — not in heavy engineering. Coverage is the
metric that matters: the value is proportional to the **share of spend that carries a tag**, so
aim for near-100% rather than a perfect taxonomy on a fraction of calls.

### What attribution unlocks

Attribution is upstream of the decisions that actually save money:[^cloudzero-state][^truefoundry-attr]

- **Kill or re-route a costly feature** — once you can see one feature is 60% of the bill for 5%
  of the value, you gate it, right-size its model, or cut it.
- **Price (or re-price) a heavy customer** — per-customer cost turns "largely guesswork"
  pricing[^cloudzero-finops] into real unit economics: charge the heavy tenant, or set a usage
  cap that protects your margin (feeds *Unit Economics: Cost per Outcome*).
- **Chargeback / showback** — allocate spend to the team or business unit that incurred it.
- **Catch regressions** — a `prompt_version` slice flags the edit that doubled cost-per-call.

## Example Where It Works

A multi-tenant B2B SaaS runs three AI features (chat assistant, document summarizer, background
enrichment) for hundreds of customers, all on a shared provider key. The bill is one line per
model; finance asks "are our top-tier accounts profitable?" and nobody can answer.

The team issues a **per-customer virtual key** at their gateway and adds a `feature` and
`agent_run_id` tag at the call site.[^bifrost-vkeys][^langfuse-metadata] Within a billing cycle,
with **no model or prompt changes**, the picture resolves: three enterprise tenants on a flat
plan account for nearly half of spend — driven almost entirely by the **enrichment agent**, whose
multi-step tool fan-out (now tied together by `agent_run_id`) was invisible before.[^langfuse-metadata]
Two decisions follow immediately: the flat-rate enterprise plan gets a usage-based add-on (the
per-customer cost is now a real number, not guesswork[^cloudzero-finops]), and the enrichment
agent gets a per-run budget cap. The savings come from those decisions — but they were only
*possible* because the spend was attributable. The same tags later make a `prompt_version`
A/B trivial: ship v2 to 10% of traffic, compare cost-per-call by tag, keep the cheaper one.

## Example Where It Would NOT Work

Attribution is an enabler, so it disappoints exactly when the surrounding conditions don't reward
targeting:

- **A single-feature, single-tenant product.** If the app is one feature serving one customer
  base on one model, there is nothing to slice — every call is "the product." The provider's own
  usage dashboard already tells you everything attribution would, and a tagging schema is
  ceremony out of proportion to the insight.

- **Tags without a decision.** A team adds five dimensions to every call, builds the rollups, and
  then... changes nothing. Spend is now beautifully attributable and exactly as high as before.
  Attribution only pays off when a slice triggers an action (kill, gate, re-price, cap); on its
  own it is overhead — which is precisely why its gain is Medium, not High.

- **Low or inconsistent coverage.** If only 30% of calls are tagged, or `feature` is a free-text
  field with twelve spellings of the same thing, the rollups don't reconcile to the invoice and
  nobody trusts them. A high-cardinality field (raw user id) shoved into every dashboard
  dimension also blows up the metrics store.[^truefoundry-attr] Partial or sloppy attribution is
  worse than none: it manufactures confident wrong answers. The fix is a small fixed schema
  applied at one chokepoint with near-complete coverage, not a sprawling taxonomy on a fraction
  of traffic.

[^cloudzero-finops]: CloudZero (with Benchmarkit), "FinOps in the AI Era: A Critical Recalibration" (press release, Feb 2026) — <https://www.cloudzero.com/press-releases/20260212/>
[^cloudzero-state]: CloudZero, "The State of AI Costs" — <https://www.cloudzero.com/state-of-ai-costs/>
[^langfuse-metadata]: Langfuse Docs, "Metadata" (tags, userId, sessionId, propagate_attributes) — <https://langfuse.com/docs/observability/features/metadata>
[^langfuse-cost]: Langfuse Docs, "Token & cost tracking" (Metrics API filter by user/tags; cost by prompt version) — <https://langfuse.com/docs/observability/features/token-and-cost-tracking>
[^litellm-tags]: LiteLLM Docs, "Request Tags for Spend Tracking" — <https://docs.litellm.ai/docs/proxy/request_tags>
[^bifrost-vkeys]: Maxim AI, "Managing Virtual Keys and Budgets in Bifrost: A Complete Guide" — <https://www.getmaxim.ai/articles/managing-virtual-keys-and-budgets-in-bifrost-a-complete-guide/>
[^truefoundry-attr]: TrueFoundry, "LLM Cost Attribution at Scale: Metadata Tagging, Team Budgets, and Chargeback Reports" — <https://www.truefoundry.com/blog/llm-cost-attribution-team-budgets>
[^particula-tenant]: Particula Tech, "Per-Tenant LLM Cost Attribution for Multi-Tenant SaaS" — <https://particula.tech/blog/per-tenant-llm-cost-attribution-multi-tenant-saas>
