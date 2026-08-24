---
title: "Iterate within the cache TTL"
group: caching
level: 1
costLever: [cache, input]
effort: Low
savingEstimate: "large on long sessions with gaps"
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
  - "context/keep-rules-file-small"
sources:
  - id: cc-caching
    title: "How Claude Code uses prompt caching"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache lifetime: 1 hr on subscription, 5 min on usage credits / API key / cloud. ENABLE_PROMPT_CACHING_1H=1 keeps 1 hr on usage credits; FORCE_PROMPT_CACHING_5M=1 forces 5 min. Each cache hit resets the timer."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "First message after a break longer than the cache lifetime misses the cache and reprocesses full context; /usage flags cache misses when ≥10% of recent usage."
  - id: api-pricing
    title: "Pricing (prompt-cache read/write multipliers)"
    publisher: "Claude Platform docs"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Cache read 0.1x base input; 5-min write 1.25x; 1-hr write 2x. Break-even after 1 read (5-min) or 2 reads (1-hr)."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts enables caching; --cache-keepalive-pings N pings every 5 min, up to N times (N*5 min) to hold the 5-min cache warm."
  - id: codex-caching
    title: "Prompt Caching in Codex CLI: how the agent loop stays linear"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex prompt caching is automatic (no opt-in flag) for requests ≥1,024 tokens; retention ~5–10 min idle, max ~1 hr. Reported 80–90% cache hit rate on stable prefixes."
  - id: gemini-implicit
    title: "Gemini 2.5 models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: blog
    note: "Implicit caching on by default for Gemini 2.5+; automatic prefix-match discount, no configuration."
---

## What & why

Prompt caching lets the provider re-read the unchanged start of your context (system prompt, project files, prior turns) at roughly a tenth of the input price instead of reprocessing it every turn.[^api-pricing] The cache expires after a period of inactivity, and each cache hit resets that timer.[^cc-caching] So the lever here is behavioural, not a setting: keep working inside the time-to-live (TTL) and your session stays cheap; step away past it and the next message misses the cache and re-pays full input price for the whole context.[^cc-costs] The TTL depends on how you authenticate — 1 hour on a Claude subscription, 5 minutes once you're on usage credits, an API key, or a cloud provider.[^cc-caching]

## How to do it

The portable rule is: **batch your gaps, not your work.** A cached prefix survives short pauses and resets its timer on every hit, so continuous back-and-forth stays warm for free. The cost lands on the *first* message after a gap longer than the TTL, which reprocesses the entire context uncached. Three things follow:

1. **Know your TTL.** On a Claude subscription it's an hour; on usage credits, an API key, or a cloud provider it's five minutes.[^cc-caching] Five minutes is easy to blow past — a meeting, a code review, lunch — and every return after that gap is a full-context cache miss.
2. **Extend the TTL when you can afford it.** In Claude Code, `ENABLE_PROMPT_CACHING_1H=1` keeps the one-hour lifetime while you're drawing on usage credits.[^cc-caching] The trade-off is the write price: a 1-hour cache write costs 2× base input vs 1.25× for the 5-minute write, so it pays off only when you get at least two reads before the next miss.[^api-pricing] In Aider, `--cache-keepalive-pings N` sends background pings every five minutes to hold the (5-minute) cache warm across short idle spells.[^aider-caching]
3. **Don't invalidate the prefix mid-task.** Switching model, changing effort/reasoning level, or `/compact` in the middle of a task recomputes the whole prefix — the same cost as a TTL miss, self-inflicted. Pick model and effort at the top of a session and save compaction for breaks between tasks.[^cc-caching]

For the IDE-based and provider-managed tools there's no user-facing TTL knob: caching is applied for you, and the same "keep the prefix stable, don't leave long gaps" discipline is what earns the discount. Gemini CLI is the clearest case of this — on Gemini 2.5+ models, implicit caching is on by default and the prefix-match discount is automatic, so there's nothing to set and the only lever is keeping the front of the prompt stable.[^gemini-implicit] See this technique's row in `TOOL_MATRIX.md` for the exact per-tool knob (or `(managed)` where the provider owns it).

## When it's worth it / when not

- **Worth it:** long, bursty sessions — the normal shape of a coding day, where you work in spurts with gaps between them. The bigger the context and the more frequent the gaps just over the TTL, the more a miss costs.
- **Most valuable on the 5-minute path** (usage credits / API key / cloud): five minutes is short enough that ordinary interruptions cause misses, so extending or keeping the cache warm has real payback.
- **Not worth engineering** for short, continuous sessions that never idle past the TTL — the cache already stays warm on its own.
- **Watch the 1-hour write cost:** if your pattern is one message then a long gap (so you rarely get a second read), the 2× write of the 1-hour TTL can cost more than just eating the 5-minute miss.[^api-pricing]

## What it costs you

- **Quality risk: none.** This changes cache economics, not what the model sees.
- **The 1-hour write premium.** `ENABLE_PROMPT_CACHING_1H` writes at 2× base input instead of 1.25×; it only nets out if you read the cache at least twice before it expires.[^api-pricing]
- **Keepalive pings aren't free.** Aider's `--cache-keepalive-pings` sends real (small) requests to reset the timer; over a long idle they add up, so cap `N` to the idle you actually expect.[^aider-caching]
- **The main failure mode is self-inflicted invalidation** — a mid-task model or effort switch, or an early `/compact`, throws away the warm prefix for no gain.[^cc-caching]

## How to verify

- Watch the **cache-read vs cache-write** split. In Claude Code, a status-line script can read `cache_read_input_tokens` and `cache_creation_input_tokens` per turn; a high read-to-write ratio means the cache is holding. If creation stays high turn after turn, your prefix keeps changing.[^cc-caching]
- **Claude Code `/usage`** flags cache misses as a behaviour when they exceed ~10% of recent usage — a direct signal that gaps or mid-session changes are costing you.[^cc-costs]
- For any tool, compare input vs cache-read tokens across a session with your usual work rhythm before and after extending the TTL (`ccusage` and Claude Code OpenTelemetry both split cache-read from input).

## Measured impact

_Not yet measured by us._ Benchmark: run the same task set on the 5-minute path with a fixed idle gap inserted between turns, comparing the baseline (default TTL) against the variant that keeps the cache warm (1-hour TTL via `ENABLE_PROMPT_CACHING_1H` on Claude Code, keepalive pings on Aider), and report input and cache-read tokens plus cost per passing task. Cited so far: prompt-cache reads bill at ~0.1× base input, so a returning-after-a-gap turn that hits the cache costs roughly a tenth of the same turn missing it;[^api-pricing] Codex reports 80–90% cache-hit rates on stable prefixes.[^codex-caching] ⚠ The Codex figure is practitioner data, not independently verified.

[^cc-caching]: Claude Code docs, "How Claude Code uses prompt caching" — <https://code.claude.com/docs/en/prompt-caching>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^api-pricing]: Claude Platform docs, "Pricing" (prompt-cache read/write multipliers) — <https://platform.claude.com/docs/en/about-claude/pricing>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^codex-caching]: Codex Knowledge Base (Daniel Vaughan), "Prompt Caching in Codex CLI" — <https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
