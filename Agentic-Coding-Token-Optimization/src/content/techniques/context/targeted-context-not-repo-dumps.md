---
title: "Point at files, not the whole repo"
group: context
level: 1
costLever: [input]
effort: Low
savingEstimate: "large on big repos"
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
  - "context/tool-output-filtering"
sources:
  - id: cursor-ignore
    title: "Ignore files"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/ignore-files"
    accessed: "2026-08-10"
    kind: docs
    note: ".cursorignore blocks access + indexing; .cursorindexingignore excludes from indexing only. .gitignore syntax."
  - id: cursor-at
    title: "@ Symbols"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/@-symbols"
    accessed: "2026-08-10"
    kind: docs
    note: "@Files & Folders reference specific paths; Agent otherwise finds files by its own search."
  - id: cline-ignore
    title: ".clineignore"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/customization/clineignore"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: ".clineignore uses .gitignore syntax; guards file reads/edits, not search_files/list_files. Known context-leak reports (issue #9554)."
  - id: roo-ignore
    title: "Using .rooignore to Control File Access"
    publisher: "Roo Code docs"
    url: "https://roocodeinc.github.io/Roo-Code/features/rooignore"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: ".rooignore mirrors .gitignore; ineffective when a whole directory is passed as context (issue #3543)."
  - id: aider-repomap
    title: "Repository map"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/repomap.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Repo map defaults to ~1k tokens (--map-tokens; 0 disables). /add and /read add exact files."
  - id: aider-ignore
    title: "Aider .aiderignore — reducing repo-map noise and token cost"
    publisher: "iamraghuveer.com"
    url: "https://www.iamraghuveer.com/posts/aider-aiderignore/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: ".aiderignore trims the repo map (generated/vendored/fixtures); .gitignore syntax."
  - id: copilot-exclusion
    title: "Excluding content from GitHub Copilot"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/how-tos/configure-content-exclusion/exclude-content-from-copilot"
    accessed: "2026-08-10"
    kind: docs
    note: "Repo/org 'content exclusion' (paths in settings, `*:` patterns) — not a repo file; CLI + agent mode do not honor it."
  - id: cc-settings
    title: "Settings — permissions"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/settings"
    accessed: "2026-08-10"
    kind: docs
    note: "@file/@dir reference a path in a prompt; permissions.deny Read(./path/**) is the enforced exclusion (no working .claudeignore)."
  - id: opencode-refs
    title: "References / Tools"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/references/"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "@alias / @alias/ attach a reference root; grep/glob use ripgrep and respect .gitignore (.ignore to override). Read tool bypasses .gitignore (issue #12196)."
  - id: codex-scoping
    title: "Codex CLI context scoping: .codexignore, file references, workspace control"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/06/01/codex-cli-context-scoping-codexignore-file-references-permission-profiles-workspace-control/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "node_modules/.gitignore excluded from listing by default; .codexignore requested/partial and reported not honored (issues #205, #6530)."
  - id: autoscout24
    title: "3 techniques to reduce token consumption in Claude Code and Codex"
    publisher: "AutoScout24 Engineering"
    url: "https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Context discipline (scope the files the agent sees) is a first-order lever on input tokens."
---

## What & why

Whole-repo references — `@codebase`, `@folder` on a large tree, or a fat repo map — pull far more
into the prompt than the task needs, and you pay for every one of those input tokens on the turn
they load (and again on later turns once they anchor the conversation). Naming the exact files and
directories a task touches, and keeping build/vendored/generated dirs out of context and out of the
index, is the cheapest way to hold input tokens down on a big codebase.[^autoscout24] The mechanism
is simple: the model only reasons over what's in the window, so a smaller, more relevant window is
both cheaper and usually more accurate.

## How to do it

Two moves, both low-effort:

1. **Reference the files the task needs, not the tree.** When you know which files matter, point at
   them (a specific file or a small directory) with the tool's `@`-syntax instead of asking the agent
   to scan everything.[^cursor-at] When
   you don't know, let the agent's own search find them — that reads a few files rather than loading
   the repo. Reserve whole-codebase references for genuine "where is X?" questions on small or
   mid-size repos; on a large tree they're the most expensive way to ask.

2. **Keep dead weight out with an ignore-file.** Add the tool's ignore-file and list the directories
   that never help the agent: `node_modules`/vendored deps, `dist`/`build`/generated output,
   `.min.js` and bundles, lockfiles, large fixtures, media. This trims both the codebase index and
   what search/`@`-references can pull in, so the noise never reaches the window.[^cursor-ignore][^aider-ignore]
   Most of these files use `.gitignore` syntax, so you can seed them from your existing `.gitignore`.
   (A few tools split this into an index-only ignore vs. a full access block, and some — like GitHub
   Copilot's content exclusion — live in repo/org settings rather than a repo file and aren't honored
   in CLI or agent mode.[^cursor-ignore][^copilot-exclusion])

One caveat that changes how you treat ignore-files: in several tools the ignore-file governs the
file *picker*, indexer, and `@`-references but is **not** a hard access block — the agent can still
reach an "ignored" file through a shell command or a raw read.[^cc-settings][^opencode-refs][^codex-scoping]
For token control that's fine (it keeps bulk dirs out of context). For secrets it is not: enforce
those with a real deny rule (e.g. Claude Code `permissions.deny`), not the ignore-file.[^cc-settings]

See this technique's row in `TOOL_MATRIX.md` for each tool's exact `@`-reference syntax, ignore-file
name, and (where it exists) the index-vs-access distinction.

## When it's worth it / when not

- **Worth it:** any repo big enough that a whole-repo reference or repo map is a meaningful slice of
  the window — monorepos, repos with large `node_modules`/`dist`/vendored trees, generated clients.
  The ignore-file half is a zero-regret default on every repo.
- **Biggest wins:** killing `@codebase`/`@folder` dumps on large trees, and excluding
  generated/vendored/build dirs from the index so they never surface in search or `@`-references.
- **Not worth it (or skip a step):** on a small repo the whole thing may fit cheaply, so pointing at
  files buys little — but the ignore-file still helps by keeping `node_modules`/build out of the
  index.
- **When not to over-scope down:** if you name too few files the agent will go search for the rest
  anyway (extra turns) or, worse, edit the ones it can see without the context it needed. Give it the
  files the change actually spans, then let it pull neighbors on demand.

## What it costs you

- **Setup:** minutes. Drop in the ignore-file (seed from `.gitignore`) and get in the habit of
  referencing files. No infrastructure.
- **The real failure mode is under-scoping** — omitting a file the task needed. The agent then
  re-searches (extra turns and tokens) or makes a change blind to a caller/callee. Fix by scoping to
  the change's actual span, not the single file you first thought of.
- **Ignore-files are not access control.** In several tools they're advisory for context/indexing and
  bypassable by shell/raw reads.[^cc-settings][^opencode-refs][^codex-scoping] Some also have
  reported leaks where an ignored directory still lands in context.[^cline-ignore][^roo-ignore] Treat
  the ignore-file as a token-hygiene tool; gate secrets with an enforced deny rule.

## How to verify

- Watch **input tokens per turn** (and the initial-context size) on the same task with and without a
  whole-repo reference, and before/after adding the ignore-file. Claude Code `/context` shows what's
  loaded; `ccusage` and OTel show per-session input across most CLIs.
- Check the **indexed size**: after adding ignore patterns, confirm the excluded dirs no longer show
  up in codebase search / `@`-reference results (Cursor's indexing settings, Aider's repo-map size).
- In Aider specifically, the repo-map token budget is visible and tunable (`--map-tokens`,
  default ~1k, `0` to disable), so you can read the map's cost directly.[^aider-repomap]

## Measured impact

_Not yet measured by us._ Benchmark: run the same task on a large repo two ways — a baseline that
lets the agent reference the whole codebase / carries an untrimmed repo map, versus a variant that
references only the files the task spans and applies an ignore-file to exclude vendored/generated/build
dirs — and compare initial-context size, input tokens per turn, and cost per passing task. Practitioner
guidance treats scoping the files the agent sees as a first-order input-token lever, but publishes no
clean before/after isolating this technique.[^autoscout24] ⚠ Cited context is practitioner-sourced and
not independently verified.

[^autoscout24]: AutoScout24 Engineering, "3 techniques to reduce token consumption in Claude Code and Codex" — <https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/>
[^cc-settings]: Claude Code docs, "Settings — permissions" — <https://code.claude.com/docs/en/settings>
[^opencode-refs]: OpenCode docs, "References / Tools" — <https://opencode.ai/docs/references/>
[^codex-scoping]: Codex Knowledge Base, "Codex CLI context scoping" — <https://codex.danielvaughan.com/2026/06/01/codex-cli-context-scoping-codexignore-file-references-permission-profiles-workspace-control/>
[^cline-ignore]: Cline docs, ".clineignore" — <https://docs.cline.bot/customization/clineignore>
[^roo-ignore]: Roo Code docs, "Using .rooignore to Control File Access" — <https://roocodeinc.github.io/Roo-Code/features/rooignore>
[^aider-repomap]: Aider docs, "Repository map" — <https://aider.chat/docs/repomap.html>
[^cursor-at]: Cursor docs, "@ Symbols" — <https://cursor.com/docs/context/@-symbols>
[^cursor-ignore]: Cursor docs, "Ignore files" — <https://cursor.com/docs/context/ignore-files>
[^aider-ignore]: iamraghuveer.com, "Aider .aiderignore — reducing repo-map noise and token cost" — <https://www.iamraghuveer.com/posts/aider-aiderignore/>
[^copilot-exclusion]: GitHub Docs, "Excluding content from GitHub Copilot" — <https://docs.github.com/en/copilot/how-tos/configure-content-exclusion/exclude-content-from-copilot>
