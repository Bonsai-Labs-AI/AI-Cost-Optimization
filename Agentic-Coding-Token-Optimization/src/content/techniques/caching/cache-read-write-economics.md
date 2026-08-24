---
title: "Cache read/write economics"
group: caching
level: 2
costLever: [input, cache]
effort: Low
savingEstimate: "up to ~90% on the repeated prefix"
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
  - gemini-cli
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/keep-rules-file-small"
  - "context/tool-output-filtering"
sources:
  - id: anthropic-cache
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Read 0.1x base input; 5-min write 1.25x; 1-hr write 2x. TTL set via cache_control ttl (default 5m, '1h' option)."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache lifetime 1 hr on subscription, 5 min on usage credits or API key/cloud; ENABLE_PROMPT_CACHING_1H=1 keeps 1 hr on usage credits. A break longer than the TTL misses the cache and reprocesses full context."
  - id: aider-cache
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts enables caching of system prompt, read-only files, repo map, chat files; --cache-keepalive-pings N pings every 5 min to hold the cache warm across N*5 min."
  - id: gemini-implicit
    title: "Gemini 2.5 Models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: docs
    note: "Implicit caching on by default for Gemini 2.5; prefix cache hit gives ~75% token discount, no cache-write or storage cost. Min 1024 tokens (Flash) / 2048 (Pro)."
  - id: oc-cache
    title: "oc-plugin-caching — cache breakpoints for OpenCode"
    publisher: "nazriel/oc-plugin-caching (GitHub)"
    url: "https://github.com/nazriel/oc-plugin-caching"
    accessed: "2026-08-10"
    kind: repo
    note: "Community plugin injects Anthropic cache breakpoints and shows cache-hit stats."
---

## What & why

Prompt caching is not a single "on" switch — it is a small bet you make on every request, and the
math decides whether it pays. On the Claude API a **cache read costs about 0.1x a normal input token,
a 5-minute cache write costs 1.25x, and a 1-hour write costs 2x**.[^anthropic-cache] So the first
time you cache a prefix you pay a premium, and you only come out ahead once that prefix is read back
enough times to earn the premium back. That break-even is **after about 2 reads on the 5-minute TTL
and about 3 reads on the 1-hour TTL** — trivially easy to clear inside one coding session, which is
why keeping a stable prefix and reusing it before the TTL expires is the lever that actually lowers
total input cost. This page is the economics behind the other caching techniques; the mechanics
(stable prefixes, TTL discipline) exist to serve this math.

## How to do it

The portable idea: **make the cache write pay for itself, then keep reading from it before it
expires.**

1. **Know your break-even.** A write at 1.25x (5-min) needs the cached prefix read back a bit more
   than once at 0.1x to beat paying full input each time; a 2x write (1-hr) needs a bit more than
   twice. Concretely: **~2 reads clears the 5-min write, ~3 reads clears the 1-hr write.** In an
   agent loop each turn re-sends the whole prefix, so you clear break-even in the first few turns and
   everything after is at ~0.1x.
2. **Cache the stable prefix, not the churn.** Put the parts that don't change per turn at the front
   (system prompt, rules file, repo map, pinned read-only files) so the cached span is as long as
   possible. Anything that changes every turn (the latest user message, fresh tool output) goes at
   the end, after the cache breakpoint. See `context/keep-rules-file-small` — a smaller, stable
   prefix is also a cheaper one to write.
3. **Pick the TTL to match your cadence.** If turns are seconds apart, the 5-minute TTL is cheaper to
   write (1.25x) and you'll re-read well within the window. If you step away — review a diff, run a
   long build, join a call — the 5-minute cache expires and your next turn is a **full-context cache
   miss** at 1x. The 1-hour TTL costs more to write (2x) but survives those gaps; it's worth it only
   if you actually read across the gap enough times to clear the higher break-even.[^anthropic-cache]
4. **Don't let a gap silently reprice you.** A break longer than the TTL reprocesses the entire
   context at full input rate — the single most common way a "cached" session quietly costs full
   price.[^cc-costs] Either keep the cadence inside the TTL, use the longer TTL, or (Aider) send
   keepalive pings.

Caching is provider-managed for most IDE-style tools (Cursor, Copilot, Gemini CLI, and Codex apply
it for you), so there's often no knob — the lever you control is the **shape and stability of the
prefix**, not a setting. Some tools need help: OpenCode, for instance, relies on a community plugin
to inject Anthropic cache breakpoints and surface cache-hit stats.[^oc-cache] See this technique's
row in `TOOL_MATRIX.md` for the exact per-tool knob or `(managed)` where the tool handles it.

## When it's worth it / when not

- **Worth it:** almost every interactive coding session. Agent loops re-send a large stable prefix
  every turn, so you clear break-even almost immediately and then ride ~0.1x reads for the rest of
  the session. This is close to a zero-regret default wherever the tool exposes it.
- **The 1-hour TTL is worth it** when your work has natural gaps (code review, long builds, meetings)
  and you return to the same context repeatedly — you pay 2x once to avoid repeated full-context
  misses.
- **Not worth paying the write premium** for a one-shot request you'll never read back: a single
  turn that's answered and cleared pays 1.25x–2x for a cache nobody reads. One-off, throwaway prompts
  don't clear break-even.
- **Not for offline/batch work in the usual way:** the Batch API is async-only and can't be used for
  interactive agent sessions, though its discount stacks with caching when you *are* batching (bulk
  evals, offline refactors).[^anthropic-cache]

## What it costs you

- **The write premium is real and up-front.** Every distinct prefix you cache costs 1.25x or 2x once.
  Churn the prefix — reorder it, edit the rules file mid-session, insert something new near the front —
  and you invalidate the cache and pay another write. Cache thrash (many writes, few reads) can cost
  *more* than not caching at all.
- **TTL misses reprice the whole context.** The failure mode to watch is the quiet one: a gap longer
  than the TTL turns your next turn into a full 1x reprocess of the entire conversation.[^cc-costs]
- **Almost no quality risk.** Caching changes billing, not model output — the cached tokens are the
  same tokens. The only "risk" is spending on writes you don't read back.

## How to verify

- **Watch cache-read vs cache-write tokens.** In Claude Code, `/usage` and the per-session line
  (`… cache read, … cache write`) show the split; a healthy session is mostly cache *reads*. `/usage`
  also flags cache misses when they exceed 10% of recent usage.[^cc-costs] `ccusage` and OpenTelemetry
  (`claude_code.token.usage` split by `cacheRead` / `cacheCreation`) give the same split across CLIs.
- **The number to move:** the ratio of cache-read to cache-write tokens. If writes rival reads, your
  prefix is churning or your TTL is expiring — fix the prefix stability or lengthen the TTL.
- **Aider:** run with `--no-stream` to see caching stats and cost, which are hidden while
  streaming.[^aider-cache]

## Measured impact

_Not yet measured by us._ Benchmark: run the same multi-turn task on the same repo twice — once with
a stable cached prefix and TTL matched to the cadence, once as the baseline (no cache reuse / prefix
churned each turn) — and compare total input cost and the cache-read/write token split. The vendor
economics set the ceiling: reads land at ~0.1x base input, so a prefix read back many times
approaches a ~90% cut on that repeated span, less the one-time 1.25x–2x write.[^anthropic-cache]
Gemini's implicit caching reports a similar ~75% discount on prefix hits.[^gemini-implicit] ⚠ These
are vendor-published rate multipliers, not an independent measurement of end-to-end session savings;
our benchmark will produce the session-level number.

[^anthropic-cache]: Claude Platform Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^aider-cache]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 Models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
[^oc-cache]: nazriel/oc-plugin-caching (GitHub), "oc-plugin-caching — cache breakpoints for OpenCode" — <https://github.com/nazriel/oc-plugin-caching>
