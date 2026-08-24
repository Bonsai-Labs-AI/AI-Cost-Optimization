---
title: "Shared self-hosted model for the team's cheap tier"
group: model-routing
level: 3
costLever: [model-price, input]
effort: High
savingEstimate: "near-zero marginal token cost above break-even"
savingBasis: estimate
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
  - "context/tool-output-filtering"
sources:
  - id: vllm-apc
    title: "Automatic Prefix Caching"
    publisher: "vLLM docs"
    url: "https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "APC reuses the KV cache of a shared prefix across requests; prefills only the new suffix. On the V1 engine it is on by default (--no-enable-prefix-caching disables)."
  - id: vllm-claude-code
    title: "Claude Code (vLLM integration)"
    publisher: "vLLM docs"
    url: "https://docs.vllm.ai/en/latest/serving/integrations/claude_code/"
    accessed: "2026-08-10"
    kind: docs
    note: "vLLM implements the Anthropic Messages API natively; Claude Code connects via ANTHROPIC_BASE_URL + ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL, no proxy. Serve with --enable-auto-tool-choice --tool-call-parser."
  - id: sglang-radix
    title: "RadixAttention / server arguments"
    publisher: "SGLang docs"
    url: "https://docs.sglang.io/advanced_features/server_arguments.html"
    accessed: "2026-08-10"
    kind: docs
    note: "RadixAttention prefix caching is on by default; --disable-radix-cache turns it off. OpenAI-compatible server via python -m sglang.launch_server."
  - id: aider-openai-compat
    title: "Connecting to an OpenAI-compatible API (local / Ollama / vLLM)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/llms/openai-compat.html"
    accessed: "2026-08-10"
    kind: docs
    note: "aider --model openai/<served-model> --openai-api-base http://host:8000/v1 --openai-api-key <any>; or OPENAI_API_BASE / .aider.conf.yml."
  - id: codex-config
    title: "Configuration Reference (model_providers, base_url, wire_api)"
    publisher: "OpenAI Codex docs"
    url: "https://learn.chatgpt.com/docs/config-file/config-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom [model_providers.X] with base_url + wire_api in config.toml; or openai_base_url to point the built-in provider at a gateway."
  - id: copilot-byok
    title: "Copilot CLI now supports BYOK and local models"
    publisher: "GitHub Changelog"
    url: "https://github.blog/changelog/2026-04-07-copilot-cli-now-supports-byok-and-local-models/"
    accessed: "2026-08-10"
    kind: docs
    note: "BYOK (Apr 7 2026) lets Copilot CLI + app target any OpenAI-compatible endpoint via Settings → Model Providers; keys in OS keychain."
  - id: opencode-models
    title: "Models / custom providers"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/models"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom provider in opencode.json using @ai-sdk/openai-compatible with baseURL to the server's /v1 endpoint."
  - id: grok-build-custom
    title: "Grok Build — custom models"
    publisher: "TrueFoundry docs"
    url: "https://www.truefoundry.com/docs/ai-gateway/grok-build"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Custom model in ~/.grok/config.toml with model/base_url/name/env_key; note the Grok Build harness prompts aren't reproduced by a swapped model."
  - id: routerarena
    title: "RouterArena: an open benchmark for LLM routers"
    publisher: "ICLR 2026 (Rice University)"
    url: "https://arxiv.org/abs/2510.00202"
    accessed: "2026-08-10"
    kind: paper
    note: "Context for routing economics: best routers ~35% cheaper at <2% accuracy loss (general-domain, not coding-specific)."
---

## What & why

Instead of paying a frontier vendor per token for the cheap tier of work — file edits, code
search, running tests, small refactors — you run one small open coding model on an internal
GPU box and point every developer's agent at it for that tier. The lever is **model price**:
once the box is bought or rented, the marginal cost of a token is the amortised hardware and
power, not a per-MTok API bill, so the cheap-tier token cost drops toward zero above break-even.
The second lever is **input**: an inference server keeps a shared KV cache, so the repeated
prefix that every agent sends (system prompt, rules file, tool schemas) is prefilled once and
reused across developers rather than recomputed per request.[^vllm-apc][^sglang-radix]

This is the team-scale version of the strong-plan / cheap-execute split: the expensive planner
stays on a hosted frontier model, and only the high-volume cheap tier moves in-house.

## How to do it

1. **Pick a small open coding model** that fits one GPU and supports tool calling (the agent
   loop depends on function-calling). Serve at the precision your card allows.
2. **Serve it behind an OpenAI-compatible (or Anthropic-compatible) endpoint.** vLLM, SGLang,
   and Ollama all expose one. vLLM additionally implements the **Anthropic Messages API**
   natively, so Claude Code can point straight at it with no translation proxy.[^vllm-claude-code]
   Enable tool calling on the server (for vLLM, `--enable-auto-tool-choice` with the right
   `--tool-call-parser`).
3. **Turn on prefix caching** so the shared prefix is reused across developers. This is the
   feature that makes a *shared* box cheaper than one-per-dev: **vLLM Automatic Prefix Caching**
   (on by default on the V1 engine; `--enable-prefix-caching` on older builds)[^vllm-apc] and
   **SGLang RadixAttention** (on by default; `--disable-radix-cache` to turn off)[^sglang-radix]
   both key the KV cache by prefix, so the second request that shares a prefix skips prefilling it.
4. **Point each agent's cheap tier at the box via base-URL.** Every first-class harness takes a
   base-URL override (env var, config file, or settings pane) and an API key that can be any
   placeholder for an unauthenticated internal box — Aider (`--openai-api-base`),[^aider-openai-compat]
   Codex (`[model_providers.X]` `base_url` in `config.toml`),[^codex-config] Copilot CLI
   (BYOK Model Providers),[^copilot-byok] and OpenCode (custom `@ai-sdk/openai-compatible`
   provider)[^opencode-models] all expose one. Set it once, per developer or via a shared
   config, so the cheap tier routes to the internal endpoint while the planner stays on the
   frontier model. See this technique's row in `TOOL_MATRIX.md` for the exact override per tool.
5. **(Optional) front it with a gateway.** Routing every dev through one LLM gateway (LiteLLM,
   Bifrost) instead of each pointing at the box directly gives you one place to swap the model,
   attribute spend per team, and fail over to the hosted model when the box is down — without
   touching each dev's config.

## When it's worth it / when not

- **Worth it:** at team scale, where the cheap tier is high-volume and repetitive. The shared
  prefix cache and the fixed-cost box only pay off across many developers and many requests per
  day. A GPU you already own (idle capacity, an on-prem cluster) shortens break-even a lot.
- **Worth it:** when data residency or air-gap requirements already push you toward self-hosting —
  the token saving is then a bonus on top of a decision you'd make anyway.
- **Not for one developer.** A single dev will not put enough load through the box to beat a
  metered API on the cheap tier, and they still carry all the ops. Rent tokens instead.
- **Not for the planning / hard-reasoning tier.** Keep architecture, debugging, and
  multi-file changes on the frontier model. A small open model on the hard tier costs more in
  re-runs and wrong turns than it saves — the same lesson RouterArena reports for routers that
  push too much work to the cheap model.[^routerarena]

## What it costs you

- **Ops and hardware.** You now run a GPU box: capacity planning, driver and server upgrades,
  monitoring, on-call for when it falls over. This is the reason the technique is L3, not L1.
- **Quality risk (Medium).** A small open model is weaker than a frontier model. Scope it to the
  cheap tier and gate the choice on your own eval — cheap-tier tasks that quietly fail cost more
  in re-runs than the tokens saved.
- **Harness-feature parity.** A swapped model does not inherit the vendor harness's extras. On
  Claude Code, a non-Anthropic model loses extended thinking, web search, computer use, and
  citation formatting. On Grok Build, pointing at a custom model changes the inference provider
  but does not reproduce the Grok Build prompts or full harness behaviour.[^grok-build-custom]
- **Availability.** The box is now a single point of failure for the cheap tier. Front it with a
  gateway that fails back to the hosted model, or developers stall when it's down.
- **Cold prefixes.** The KV cache helps only when prefixes actually match. Divergent per-dev
  system prompts, per-request nonces, or a small cache that evicts under load erase the reuse —
  keep the shared prefix stable and size the cache to the working set.[^vllm-apc]

## How to verify

- **Break-even:** amortised box cost (hardware/rental + power + ops hours) per day vs. what the
  cheap tier would have cost on the metered API for the same traffic. Track cheap-tier tokens/day
  moved off the vendor bill; the technique only wins once that line clears the box's daily cost.
- **Prefix cache-hit rate on the server.** vLLM and SGLang expose prefix-cache hit metrics; a low
  hit rate means the shared-cache saving isn't landing and prefixes are diverging.
- **Cost per passing cheap-tier task**, not tokens alone — a weaker model that triggers re-runs
  can raise total cost even at near-zero token price. Compare against the hosted cheap model on the
  same golden tasks before rolling out.

## Measured impact

_Not yet measured by us._ Benchmark arm **B3** (self-hosted cheap tier) vs **B0** (all-hosted
baseline) and **B1** (hosted strong-plan / cheap-execute split): run the same task set — edits,
search, and test loops routed to the cheap tier — with the cheap tier on a shared vLLM box
(prefix caching on) against the same tier on the hosted cheap model, and compare **cost per
passing task** and **cheap-tier tokens moved off the vendor bill**, including the server's
prefix-cache hit rate. For routing-economics context, RouterArena reports the best general-domain
routers at ~35% cost reduction at <2% accuracy loss — ⚠ general-domain and not coding-specific, so
directional only.[^routerarena]

[^vllm-apc]: vLLM docs, "Automatic Prefix Caching" — <https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html>
[^vllm-claude-code]: vLLM docs, "Claude Code integration" — <https://docs.vllm.ai/en/latest/serving/integrations/claude_code/>
[^sglang-radix]: SGLang docs, "RadixAttention / server arguments" — <https://docs.sglang.io/advanced_features/server_arguments.html>
[^aider-openai-compat]: Aider docs, "Connecting to an OpenAI-compatible API (local / Ollama / vLLM)" — <https://aider.chat/docs/llms/openai-compat.html>
[^codex-config]: OpenAI Codex docs, "Configuration Reference" — <https://learn.chatgpt.com/docs/config-file/config-reference>
[^copilot-byok]: GitHub Changelog, "Copilot CLI now supports BYOK and local models" — <https://github.blog/changelog/2026-04-07-copilot-cli-now-supports-byok-and-local-models/>
[^opencode-models]: OpenCode docs, "Models / custom providers" — <https://opencode.ai/docs/models>
[^grok-build-custom]: TrueFoundry docs, "Grok Build — custom models" — <https://www.truefoundry.com/docs/ai-gateway/grok-build>
[^routerarena]: RouterArena, ICLR 2026 (Rice University) — <https://arxiv.org/abs/2510.00202>
