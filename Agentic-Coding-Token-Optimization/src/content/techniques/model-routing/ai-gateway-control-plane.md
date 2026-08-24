---
title: "AI gateway (the plumbing / control plane)"
group: model-routing
level: 2
costLever: [model-price, plan, calls]
effort: Medium
savingEstimate: "governance; enables substitution (indirect)"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - claude-code
  - cursor
  - cline
  - aider
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/strong-plan-cheap-execute-split"
sources:
  - id: cc-gateway
    title: "LLM gateway configuration"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/llm-gateway"
    accessed: "2026-08-10"
    kind: docs
    note: "ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_CUSTOM_HEADERS; zero code change."
  - id: litellm-cc
    title: "Claude Code — Granular Cost Tracking"
    publisher: "LiteLLM docs"
    url: "https://docs.litellm.ai/docs/tutorials/claude_code_customer_tracking"
    accessed: "2026-08-10"
    kind: docs
    note: "x-litellm-customer-id, x-litellm-tags via ANTHROPIC_CUSTOM_HEADERS; virtual keys carry budgets; 429 BudgetExceededError on cap."
  - id: bifrost-cc
    title: "Claude Code + Bifrost"
    publisher: "Bifrost docs"
    url: "https://docs.getbifrost.ai/cli-agents/claude-code"
    accessed: "2026-08-10"
    kind: docs
    note: "Routing rules rewrite sonnet-model / haiku-model aliases to any provider at request time; virtual keys; x-bf-vk header."
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "ICLR 2026 (arXiv 2510.00202)"
    url: "https://arxiv.org/abs/2510.00202"
    accessed: "2026-08-10"
    kind: paper
    note: "Best routers (vLLM-SR, CARROT) ~35% lower cost at <2% accuracy loss; most cluster near baseline and over-rely on the strongest model. General-domain, not coding-specific."
  - id: codex-config
    title: "Configuration reference — model providers, base_url, wire_api"
    publisher: "OpenAI Codex docs"
    url: "https://learn.chatgpt.com/docs/config-file/config-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom provider block in ~/.codex/config.toml; wire_api = \"responses\" required since Feb 2026; built-in ids reserved. Non-Responses backends need a translating gateway."
  - id: roo-litellm
    title: "Using LiteLLM with Roo Code"
    publisher: "Roo Code docs"
    url: "https://docs.roocode.com/providers/litellm"
    accessed: "2026-08-10"
    kind: docs
    note: "Dedicated LiteLLM provider (model discovery) or OpenAI-Compatible provider with base URL. Cline uses the OpenAI-Compatible provider + Base URL."
  - id: copilot-byok
    title: "Manage language models in VS Code (BYOK)"
    publisher: "VS Code docs"
    url: "https://code.visualstudio.com/docs/agent-customization/language-models"
    accessed: "2026-08-10"
    kind: docs
    note: "BYOK custom endpoint routes Chat/agent traffic to an OpenAI-compatible / Azure / Anthropic endpoint; inline code completions excluded (require GitHub infrastructure)."
---

## What & why

An AI gateway is one HTTP endpoint you put in front of every coding agent. The agent still speaks
its normal API; the gateway sits in the middle and rewrites the model alias, attaches a per-key or
per-team identity, meters the spend against a budget, and fails over to a backup provider on error.
It does not decide *which* model is cheapest for a given task — that is the routing technique next
door. The gateway is the plumbing that makes routing, model substitution, and per-team attribution
possible without editing each developer's config. Its direct token saving is close to zero; its
value is control: you can enforce a cheaper default, cap a runaway project, and see who spent what.

## How to do it

The portable move is the same across tools: **point the agent's base URL at the gateway instead of
the vendor**, hand it a gateway-issued key, and do the routing/budget/attribution work server-side.
Tools that speak the Anthropic API (Claude Code) take `ANTHROPIC_BASE_URL` plus an auth token and
optional custom headers, with no code change.[^cc-gateway] Tools that speak the OpenAI API (Aider,
Cline/Roo, OpenCode, Cursor's override, Copilot BYOK) take an OpenAI-compatible base URL and
key.[^roo-litellm]
Codex needs a custom provider block and, since February 2026, `wire_api = "responses"` — a
Chat-Completions-only backend must sit behind a translating gateway.[^codex-config]

Four things the gateway does once it is in the path:

1. **Alias rewriting.** Map the agent's model labels (Claude Code's `sonnet-model` / `haiku-model`,
   or a named alias) to whatever provider you choose, centrally, so a swap doesn't touch each
   dev's machine.[^bifrost-cc]
2. **Attribution.** Tag each request with a customer/team/project id so cost lands in the right
   bucket — e.g. LiteLLM reads `x-litellm-customer-id` and `x-litellm-tags` from the agent's
   custom headers.[^litellm-cc]
3. **Budgets.** Issue a virtual key per team or project with a spend cap; when it's hit the agent
   gets a `429 BudgetExceededError` and the key resets on the next cycle.[^litellm-cc]
4. **Failover.** Configure a fallback model/provider so a provider outage or rate-limit degrades to
   a backup instead of failing the task.

Pick the substitution and routing policy separately (see the strong-plan / cheap-execute and
routing pages); the gateway only executes it. See this technique's row in `TOOL_MATRIX.md` for the
exact per-tool base-URL setting, header, and config key.

## When it's worth it / when not

- **Worth it:** more than a handful of developers, multiple agents/providers in play, or any need to
  attribute spend and enforce a per-team cap. It's the enforcement layer for standardized configs.
- **Worth it:** when you plan to substitute a cheaper or open-weight model — the gateway is how you
  flip the default for everyone at once and fail back if quality drops.
- **Not yet:** a solo dev or a single team on one provider. The gateway is infra to run and secure
  (a key store, an uptime dependency in the hot path) and buys little at that size.
- **Not a saving by itself:** the gateway doesn't cut tokens. If you stand one up and keep routing
  every call to the top model, spend doesn't move — you've only gained visibility and a budget cap.

## What it costs you

- **It's a hop in the critical path.** The gateway is now a dependency for every request; if it's
  down or slow, every agent is. Run it HA, watch its latency, and keep a direct-to-vendor fallback.
- **Feature parity loss on substitution.** Routing Claude Code to a non-Anthropic model through the
  gateway can drop extended thinking, web search, computer use, and citation parity, and the target
  must support tool calling — so quality risk is Medium, not the gateway's fault but its consequence.
- **Client caveats.** Cursor's "Override OpenAI Base URL" does not route tab-complete or Cmd/Ctrl-K
  (those stay on Cursor's backend) and can 422 on Claude traffic; Copilot BYOK routes chat/agent
  turns but not code completions.[^copilot-byok] Verify the exact flag per tool before rollout — some
  are settings-panel toggles, not env vars.
- **Setup + security.** You hold provider keys server-side and issue virtual keys; that's the point,
  but it's real operational work (rotation, access control, audit).

## How to verify

- **Attribution works:** spend shows up split by team/project/customer in the gateway's own
  reporting (LiteLLM tags/customer views, or your dashboard) rather than one undifferentiated bill.
- **Budget bites:** exceed a test key's cap and confirm the agent receives `429 BudgetExceededError`
  and recovers on reset.[^litellm-cc]
- **Substitution took effect:** the gateway's request log shows the rewritten target model, and
  cost-per-task moves in your usage data (`ccusage`, Claude Code OpenTelemetry) after the swap.

## Measured impact

_Not a token-reduction lever, so no before/after token number of its own._ The saving is realized by
the routing/substitution it enables — measured in the routing arm, not here. Benchmark: run tasks
T1–T3 direct-to-vendor (arm A0) versus through a gateway that rewrites the default to a cheaper model
(a routing arm, e.g. A2), and compare cost per passing task; the gateway-only delta over A0 with an
unchanged model should be ~0 plus the gateway's latency overhead. Cited context for the ceiling this
plumbing can unlock: RouterArena (ICLR 2026) puts best-case automatic-router savings at **~35% at
<2% accuracy loss**, with most routers over-relying on the strongest model — ⚠ general-domain, not
coding-specific, so treat as directional.[^routerarena]

[^cc-gateway]: Claude Code docs, "LLM gateway configuration" — <https://code.claude.com/docs/en/llm-gateway>
[^litellm-cc]: LiteLLM docs, "Claude Code — Granular Cost Tracking" — <https://docs.litellm.ai/docs/tutorials/claude_code_customer_tracking>
[^bifrost-cc]: Bifrost docs, "Claude Code + Bifrost" — <https://docs.getbifrost.ai/cli-agents/claude-code>
[^codex-config]: OpenAI Codex docs, "Configuration reference" — <https://learn.chatgpt.com/docs/config-file/config-reference>
[^copilot-byok]: VS Code docs, "Manage language models in VS Code (BYOK)" — <https://code.visualstudio.com/docs/agent-customization/language-models>
[^roo-litellm]: Roo Code docs, "Using LiteLLM with Roo Code" — <https://docs.roocode.com/providers/litellm>
[^routerarena]: RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers, ICLR 2026 (arXiv 2510.00202) — <https://arxiv.org/abs/2510.00202>
