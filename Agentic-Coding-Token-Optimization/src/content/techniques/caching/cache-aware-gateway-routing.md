---
title: "Cache-aware gateway routing"
group: caching
level: 2
costLever: [cache]
effort: Medium
savingEstimate: "large (restores cache hits lost to load-balancing)"
savingBasis: cited
qualityRisk: Low
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
  - "model-routing/ai-gateway-control-plane"
  - "caching/keep-cache-warm"
sources:
  - id: litellm-cc-cache-routing
    title: "Claude Code — Prompt Cache Routing"
    publisher: "LiteLLM docs"
    url: "https://docs.litellm.ai/docs/tutorials/claude_code_prompt_cache_routing"
    accessed: "2026-08-10"
    kind: docs
    note: "optional_pre_call_checks: [\"prompt_caching\"] (PromptCachingDeploymentCheck) routes follow-up calls to the deployment that wrote the cache."
  - id: litellm-cache-bench
    title: "Cut 69% Costs Stacking Auto-Routing on Prompt Caching"
    publisher: "LiteLLM blog"
    url: "https://docs.litellm.ai/blog/auto-router-prompt-caching-benchmark"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Practitioner data: 99.3% of switch-backs find the cache still warm; router+caching 37–69% cheaper than caching a single model. Router is a separate technique — the load-bearing datum here is switch-back warmth."
  - id: litellm-prefix-issue
    title: "Add character-level prefix routing for cache-aware load balancers (SGLang) — issue #12584"
    publisher: "BerriAI/litellm"
    url: "https://github.com/BerriAI/litellm/issues/12584"
    accessed: "2026-08-10"
    kind: repo
    note: "LiteLLM's prompt-cache routing uses message-level exact-hash matching, not character-level prefix matching; extending a prefix can still miss."
  - id: gemini-implicit
    title: "Gemini 2.5 models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: docs
    note: "Implicit caching is prefix-based; put stable content first and send similar-prefix requests close in time. Regional routing keeps requests on the same infrastructure."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache TTL depends on billing path: 1 hr on subscription, 5 min on usage credits or API/cloud."
  - id: claude-pricing
    title: "Pricing — prompt caching multipliers"
    publisher: "Anthropic (Claude platform docs)"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Cache read 0.1x base input; 5-min write 1.25x; 1-hr write 2x."
---

## What & why

A gateway or proxy in front of the provider (LiteLLM, Bifrost, an OpenAI-compatible router) usually
load-balances requests across several deployments — multiple API keys, regions, or cloud accounts of
the same model. Provider prompt caches are **per-deployment**: the cache lives on whichever endpoint
wrote it. So a load balancer that rotates deployments between turns silently zeroes the cache — every
turn looks like a fresh prefix and pays the full input rate instead of the cached 0.1x.[^claude-pricing]
Cache-aware routing pins requests that share a prefix to the deployment that wrote the cache, so the
cache lever you set up elsewhere actually fires. The token lever is cache hits.

## How to do it

The portable rule: **route on the shared prefix, not round-robin.** Requests from the same coding
session share a long stable prefix (system prompt, rules file, project context), so they must land on
the same deployment for the second and later turns to read the cache the first turn wrote.

1. **Turn on the gateway's cache-aware check.** A cache-aware router remembers which deployment wrote a
   cache and sends follow-up requests with a matching prefix back to it, instead of picking the
   next-cheapest or least-loaded endpoint. In LiteLLM this is a one-line `optional_pre_call_checks`
   setting; see this technique's row in `TOOL_MATRIX.md` for the exact per-tool knob.[^litellm-cc-cache-routing]
2. **Keep the prefix stable and up front.** Cache-aware routing only helps if the prefix is actually
   shared. Put the stable content (system prompt, rules, project context) at the start and let the
   volatile conversation trail it — the same ordering that makes provider caching work at all. Gemini's
   implicit caching is explicit about this: stable content first, and send similar-prefix requests close
   together in time.[^gemini-implicit]
3. **Expect a warm-up.** With load balancing on, it can take a couple of calls before caching settles —
   the first call writes the cache on one deployment, and only once routing is pinned do later calls
   read it. Without the cache-aware check, that pinning never happens and each turn can hit a cold
   deployment.[^litellm-cc-cache-routing]
4. **Know the matching limits.** LiteLLM's cache-aware routing matches on a message-level exact hash,
   not a character-level prefix, so extending a shared prefix can still route to a different deployment
   and miss. If your gateway supports prefix-based affinity (or you can pin a session with a stable
   routing key), prefer it for long agent sessions.[^litellm-prefix-issue]

For the IDE tools (Cursor, Copilot) caching is provider-managed and there's no gateway in the path you
control, so there's no knob — see the matrix. This technique applies when *you* run the gateway
(Claude Code, Aider, Cline/Roo, Codex, OpenCode via `ANTHROPIC_BASE_URL` / an OpenAI-compatible base URL).

## When it's worth it / when not

- **Worth it:** any team already routing coding agents through a gateway that load-balances across more
  than one deployment of the same model (multiple keys, regions, or accounts). This is the default
  failure mode there — the cache is being thrown away and it doesn't show up as an error, only as spend.
- **Worth it:** long agent sessions with a big stable prefix (rules file + project context), where a
  cache miss reprocesses the whole prefix at full rate every turn.
- **Not worth it:** a single-deployment setup (nothing to balance, cache stays put), or the managed IDE
  tools where you don't run the gateway. There's no lever to pull.
- **Watch:** cache-aware pinning trades some load-balancing evenness for cache locality. If one
  deployment has tight rate limits, pinning a hot session to it can bump you into throttling — size the
  pinned deployment for the session, or let the router fail over (which re-warms elsewhere).

## What it costs you

- **Setup effort.** Low to Medium: one router setting plus verifying prefix order. The Medium part is
  proving it actually pins — you have to look at cache-read tokens per deployment, not just trust the flag.
- **Load-balancing tension.** Pinning to the cache-writing deployment is, by design, less even than
  round-robin. Usually fine; only bites under tight per-deployment rate limits.
- **Failover re-warms.** If the pinned deployment is down or throttled and the router fails over, the new
  deployment starts cold — one full-rate prefix write (1.25x at 5-min TTL, 2x at 1-hr)[^claude-pricing]
  before it's warm again. Which TTL you get depends on the billing path: 1 hr on a subscription, 5 min on
  usage credits or an API/cloud key.[^cc-costs] Expected, not a bug.
- **Quality risk: none.** This changes *where* a request goes, not *what* the model sees.

## How to verify

- Watch **cache-read tokens as a share of input tokens** across turns of one session. With cache-aware
  routing off, later turns show near-zero cache reads on a multi-deployment gateway; with it on, cache
  reads should dominate input after the first turn. Claude Code splits token usage into
  `input` / `output` / `cacheRead` / `cacheCreation` in its OpenTelemetry metrics, and `/usage` flags a
  session as cache-miss-heavy when misses are ≥10% of recent usage.
- At the gateway, check that requests from one session land on **one deployment** (LiteLLM logs the
  chosen deployment per call). If a session is bouncing across deployments, the check isn't engaging.
- Confirm the prefix is stable: a moving system prompt or rules file defeats both the cache and the
  routing. Diff the request prefix across two turns if cache reads stay low.

## Measured impact

_Not yet measured by us._ Benchmark: run one coding task through a gateway load-balancing two
deployments of the same model, with cache-aware routing **off vs on**, and compare cache-read share and
input cost per passing task (baseline = round-robin gateway; variant = cache-aware pinning). Cited so
far: LiteLLM reports that **99.3% of the time a session switches back to a model it used earlier the
cache is still warm**, and that stacking their auto-router on caching runs **37–69% cheaper than caching
a single model** — though that upper number is the *routing* technique, and the load-bearing datum here
is the switch-back warmth that pinning preserves.[^litellm-cache-bench] ⚠ Practitioner (vendor) data,
not independently verified.

[^litellm-cc-cache-routing]: LiteLLM docs, "Claude Code — Prompt Cache Routing" — <https://docs.litellm.ai/docs/tutorials/claude_code_prompt_cache_routing>
[^litellm-cache-bench]: LiteLLM blog, "Cut 69% Costs Stacking Auto-Routing on Prompt Caching" — <https://docs.litellm.ai/blog/auto-router-prompt-caching-benchmark>
[^litellm-prefix-issue]: BerriAI/litellm, issue #12584 — <https://github.com/BerriAI/litellm/issues/12584>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^claude-pricing]: Anthropic, "Pricing" (prompt-cache multipliers) — <https://platform.claude.com/docs/en/about-claude/pricing>
