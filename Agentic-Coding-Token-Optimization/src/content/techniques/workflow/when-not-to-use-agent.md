---
title: "Know when not to use the agent"
group: workflow
level: 1
costLever: [output, calls]
effort: Low
savingEstimate: "avoids the call entirely on mechanical work"
savingBasis: estimate
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
  - "workflow/test-driven-agent-work"
  - "context/tool-output-filtering"
sources:
  - id: ast-grep
    title: "ast-grep — code structural search and replace"
    publisher: "ast-grep docs"
    url: "https://ast-grep.github.io/"
    accessed: "2026-08-10"
    kind: docs
    note: "Structural search/rewrite across 20+ languages: `-p` pattern, `-r` rewrite. AST-based, deterministic — no model."
  - id: ruff
    title: "The Ruff formatter"
    publisher: "Astral (Ruff docs)"
    url: "https://docs.astral.sh/ruff/formatter/"
    accessed: "2026-08-10"
    kind: docs
    note: "`ruff format` (Black-compatible) and `ruff check --fix` apply deterministic formatting/lint fixes."
  - id: codemod2
    title: "Intelligent code modification at scale (Codemod 2.0)"
    publisher: "Codemod Blog"
    url: "https://codemod.com/blog/codemod2"
    accessed: "2026-08-10"
    kind: blog
    note: "'LLMs are great at generating code, they are not designed for detecting patterns at scale' — use deterministic AST engines for detection/mechanical transforms; more reliable & scalable than LLMs alone."
  - id: swamp
    title: "A Practical Guide to Reducing Token Spend"
    publisher: "Adam Jacob"
    url: "https://www.adamhjk.com/blog/a-practical-guide-to-reducing-token-spend/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Moving coordination/mechanical work out of the LLM hot path cut a code-review workload from ~4.5M tokens (23 agents) to ~500k (3 agents) — 8x — and ran 2x faster."
  - id: cc-interactive
    title: "Interactive mode — Shell mode with `!` prefix"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/interactive-mode"
    accessed: "2026-08-10"
    kind: docs
    note: "`!` runs a command directly without going through the model. By default it triggers a response (costs a prompt); `respondToBashCommands: false` makes it purely deterministic. `Esc` interrupts a running turn."
  - id: aider-commands
    title: "In-chat commands — /run, /git"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/commands.html"
    accessed: "2026-08-10"
    kind: docs
    note: "`/run` (alias `!`) runs a shell command and *optionally* adds output to chat; `/git` runs git with output excluded from chat — deterministic paths that spend no model tokens."
---

## What & why

The cheapest agent call is the one you don't make. Mass mechanical edits — a repo-wide rename,
a framework migration, an import reorder, formatting — are deterministic transforms that a
codemod, `sed`, or an AST tool does exactly and for free, while an agent re-derives the same edit
token by token and bills you for every line of output it re-emits. The lever here is avoided
output tokens and avoided calls: you route deterministic work to a deterministic tool and reserve
the model for the judgment work only it can do.[^codemod2] The same logic covers the other end of
the size scale — a one-line typo fix or a known config flip is faster to type than to describe to
an agent and wait for a turn.

## How to do it

The portable rule is to **classify the edit before you prompt**: is it mechanical (a rule a machine
can apply everywhere) or does it need judgment (context, tradeoffs, a design choice)? Send only the
second kind to the agent.

- **Mechanical, at scale → a deterministic tool.** Repo-wide renames, API/framework migrations,
  syntax-preserving rewrites, import sorting, formatting. Reach for AST-aware tools that understand
  code structure rather than text: `ast-grep` (`-p` pattern, `-r` rewrite; 20+ languages)[^ast-grep]
  or `comby` for structural search-and-replace, `jscodeshift` for deep JS/TS transforms, and
  formatters/fixers like `ruff format` / `ruff check --fix` for Python style and safe lint
  fixes.[^ruff] These run in seconds, apply everywhere consistently, and cost no tokens.
- **Trivial and local → do it by hand.** A one-line change, a version bump, a known flag flip.
  Typing it is faster than a round-trip and spends nothing.
- **Let the agent write the codemod, not perform the edit.** When the transform is one-off or the
  pattern is fiddly, the high-leverage move is to have the model *generate the codemod script or the
  `ast-grep` rule* once, then run it deterministically over the whole repo. You pay for one small
  output (the script), not for N edited files.[^codemod2]
- **Keep the deterministic step out of the model's hot path.** Where a tool lets you run a command
  without feeding its output back for a model response, use that path — it's a zero-token action. In
  Claude Code, `!` shell mode runs a command directly; set `respondToBashCommands: false` so it
  doesn't also spend a prompt on a response.[^cc-interactive] In Aider, `/run` (alias `!`) *optionally*
  adds output to chat and `/git` excludes it entirely — deterministic paths that spend no model
  tokens.[^aider-commands] See this technique's row in `TOOL_MATRIX.md` for the exact per-tool
  mechanism.

The judgment cases still belong to the agent: edits that need to read surrounding context, resolve
ambiguity, weigh a design tradeoff, or touch code no rule can safely pattern-match.

## When it's worth it / when not

- **Worth it:** any edit expressible as a rule that repeats — a rename across hundreds of files, a
  version-migration codemod, "reorder these imports everywhere," "run the formatter." The bigger the
  file count, the larger the avoided output.
- **Worth it:** the trivial one-liner — cheaper to type than to prompt.
- **Not worth it:** edits that need judgment or context. A rename that's really a semantic change
  (some call sites need different handling), a migration with per-file exceptions, "clean this up" —
  force those into a blind codemod and you either miss cases or break code, then pay the agent to fix
  the mess.
- **Not worth it when writing the rule costs more than the edit.** For a handful of sites in one
  file, a codemod's authoring overhead can exceed just letting the agent do it. Scale is the
  deciding factor.

## What it costs you

- **Setup and skill.** Someone has to know the codemod tools and write the pattern. `ruff format` or
  a `sed` one-liner is Low effort; a `jscodeshift` transform for a gnarly migration is Medium and
  needs testing. This is a real bar — the failure mode is a team that reaches for the agent because
  it's the tool they know.
- **A wrong rule applies everywhere.** Determinism cuts both ways: a bad pattern breaks every match
  at once. Run codemods on a clean tree, review the diff, and gate on the test suite (see
  `workflow/test-driven-agent-work`) before committing.
- **Classification overhead.** You spend a moment deciding mechanical-vs-judgment. Cheap, and it
  becomes reflex, but it's not zero.
- **Over-applying it.** Don't turn genuinely context-dependent work into a brittle regex to avoid a
  model call; that trades tokens for bugs.

## How to verify

- **Watch for the anti-pattern in your traces.** Large multi-file diffs the agent produced for a
  purely mechanical change (a rename, a format pass) are output tokens you could have spent zero on.
  Per-session output-token and turn counts (`ccusage`, Claude Code OTel) surface these.
- **Track cost per task by task class.** Mechanical tasks routed to codemods should approach zero
  model cost; if they don't, the agent is still doing work a tool should.
- **Sanity-check the tool did the whole job.** Diff and test after a codemod so a silent miss doesn't
  route back to the agent — which re-pays what you saved.

## Measured impact

_Not yet measured by us._ Benchmark: take a mechanical task with a clear rule (a repo-wide rename or
an import-reorder across many files) and run it two ways on the same repo — a baseline that hands the
whole job to the agent, and a variant that applies a codemod / `ast-grep` rule (optionally with the
agent authoring the script) — then compare output tokens and cost per completed task. Expected
direction is a large drop in output tokens for the codemod variant, since the deterministic edit
emits nothing through the model; the case to measure against is a task with enough per-file
exceptions that the rule misses cases and routes rework back to the agent. Cited signal for the
mechanism: one practitioner reports moving mechanical/coordination work out of the LLM hot path cut a
code-review workload from ~4.5M to ~500k tokens (8x) and ran 2x faster.[^swamp] ⚠ That figure is a
single practitioner blog and is not independently verified; treat it as directional.

[^ast-grep]: ast-grep docs, "code structural search and replace" — <https://ast-grep.github.io/>
[^ruff]: Astral, "The Ruff formatter" — <https://docs.astral.sh/ruff/formatter/>
[^codemod2]: Codemod Blog, "Intelligent code modification at scale (Codemod 2.0)" — <https://codemod.com/blog/codemod2>
[^swamp]: Adam Jacob, "A Practical Guide to Reducing Token Spend" — <https://www.adamhjk.com/blog/a-practical-guide-to-reducing-token-spend/>
[^cc-interactive]: Claude Code docs, "Interactive mode — Shell mode with `!` prefix" — <https://code.claude.com/docs/en/interactive-mode>
[^aider-commands]: Aider docs, "In-chat commands — /run, /git" — <https://aider.chat/docs/usage/commands.html>
