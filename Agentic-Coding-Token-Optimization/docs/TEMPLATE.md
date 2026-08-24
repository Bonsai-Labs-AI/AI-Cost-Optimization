# Technique page template

The format for a technique page in this project. It is **not** the same as Part 1's template —
these techniques are operational (specific setup, tool-dependent, and we have our own benchmark
numbers), so the page reads like a playbook entry, not an essay.

Two decisions that shape this (Daniel, 2026-08-10):
1. **Portable description on the page + a shared tool matrix.** The page explains the technique
   once, tool-agnostically, and points at `TOOL_MATRIX.md` for the exact per-tool flags — instead
   of repeating the Claude Code / Cursor / Aider rows on every page.
2. **A "Measured impact" block on every page,** as a placeholder until the benchmark fills it in.

---

## Frontmatter

```yaml
---
title: "Keep the rules file small"
group: context          # foundations | model-routing | context | caching | workflow | quality
level: 1                # 1 | 2 | 3  (omit for foundations pages; use `foundation: true` instead)
costLever: [input]      # input | output | calls | turns | cache | model-price | plan
effort: Low             # Low | Medium | High
savingEstimate: "large" # short free text ("large", "~30–50%", "varies") — don't over-claim
savingBasis: cited      # measured | cited | estimate   (measured = our benchmark)
qualityRisk: Low        # Low | Medium | High
appliesTo:              # tools this applies to; keys match TOOL_MATRIX.md columns
  - claude-code         # valid keys: claude-code, cursor, cline, aider, copilot, codex,
  - cursor              # opencode, grok-build, windsurf, gemini-cli, goose
  - cline
  - copilot
  - codex
  - aider
status: planned         # planned | in-progress | researched | published
lastUpdated: "2026-08-10"
related:                # optional cross-links: "<group>/<slug>"
  - "workflow/deterministic-orchestration"
sources:
  - id: rtk
    title: "..."
    publisher: "..."
    url: "https://..."
    accessed: "2026-08-10"
    kind: blog          # docs | paper | blog | benchmark | repo | pricing | other
    verify: true        # set true if the headline number is practitioner-sourced (⚠)
---
```

## Body sections (use these exact H2 headings)

```markdown
## What & why
2–3 sentences: what you change and which token lever it pulls. One line on the mechanism.

## How to do it
The portable version — the steps that hold across tools. For the exact flags/commands per tool,
link to this technique's row in TOOL_MATRIX.md; do not restate every tool here.

## When it's worth it / when not
Bullets. Replaces Part 1's "Example Where It Works / Would NOT Work." Be honest about where it
backfires (e.g. over-trimming a rules file so the agent re-derives conventions).

## What it costs you
Quality risk, added latency, setup effort, and the failure modes to watch.

## How to verify
The one or two metrics a reader should watch to confirm it worked (cache-hit rate, tokens/turn,
cost per task) — and where to see them.

## Measured impact
Our benchmark number if we have it (before/after, with the arm); otherwise the placeholder plus
the arm that will fill it. Always name the benchmark arm so it's traceable to D3.
```

`## References` is rendered from `sources` — don't hand-write it.

---

## The shared tool matrix (`TOOL_MATRIX.md`)

One table: **techniques as rows, tools as columns, cell = the exact knob** (flag, command, or
setting) — or `—` if it doesn't apply. Each page's "How to do it" links to its row. This is also
the artifact we hand a team in the "set it up in your repo" service.

| Technique | Claude Code | Cursor | Cline/Roo | Aider | Copilot | Codex |
|---|---|---|---|---|---|---|
| Keep rules file small | `CLAUDE.md` (<200 lines), skills for detail | `.cursor/rules/*.mdc` + globs | `.clinerules/` | `CONVENTIONS.md` (read-only) | `.github/copilot-instructions.md` | `AGENTS.md` |
| Cheap-model split | `opusplan`, subagent `model:` | Auto / model picker | Plan/Act models | `--weak-model`, architect/editor | Auto model | `--model`, `-e` |
| Filter tool output | `PreToolUse`/`PostToolUse` hooks | — | — | — | — | `tool_output_token_limit` |
| Cache TTL | `ENABLE_PROMPT_CACHING_1H` | (managed) | `cache_control` | `--cache-prompts`, `--cache-keepalive-pings` | (managed) | (managed) |

(Grows as pages are written. Cells with more than a flag get a footnote.)

---

## Worked example — `context/keep-rules-file-small.md`

```markdown
---
title: "Keep the rules file small"
group: context
level: 1
costLever: [input]
effort: Low
savingEstimate: "large"
savingBasis: cited
qualityRisk: Low
appliesTo: [claude-code, cursor, cline, copilot, codex, aider]
status: planned
lastUpdated: "2026-08-10"
sources:
  - id: autoscout24
    title: "3 techniques to reduce token consumption in Claude Code and Codex"
    publisher: "AutoScout24 Engineering"
    url: "https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
---

## What & why
The rules file (CLAUDE.md / AGENTS.md / .cursorrules) is added to every prompt, so every unused
line is charged on every turn. Keeping it short and scoped cuts input tokens across the whole session.

## How to do it
Cap the file to the essentials, move long or situational detail into on-demand skills or referenced
docs, prune stale rules, and scope rules per-directory so subsystem detail only loads in that subtree.
See this technique's row in TOOL_MATRIX.md for the exact file and mechanism per tool.

## When it's worth it / when not
- Worth it: always — it's a zero-regret default.
- Not: don't over-trim to where the agent lacks project conventions and re-derives them each session
  (that costs more than the lines you saved).

## What it costs you
Almost nothing. The only risk is cutting a convention the team actually relies on; fix by moving it
to a skill rather than deleting it.

## How to verify
Check the rules-file token count (Claude Code `/context`), and watch input-tokens-per-turn before
and after.

## Measured impact
_Not yet measured. Benchmark arm A1 vs A0 (good rules file vs none) and A3 (bloated rules file)._
```

---

## Notes

- **Foundations pages** use the same frontmatter but set `foundation: true` (no `level`), and may
  skip `## When it's worth it / when not` and `## Measured impact` — they're setup, not levers we
  benchmark.
- **`savingBasis: measured`** should only be set once a D3 benchmark arm backs the number; until
  then use `cited` or `estimate`, and keep `verify: true` on any practitioner-sourced figure.
- Keep the prose plain and short. These pages are reference, not persuasion.
