---
title: "Auto query-router (the decision policy)"
group: model-routing
level: 2
costLever: [model-price]
effort: Medium
savingEstimate: "modest — ~35% cost ceiling at <2% accuracy loss (general-domain)"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - claude-code
  - cursor
  - cline
  - codex
  - copilot
  - aider
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/strong-plan-cheap-execute-split"
  - "model-routing/ai-gateway-control-plane"
sources:
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "Rice University (ICLR 2026)"
    url: "https://arxiv.org/html/2510.00202v1"
    accessed: "2026-08-10"
    kind: paper
    note: "Best routers (vLLM-SR, CARROT) ~35% cost cut at <2% accuracy loss; most cluster near 100% cost/accuracy (over-rely on the strongest model); ~85% oracle headroom; commercial ≯ open-source (GPT-5 built-in #7, NotDiamond #12/last)."
  - id: nd-code
    title: "Not Diamond Code: intelligent model routing for coding agents"
    publisher: "Not Diamond"
    url: "https://www.notdiamond.ai/blog/not-diamond-code-intelligent-model-routing-for-coding-agents"
    accessed: "2026-08-10"
    kind: blog
    note: "Vendor claim: 20%+ cost cut with no quality loss; 39% on Poly-SWE-Bench, 61% on LongCodeQA vs Opus 4.8 Xhigh. Local proxy alongside the harness; harness- and gateway-agnostic. Early-access waitlist."
  - id: cursor-router
    title: "Cursor Router"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/cursor-router"
    accessed: "2026-08-10"
    kind: docs
    note: "Auto mode → Optimize For: Cost / Balance / Intelligence. Teams/Enterprise; Enterprise defaults off (admin toggle 'Enable Cursor Router'). Vendor claim: frontier quality at ~60% lower cost, trained on 600k+ requests (launched 2026-07-22)."
  - id: gpt5-router
    title: "Introducing GPT-5 for developers"
    publisher: "OpenAI"
    url: "https://openai.com/index/introducing-gpt-5-for-developers/"
    accessed: "2026-08-10"
    kind: docs
    note: "The real-time model router is a ChatGPT-product feature (routes between fast and thinking models). In the API you get the reasoning model directly — the built-in router is not exposed to agent harnesses calling the API."
  - id: aider-modes
    title: "Chat modes (architect/editor)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/modes.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Architect mode auto-selects an editor model from the main model (--editor-model to override). This is a two-model split, not a per-request cost router."
  - id: codex-config
    title: "Codex CLI configuration and /model"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/03/26/codex-cli-model-selection/"
    accessed: "2026-08-10"
    kind: blog
    note: "No native per-request auto-router; model set via /model, config.toml, or --model. Routing to another backend is done by pointing Codex at a gateway/proxy."
---

## What & why

An auto query-router looks at each incoming request and picks a model for it — cheap model for
easy work, strong model for hard work — so you stop paying frontier prices on requests that a
smaller model would handle. The lever it pulls is **model unit price**: same request, cheaper
per-token model when the router judges it safe. It's the automatic sibling of manual task-class
right-sizing, and it can run on top of a [gateway](ai-gateway-control-plane.md) so the
decision is centralized rather than per-developer.

Set expectations honestly: the peer-reviewed evidence says the ceiling is modest. On RouterArena
(ICLR 2026, ~8,400 queries across 9 domains) the best routers cut cost by **~35% at under 2%
accuracy loss**, but **most routers over-rely on the strongest model** and cluster near 100%
cost/accuracy, and **commercial routers do not beat open-source ones** — the GPT-5 built-in router
placed #7 and NotDiamond placed last (#12).[^routerarena] The headroom an oracle router leaves on
the table (~85%) is large; today's routers capture a fraction of it.

## How to do it

The portable decision has two parts: **where the routing policy lives** and **how the request
reaches the chosen model**.

1. **Pick a policy source.** Either a native router the tool already ships (Cursor's Auto mode), a
   dedicated coding-agent router that runs as a local proxy (Not Diamond Code), or a routing rule you
   configure on a gateway. For CLI harnesses that have no native per-request router (Claude Code,
   Cline/Roo, Codex, Aider, OpenCode), the router is external — a proxy or gateway sits in front and
   makes the call.
2. **Point the harness at it.** Most CLIs redirect with an env var or config: Claude Code honours
   `ANTHROPIC_BASE_URL`, so a router-proxy intercepts every request with no code change; Codex takes
   a custom provider in `config.toml`.[^codex-config] Not Diamond Code is built for this — its proxy sits alongside
   the harness and stays harness- and gateway-agnostic, using only derived metadata (no payloads
   leave the machine).[^nd-code]
3. **Choose the aggressiveness.** Where the tool exposes it, pick the cost/quality bias explicitly.
   Cursor's Auto mode has an **Optimize For** setting — Cost, Balance, or Intelligence — and on
   Enterprise the router is off until an admin enables it.[^cursor-router]
4. **Constrain the model pool.** A router is only as good as the models it may choose. Restrict it to
   a shortlist you've validated on your own tasks (see
   [strong-plan / cheap-execute](strong-plan-cheap-execute-split.md)) so it can't route to a model that
   fails your evals.

Two things that are often mistaken for a query-router but aren't: the **GPT-5 built-in router** is a
ChatGPT-product feature — in the API (which is what agent harnesses call) you get the reasoning model
directly, so there's no automatic routing to lean on;[^gpt5-router] and **Aider's architect/editor
split** auto-picks an editor model from your main model, which is a two-model division of labour, not
a per-request cost decision.[^aider-modes]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool switch.

## When it's worth it / when not

- **Worth it:** mixed workloads with a wide easy/hard spread and no appetite to hand-tune model
  choice — the router captures the easy-request savings automatically. Strongest fit where a native
  router already exists (Cursor) or a gateway is already in place, so setup is near-zero.
- **Worth it as a layer:** on top of manual right-sizing, not instead of it. Manual task-class
  routing is the reliable lever; the auto-router adds a modest slice on top.
- **Not worth it** if you expect large savings — the ceiling is ~35% and real routers hit less. If
  most of your traffic is genuinely hard (long-horizon refactors, tricky debugging), the router will
  correctly route to the strong model and save little.
- **Not worth it** on a router you can't constrain or observe — an opaque router that silently
  downgrades quality-critical work costs more in reverts than it saves in tokens.

## What it costs you

- **Quality risk (Medium).** A wrong route sends hard work to a model that can't do it; the agent
  loops, retries, or the developer reverts — re-paying the tokens plus the strong-model run you were
  trying to avoid. RouterArena's finding that most routers over-rely on the strong model is partly a
  safety reflex against exactly this.[^routerarena]
- **A dependency and a decision layer.** A proxy/gateway in the request path is one more thing that
  can break, add latency, or lose feature parity (non-Anthropic models called through a gateway lose
  extended-thinking / web-search / computer-use parity and must support tool calling).
- **Setup and trust.** Native routers are Low effort; a proxy or gateway router is Medium. Early-access
  tools (Not Diamond Code is waitlist-gated as of 2026-08-10) add procurement friction.[^nd-code]
- **Attribution noise.** With the model chosen per request, per-model spend reports shift under you;
  keep the underlying-model label visible so you can audit routing decisions.

## How to verify

- **Cost per passing task**, before and after, on a fixed task set — the only number that captures
  both the token saving and any quality-driven reruns. A router that lowers tokens-per-request but
  raises reruns can lose on this metric.
- **Route mix:** what fraction of requests went to each model. If ~100% went to the strong model,
  the router isn't doing anything (the RouterArena failure mode); if cheap-model routes correlate with
  reverts, it's routing too aggressively. Cursor can display which model handled each response; a
  gateway logs the model per request.
- **Accuracy delta** on your golden tasks versus a strong-model-only baseline — hold this under a
  threshold you set (RouterArena's bar is <2% loss).

## Measured impact

_Not yet measured by us._ Benchmark: run tasks T1–T3 through an auto-router (arm **P3-router**)
against a strong-model-only baseline (arm **P3-baseline**) and a manual right-sizing arm
(**P3-manual**), comparing cost per passing task and accuracy on the same repo. This isolates what the
automatic policy adds over manual right-sizing. Cited anchors: RouterArena reports **~35% cost cut at
<2% accuracy loss** for the best routers, with most over-relying on the strong model and commercial
routers not beating open-source (NotDiamond last of 12).[^routerarena] ⚠ RouterArena is
**general-domain, not coding-specific** — directional for coding agents, not proven. Vendor claims are
higher — Not Diamond Code cites 20%+ generally and up to 39% (Poly-SWE-Bench) / 61% (LongCodeQA)
against Opus 4.8 Xhigh;[^nd-code] Cursor cites ~60% lower cost.[^cursor-router] ⚠ Both are vendor
self-reported and not independently verified.

[^routerarena]: RouterArena, ICLR 2026 (Rice University) — <https://arxiv.org/html/2510.00202v1>
[^nd-code]: Not Diamond, "Not Diamond Code: intelligent model routing for coding agents" — <https://www.notdiamond.ai/blog/not-diamond-code-intelligent-model-routing-for-coding-agents>
[^cursor-router]: Cursor docs, "Cursor Router" — <https://cursor.com/docs/cursor-router>
[^gpt5-router]: OpenAI, "Introducing GPT-5 for developers" — <https://openai.com/index/introducing-gpt-5-for-developers/>
[^aider-modes]: Aider docs, "Chat modes" — <https://aider.chat/docs/usage/modes.html>
[^codex-config]: Codex Knowledge Base, "Model selection in Codex CLI" — <https://codex.danielvaughan.com/2026/03/26/codex-cli-model-selection/>
