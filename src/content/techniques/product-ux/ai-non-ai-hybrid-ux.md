---
title: "AI / Non-AI Hybrid UX"
category: product-ux
maturityLevel: 2
maturityProvisional: false
shortDescription: "Handle the parts of a flow that don't need generative AI with deterministic paths — rules, search, buttons, templates, and classical ML — so the expensive LLM is reserved for the interactions that genuinely require it, and a large share of requests never call the model at all."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "The LLM is invoked for tasks a rule, lookup, search, or form handles perfectly — deterministic FAQs answered by live generation."
  - "Every interaction hits the model, even trivial navigation, greetings, or menu selection."
  - "Free-text input is demanded where a few buttons or a form would capture the intent more reliably."
  - "A single flagship model answers both 'what are your hours' and 'help me plan a migration' with no cheaper pre-filter in front."
measurementMethods:
  - "Share of interactions served without any LLM call (the deterministic-deflection rate)."
  - "Blended cost per session before vs. after adding the non-AI path."
  - "Containment/resolution rate held or improved while LLM call volume drops."
  - "Pre-filter classifier accuracy and its added latency/cost vs. the LLM it front-runs."
status: published
lastUpdated: "2026-07-02"
related:
  - "product-ux/ai-feature-gating"
  - "product-ux/precomputed-content-surfacing"
  - "output/post-processing-instead-of-generation"
  - "product-ux/user-controlled-quality-mode"
sources:
  - id: hybrid-arch
    title: "Stop Using LLMs for Everything: The Power of Hybrid Architectures"
    publisher: "DEV Community"
    authors: "Vasiliy Shilov"
    year: 2025
    url: "https://dev.to/uxter/stop-using-llms-for-everything-the-power-of-hybrid-architectures-45ee"
    accessed: "2026-07-02"
    kind: blog
    note: "Deterministic layers should reduce the problem space first; the LLM solves only the residual uncertainty. Regex/if-statements/DB lookups run in microseconds; one good deterministic filter can cut the search space tenfold before the model runs."
  - id: gqr-paper
    title: "Guarded Query Routing for Large Language Models"
    publisher: "arXiv:2505.14524"
    authors: "Stollenwerk et al."
    year: 2025
    url: "https://arxiv.org/html/2505.14524v1"
    accessed: "2026-07-02"
    kind: paper
    note: "A WideMLP text classifier hits 88% accuracy at <4ms vs Llama-3.1-8B's 91% at ~62ms and GPT-4o-mini's 669ms — ~95% relative routing performance at orders of magnitude less time and no API cost."
  - id: semantic-router
    title: "semantic-router: Superfast AI decision making"
    publisher: "Aurelio Labs — GitHub"
    year: 2026
    url: "https://github.com/aurelio-labs/semantic-router"
    accessed: "2026-07-02"
    kind: repo
    note: "Routes by nearest-neighbor over pre-encoded example utterances in embedding space rather than 'waiting for slow LLM generations to make tool-use decisions.'"
  - id: vllm-sr-paper
    title: "When to Reason: Semantic Router for vLLM"
    publisher: "arXiv:2510.08731"
    year: 2025
    url: "https://arxiv.org/html/2510.08731v1"
    accessed: "2026-07-02"
    kind: paper
    note: "Classifying queries and applying the expensive path only when beneficial cut latency 47.1% and token consumption 48.5% vs direct inference, while improving accuracy 10.24pp on MMLU-Pro."
  - id: decagon-containment
    title: "What is Chatbot Containment Rate?"
    publisher: "Decagon"
    year: 2026
    url: "https://decagon.ai/glossary/what-is-chatbot-containment-rate"
    accessed: "2026-07-02"
    kind: docs
    note: "Best-in-class AI support containment is 70–80%; rule-based bots sit below 35%. Each contained contact shifts $8–15 of human-agent cost to $0.10–$1.00 of automation."
  - id: nng-genui
    title: "GenUI In Real Life: Buttons and Checkboxes"
    publisher: "Nielsen Norman Group"
    authors: "Tim Neusesser"
    year: 2025
    url: "https://www.nngroup.com/articles/genui-buttons-and-checkboxes/"
    accessed: "2026-07-02"
    kind: blog
    note: "Structured form fields / multiselect buttons make providing details substantially faster and cut the back-and-forth typing that free text forces; open text is 'error-prone and cognitively taxing.'"
  - id: google-convo-design
    title: "How to design conversational AI agents"
    publisher: "Google Cloud Blog"
    year: 2025
    url: "https://cloud.google.com/blog/products/ai-machine-learning/how-to-design-conversational-ai-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Blend chat with structured UI — buttons for quick choices, cards for results — and keep the free-text bar always available so structured paths never trap the user."
---

## Overview

Not every interaction in an AI product needs generative AI. A large fraction of real
traffic is navigational, repetitive, or structured: greetings, "what are your hours,"
menu selection, a password reset, a known FAQ, picking one of five plan tiers. Running a
frontier LLM on those interactions is the most expensive way to do something a rule, a
lookup, a search index, a form, or a small classifier does **faster, more reliably, and
for a fraction of a cent**.

The **AI / non-AI hybrid** pattern draws a deliberate line: deterministic paths handle
what they do best, and the LLM is reserved for the residual — open-ended reasoning and
language generation that genuinely need a model.[^hybrid-arch] The cost lever here is not
a cheaper token or a smaller model; it is **not calling the LLM at all** for a large share
of interactions. Because a deterministic hit costs effectively nothing and returns
instantly, this is one of the few optimizations that improves cost, latency, **and**
reliability at the same time — deterministic code is auditable and always returns the same
answer for the same input, where an LLM occasionally does not.[^hybrid-arch]

It sits at **Level 2** rather than Level 1 because doing it well is real product
engineering, not a config toggle: you have to identify which slices of the flow are
deterministic, build (and evaluate) the routing/classifier that decides "LLM or not," and
design the fallback so users are never trapped in a rigid path when they actually want
natural language.[^google-convo-design]

## Detailed Approach & Techniques

The core move is to put a **cheap deterministic layer in front of the model** that either
answers the request itself or decides the request is worth the LLM. The guiding principle:
deterministic logic reduces the problem space first, and the probabilistic model solves
only what's left.[^hybrid-arch]

### Route before you generate

Add an intent/keyword or semantic pre-filter that classifies the incoming request and
short-circuits the ones that don't need generation:

- **Keyword / rule routing** to a canned answer, a help-center article, or a search
  results page for high-frequency known questions — no model call.
- **Semantic routing** — match the query by nearest-neighbor against pre-encoded example
  utterances in embedding space instead of "waiting for slow LLM generations to make
  tool-use decisions."[^semantic-router] This catches paraphrases a keyword rule misses,
  still without a generation step.
- **A classical ML classifier as the pre-filter.** A small text classifier can decide
  whether a query is in-scope (and which path it belongs to) at near-LLM accuracy for a
  tiny fraction of the latency and cost: a WideMLP classifier reached **88% accuracy at
  under 4 ms**, versus **91% at ~62 ms** for a local Llama-3.1-8B and **669 ms** for a
  GPT-4o-mini call — about **95% of the LLM's routing performance at orders of magnitude
  less time and no per-call API cost.**[^gqr-paper] Even when the LLM still runs, gating
  *when* it runs pays off: selectively applying the expensive path only where it helps cut
  latency **47.1%** and token consumption **48.5%** in one vLLM study.[^vllm-sr-paper]

### Prefer structured input over free text where the task is structured

If you know the shape of the information you need, ask for it with **buttons, chips, or a
form** instead of an open text box the model then has to parse:

- Structured form fields and multiselect buttons make providing details "substantially
  faster and easier" and remove the error-prone, cognitively taxing back-and-forth that
  free text forces.[^nng-genui] Every field a button captures is one the LLM doesn't have
  to extract (and can't misread).
- **Autocomplete and templates** for structured input (addresses, product pickers, date
  ranges) resolve deterministically at the client with zero model tokens.
- Blend the two: buttons/cards for the known choices, with the free-text bar **always
  available** so a user who wants natural language is never trapped.[^google-convo-design]

### Serve known answers deterministically

For predictable, repeated questions, deflect to a **search index or a cached/canned
response** rather than regenerating the same answer live. This is where the economics are
starkest: in customer support, best-in-class AI containment runs **70–80%**, and each
contained contact shifts **\$8–15** of human-agent cost down to **\$0.10–\$1.00** of
automation — but a *deterministic* deflection (FAQ lookup, search) also avoids the LLM
generation cost that a model-answered deflection still incurs.[^decagon-containment]

### Draw the line honestly

The LLM earns its cost where the task is genuinely open-ended: multi-step reasoning,
synthesis across sources, free-form drafting, or ambiguous natural-language understanding
that no rule enumerates. The heuristic: probabilistic models "should solve only the
residual uncertainty after deterministic reduction of the problem space."[^hybrid-arch]
Formatting, sorting, math, lookups, and known FAQs are on the deterministic side of that
line (see *Post-Processing Instead of Generation* and *Precomputed Content Surfacing*).

**Guardrail:** don't over-rotate into rigid flows. If the deterministic path can't handle
a request, it must fall through cleanly to the LLM (or a human), and the natural-language
escape hatch should always be one tap away.[^google-convo-design] A hybrid UX that forces
users through decision trees they didn't want degrades the very experience the AI was
meant to improve.

## Example Where It Works

A retail support assistant handles ~50,000 conversations/day. Analysis of a week of logs
shows the top intents are **order status, return policy, store hours, and password
reset** — highly repetitive, fully known answers — with only a long tail being genuinely
open-ended ("help me choose between these two products for my use case").

The team adds a semantic pre-filter and a small in-scope classifier in front of the model.
Order-status queries route to an API + template response; policy/hours questions deflect to
a search-backed canned answer; account actions surface as **buttons and a form**; only the
open-ended tail reaches the LLM.[^semantic-router][^gqr-paper] Suppose **60%** of
conversations are now resolved on a deterministic path. Those interactions drop from a
multi-turn LLM exchange to a sub-cent, sub-4-ms lookup — the classifier itself costs a
rounding error against the model call it replaces.[^gqr-paper] Blended cost per session
falls by well over half, latency on the common path collapses, and containment holds or
improves because the deterministic answers are exact and consistent every
time.[^decagon-containment][^hybrid-arch] Crucially, the free-text bar stays live, so the
40% who need the model still get it.[^google-convo-design]

## Example Where It Would NOT Work

- **Genuinely open-ended products.** A brainstorming partner, a coding assistant, or a
  long-form writing tool is *mostly* the residual-uncertainty case the LLM exists for —
  there is little deterministic slice to carve off, so the routing machinery adds
  engineering and latency for a handful of avoidable calls.[^hybrid-arch] The pre-filter's
  own cost/latency (however small) isn't worth it when nearly everything routes to the
  model anyway.[^vllm-sr-paper]

- **High-entropy, low-repetition traffic.** If queries rarely repeat and don't cluster into
  a small set of intents, there are no canned answers to deflect to and a classifier can't
  meaningfully pre-filter — the deterministic hit rate is near zero, and you've built
  routing that never fires.

- **Where rigidity breaks the experience.** Forcing a naturally conversational task into
  buttons and decision trees to save calls can tank satisfaction and containment: users
  bounce to a human (a **\$8–15** contact) rather than click through a flow that doesn't fit
  their question.[^decagon-containment][^nng-genui] If the non-AI path can't gracefully fall
  back to the model, the "savings" are illusory — you've just moved cost to the support
  queue.[^google-convo-design]

- **Correctness-critical understanding of messy input.** A too-simple keyword rule that
  misclassifies an in-scope request as a canned FAQ gives a confidently wrong answer.
  Deterministic deflection is only safe when the classifier is evaluated and its precision
  is high; the WideMLP-style gains hold *because* the classifier was measured, not
  assumed.[^gqr-paper]

[^hybrid-arch]: Vasiliy Shilov, "Stop Using LLMs for Everything: The Power of Hybrid Architectures," DEV Community — <https://dev.to/uxter/stop-using-llms-for-everything-the-power-of-hybrid-architectures-45ee>
[^gqr-paper]: Stollenwerk et al., "Guarded Query Routing for Large Language Models," arXiv:2505.14524 — <https://arxiv.org/html/2505.14524v1>
[^semantic-router]: Aurelio Labs, "semantic-router: Superfast AI decision making," GitHub — <https://github.com/aurelio-labs/semantic-router>
[^vllm-sr-paper]: "When to Reason: Semantic Router for vLLM," arXiv:2510.08731 — <https://arxiv.org/html/2510.08731v1>
[^decagon-containment]: Decagon, "What is Chatbot Containment Rate?" — <https://decagon.ai/glossary/what-is-chatbot-containment-rate>
[^nng-genui]: Tim Neusesser, "GenUI In Real Life: Buttons and Checkboxes," Nielsen Norman Group — <https://www.nngroup.com/articles/genui-buttons-and-checkboxes/>
[^google-convo-design]: Google Cloud, "How to design conversational AI agents," Google Cloud Blog — <https://cloud.google.com/blog/products/ai-machine-learning/how-to-design-conversational-ai-agents>
