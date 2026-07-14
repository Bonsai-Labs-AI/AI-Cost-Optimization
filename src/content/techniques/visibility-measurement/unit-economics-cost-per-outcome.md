---
title: "Unit Economics: Cost per Outcome"
category: visibility-measurement
maturityLevel: 3
maturityProvisional: false
shortDescription: "Measure AI cost per resolved business outcome (a closed ticket, a completed agent task, a shipped PR) instead of per token or per call, and track AI unit margin — so you can answer whether a feature or customer is actually profitable per use."
effort: Medium
gain: Medium
riskToQuality: Low
effortWhy: "Requires wiring an outcome ID through every call/tool/retry of a trace and joining it to a value-per-outcome model — cross-system work on top of existing attribution and eval foundations."
gainWhy: "Not a direct cost cut; it's the decision layer that reveals which features and customers are margin-negative and where every other optimization should be aimed."
riskWhy: "Purely a measurement technique — it changes no production behavior, so it cannot degrade output quality."
detectionSignals:
  - "Cost is tracked per token or per call, but nobody can answer 'what does one closed ticket / completed task cost us in AI?'"
  - "No AI unit-margin metric: cost per outcome is never compared to the revenue or value that outcome produces."
  - "An agentic feature where one user outcome spans many model calls, retries, and tool calls, and spend is only visible as an undifferentiated total."
  - "Flat-rate or seat-based pricing sits on top of a variable-cost AI feature, so a few heavy users can be silently unprofitable."
  - "You cannot break spend down by feature or customer, only by model or API key."
measurementMethods:
  - "Cost per outcome, sliced by feature and by customer (total AI cost of all calls/tools/retries in a trace ÷ resolved outcomes)."
  - "AI unit margin: value-per-outcome (revenue, deflected labor, or willingness-to-pay) minus cost-per-outcome."
  - "Percentage of outcomes that are margin-negative, and the share of total spend they consume."
  - "Cost-per-outcome trend as volume scales (falling unit cost on rising total spend = healthy scaling)."
status: published
lastUpdated: "2026-07-03"
related:
  - "visibility-measurement/tag-based-cost-attribution"
  - "visibility-measurement/quality-cost-evaluation-suite"
  - "product-ux/cost-aware-product-tiers"
  - "agent-workflow/agent-budget-guardrails"
sources:
  - id: cz-cue-2026
    title: "Cloud Unit Economics In 2026: The Bridge Between Spend And Business Value"
    publisher: "CloudZero"
    year: 2026
    url: "https://www.cloudzero.com/guide/cloud-unit-economics-2026/"
    accessed: "2026-07-03"
    kind: blog
    note: "Unit economics = spend per unit of value; total spend can rise while unit cost (e.g. cost per 1M tokens, cost per 1,000 orders) falls — that's efficient scaling. Cloud Efficiency Rate frames cost as a fraction of revenue."
  - id: cz-glossary
    title: "CloudZero's FinOps Cost-Per-Unit Glossary"
    publisher: "CloudZero"
    year: 2026
    url: "https://www.cloudzero.com/blog/finops-cost-per-unit-glossary/"
    accessed: "2026-07-03"
    kind: blog
    note: "Definitions of cost per customer, cost per transaction, cost per inference; unit cost reveals which customers/features/operations are economically viable where aggregate spend obscures it."
  - id: cz-finops-ai
    title: "FinOps for AI: What It Is And Why AI Changes Cloud Cost Management"
    publisher: "CloudZero"
    year: 2026
    url: "https://www.cloudzero.com/blog/finops-for-ai/"
    accessed: "2026-07-03"
    kind: blog
    note: "FinOps-for-AI maturity (Crawl/Walk/Run); tying AI cost to outcomes and product lines/customers/revenue is the 'Run' stage; only ~51% of teams feel confident measuring AI ROI."
  - id: cz-ai-cost-mgmt
    title: "AI Cost Management: How To Track, Allocate And Optimize AI Spend"
    publisher: "CloudZero"
    year: 2026
    url: "https://www.cloudzero.com/blog/ai-cost-management/"
    accessed: "2026-07-03"
    kind: blog
    note: "'AI cost allocation for shared AI workloads requires request-level attribution, not resource-level tagging'; tags attribute 0% correctly when many teams share one API key."
  - id: langfuse-datamodel
    title: "Data Model — Traces, Observations, Sessions"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/data-model"
    accessed: "2026-07-03"
    kind: docs
    note: "A trace = one request/operation; observations (generations, tool calls, retrieval) nest inside it; user_id, session_id, tags, metadata propagate to all observations; traces group into sessions for multi-turn interactions."
  - id: langfuse-users
    title: "User Tracking"
    publisher: "Langfuse Docs"
    year: 2026
    url: "https://langfuse.com/docs/observability/features/users"
    accessed: "2026-07-03"
    kind: docs
    note: "Setting userId lets Langfuse aggregate LLM usage cost, token usage, and trace counts per user via the Metrics API and custom dashboards."
  - id: helicone-cost
    title: "Cost Tracking & Optimization"
    publisher: "Helicone Docs"
    year: 2026
    url: "https://docs.helicone.ai/guides/cookbooks/cost-tracking"
    accessed: "2026-07-03"
    kind: docs
    note: "Custom-property headers (Helicone-Property-Feature/UserTier/Environment) slice cost by business dimension; Helicone-Session-Id groups multi-call requests so cost rolls up to a session (e.g. a support chat = $0.12 over 5 calls; a doc-analysis workflow = $0.45 over 12 calls)."
  - id: intercom-outcomes
    title: "Fin AI Agent outcomes"
    publisher: "Intercom Help"
    year: 2026
    url: "https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes"
    accessed: "2026-07-03"
    kind: docs
    note: "Fin bills $0.99 per resolution (a delivered, non-escalated answer the customer confirms or exits satisfied), once per conversation regardless of how many actions Fin took — an outcome-priced, not token-priced, AI product."
---

## Overview

Almost every AI cost dashboard measures the wrong thing for a product decision. It reports
**cost per token** or **cost per call** — the denominators the *provider* bills you in. But
no product manager ever ships a feature because tokens got cheaper; they ship it because a
*unit of business value* is profitable to produce. The question that actually decides a
feature's fate is: **"what does one resolved ticket / one completed agent task / one shipped
PR cost us in AI, and is that less than what the outcome is worth?"** Per-token cost cannot
answer it.

**Unit economics for AI** replaces the token denominator with a **business-outcome
denominator**. You define what an "outcome" is for your product, roll up the *full
end-to-end AI cost* of producing it — every model call, retry, tool call, and
human-in-the-loop assist that contributed — and divide total AI spend by resolved outcomes.
That gives **cost per outcome**. Set it against **value per outcome** (the revenue, the
labor it deflects, or the price you charge) and you get the metric that actually matters:
**AI unit margin**.[^cz-cue-2026][^cz-glossary]

The reason total spend can't substitute is that it hides the distribution. As CloudZero puts
it, *"knowing that you spent $650,000 on compute last month doesn't tell you much about the
economics of the service you're delivering"* — and total spend can even *rise* while unit
cost *falls*, which is healthy scaling, not a problem.[^cz-cue-2026] Only a per-outcome view
tells you *which* features and *which* customers are margin-negative, so you know where every
other optimization on this pyramid should be aimed.

This is the **capstone visibility technique**, and it sits at **Level 3** for a concrete
reason: it is not a metric you can bolt on. It requires the **L1 attribution foundation**
(spend already resolvable to a request, feature, and customer rather than one blended total),
the **L2 evaluation foundation** (so a "resolved outcome" is a *quality-gated* success, not
just "a response was returned"), *plus* a business-outcome model wired through the trace. That
is real cross-system engineering, not off-the-shelf config.

## Detailed Approach & Techniques

### 1. Define the outcome (the denominator)

An "outcome" is a **completed unit of business value**, not a technical event. Good
denominators are things a stakeholder would recognize: a *resolved support ticket*, a
*completed agent task*, a *shipped/merged PR*, a *qualified lead*, a *generated-and-accepted
document*. The sharpest real-world example is **Intercom Fin**, which is *priced* on exactly
this unit: **$0.99 per resolution**, where a resolution is a delivered, non-escalated answer
the customer confirms or exits satisfied — billed **once per conversation regardless of how
many actions Fin took** internally.[^intercom-outcomes] That is a whole product built on
cost-per-outcome thinking rather than cost-per-token thinking.

Two subtleties matter:

- **Gate the outcome on quality.** A "resolved" ticket that the user immediately reopens is
  not an outcome — it's a failure you paid for. This is why the technique depends on an eval
  suite: the outcome must be a *quality-passing* success, or your denominator is inflated by
  bad results. (See *Quality/Cost Evaluation Suite*.)
- **Pick the unit the business prices in.** If you charge per seat but cost is driven per
  task, seat-based revenue can hide task-based losses — so measure the cost unit that maps to
  the *value* unit you'll compare it against.

### 2. Roll up full end-to-end cost to that outcome

The hard part is the **rollup**, and it is exactly what the token denominator lets people
avoid. A single outcome in a modern agentic product is *not* one call. It is a **trace**: a
planning call, several tool calls, retrieved-context calls, retries after a failure, maybe a
verifier or a cascade escalation, and possibly a human reviewer's assist — all of which must
sum onto **one outcome ID**.

Observability tools give you the primitives for this:

- **Trace = one outcome.** In Langfuse, *a trace represents a single request/operation, and
  observations (generations, tool calls, retrieval steps) nest inside it*; trace-level
  `user_id`, `session_id`, `tags`, and `metadata` **propagate to every observation**, so the
  outcome identity you stamp on the trace attaches to every call underneath it.[^langfuse-datamodel]
  Traces group into **sessions** for multi-turn interactions — the natural unit when one
  outcome spans a whole conversation.[^langfuse-datamodel]
- **Sessions roll up multi-call cost.** Helicone makes the rollup explicit: a
  `Helicone-Session-Id` (e.g. `support-ticket-123`) groups every request in an interaction so
  you see *the true cost of the interaction rather than individual API calls* — their own
  examples show *a support chat averaging **$0.12 across 5 API calls** and a document-analysis
  workflow **$0.45 across 12 calls**.*[^helicone-cost] That per-session dollar figure *is*
  cost per outcome.
- **Tag by business dimension.** Both tools let you attach custom dimensions —
  `Helicone-Property-Feature`, `Helicone-Property-UserTier`, or Langfuse `tags`/`user_id` —
  so the same rollup slices by **feature** and by **customer**.[^helicone-cost][^langfuse-users]

Critically, this must be **request-level attribution, not resource-level tagging**. CloudZero
is blunt about why: *"when five teams hit the same model endpoint through one API key, tags
attribute zero percent of that spend correctly … AI cost allocation for shared AI workloads
requires request-level attribution, not resource-level tagging."*[^cz-ai-cost-mgmt] Cloud
resource tags simply can't see inside a shared LLM endpoint; you have to instrument the
request.

### 3. Compute unit margin, not just unit cost

Cost per outcome is only half the metric. Pair it with **value per outcome**:

> **AI unit margin = value per outcome − AI cost per outcome**

Value can be revenue (Fin's $0.99), deflected human labor (a ticket a human would answer in
~8 minutes at $25/hr ≈ $3.33), or the price a plan charges. The framing generalizes
CloudZero's **cost-per-customer / cost-per-transaction** metrics — each *"reveals whether a
customer contract remains profitable relative to their usage"* and *"demonstrates the
marginal cost of core product actions."*[^cz-glossary] At the aggregate level the same idea
appears as a **Cloud Efficiency Rate** — cost as a fraction of revenue, e.g. *sending $0.20
to your providers for every $1.00 of revenue.*[^cz-cue-2026]

The decision outputs that make this worth the engineering:

- **% of outcomes that are margin-negative** and the share of spend they consume (the classic
  "5% of power users burn 60% of the AI budget" finding).
- **Cost-per-outcome trend vs. volume** — a *falling* unit cost on *rising* total spend is
  efficient scaling, the exact signal total-spend dashboards obscure.[^cz-cue-2026]
- A defensible input to **pricing and gating** decisions downstream (see *Cost-Aware Product
  Tiers*, *Agent Budget Guardrails*).

### 4. Why this is Level 3 (the maturity dependencies)

Tying AI cost to outcomes is what CloudZero calls the **"Run" stage** of FinOps-for-AI
maturity — the top of a Crawl → Walk → Run model, reached only after cost visibility and
budget accountability are already in place; and it's genuinely hard, with *only ~51% of teams
confident they can measure AI ROI at all.*[^cz-finops-ai] Concretely it stacks on:
**L1 tag-based attribution** (spend already resolvable per request/feature/customer), an
**L2 eval suite** (so an outcome is quality-gated), and a **business-outcome model wired
through the trace**. Missing any layer and the number is either unattributable, inflated by
low-quality "successes," or disconnected from value.

## Example Where It Works

A B2B support product runs an **agentic** ticket resolver. Leadership sees the monthly AI
bill climbing and a token dashboard that says "input tokens up 30%" — useless for deciding
whether the feature is healthy.

The team instruments a **trace per ticket**, stamping a `ticket_id` and `customer_id` on the
trace so all nested calls (a triage classification, 3–4 retrieval calls, two tool lookups,
one retry, and an occasional human-agent assist) roll up to one outcome — the same
session-rollup pattern Helicone documents, where a support interaction's true cost is the sum
across its 5-ish calls, not any single one.[^helicone-cost][^langfuse-datamodel] They divide
quality-gated resolutions into total AI spend and get **cost per resolved ticket ≈ $0.60**.

Now the decisions unlock:

- Against a **value per resolution** of ~$3.33 in deflected labor, unit margin is strongly
  positive — the feature is profitable, so *invest*, don't cut.[^cz-glossary]
- Slicing by `customer_id`, they find **two enterprise accounts on flat pricing** whose
  self-serve agents run 8–10 calls per ticket at a cost per outcome **above** their blended
  contract value — **margin-negative customers** that the aggregate bill completely hid.[^cz-cue-2026][^cz-finops-ai]
- Because total spend was *rising* while cost-per-ticket was *falling* as volume grew, they
  can tell finance this is **efficient scaling**, not a cost problem — a story the total-spend
  chart couldn't support.[^cz-cue-2026]

The metric didn't save a dollar by itself; it told them *where* to aim caching, routing, and
tiering (the margin-negative accounts) and *what not to touch* (the profitable majority).

## Example Where It Would NOT Work

- **No attribution or eval foundation yet.** If spend is still one blended total behind a
  shared API key, there is nothing to roll up — *"tags attribute zero percent of that spend
  correctly"* — and if there's no quality gate, your "resolved outcomes" include failures you
  paid for, so cost-per-outcome is meaningless. Build **L1 attribution** and the **L2 eval
  suite** first; this technique has hard prerequisites.[^cz-ai-cost-mgmt][^cz-finops-ai]

- **Single-call, uniform, tiny workloads.** For a one-shot classifier or autocomplete where
  every request is essentially identical and cheap, an outcome *is* a call — the elaborate
  trace-rollup and value-model machinery is overhead with nothing to reveal. **Cost per call
  (an L1 metric) already answers the question**; reserve unit-economics engineering for
  multi-call, variable-cost, agentic features.

- **No stable notion of an "outcome" or its value.** Open-ended creative or exploratory tools
  where a "session" has no discrete success event, or where value-per-use is genuinely
  unknowable, give you a denominator you can't define and a margin you can't compute. Forcing
  a fake outcome boundary produces a precise-looking number that misleads product
  decisions.[^cz-glossary]

- **When the instrumentation costs more than the insight.** Wiring an outcome ID and a
  value model through every trace is real cross-system work; on a low-volume feature with a
  small, stable bill, the engineering won't pay back. Unit economics earns its keep at the
  **scale and variability** where a few features or customers can be quietly
  unprofitable.[^cz-cue-2026]

[^cz-cue-2026]: CloudZero, "Cloud Unit Economics In 2026" — <https://www.cloudzero.com/guide/cloud-unit-economics-2026/>
[^cz-glossary]: CloudZero, "FinOps Cost-Per-Unit Glossary" — <https://www.cloudzero.com/blog/finops-cost-per-unit-glossary/>
[^cz-finops-ai]: CloudZero, "FinOps for AI" — <https://www.cloudzero.com/blog/finops-for-ai/>
[^cz-ai-cost-mgmt]: CloudZero, "AI Cost Management: How To Track, Allocate And Optimize AI Spend" — <https://www.cloudzero.com/blog/ai-cost-management/>
[^langfuse-datamodel]: Langfuse Docs, "Data Model — Traces, Observations, Sessions" — <https://langfuse.com/docs/observability/data-model>
[^langfuse-users]: Langfuse Docs, "User Tracking" — <https://langfuse.com/docs/observability/features/users>
[^helicone-cost]: Helicone Docs, "Cost Tracking & Optimization" — <https://docs.helicone.ai/guides/cookbooks/cost-tracking>
[^intercom-outcomes]: Intercom Help, "Fin AI Agent outcomes" — <https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes>
