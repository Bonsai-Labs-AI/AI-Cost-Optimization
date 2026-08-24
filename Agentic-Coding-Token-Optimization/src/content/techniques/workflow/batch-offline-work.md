---
title: "Move non-interactive work to the Batch API / offline"
group: workflow
level: 3
costLever: [model-price]
effort: Medium
savingEstimate: "~50% on the work you move"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - codex
  - aider
  - cursor
  - cline
  - copilot
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "workflow/deterministic-orchestration"
sources:
  - id: anthropic-batch
    title: "Batch processing (Message Batches API)"
    publisher: "Claude Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
    accessed: "2026-08-10"
    kind: docs
    note: "50% off all usage (input, output, special tokens); async-only; most batches <1 hr, hard 24-hr window; batch requests are not stateful; 1-hr prompt cache recommended for shared context, cache hits best-effort."
  - id: openai-batch
    title: "Batch API guide"
    publisher: "OpenAI Platform docs"
    url: "https://developers.openai.com/api/docs/guides/batch"
    accessed: "2026-08-10"
    kind: docs
    note: "50% cost discount vs synchronous APIs; each batch completes within 24 hours; async / no real-time reply."
  - id: cc-headless
    title: "Run Claude Code programmatically (headless / -p)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/headless"
    accessed: "2026-08-10"
    kind: docs
    note: "claude -p / --print runs non-interactively for scripts and CI; --bare for reproducible one-shot runs; ANTHROPIC_BASE_URL/API key repointable."
  - id: codex-noninteractive
    title: "Non-interactive mode (codex exec)"
    publisher: "OpenAI Codex docs"
    url: "https://developers.openai.com/codex/noninteractive"
    accessed: "2026-08-10"
    kind: docs
    note: "codex exec runs a single session to completion, no TUI; --ask-for-approval never for unattended runs."
  - id: aider-scripting
    title: "Scripting aider"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/scripting.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--message/-m and --message-file/-f run one shot then exit; --yes auto-confirms; Python API for batch loops."
  - id: deepseek-offpeak
    title: "DeepSeek API pricing — peak / off-peak"
    publisher: "DeepSeek API docs"
    url: "https://api-docs.deepseek.com/quick_start/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Off-peak = half of peak. Peak hours 01:00–04:00 and 06:00–10:00 UTC; all other hours off-peak. Off-peak is a time-of-day rate, not a discount off older prices."
---

## What & why

Async, latency-tolerant bulk work — mass-refactor drafts, doc and test generation, backfills across
many files, PR-triage passes — doesn't need to run in a live agent loop. The Batch API runs those
requests asynchronously for **50% off input and output tokens**, on both Anthropic and OpenAI.[^anthropic-batch][^openai-batch]
The lever is the model's unit price: the same tokens, at half price, for anything you can wait on.
It stacks with prompt caching, so shared context (the repo, the rules file) is discounted on top of
the batch discount.[^anthropic-batch] The one hard rule: batch is **async-only and not stateful** — it
is explicitly not for interactive, turn-by-turn agent sessions.[^anthropic-batch]

## How to do it

Split your token spend into two buckets: **interactive** (a developer waiting at the keyboard) and
**offline** (a job that can finish in the next hour or overnight). Move the offline bucket off the
synchronous path.

1. **Identify the batchable work.** Anything you'd be fine getting back in under an hour (usually) and
   within 24 hours (guaranteed-or-expired): bulk refactor drafts, generating docstrings/tests across a
   directory, a first-pass PR-triage summary over many PRs, one-off migrations, offline eval runs.
2. **Generate the request set, then submit as a batch.** Each unit of work becomes one request with its
   own id; you submit them together and poll for results. Most batches finish in under an hour; results
   are held for retrieval, and anything not done in 24 hours expires.[^anthropic-batch] Because the work
   isn't stateful, design each request to be self-contained rather than a continued conversation.
3. **Stack prompt caching.** When many requests share the same prefix (repo context, conventions), use
   the **1-hour cache** so the shared prefix survives the longer batch turnaround. Cache hits inside a
   batch are best-effort because requests run concurrently and in any order, so treat the caching win as
   a bonus, not a guarantee.[^anthropic-batch]
4. **Where a provider offers off-peak pricing, schedule for it.** DeepSeek, for example, charges half
   price outside its peak UTC windows; a nightly cron for offline jobs lands in the cheap window for
   free.[^deepseek-offpeak] This composes with, or substitutes for, the batch route depending on the
   provider.

**A key distinction for tool users:** the coding CLIs (Claude Code, Codex, Aider, …) run
*synchronously* — they don't submit to the Batch API for you. The realistic pattern is either
(a) script the bulk generation against the raw Batch API directly and reserve the CLI for the
interactive parts, or (b) drive the CLI in its **non-interactive / headless mode** as the orchestration
and point it at a discounted endpoint — Claude Code's `claude -p` / `--print`,[^cc-headless] Codex's
`codex exec`,[^codex-noninteractive] and Aider's `--message` / `-m` one-shot mode.[^aider-scripting] So
the per-tool knob is each tool's headless entry point plus its endpoint override, not a "batch button."
See this technique's row in `TOOL_MATRIX.md` for the exact flags.

## When it's worth it / when not

- **Worth it:** large, repetitive, latency-tolerant jobs — the mass-refactor first draft, test/doc
  backfills, a nightly PR-triage or lint-review pass, offline evals. The more requests and the more
  shared context, the better batch + caching pays off.
- **Worth it:** teams already running scheduled/CI automation — you're just pointing that work at a
  cheaper lane.
- **Not:** anything a developer is waiting on. Interactive coding, debugging, "fix this now" — batch's
  async delay makes it a non-starter, and it's explicitly unsupported for stateful sessions.[^anthropic-batch]
- **Not:** small one-off jobs where the plumbing (building the request set, polling, wiring results back)
  costs more engineering time than the ~50% saves.

## What it costs you

- **Latency.** Minutes to (rarely) hours; you must be able to wait, and design around jobs that can
  expire at 24 hours under load.[^anthropic-batch]
- **Setup effort (Medium).** You build the request-generation, submission, polling, and result-merge
  glue, and split your pipeline into interactive vs offline lanes. This is engineering, not a config flag.
- **No live steering.** Because it isn't a conversation, the model can't ask a follow-up or self-correct
  mid-task the way an interactive agent does — you get one shot per request, so results need a review or
  eval gate before they land.
- **Caching is best-effort in batch,** so don't budget on a guaranteed cache-hit rate.[^anthropic-batch]

## How to verify

- Confirm the discount on the bill: batched line items should show ~50% of the synchronous per-token
  rate for the same model.[^anthropic-batch][^openai-batch]
- Track the **share of tokens on the batch/off-peak lane** vs the interactive lane over time — that share
  is the size of this lever for your team.
- Watch **batch expiry / failure rate**; if jobs routinely hit the 24-hour wall, split them smaller.
- For off-peak, confirm jobs actually run inside the cheap UTC window and are billed at the off-peak
  rate.[^deepseek-offpeak]

## Measured impact

_Not yet measured by us._ Benchmark: take a latency-tolerant bulk job (e.g. generate tests across N
files) and run it two ways on the same repo and model — the interactive/synchronous baseline vs the
same work submitted through the Batch API — then compare total cost and cost per accepted result. The
expected delta is the provider's stated ~50% token discount on the moved work, plus any prompt-cache
stacking. Providers report a 50% discount on all batch usage;[^anthropic-batch][^openai-batch] ⚠ that is
vendor-published pricing, not an independent measurement, and the *realized* saving depends on how much
of your spend is genuinely batchable.

[^anthropic-batch]: Claude Docs, "Batch processing (Message Batches API)" — <https://platform.claude.com/docs/en/build-with-claude/batch-processing>
[^openai-batch]: OpenAI Platform docs, "Batch API guide" — <https://developers.openai.com/api/docs/guides/batch>
[^cc-headless]: Claude Code docs, "Run Claude Code programmatically (headless / -p)" — <https://code.claude.com/docs/en/headless>
[^codex-noninteractive]: OpenAI Codex docs, "Non-interactive mode (codex exec)" — <https://developers.openai.com/codex/noninteractive>
[^aider-scripting]: Aider docs, "Scripting aider" — <https://aider.chat/docs/scripting.html>
[^deepseek-offpeak]: DeepSeek API docs, "API pricing — peak / off-peak" — <https://api-docs.deepseek.com/quick_start/pricing>
</content>
</invoke>
