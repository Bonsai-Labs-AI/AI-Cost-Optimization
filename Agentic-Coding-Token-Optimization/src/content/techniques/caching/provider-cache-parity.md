---
title: "Provider cache parity (OpenAI / Gemini / Copilot)"
group: caching
level: 1
costLever: [cache, input]
effort: Low
savingEstimate: "large on the cached prefix (0.1×–0.25× base input)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - codex
  - copilot
  - gemini-cli
  - opencode
  - cursor
  - cline
  - aider
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "context/keep-rules-file-small"
sources:
  - id: openai-cache
    title: "Prompt caching"
    publisher: "OpenAI API docs"
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Automatic for prompts >=1,024 tokens; cached input billed 0.1x uncached input (90% off); older models cache in 128-token increments, 5-10 min idle up to 1 hr; GPT-5.6+ exact-match at cache breakpoints, 30-min lifetime refreshed on reuse."
  - id: gemini-implicit
    title: "Gemini 2.5 models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: blog
    note: "Implicit caching automatic, no setup; 75% token discount on matched prefixes; min 1,024 tokens (2.5 Flash) / 2,048 (2.5 Pro); put static content first."
  - id: gemini-cache-docs
    title: "Context caching"
    publisher: "Gemini API docs"
    url: "https://ai.google.dev/gemini-api/docs/caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Implicit caching enabled by default for Gemini 2.5+; explicit caching bills cached tokens at 0.1x plus $1/MTok-hr storage; cached count in usage.total_cached_tokens."
  - id: copilot-billing
    title: "GitHub Copilot is moving to usage-based billing"
    publisher: "The GitHub Blog"
    url: "https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "From June 1 2026, credits consumed by token usage 'including input, output, and cached tokens' at each model's published API rate. 1 AI Credit = $0.01 (per RESEARCH_FINDINGS)."
  - id: claude-cache
    title: "Manage costs effectively — prompt caching"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "For contrast: Anthropic read 0.1x, 5-min write 1.25x, 1-hr write 2x; TTL 1 hr on subscription / 5 min on usage credits or API."
---

## What & why

Prompt caching is not an Anthropic-only feature. OpenAI, Google, and GitHub Copilot all charge less
for the repeated prefix of a prompt, and for all three it is **automatic** — you don't call a caching
API, you just have to keep the front of the prompt stable so it matches the previous request.[^openai-cache][^gemini-implicit]
That means the same hygiene that pays off on Claude Code — a stable system/rules prefix, no
per-turn timestamps or volatile ordering — also pays off for Codex, Gemini CLI, and Copilot users.
The lever is cache hits; the economics and TTLs just differ per provider.

## How to do it

The portable move is the same across every provider: **make the front of every request identical
turn to turn, and let the volatile bits fall at the end.**

1. **Keep the prefix stable.** System prompt, rules file, tool definitions, and any pinned context go
   first and stay byte-for-byte identical. A cache hit is a prefix match, so a single changed
   character near the top invalidates everything after it.
2. **Push the variable stuff to the end.** The user's new question, the current diff, a timestamp —
   put these last so they don't break the cached prefix.[^gemini-implicit]
3. **Strip per-turn noise from the prefix.** No injected clocks, no randomized tool ordering, no
   session IDs early in the prompt. (This is the same discipline as the no-timestamp / stable-prefix
   caching rules elsewhere in this group.)
4. **Clear the minimum size.** Caching only kicks in above a floor: **OpenAI ~1,024 tokens**,[^openai-cache]
   **Gemini 1,024 (2.5 Flash) / 2,048 (2.5 Pro)**.[^gemini-implicit] A tiny prompt won't cache — which
   is usually fine, because a tiny prompt is already cheap.

You rarely toggle anything: for these providers caching is on by default and managed by the provider,
so with the IDE-style tools there's often no user-facing knob at all — the win comes entirely from
prompt hygiene. See this technique's row in `TOOL_MATRIX.md` for the per-tool specifics.

**The economics differ, so calibrate expectations:**

- **OpenAI (Codex, Copilot-on-OpenAI):** cached input is billed at **0.1× the uncached rate — 90%
  off** — automatically for prompts ≥1,024 tokens. Older models cache in 128-token increments and
  hold for 5–10 minutes idle (up to ~1 hour); GPT-5.6+ uses exact matching at cache breakpoints with
  a 30-minute lifetime that refreshes on reuse.[^openai-cache]
- **Gemini (Gemini CLI, Gemini-backed agents):** implicit caching gives an automatic **~75% discount**
  on the matched prefix for Gemini 2.5 and newer, no setup.[^gemini-implicit] Explicit (manually
  created) caches bill the cached tokens at ~0.1× but add a storage fee (~$1 per million tokens per
  hour), so explicit only wins for large, long-lived, reused context.[^gemini-cache-docs]
- **Copilot:** since **June 1 2026** Copilot bills usage-based **AI Credits** (1 credit = $0.01), and
  credits are consumed by "input, output, **and cached tokens**" at each model's published API rate.[^copilot-billing]
  So cached tokens still show up on the meter — but at the underlying model's cached rate, which is
  where the same prefix hygiene lowers the bill.

For contrast, Anthropic's model is different in shape: reads are 0.1× but **writes cost extra** (1.25×
for 5-min, 2× for 1-hr TTL), and the TTL depends on billing path.[^claude-cache] OpenAI and Gemini
don't charge a separate cache-write premium, so on those providers the stable-prefix habit is closer
to pure upside.

## When it's worth it / when not

- **Worth it:** any Codex, Gemini CLI, or Copilot session with a non-trivial standing prompt (rules
  file, tool set, pinned files) that repeats across turns — i.e. essentially every agentic session.
  It's a zero-regret default, same as on Claude Code.
- **Worth it:** long, stable context you re-send often (a big spec, a schema) — that's exactly what
  the discount rewards.
- **Not much to gain:** very short prompts below the ~1–2k-token floor never cache, and one-shot
  prompts you never repeat can't hit.
- **Backfires only if you fight it:** injecting a timestamp, request ID, or reshuffled tool list into
  the *front* of the prompt silently turns every request into a cache miss. The failure is invisible
  on the bill unless you watch the cached-token counts.

## What it costs you

Almost nothing. There's no quality risk — the model sees the same tokens either way; caching only
changes the price of the prefix. The one real cost is **discipline**: you have to keep the prefix
stable, and with off-the-shelf tools you don't fully control the prompt the harness builds, so a tool
update can quietly change the prefix and drop your hit rate. Gemini's *explicit* caching is the only
one with a direct downside — the per-hour storage fee means a rarely-reused explicit cache can cost
more than it saves; prefer implicit unless the context is large and hot.[^gemini-cache-docs]

## How to verify

Watch the cached-token counters in each provider's usage payload and confirm the cached share of
input is climbing:

- **OpenAI / Codex:** `usage.prompt_tokens_details.cached_tokens` in the API response.[^openai-cache]
- **Gemini / Gemini CLI:** `usage_metadata` cached-content token count (`total_cached_tokens`).[^gemini-cache-docs]
- **Copilot:** the AI-Credits / usage report breaks spend down by token type; watch the cached-token
  line and total credits per task.[^copilot-billing]

`ccusage` also reads cached-token splits for several of these CLIs locally, so you can compare cache
hit rate on a repeated task before and after tightening the prefix. The metric to move is
**cached-input tokens as a fraction of total input** on a repeat run of the same task.

## Measured impact

_Not yet measured by us._ Benchmark: run the same repeated-turn task on a Codex (OpenAI), Gemini CLI,
and Copilot session, first with a clean stable prefix and then with a prefix deliberately broken by a
per-turn timestamp, and compare cached-input fraction and cost per task against that same-tool
baseline. Cited economics so far: OpenAI cached input at **0.1× (90% off)** automatically above
1,024 tokens;[^openai-cache] Gemini implicit caching at **~75% off** the matched prefix;[^gemini-implicit]
Copilot meters cached tokens at each model's published API rate under AI Credits.[^copilot-billing]
⚠ The Copilot AI-Credits figures are vendor-announced (June 2026 billing change) and should be
re-checked against current published per-model rates.

[^openai-cache]: OpenAI API docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
[^gemini-cache-docs]: Gemini API docs, "Context caching" — <https://ai.google.dev/gemini-api/docs/caching>
[^copilot-billing]: The GitHub Blog, "GitHub Copilot is moving to usage-based billing" — <https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/>
[^claude-cache]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
