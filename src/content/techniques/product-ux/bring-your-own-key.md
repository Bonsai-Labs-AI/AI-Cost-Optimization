---
title: "Bring-Your-Own-Key (BYOK)"
category: product-ux
maturityLevel: 1
maturityProvisional: false
shortDescription: "Let customers supply their own model-provider API key (or connect their own cloud AI account) so inference is billed directly to them, removing token cost from your COGS entirely while you charge for the product/outcome."
effort: Low
gain: High
riskToQuality: Low
effortWhy: "A key-paste (or OAuth) field, encrypted storage, and a proxy that swaps in the customer's key — days of work, not a re-architecture; managed platforms (OpenRouter, Bedrock, Azure) expose it as a config."
gainWhy: "Moves 100% of inference token cost off your P&L onto the customer's provider account, protecting gross margin outright and removing your exposure to inference price and usage-spike risk — the most direct margin lever as inference commoditizes."
riskWhy: "Billing changes, not model behavior — the same model runs the same prompts; the main quality caveat is losing control over which model/version the customer's account resolves to."
detectionSignals:
  - "Inference token cost is a large, growing line in COGS and is dragging blended gross margin below the ~70–80% SaaS norm."
  - "You are being pushed toward cost-plus pricing where the markup on inference is visible and compressing toward zero."
  - "Customers are developers or prosumers who already hold their own OpenAI/Anthropic/Google/cloud provider accounts."
  - "Enterprise buyers ask for committed-use discounts, data residency, or 'run it in our cloud' — signals they want to own the inference relationship."
  - "A few power users generate usage spikes that would blow up a flat-priced plan's unit economics."
measurementMethods:
  - "Inference COGS as a share of revenue (and blended gross margin %) before vs. after BYOK adoption."
  - "Share of active accounts / inference volume running on customer-supplied keys vs. your managed keys."
  - "Conversion / activation rate on the key-entry step (to confirm BYOK is not killing signup on a given tier)."
  - "Support ticket volume attributable to customers' own rate limits, quota, or provider billing issues."
status: published
lastUpdated: "2026-07-21"
related:
  - "product-ux/cost-aware-product-tiers"
  - "product-ux/ai-feature-gating"
  - "model-routing/local-open-weight-substitution"
sources:
  - id: openrouter-byok
    title: "BYOK — Use Your Own Provider Keys with OpenRouter"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/use-cases/byok"
    accessed: "2026-07-21"
    kind: docs
    note: "Customer provider keys are encrypted and used for all requests routed to that provider; keys are attempted first with optional fallback to shared credits (or 'Always use for this provider' to disable fallback). The platform fee for using custom keys is 5% of the normal model cost, waived for the first 1M BYOK requests/month. BYOK gives 'direct control over rate limits and costs via your provider account.'"
  - id: cursor-byok
    title: "Bring your own API key"
    publisher: "Cursor Docs"
    year: 2026
    url: "https://cursor.com/help/models-and-usage/api-keys"
    accessed: "2026-07-21"
    kind: docs
    note: "A shipping developer-tool BYOK example. Supports OpenAI, Anthropic, Google, Azure OpenAI, and AWS Bedrock keys; keys are sent to Cursor's backend per request over encrypted connections and not persisted after the request. Tab completion still uses Cursor's built-in models, and Zero Data Retention does not apply on custom keys."
  - id: azure-cmk
    title: "Azure OpenAI encryption of data at rest — customer-managed keys (BYOK)"
    publisher: "Microsoft Learn"
    year: 2026
    url: "https://learn.microsoft.com/en-us/azure/ai-foundry/openai/encrypt-data-at-rest?view=foundry-classic"
    accessed: "2026-07-21"
    kind: docs
    note: "Data is encrypted with FIPS 140-2 compliant 256-bit AES. Customer-managed keys (CMK), 'also known as Bring your own key (BYOK),' let the customer create, rotate, disable, revoke, and audit the keys, stored in Azure Key Vault. The enterprise variant of BYOK: the customer owns the key material and access controls."
  - id: bedrock-pt
    title: "Increase model invocation capacity with Provisioned Throughput in Amazon Bedrock"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html"
    accessed: "2026-07-21"
    kind: docs
    note: "Enterprises can reserve dedicated inference capacity with 1-month or 6-month commitments; committed tiers are materially cheaper per hour than no-commit. Evidence that enterprise customers often already hold committed-use provider discounts, which BYOK lets them apply to your product's inference."
  - id: byoc-northflank
    title: "Bring Your Own Cloud (BYOC): the future of enterprise SaaS deployment"
    publisher: "Northflank Blog"
    year: 2026
    url: "https://northflank.com/blog/bring-your-own-cloud-byoc-future-of-enterprise-saas-deployment"
    accessed: "2026-07-21"
    kind: blog
    note: "Defines BYOC — software deployed inside the customer's own cloud account so data, network, and compliance stay under the customer's control (GDPR, data residency). The enterprise generalization of BYOK from a single API key to the whole inference account/environment."
  - id: tanayj-margins
    title: "The Gross Margin Debate in AI"
    publisher: "Tanay Jaipuria (tanayj.com)"
    authors: "Tanay Jaipuria"
    year: 2025
    url: "https://www.tanayj.com/p/the-gross-margin-debate-in-ai"
    accessed: "2026-07-21"
    kind: blog
    note: "AI application-layer gross margins run far below the 70–80% SaaS norm — ~25% for high-growth 'Supernovas' vs. ~60% for steadier companies, some negative — because COGS is tied to 'someone else's price card.' Model providers sit ~50–60%. Margin can be defended by decoupling value capture from raw token pass-through."
  - id: tunguz-inference
    title: "So You Want to Sell Inference"
    publisher: "Tomasz Tunguz (tomtunguz.com)"
    authors: "Tomasz Tunguz"
    year: 2025
    url: "https://tomtunguz.com/so-you-want-to-sell-inference/"
    accessed: "2026-07-21"
    kind: blog
    note: "Reselling inference at a markup is 'a payment rail, not a software company': as inference commoditizes the markup compresses toward zero and customers can route around you with raw APIs. Value/outcome pricing 'decouples pricing from raw compute' and survives even when customers bring their own keys, where cost-plus 'breaks' because the markup becomes a 'visible tax.'"
  - id: openrouter-byok-overview
    title: "BYOK — Bring Your Own Keys to OpenRouter"
    publisher: "OpenRouter Documentation"
    year: 2026
    url: "https://openrouter.ai/docs/guides/overview/auth/byok"
    accessed: "2026-07-21"
    kind: docs
    note: "Companion overview page: keys are securely encrypted; multiple keys per provider with filtering by model/API key/workspace member; priority ordering before fallback. Confirms BYOK as a first-class, productized platform primitive."
---

## Overview

Every AI feature you ship carries a token cost, and unlike traditional SaaS that cost does
not fall to near-zero at scale — it is a per-request **cost of goods sold (COGS)** priced by
your model provider. This is why application-layer AI companies run gross margins far below
the classic **70–80% SaaS norm**: roughly **~25% for the fastest-growing "Supernovas" and
~60% for steadier companies**, with some negative, because their COGS is tied to "someone
else's price card."[^tanayj-margins] Every optimization elsewhere in this catalog attacks
that COGS by making each call cheaper. **Bring-Your-Own-Key (BYOK) removes it from your books
entirely.**

Under BYOK, the customer supplies their **own** model-provider API key (or connects their own
cloud AI account); your product **proxies inference calls using that key**, so the tokens are
billed straight to the customer's provider account. You stop being a reseller of inference and
go back to charging for the **product and the outcome** — seats, workflows, resolved tickets —
while the raw compute is the customer's line item, not yours. Concretely, developer tools like
**Cursor** let a user paste their OpenAI, Anthropic, Google, Azure OpenAI, or AWS Bedrock key;
routing platforms like **OpenRouter** expose BYOK as a first-class feature where "your provider
keys are securely encrypted and used for all requests routed through the specified
provider."[^cursor-byok][^openrouter-byok]

The strategic case is straightforward. As inference commoditizes, **cost-plus pricing "breaks"** — the
markup on tokens "compresses toward zero," customers can route around you with the raw API, and
any visible inference markup becomes "a visible tax."[^tunguz-inference] BYOK sidesteps that
race: because you are not marking up tokens at all, you cannot be undercut on tokens. It pairs
naturally with **outcome- and seat-based pricing**, it shifts **usage-spike risk** onto the
customer (a runaway power user hits *their* provider bill, not your margin), and it is exactly
what many **enterprise** buyers want anyway — they often already hold **committed-use provider
discounts** and have **data-residency** obligations they would rather satisfy in their own
account.[^bedrock-pt][^azure-cmk] It sits at **Level 1** because it is a **low-effort, high-gain,
low-quality-risk** lever — but, as covered below, it is a business-model choice with real
trade-offs, and it is wrong for whole classes of product.

## Detailed Approach & Techniques

### How it works technically

The mechanism is small. You add a place for the customer to **provide a credential** — most
commonly pasting a provider API key, sometimes an OAuth/connect flow to their cloud AI account —
and your inference client **swaps that credential in** when it calls the provider on their
behalf. Your app still owns the prompt construction, tools, and orchestration; only the
`Authorization` header (and the billing relationship behind it) changes. OpenRouter's productized
version illustrates the pattern: customer keys are **attempted first**, with optional **fallback**
to shared credits, or an **"Always use for this provider"** toggle that disables fallback so
requests use *only* the customer's key.[^openrouter-byok] Cursor's version is the plain
key-paste: supported for OpenAI, Anthropic, Google, Azure OpenAI, and Bedrock, with the key
**sent to the backend per request over encrypted connections and not persisted afterward**.[^cursor-byok]

### Key storage and security — the liability you take on

Holding someone else's provider key is a security responsibility, and it is the part teams most
often under-build. The baseline:

- **Encrypt at rest.** Store keys in a secrets manager / KMS, never in plaintext columns. The
  managed platforms make encryption the explicit contract — OpenRouter states keys are "securely
  encrypted."[^openrouter-byok-overview]
- **Never log the key** — not in request logs, error traces, or analytics. Redact it before it
  reaches any observability pipeline.
- **Scope and limit.** Prefer the narrowest credential the provider offers (project/service keys
  over root keys), and let customers **rotate and revoke** without contacting you. One low-liability
  design is to **not persist at all** and hold the key only for the life of the request, as Cursor
  documents.[^cursor-byok]
- **Set expectations on data handling.** BYOK often changes the data path: Cursor notes that its
  **Zero Data Retention policy does not apply** when a custom key is used, because data now flows
  under the customer's provider agreement.[^cursor-byok]

### Business rationale — why this is the most direct margin lever

- **It protects gross margin outright.** Inference COGS is what drags AI-app margins below the SaaS
  norm; BYOK moves that cost line to the customer, so your revenue is no longer net of a volatile,
  provider-priced COGS.[^tanayj-margins]
- **It avoids cost-plus pricing pressure.** You are not selling tokens with a markup that
  commoditization erodes; you sell the product, and price on value/outcome, which "decouples pricing
  from raw compute" and survives BYOK where cost-plus does not.[^tunguz-inference]
- **It shifts usage-spike risk to the customer.** A heavy user's burst of usage hits *their* provider
  quota and bill, not your unit economics — removing the tail risk that forces conservative rate caps
  on flat-priced plans.
- **It fits enterprise procurement.** Large customers frequently hold **committed-use / provisioned
  discounts** (e.g. Bedrock 1-/6-month commitments, materially cheaper than on-demand) and have
  **residency/compliance** needs; BYOK lets them apply their own negotiated rate and keep the
  inference relationship inside their own account.[^bedrock-pt][^azure-cmk]

### Variants

- **Pure BYOK.** Every customer must supply a key; you never touch inference billing. Cleanest
  margins, highest signup friction — viable when the audience already has keys (developer tools).[^cursor-byok]
- **Hybrid / by-tier.** You offer **managed keys on lower/consumer tiers** (frictionless, you eat the
  inference and price it in) and **BYOK on higher/enterprise tiers** (they own the cost). This is the
  common answer and pairs directly with *Cost-Aware Product Tiers* and *AI Feature Gating*.
- **Customer-managed keys (CMK).** The enterprise security flavor: the customer owns the **encryption**
  key material (not just an API key) in their own vault. Azure literally labels CMK "also known as
  Bring your own key," giving the customer create/rotate/disable/revoke/audit control.[^azure-cmk]
- **Bring-Your-Own-Cloud (BYOC).** The full generalization: your software runs **inside the customer's
  own cloud account**, so inference, data, and network all stay under their control and compliance
  boundary (GDPR, data residency) — the inference bill is simply part of their cloud spend.[^byoc-northflank]

### Where it does NOT work — the honest trade-offs

- **Consumer / low-friction products.** Asking a non-technical user to create a provider account and
  paste an API key is a **conversion killer**. For these, managed keys (and the *cost-aware tiers* /
  *local open-weight substitution* levers) are the answer, not BYOK.
- **Loss of control over model and version.** With the customer's account, *they* control which model
  and version resolves, org-level safety settings, and rate limits — you lose a lever over **quality
  and safety** consistency. (This is the one real quality caveat; the prompts and code are unchanged.)
- **You forfeit inference as a revenue line.** BYOK deliberately gives up any inference markup. If your
  business model *depends* on reselling tokens, BYOK removes that revenue — which is the point, but it
  must be replaced by product/outcome pricing.[^tunguz-inference]
- **Support burden shifts to their limits and billing.** You now field tickets about **the customer's**
  provider rate limits, quota exhaustion, and billing — an operational cost even though the dollars moved
  off your P&L.[^openrouter-byok]
- **Security liability of holding keys.** You are custodian of a live credential; a leak is the
  customer's money and data. This is real risk that must be engineered down (encrypt, don't log, scope,
  don't persist).[^openrouter-byok-overview][^cursor-byok]

## Example Where It Works

A **developer-facing coding assistant** sells to engineers who already have OpenAI and Anthropic
accounts. It offers two paths: a managed **Pro** plan with a monthly quota, and a **BYOK** mode where
the user pastes their own key and pays the provider directly.

- **Economics.** On BYOK usage, **100% of token cost leaves the vendor's COGS** — the vendor charges a
  flat seat price for the product and keeps that revenue at software-like margins, instead of running
  the ~25–60% margins typical when inference sits in COGS.[^tanayj-margins] Because there is no token
  markup, a competitor cannot undercut the vendor on inference price.[^tunguz-inference]
- **Risk transfer.** A power user who runs the agent in a tight loop for hours hits **their own**
  provider rate limit and bill — the vendor's unit economics are untouched, so it need not cap usage
  defensively.
- **Enterprise fit.** The customer's platform team points the tool at their **Bedrock provisioned
  throughput** or **Azure OpenAI** deployment, applying a committed-use discount and keeping data in
  their own tenant/region for compliance.[^bedrock-pt][^azure-cmk]
- **Low build cost.** The whole feature is a verified key field, KMS-encrypted (or non-persisted)
  storage, and a proxy that swaps the key in — exactly the shape Cursor and OpenRouter ship.[^cursor-byok][^openrouter-byok]

This is the ideal BYOK profile: technical audience, high per-user inference variance, enterprise buyers
with existing discounts and residency needs.

## Example Where It Would NOT Work

A **consumer B2C photo-editing app** offers a one-tap "AI enhance." Users are non-technical, the
median session is a few free edits, and growth depends on **frictionless signup**.

- **Conversion collapse.** Requiring each user to create an OpenAI/Google account, generate an API key,
  and paste it before the first magic moment would **destroy activation** — the friction dwarfs the value
  of any single edit. BYOK's whole premise (the user *has* a provider account) is false here.
- **Wrong margin tool.** With sub-cent per-edit cost and huge volume, the vendor is better served by
  *prompt caching*, a *smaller/open-weight model* for the enhance step, and *cost-aware tiers* that cap
  free usage — not by pushing billing onto users.[^tanayj-margins]
- **Support and trust cost.** A consumer audience will not manage provider rate limits or debug quota
  errors, so the support burden BYOK shifts onto the vendor's ticket queue would be worse than the COGS
  it removes.[^openrouter-byok]

Here the right pattern is **managed keys with a hybrid model reserved for a prosumer/business tier** — offer
BYOK only where the audience already holds keys and the inference bill is large enough to matter.

[^openrouter-byok]: OpenRouter Documentation, "BYOK — Use Your Own Provider Keys with OpenRouter" — <https://openrouter.ai/docs/use-cases/byok>
[^cursor-byok]: Cursor Docs, "Bring your own API key" — <https://cursor.com/help/models-and-usage/api-keys>
[^azure-cmk]: Microsoft Learn, "Azure OpenAI encryption of data at rest — customer-managed keys (BYOK)" — <https://learn.microsoft.com/en-us/azure/ai-foundry/openai/encrypt-data-at-rest?view=foundry-classic>
[^bedrock-pt]: Amazon Bedrock User Guide, "Increase model invocation capacity with Provisioned Throughput in Amazon Bedrock" — <https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html>
[^byoc-northflank]: Northflank Blog, "Bring Your Own Cloud (BYOC): the future of enterprise SaaS deployment" — <https://northflank.com/blog/bring-your-own-cloud-byoc-future-of-enterprise-saas-deployment>
[^tanayj-margins]: Tanay Jaipuria, "The Gross Margin Debate in AI" — <https://www.tanayj.com/p/the-gross-margin-debate-in-ai>
[^tunguz-inference]: Tomasz Tunguz, "So You Want to Sell Inference" — <https://tomtunguz.com/so-you-want-to-sell-inference/>
[^openrouter-byok-overview]: OpenRouter Documentation, "BYOK — Bring Your Own Keys to OpenRouter" — <https://openrouter.ai/docs/guides/overview/auth/byok>
