---
title: "Repoint the agent at open/cheap models"
group: model-routing
level: 3
costLever: [model-price, plan]
effort: Medium
savingEstimate: "~5–75x on unit price; net saving depends on retries"
savingBasis: cited
qualityRisk: High
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
  - "quality/regression-gated-model-swaps"
sources:
  - id: swebench-cost
    title: "SWE-bench Verified — resolved-% and $/instance (mini-SWE-agent board)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Open-weight MiniMax M2.5 75.8% @ $0.073 vs Claude 4.5 Opus 76.8% @ $0.754 (~1 pt lower at ~1/10th per-task cost). Cost data only for mini-SWE-agent runs; never compare across harnesses."
  - id: grok-code-fast
    title: "Grok Code Fast 1"
    publisher: "xAI"
    url: "https://x.ai/news/grok-code-fast-1"
    accessed: "2026-08-10"
    kind: pricing
    note: "$0.20/M input, $1.50/M output, $0.02/M cached input; 70.8% on SWE-bench Verified (xAI internal harness); 256K context."
    verify: true
  - id: bifrost-cc
    title: "Bifrost — Claude Code gateway (model-label rewrite)"
    publisher: "Maxim / Bifrost docs"
    url: "https://docs.getbifrost.ai/cli-agents/claude-code"
    accessed: "2026-08-10"
    kind: docs
    note: "Rewrites Claude Code's sonnet-model/haiku-model labels to any provider (Anthropic, Bedrock, Vertex, Azure, OpenAI, Gemini) at request time via ANTHROPIC_BASE_URL. Non-Anthropic models must support tool calling; lose extended-thinking / web-search / computer-use / citations parity."
  - id: codex-providers
    title: "Codex CLI — config reference (model_providers)"
    publisher: "OpenAI"
    url: "https://learn.chatgpt.com/docs/config-file/config-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "model + model_provider top-level keys; [model_providers.<id>] with name/base_url/env_key/wire_api for any OpenAI-compatible endpoint."
  - id: copilot-byok
    title: "BYOK (bring your own key)"
    publisher: "GitHub Copilot docs"
    url: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models"
    accessed: "2026-08-10"
    kind: docs
    note: "Add a provider under Settings → Model Providers (OpenAI-compatible / Azure / Anthropic / Ollama / LM Studio); its models appear in the picker. Note: Copilot moved to token-based AI-Credit billing Jun 1 2026, so provider tokens are billed via BYOK provider, not Copilot."
  - id: aider-openrouter
    title: "Connecting to OpenRouter / OpenAI-compatible models"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/llms/openrouter.html"
    accessed: "2026-08-10"
    kind: docs
    note: "aider --model openrouter/deepseek/deepseek-chat; also --weak-model / architect+editor for per-slot models; .aider.model.settings.yml for edit_format etc."
  - id: cline-openai-compat
    title: "OpenAI Compatible provider"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/provider-config/openai-compatible"
    accessed: "2026-08-10"
    kind: docs
    note: "Provider = OpenAI Compatible; set Base URL + API key + Model ID. No trailing slash, don't append /v1. Same UI in Roo Code."
  - id: routerarena
    title: "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers"
    publisher: "Rice University (ICLR 2026)"
    url: "https://arxiv.org/abs/2510.00202"
    accessed: "2026-08-19"
    kind: paper
    note: "Best routers (vLLM-SR, CARROT) ~35% lower cost at <2% accuracy loss; most cluster near the baseline and over-rely on the strongest model. General-domain, not coding-specific — directional only."
  - id: coding-plans
    title: "AI coding-plan comparison (GLM / Kimi / Qwen flat-rate plans)"
    publisher: "codingplan.org"
    url: "https://codingplan.org/en"
    accessed: "2026-08-10"
    kind: other
    note: "Flat-fee coding subscriptions (Z.ai GLM, Moonshot Kimi, Alibaba Qwen) that expose an Anthropic-compatible base URL for Claude Code. Vendor-comparison site — verify the specific plan's price/limits before quoting."
    verify: true
---

## What & why

Point the coding agent at a cheaper model instead of the default frontier one. The lever is the
model's unit price: open-weight models (DeepSeek, Qwen3-Coder, GLM, Kimi) and cheap proprietary ones
(grok-code-fast-1 at ~$0.20/$1.50 per M tokens, ~70.8% on SWE-bench Verified[^grok-code-fast]) run
roughly 5–75x below top-tier per-token rates, and public boards show some open-weight models within
~1 point of the frontier at ~1/10th the per-task cost.[^swebench-cost] You keep the same harness and
workflow; only the model slot changes. The catch is that a non-Anthropic backend can mishandle
tool-calling and edits, so the swap has to be eval-gated or the retries eat the saving.

## How to do it

The portable move has three parts: **redirect the model slot, pick the model per task class, and
gate the swap on an eval.**

1. **Redirect the slot.** Every first-class harness can be pointed at a different backend without
   code changes — either a base-URL/API-key override (Claude Code honors `ANTHROPIC_BASE_URL`;
   Codex CLI takes `model` + `[model_providers.<id>]` with `base_url`/`env_key`/`wire_api`[^codex-providers];
   Cline's OpenAI-Compatible provider wants Base URL + key + Model ID[^cline-openai-compat]; Aider takes
   `--model openrouter/<provider>/<model>`[^aider-openrouter]) or a native provider picker (Copilot's BYOK
   adds an OpenAI-compatible/Azure/Anthropic/Ollama provider whose models show up in the picker[^copilot-byok]).
   Routing through a **gateway** (Bifrost, LiteLLM) is the cleaner version: it rewrites the harness's model
   labels to any provider centrally, so you don't touch each developer's config and you get spend
   attribution for free.[^bifrost-cc] See this technique's row in `TOOL_MATRIX.md` for the exact
   override per tool.

2. **Pick the model per task class, not globally.** Cheap models are fine for the bulk of edits,
   boilerplate, and test scaffolding; keep the frontier model for the hard planning and the tricky
   diffs. This manual right-sizing is more reliable than an automatic query-router — RouterArena
   (ICLR 2026) found the best routers save only ~35% at <2% accuracy loss and most over-rely on the
   strongest model anyway.[^routerarena] Pair this page with the strong-plan / cheap-execute split.

3. **Choose the billing shape.** Two ways to pay for the cheap model: **per-token** (via the
   provider API or a gateway) or a **flat-rate "coding plan"** — GLM (Z.ai), Kimi (Moonshot), and
   Qwen (Alibaba) sell fixed-fee subscriptions that expose an Anthropic-compatible base URL, so
   Claude Code and anything that accepts a custom base URL/key works against them.[^coding-plans] A
   flat plan caps spend predictably; per-token wins when usage is spiky.

**Then eval-gate it.** Before rolling the swap out, run your golden-task set on the new model and
compare pass rate, tokens, and cost per *passing* task — not per attempt. A backend that fails the
edit format or drops a tool call will retry, and enough retries erase the unit-price win. Non-Anthropic
models routed through a gateway also lose extended-thinking, web-search, computer-use, and citation
parity, and must support tool calling.[^bifrost-cc]

## When it's worth it / when not

- **Worth it:** high-volume, well-scoped work (bulk edits, refactors, test generation) where the
  task class tolerates a slightly weaker model, and you have an eval set to prove the swap holds.
- **Worth it:** cost-sensitive teams that can route everyone through a gateway and standardize the
  cheap backend centrally.
- **Not worth it:** the gnarly 10% — deep multi-file planning, subtle concurrency/security work —
  where a frontier model's higher pass rate makes it cheaper per *solved* task despite the unit price.
- **Not worth it (yet):** any harness where the cheap backend can't reliably produce the tool's edit
  format. Measure before trusting it; a swap that raises the retry rate is a false economy.

## What it costs you

- **Quality risk is the main cost, and it's High for this technique.** Weaker models resolve fewer
  tasks and, more insidiously, some backends mishandle tool-calling or the diff/edit format the
  harness expects — producing malformed edits that trigger silent retries.
- **Setup effort is Medium:** wiring the base URL or gateway is quick, but the eval gate and
  per-task-class assignment are the real work.
- **Failure modes to watch:** broken edit application (edit-format mismatch), dropped or malformed
  tool calls, lost frontier-only features (extended thinking, web search), and rate limits / weaker
  uptime on some open-model endpoints.
- **A cheap model that retries is not cheap.** The whole saving lives or dies on cost per passing
  task, so that's the number to hold, not the sticker unit price.

## How to verify

- **Cost per passing task**, before vs after the swap, on your own repo — the only number that
  accounts for retries. Public boards ($/instance next to resolved-%) are for *shortlisting* a model,
  not for trusting it on your code; and cost figures are only comparable within one harness
  (`mini-SWE-agent`), never across harnesses.[^swebench-cost]
- **Edit-apply success rate and tool-call error rate** on the new backend — the early warning that a
  model can't drive your harness.
- **Effective unit price**, read from the gateway/provider dashboard (a gateway also gives you the
  per-project attribution to confirm the cheap route is actually being used).

## Measured impact

_Not yet measured by us._ Benchmark: run tasks T1–T3 on the same repo with the frontier default
(arm A0) versus an open/cheap backend swapped in via gateway (arm R2 — open/cheap-model
substitution), holding the harness fixed, and compare **cost per passing task** and edit-apply
success rate. Cited anchors so far: on the SWE-bench Verified `mini-SWE-agent` board, open-weight
**MiniMax M2.5 resolves 75.8% at $0.073/instance vs Claude 4.5 Opus 76.8% at $0.754** — about one
point lower at roughly a tenth of the per-task cost;[^swebench-cost] **grok-code-fast-1** reports
70.8% on SWE-bench Verified at $0.20/$1.50 per M tokens.[^grok-code-fast] ⚠ The grok-code-fast score
is xAI's own internal-harness number, the coding-plan pricing is vendor-comparison data, and
RouterArena is general-domain — all three are practitioner/vendor-sourced and not independently
verified; SWE-bench cost data is valid only within the `mini-SWE-agent` harness.

[^swebench-cost]: SWE-bench, "Verified — resolved-% and $/instance (mini-SWE-agent board)" — <https://www.swebench.com/verified.html>
[^grok-code-fast]: xAI, "Grok Code Fast 1" — <https://x.ai/news/grok-code-fast-1>
[^bifrost-cc]: Bifrost docs, "Claude Code gateway (model-label rewrite)" — <https://docs.getbifrost.ai/cli-agents/claude-code>
[^codex-providers]: OpenAI, "Codex CLI — config reference (model_providers)" — <https://learn.chatgpt.com/docs/config-file/config-reference>
[^cline-openai-compat]: Cline docs, "OpenAI Compatible provider" — <https://docs.cline.bot/provider-config/openai-compatible>
[^aider-openrouter]: Aider docs, "Connecting to OpenRouter / OpenAI-compatible models" — <https://aider.chat/docs/llms/openrouter.html>
[^copilot-byok]: GitHub Copilot docs, "BYOK (bring your own key)" — <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models>
[^routerarena]: Rice University, "RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers" (ICLR 2026) — <https://arxiv.org/abs/2510.00202>
[^coding-plans]: codingplan.org, "AI coding-plan comparison (GLM / Kimi / Qwen flat-rate plans)" — <https://codingplan.org/en>
