---
title: "Symbol / repo-map retrieval"
group: context
level: 2
costLever: [input, calls]
effort: Medium
savingEstimate: "varies — fewer file reads to orient"
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
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: aider-repomap
    title: "Repository map"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/repomap.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Ranked tree-sitter map of the whole repo; --map-tokens default 1k."
  - id: aider-options
    title: "Options reference"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/config/options.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--map-tokens (0 disables), --map-refresh (auto/always/files/manual, default auto), --map-multiplier-no-files (default 2)."
  - id: serena
    title: "Tools"
    publisher: "Serena docs (Oraios)"
    url: "https://oraios.github.io/serena/01-about/035_tools.html"
    accessed: "2026-08-10"
    kind: docs
    note: "LSP-backed symbol tools: get_symbols_overview, find_symbol, find_referencing_symbols, find_declaration, find_implementations."
  - id: cursor
    title: "How Cursor indexes codebases fast"
    publisher: "Engineer's Codex"
    url: "https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast"
    accessed: "2026-08-10"
    kind: blog
    note: "AST-aware chunking → embeddings → Turbopuffer vector store; Merkle-tree incremental re-index."
  - id: copilot
    title: "Indexing repositories for GitHub Copilot"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/concepts/context/repository-indexing"
    accessed: "2026-08-10"
    kind: docs
    note: "Semantic index built remotely for GitHub repos, locally otherwise; referenced with #codebase."
  - id: cc-no-index
    title: "Claude Code doesn't index your codebase — here's what it does instead"
    publisher: "Vadim's blog"
    url: "https://vadim.blog/claude-code-no-indexing/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Claude Code uses on-demand Glob/Grep/Read, not a pre-built index. (practitioner — corroborated by Serena-for-Claude-Code adoption)"
---

## What & why

Without a map, the agent spends turns just finding where things live — it opens files, greps, opens
more files, and reads a lot of code it will not edit, all charged as input tokens on every turn it
stays in context. A symbol or repo map gives it a compact index up front (files, classes, functions,
signatures, or an embedding search over the repo) so it jumps closer to the right code instead of
paying to orient. The lever is **input tokens and the number of file-read calls** in the exploration
phase.

## How to do it

The portable idea is to **hand the agent structure instead of making it reconstruct structure by
reading files.** Three shapes of this exist; pick by tool and repo size:

1. **LSP-symbol retrieval (most precise).** Run a language-server-backed MCP such as Serena so the
   agent can list a file's symbols, jump to a definition, or find references without reading whole
   files.[^serena] This is the closest thing to an IDE's "go to definition" and it edits at the
   symbol level too. Best for large, strongly-typed repos; works across harnesses that accept MCP
   (Claude Code, Codex, Cursor, Cline/Roo, OpenCode) — and it is the way to add symbol retrieval to
   Claude Code, which ships with on-demand Glob/Grep/Read rather than a pre-built index.[^cc-no-index]
2. **A ranked repo map (cheapest to run).** Aider builds a whole-repo map — the important classes and
   functions with their signatures, ranked by a graph over references — and includes a token-budgeted
   slice of it in context.[^aider-repomap] A `ctags`-style symbol dump is the low-tech fallback where
   no map exists.
3. **An embedding index over the codebase (semantic search).** Cursor and Copilot build a vector index
   (AST-aware chunks → embeddings) so the agent can semantically search the repo instead of scanning
   it.[^cursor][^copilot] This is managed for you in those tools; the RAG-over-codebase pattern is the
   same idea if you wire it yourself.

**Keep the map stable so it does not bust the prompt cache.** Whatever map you inject sits near the
top of the prompt; if it changes every turn, every turn is a cache miss and you re-pay full input.
Prefer a map that only refreshes when files actually change, and size the budget so the map is a
small, steady prefix rather than a moving target. In Aider this is the `--map-refresh` cadence and the
`--map-tokens` budget;[^aider-options] in Cursor/Copilot the index is incremental and you mostly leave it alone.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool flag, MCP, or index setting.

## When it's worth it / when not

- **Worth it:** medium-to-large repos where "find the code" is a real cost — the agent otherwise reads
  many files per task just to orient. The bigger and less familiar the repo, the more this pays.
- **Worth it:** strongly-typed languages with good language servers — LSP-symbol retrieval is most
  accurate there.
- **Not worth it:** small repos the agent can hold in context anyway — the map is overhead you re-pay
  each turn for little navigation saved.
- **Not worth it as a blind add-on:** a large always-on repo map or a fat MCP tool list can cost more
  tokens than the reads it saves. Budget it (see below), don't just switch it on.

## What it costs you

- **The map itself is input tokens.** A repo map or symbol overview is only a win if it is smaller than
  the reads it prevents. An over-large `--map-tokens` budget, or a map that refreshes every turn, turns
  a saving into a tax — and an unstable map causes cache misses on top.
- **Setup effort.** Managed index (Cursor, Copilot) is Low — it just runs. An MCP server (Serena) is
  Medium: install, point it at the repo, let the language server warm up. A hand-rolled
  RAG-over-codebase is High and rarely worth it over the built-ins.
- **Failure modes to watch:** a stale index pointing the agent at moved or deleted code; embedding
  search returning plausible-but-wrong chunks (semantic ≠ exact); and an MCP tool list that itself
  bloats context. Prefer letting the index update incrementally over forcing full rebuilds.

## How to verify

- Watch **file-read calls and input tokens during the exploration phase** of a task, before and after
  turning the map on — the map should cut the "open file to look around" reads, not the edits.
- Watch **cache-hit rate / cache-read tokens.** A well-behaved map is a stable prefix and shows high
  cache reads; if hits drop after you add it, the map is churning — pin its refresh cadence.
- In Claude Code, `/context` and `/usage` show what's consuming the window (including MCP servers as a
  share), so you can confirm the symbol MCP is earning its footprint rather than bloating it.

## Measured impact

_Not yet measured by us. This is the project's main benchmark arm._ We compare a baseline run —
the harness orienting with plain file reads / grep — against a variant that gives the agent a symbol
or repo map (LSP-symbol MCP, a ranked repo map, or the built-in codebase index), on the same tasks and
repo. We report input tokens, number of file-read calls, and cost per passing task, and we check that
cache-hit rate does not fall when the map is added. No third-party token-reduction figure is cited here
because the public numbers are tool-specific and not comparable across harnesses; the load-bearing
number will be our own. ⚠ Until that run lands, treat the direction (fewer orientation reads) as
expected, not measured.

[^aider-repomap]: Aider docs, "Repository map" — <https://aider.chat/docs/repomap.html>
[^aider-options]: Aider docs, "Options reference" — <https://aider.chat/docs/config/options.html>
[^serena]: Serena docs (Oraios), "Tools" — <https://oraios.github.io/serena/01-about/035_tools.html>
[^cursor]: Engineer's Codex, "How Cursor indexes codebases fast" — <https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast>
[^copilot]: GitHub Docs, "Indexing repositories for GitHub Copilot" — <https://docs.github.com/en/copilot/concepts/context/repository-indexing>
[^cc-no-index]: Vadim's blog, "Claude Code doesn't index your codebase — here's what it does instead" — <https://vadim.blog/claude-code-no-indexing/>
