---
title: "Long-context price cliff (Gemini)"
group: context
level: 1
costLever: [input, model-price]
effort: Low
savingEstimate: "up to ~2x on any request that crosses 200k"
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
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: gemini-pricing
    title: "Gemini API pricing"
    publisher: "Google (Gemini API docs)"
    url: "https://ai.google.dev/gemini-api/docs/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Gemini 3 Pro (listed as Gemini 3.1 Pro Preview): input $2.00 / output $12.00 for prompts <=200k; $4.00 / $18.00 for prompts >200k."
  - id: apidog-gemini
    title: "How Much Does the Gemini 3.0 API Cost in 2026?"
    publisher: "Apidog"
    url: "https://apidog.com/blog/gemini-3-0-api-cost/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Worked example (350k input x $4/1M) confirms the whole request bills at the higher tier once it crosses 200k, not just the overage. Practitioner-sourced — link-check the mechanism against Google docs."
  - id: anthropic-removal
    title: "Anthropic makes a pricing change that matters for Claude's longest prompts"
    publisher: "The New Stack"
    url: "https://thenewstack.io/claude-million-token-pricing/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Anthropic removed its >200k long-context surcharge (previously 2x input / 1.5x output) on 2026-03-13. Confirms Claude no longer has this cliff. Cross-checked in RESEARCH_FINDINGS.md."
  - id: claude-pricing
    title: "Pricing"
    publisher: "Claude Platform docs"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Current Claude pricing is a flat per-token rate across the 1M window — no >200k tier."
  - id: cc-context
    title: "Costs"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "/context shows the current context breakdown; agent teams use ~7x tokens (plan mode)."
  - id: cline-context
    title: "Understanding the context window progress bar in Cline"
    publisher: "Cline"
    url: "https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline"
    accessed: "2026-08-10"
    kind: docs
    note: "Cline shows a live context-window progress bar and auto-condenses at a configurable threshold."
---

## What & why

Gemini 3 Pro bills on a context-length tier: input and output are ~$2 / ~$12 per million tokens while the
prompt stays at or under 200k tokens, and jump to ~$4 / ~$18 once it crosses 200k.[^gemini-pricing] The jump
is not pro-rata — the moment the prompt passes 200k, the **entire** request (all input and all output) is
charged at the higher rate, so a request that lands at 201k costs roughly twice a request that lands at
199k.[^apidog-gemini] For an agent, whose context grows turn by turn as it reads files and accumulates tool
output, that makes 200k a hard price cliff, not just a hygiene target. Keeping the working context under 200k
holds the request on the cheap tier. This lever pulls **input price tier** (and output).

**Provider scope — read this.** This cliff is Gemini-specific as of 2026-08-10. Anthropic **removed** its own
>200k surcharge (previously 2x input / 1.5x output) on 2026-03-13; Claude now bills a flat per-token rate
across its 1M window.[^anthropic-removal][^claude-pricing] So do not treat the old Claude long-context
surcharge as current — if your agent runs on Claude, this page's cliff does not apply to your bill (context
discipline still helps for other reasons; see related pages). It applies when your harness is pointed at a
Gemini 3 Pro model.

## How to do it

The portable move is to **watch context size and keep the agent's working window under 200k when it's on
Gemini 3 Pro** — through three levers, cheapest first:

1. **Know where the 200k line is and watch the meter.** Most harnesses show current context usage (a
   progress bar or a token count). Keep an eye on it and act before it crosses 200k, not after.
2. **Keep context small by default.** The same techniques that reduce input tokens generally also keep you
   below the cliff: filter noisy tool output, keep the rules file small, prune stale files from the session,
   and compact/condense the conversation when it grows. See the related pages.
3. **Route around it when context has to be large.** If a task genuinely needs more than 200k of context,
   the cliff is unavoidable on Gemini 3 Pro — but you can often run that task on a model without the tier
   (e.g. Claude's flat 1M pricing, or Gemini 3 Flash for cheaper high-frequency work) instead. Pick the
   model per task, not per session.

The key judgment: a request at 199k and one at 260k both cost ~2x apart only because of the tier, so the
cheapest fix is usually to **trim context back under 200k**, and only escalate to a different model when the
task truly can't fit. See this technique's row in `TOOL_MATRIX.md` for the exact per-tool context meter,
compaction command, and model-switch mechanism.

## When it's worth it / when not

- **Worth it:** any team whose agents run on Gemini 3 Pro and whose sessions routinely approach 200k —
  long-file reads, big diffs, agent teams (which use ~7x the tokens of a single session[^cc-context]), or
  long-running loops. The saving is a clean ~2x on every request that would otherwise tip over.
- **Not relevant:** agents running on Claude (no >200k tier since 2026-03-13[^anthropic-removal]) or on
  models without a context-length price tier — for those, context discipline still helps input cost, but
  there's no cliff to avoid.
- **Not worth forcing:** if a task genuinely needs >200k of context to succeed on Gemini 3 Pro, don't
  cripple it to save the tier — either accept the higher rate for that request or move that task to a model
  without the cliff.

## What it costs you

- **Setup effort is Low** — mostly watching an existing meter and reusing context-trimming you should be
  doing anyway.
- **The real failure mode is over-trimming to stay under the line** — dropping a file or compacting away
  detail the agent then has to re-fetch, which re-adds tokens (and can push you back over 200k on the next
  turn) and can hurt task quality. Trim noise first (tool output, stale files), not the material the task
  needs.
- **Model-switching has its own trade-offs.** Moving a task off Gemini 3 Pro to dodge the cliff changes the
  model doing the work; validate quality on the target model before making it the default for that task class.

## How to verify

- Watch the **context meter** in your harness during a representative session and confirm it stays under
  200k on Gemini-3-Pro work (Claude Code `/context`; Cline's context-window progress bar[^cline-context]).
- Check your **per-request token counts and billed rate** in the provider's usage/billing view: requests
  that stay <=200k should bill at ~$2/$12; any that cross should show ~$4/$18 on the whole request. The count
  of requests that crossed 200k is the number to drive down.

## Measured impact

_Not yet measured by us._ Benchmark: run the same Gemini-3-Pro task set twice — once with context allowed to
drift over 200k (baseline) and once with context held under 200k via the levers above — and compare cost per
passing task; the expected effect is roughly a 2x per-request cost difference on every request that would
otherwise cross the tier, with equal task success. ⚠ The tier figures ($2/$12 -> $4/$18 at 200k) are from
Google's pricing docs;[^gemini-pricing] the "entire request bills at the higher rate" mechanism is confirmed
by a practitioner worked example[^apidog-gemini] — link-check both against current Google billing docs before
publishing, since Gemini model names and prices drift.

[^gemini-pricing]: Google, "Gemini API pricing" — <https://ai.google.dev/gemini-api/docs/pricing>
[^apidog-gemini]: Apidog, "How Much Does the Gemini 3.0 API Cost in 2026?" — <https://apidog.com/blog/gemini-3-0-api-cost/>
[^anthropic-removal]: The New Stack, "Anthropic makes a pricing change that matters for Claude's longest prompts" — <https://thenewstack.io/claude-million-token-pricing/>
[^claude-pricing]: Claude Platform docs, "Pricing" — <https://platform.claude.com/docs/en/about-claude/pricing>
[^cc-context]: Claude Code docs, "Costs" — <https://code.claude.com/docs/en/costs>
[^cline-context]: Cline, "Understanding the context window progress bar in Cline" — <https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline>
