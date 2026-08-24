---
title: "Check that the cache is actually hitting"
group: caching
level: 2
costLever: [cache, input]
effort: Low
savingEstimate: "diagnostic — protects the whole cache discount"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - aider
  - codex
  - opencode
  - cursor
  - copilot
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "caching/remove-silent-cache-invalidators"
  - "caching/stable-prompt-prefix"
sources:
  - id: cc-prompt-caching
    title: "Prompt caching"
    publisher: "Claude Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Usage fields cache_read_input_tokens / cache_creation_input_tokens / input_tokens; invalidation hierarchy tools → system → messages; any block at/before the breakpoint changing breaks the hit; images, tool defs, thinking params, per-request content all invalidate."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "/usage Session block shows 'cache read' / 'cache write' per model; /usage flags 'cache misses' as a behavior when it's ≥10% of recent usage. Cache lifetime 1 hr subscription / 5 min usage-credits or API key/cloud; ENABLE_PROMPT_CACHING_1H=1."
  - id: cc-monitoring
    title: "Monitoring usage (OpenTelemetry)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/monitoring-usage"
    accessed: "2026-08-10"
    kind: docs
    note: "Metric claude_code.token.usage with type attribute values input / output / cacheRead / cacheCreation."
  - id: pricing
    title: "Pricing (prompt-cache economics)"
    publisher: "Claude Docs"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Cache read = 0.1× base input; 5-min write = 1.25×; 1-hr write = 2×."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts / --cache-keepalive-pings; caching statistics and costs are not available while streaming — use --no-stream to see them."
  - id: gemini-cli-caching
    title: "Token caching and cost optimization"
    publisher: "Gemini CLI docs"
    url: "https://google-gemini.github.io/gemini-cli/docs/cli/token-caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/stats shows token usage and cached token savings; implicit caching is automatic with API-key auth."
---

## What & why

Prompt caching only saves money on the turns where the cache is actually read. A cache read is
billed at 0.1× the base input rate, so a warm prefix is roughly a 90% discount on everything before
the cache breakpoint.[^pricing] But that discount is silent when it disappears: if something in the
prompt prefix changes every turn, each request re-writes the cache instead of reading it, and you pay
full input price (plus a write surcharge) on the whole prefix, every turn — while the tool still
"has caching on." This page is the diagnostic: read the cache fields and confirm reads are happening.

## How to do it

The cache splits your input into three counters on every request — tokens read from cache, tokens
written to cache, and uncached tokens. On the Claude API these are `cache_read_input_tokens`,
`cache_creation_input_tokens`, and `input_tokens`; the three sum to the total input.[^cc-prompt-caching]
The check is the same everywhere the numbers are exposed:

1. **Find the cache-read number** for a session that repeats a stable prefix (same system prompt,
   same rules file, same early tool results). See this technique's row in `TOOL_MATRIX.md` for where
   each tool surfaces it.
2. **Run a few identical-prefix turns** — ask two or three follow-ups in the same session without
   editing files or clearing context, so the prefix should be reused.
3. **Read the ratio.** After the first turn (which writes the cache), later turns should show a large
   `cache_read` and a small `cache_write`. If `cache_read` stays at or near zero while `cache_write`
   stays high turn after turn, the cache is being invalidated before it can be read — a silent
   invalidator is burning full input price.

If reads are near zero, look for the thing that changes the prefix. Cache hits require the prompt to
be byte-identical up to and including the cache breakpoint; the match walks `tools` → `system` →
`messages`, and changing any block at or before the breakpoint produces a different prefix and no
hit.[^cc-prompt-caching] The usual culprits:

- A timestamp, session id, or per-turn note injected near the top of the system prompt.
- Tool definitions that change between turns (names, descriptions, parameters) — including MCP
  servers whose tool list shifts, or turning web search / citations on and off.
- Images added or removed anywhere in the prompt, and changes to thinking / effort settings — these
  invalidate the cache too.[^cc-prompt-caching]
- A cache break longer than the TTL: the cache lifetime is 1 hour on a Claude subscription but drops
  to 5 minutes on usage credits or an API key / cloud provider, so a gap between turns can miss even
  with a perfectly stable prefix. `ENABLE_PROMPT_CACHING_1H=1` keeps the 1-hour lifetime on usage
  credits.[^cc-costs] (Keeping the cache warm is a separate technique; here you're only confirming
  the reads exist.)

Fix the invalidator, re-run the identical-prefix turns, and confirm `cache_read` is now high.

## When it's worth it / when not

- **Worth it:** run this once whenever you set up caching, change your rules file or MCP servers,
  switch billing path (subscription → API key), or notice input spend climbing without more work
  getting done. It is a five-minute check that protects the largest single caching discount.
- **Worth it:** on any managed IDE tool where you can't set the breakpoints yourself — the only thing
  you *can* do is verify the provider's cache is landing (see below).
- **Not a lever on its own:** this diagnoses; it doesn't save tokens. The saving comes from fixing
  whatever the check exposes (a stable prefix, a warm cache, correct TTL).

## What it costs you

- **Almost nothing.** A few extra turns and a look at one number. No quality risk — you're reading a
  usage field, not changing the model's inputs.
- **The one trap is measuring the write turn.** The first turn after a fresh prefix always writes and
  shows near-zero reads — that's expected. Judge the *steady-state* turns, not the first.
- **Streaming can hide the numbers.** In Aider, cache statistics and costs aren't reported while
  streaming; run with `--no-stream` to see them.[^aider-caching] Check your tool's equivalent before
  concluding the cache is dead.

## How to verify

- **Claude Code:** `/usage` — the Session block shows `cache read` and `cache write` per model, and
  `/usage` flags "cache misses" as a behavior when they're 10% or more of recent usage.[^cc-costs]
  For a team, the OpenTelemetry metric `claude_code.token.usage` breaks out by `type` =
  `cacheRead` / `cacheCreation`, so you can watch cache-read share on a dashboard.[^cc-monitoring]
- **Direct API / gateway:** read `cache_read_input_tokens` vs `cache_creation_input_tokens` on the
  usage object.[^cc-prompt-caching] A gateway (LiteLLM, Bifrost) logs these per request.
- **Other CLIs:** Aider prints cache stats with `--no-stream`;[^aider-caching] Gemini CLI's `/stats`
  shows cached-token savings.[^gemini-cli-caching] For provider-managed IDE tools (Cursor, Copilot,
  Grok Build) the cache is not user-tunable, so the check is coarser: confirm cached usage appears in
  the vendor's usage/billing breakdown rather than expecting a per-turn read/write split.

The one signal to watch: **cache-read tokens as a share of input tokens across steady-state turns.**
On a stable prefix it should be high; near zero means a silent invalidator.

## Measured impact

_Not yet measured by us._ Benchmark: run a multi-turn task on a fixed repo and compare a baseline
session against one where a prefix invalidator has been removed — same work, measured by
cache-read-token share and input cost per passing task. The verified anchor is the price gap that
makes this matter: a cache read is billed at 0.1× base input while an invalidated prefix pays full
input plus a 1.25×–2× write surcharge every turn,[^pricing] so a silently-missing cache can multiply
the input bill on the cheapest-to-cache part of the prompt. ⚠ The economics are vendor-published;
the end-to-end session delta is not yet independently measured.

[^cc-prompt-caching]: Claude Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cc-monitoring]: Claude Code docs, "Monitoring usage" — <https://code.claude.com/docs/en/monitoring-usage>
[^pricing]: Claude Docs, "Pricing" — <https://platform.claude.com/docs/en/about-claude/pricing>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^gemini-cli-caching]: Gemini CLI docs, "Token caching and cost optimization" — <https://google-gemini.github.io/gemini-cli/docs/cli/token-caching.html>
