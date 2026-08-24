---
title: "Filter tool output before it reaches the model"
group: context
level: 2
costLever: [input]
effort: Medium
savingEstimate: "60–90% of dev-loop output"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - codex
  - cursor
  - cline
  - aider
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/deterministic-orchestration"
  - "context/keep-rules-file-small"
sources:
  - id: rtk
    title: "RTK — filtering command output for coding agents"
    publisher: "Parker Jones"
    url: "https://parkerjones.dev/posts/rtk-token-killer/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "24.5M tokens saved over 6,283 commands (~90.9% of that output)."
  - id: autoscout24
    title: "3 techniques to reduce token consumption in Claude Code and Codex"
    publisher: "AutoScout24 Engineering"
    url: "https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "60–90% reduction on dev-loop output."
  - id: cc-hooks
    title: "Hooks"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/hooks"
    accessed: "2026-08-10"
    kind: docs
    note: "PostToolUse can't modify tool output; suppressOutput has no effect. PreToolUse can rewrite the command (updatedInput)."
  - id: cc-issue-17611
    title: "Configurable Tool Output Limits for Token Optimization"
    publisher: "anthropics/claude-code (issue #17611)"
    url: "https://github.com/anthropics/claude-code/issues/17611"
    accessed: "2026-08-10"
    kind: repo
    note: "Native intelligent output filtering not built yet; MAX_MCP_OUTPUT_TOKENS caps MCP output (default 25k)."
  - id: codex-perf
    title: "Codex CLI performance optimisation: token overhead and tuning"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/08/codex-cli-performance-optimization/"
    accessed: "2026-08-10"
    kind: blog
    note: "Codex output truncation and model_auto_compact_token_limit."
---

## What & why

A coding agent runs the dev loop constantly — `git status`, test runs, builds, linters, package
installs. The full output of each command goes into context at full token cost, even when only a
line or two matters (did the tests pass? which files changed?). Filtering that output down to the
signal before it reaches the model cuts input tokens on the highest-frequency, lowest-value traffic
in a session. Reported reductions run 60–90% of dev-loop output.[^rtk][^autoscout24]

## How to do it

The portable idea is to **wrap the noisy commands** so the agent sees a filtered version, not the
raw stream. A wrapper (or proxy) runs the real command, strips the noise — ANSI colour codes,
progress bars, passing-test lines, unchanged-file walls, verbose JSON fields — and returns the lean
result. The rewrite itself costs no model tokens.[^rtk]

Three levels, cheapest first:

1. **Quiet the source.** Pass the flags the tool already has: `--quiet`, `--reporter=dot`, `| tail`,
   `pytest -q`. No setup, works everywhere.
2. **Wrap the loud commands.** Route the worst offenders (test runners, builds, `git status`/`diff`,
   installs) through a filtering script or proxy such as RTK. Start with the commands that produce
   the most tokens.
3. **Auto-route in Claude Code.** A `PreToolUse` hook can rewrite the command (via `updatedInput`) to
   the wrapper, so it happens without the agent's involvement.

**Mechanism limitation (important):** a Claude Code hook cannot truncate or rewrite output *after* a
tool runs — `PostToolUse` fires once the output is already in context, and `suppressOutput` has no
effect.[^cc-hooks] So the filtering has to happen in the wrapper, not the hook. Native "output cap"
settings exist (`MAX_MCP_OUTPUT_TOKENS`, default 25k, for MCP tools; token-based truncation in
Codex[^codex-perf]) but they blindly truncate rather than filter — use them only as a backstop.
Intelligent native filtering is still an open request.[^cc-issue-17611]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool mechanism and cap settings.

## When it's worth it / when not

- **Worth it:** almost any repo where the agent runs tests, builds, or git frequently — which is
  most of them. The dev loop is where this traffic lives.
- **Biggest wins:** verbose test runners, chatty builds, large `git status`/`diff`, package installs.
- **Not worth it:** one-off exploration where you actually want the full output, or any command where
  a filter could hide the very line the agent needs. Keep filters conservative.

## What it costs you

- **Setup effort.** Adopting an existing proxy is Low effort; hand-rolling wrappers and deciding what
  to strip is Medium.
- **The real risk is over-filtering** — dropping a line the agent needed, which triggers a re-run and
  re-pays the tokens you saved. Mitigate by only suppressing known noise (progress, passing tests) and
  always passing errors and failures through verbatim.
- **Truncation is worse than filtering** — a blind token cap can cut the one relevant line. Prefer
  filtering; use caps only as a safety net.

## How to verify

- Compare input tokens (or tokens-per-turn) on a session that exercises the dev loop, before and
  after wrapping the top commands.
- Find the commands worth wrapping first: RTK has a discovery mode; `ccusage` and Claude Code OTel
  show per-session input so you can see which tools dominate.

## Measured impact

_Not yet measured by us._ Benchmark: run tasks T1–T3 on the same repo with and without dev-loop
output filtering, and compare input tokens and cost per passing task (arm A0/A1 vs a filtered
variant). Cited so far: RTK reports 24.5M tokens saved over 6,283 commands (~90.9% of that
output);[^rtk] AutoScout24 reports a 60–90% cut in dev-loop output.[^autoscout24] ⚠ Both are
practitioner data, not yet independently verified.

[^rtk]: Parker Jones, "RTK — filtering command output for coding agents" — <https://parkerjones.dev/posts/rtk-token-killer/>
[^autoscout24]: AutoScout24 Engineering, "3 techniques to reduce token consumption in Claude Code and Codex" — <https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/>
[^cc-hooks]: Claude Code docs, "Hooks" — <https://code.claude.com/docs/en/hooks>
[^cc-issue-17611]: anthropics/claude-code, issue #17611 — <https://github.com/anthropics/claude-code/issues/17611>
[^codex-perf]: Codex Knowledge Base, "Codex CLI performance optimisation" — <https://codex.danielvaughan.com/2026/04/08/codex-cli-performance-optimization/>
