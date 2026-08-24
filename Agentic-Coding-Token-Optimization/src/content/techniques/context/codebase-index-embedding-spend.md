---
title: "Control codebase-index embedding spend"
group: context
level: 1
costLever: [input]
effort: Low
savingEstimate: "the whole embedding-API line item"
savingBasis: estimate
qualityRisk: Low
appliesTo:
  - cursor
  - cline
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/keep-rules-file-small"
  - "context/tool-output-filtering"
sources:
  - id: roo-index
    title: "Codebase Indexing"
    publisher: "Roo Code docs"
    url: "https://roocodeinc.github.io/Roo-Code/features/codebase-indexing"
    accessed: "2026-08-10"
    kind: docs
    note: "Embedder providers OpenAI / Gemini (currently free) / Ollama (offline, zero cost) / Mistral / OpenAI-Compatible / Bedrock / OpenRouter; scope via .gitignore + .rooignore; initial index is the heavy phase; hash-based caching + file-watch smart updates on re-index; >1MB files skipped."
  - id: kilo-index
    title: "Codebase Indexing"
    publisher: "Kilo Code docs"
    url: "https://kilo.ai/docs/customize/context/codebase-indexing"
    accessed: "2026-08-10"
    kind: docs
    note: "OpenAI (text-embedding-3-small default) / Ollama + LanceDB fully local (no hosted embedding API, no external calls) / Gemini / Mistral; scope via .gitignore + .kilocodeignore."
  - id: continue-embed
    title: "Embed Role"
    publisher: "Continue docs"
    url: "https://docs.continue.dev/customize/model-roles/embeddings"
    accessed: "2026-08-10"
    kind: docs
    note: "Default embedder is local transformers.js (all-MiniLM-L6-v2, free) in VS Code; paid API-key providers openai/gemini/cohere/voyage/mistral; local free alt = nomic-embed-text via Ollama; add `embed` to a model's roles."
  - id: cursor-ignore
    title: "Ignore Files"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/reference/ignore-file"
    accessed: "2026-08-10"
    kind: docs
    note: ".cursorignore blocks access entirely (Agent, Tab, @-mentions, indexing); .cursorindexingignore excludes from indexing only while files stay reachable to AI features."
  - id: cursor-index-internals
    title: "How Cursor Actually Indexes Your Codebase"
    publisher: "Towards Data Science"
    url: "https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/"
    accessed: "2026-08-10"
    kind: blog
    note: "Chunk locally → embed on Cursor's hosted model → per-codebase namespace in Turbopuffer; Merkle tree (SHA-256) finds changed chunks; embeddings cached in AWS keyed by chunk hash so only changed chunks re-embed. Practitioner explainer, not Cursor's own docs."
---

## What & why

Semantic-index tools (Cursor, Cline/Roo, Kilo, Continue) turn your repo into a vector index so the
agent can retrieve relevant files instead of reading the tree by hand. Building that index means
running every chunk of code through an embeddings model, and in the tools that let you bring your own
embedder that call is billed to **your** API key — a separate line item from the chat/completion
tokens most cost tracking watches. The lever is the embedding-API spend: pick a cheap or free
embedder, index less, and don't re-embed the whole repo when you don't have to.

## How to do it

Three portable moves, largest saving first:

1. **Use a cheap or free embedder.** Embedding tokens are far cheaper than chat tokens, but "your key,
   your bill" still adds up on a big monorepo. In the bring-your-own-embedder tools you can point the
   embedder at a **local model** (Ollama `nomic-embed-text` / `mxbai-embed-large`, or Continue's
   built-in `transformers.js`) so indexing costs nothing, or at a **free-tier hosted model** (Google
   Gemini's embedding endpoint is currently free) instead of a paid OpenAI/Mistral key. Local is the
   zero-cost floor; a free hosted tier is the easy middle.[^roo-index][^continue-embed][^kilo-index]

2. **Scope what gets indexed.** The index only needs your source. Exclude vendored SDKs, generated
   clients, `node_modules`/build output, lockfiles, fixtures, and large data files with an ignore
   file. These tools already honour `.gitignore`; add a tool-specific ignore for anything that's
   checked in but shouldn't be embedded. Most also skip files over ~1 MB automatically.[^roo-index]
   Smaller index = fewer embed calls up front and less to re-embed later.

3. **Avoid full re-index churn.** The first full index is the expensive part; after that these tools
   hash each chunk and only re-embed what changed (Cursor uses a Merkle tree over file hashes and
   caches embeddings by chunk hash; Roo/Kilo/Continue use hash-based caching with file-watch
   updates).[^cursor-index-internals][^roo-index] So the thing to avoid is triggering a **from-scratch
   re-index** — deleting the index, switching embedding model or dimension, or wiping the vector store
   — which re-pays the whole initial cost. Change the embedder deliberately, not repeatedly.

**One key distinction for the matrix:** Cursor embeds on its **own hosted infrastructure**, included in
the subscription — there's no embedding API key to bill, so for Cursor this technique is purely
*scope* (`.cursorindexingignore`) and *don't force a re-index*, not *choose an embedder*.[^cursor-ignore] Cline/Roo,
Kilo, and Continue embed through **an embeddings API on your key**, which is where the "cheap/free
embedder" lever actually exists.[^cursor-index-internals][^roo-index][^continue-embed] See this
technique's row in `TOOL_MATRIX.md` for the exact provider settings and ignore-file names per tool.

## When it's worth it / when not

- **Worth it:** you use a bring-your-own-embedder tool (Cline/Roo, Kilo, Continue) on a large or
  fast-changing repo, and the embedding API is on your key. Switching a paid embedder to Ollama or
  Gemini free tier removes the line item outright.
- **Worth it (Cursor):** the repo has large generated/vendored trees that don't need semantic search
  — `.cursorindexingignore` shrinks the index and the per-turn retrieval you pay for, even though the
  embedding itself is on Cursor's bill.
- **Not worth it:** small repos, or teams on Cursor with a clean tree — the embedding spend is already
  negligible and a local embedder can retrieve slightly worse. Don't disable indexing to save pennies
  and then pay it back in the agent grepping the tree manually.

## What it costs you

- **Retrieval quality.** Local/free embedders (MiniLM, nomic-embed) are generally weaker than a paid
  hosted model, so retrieval can be a little less precise. On most code repos the gap is small; verify
  on your own before standardising.
- **Setup and moving parts.** Local embedding via Ollama adds a service to run and (for Roo/Kilo) a
  vector store to point at; Kilo's Ollama + LanceDB path keeps it fully local with no external
  store.[^kilo-index] Low effort, but not zero.
- **The re-index trap.** Changing embedder or dimension invalidates the existing vectors and forces a
  full re-embed — the one action that re-pays the initial cost. Pick an embedder once.

## How to verify

- Look at the **embedding endpoint's own usage/billing**, not just chat-token dashboards — this spend
  is on the embeddings API (or is zero if you moved to local/Ollama). Confirm the paid embedder's
  usage drops to zero after switching.
- Check the tool's index status/size and the ignore file's effect: fewer indexed blocks after adding
  exclusions confirms scoping worked (Roo/Kilo show indexed-block counts; Cursor shows index status in
  settings).
- Watch for unexpected **full re-index** events after upgrades or model changes — a sudden spike in
  embedding calls is the signal.

## Measured impact

_Not yet measured by us._ Benchmark: index the same repo with (a) a paid hosted embedder on your key
vs (b) a local/free embedder, and separately (c) a full-tree index vs (d) a scoped index with vendored
and generated paths excluded — compare embedding-API cost and retrieval quality on a fixed task set.
Direction is clear from the docs rather than a headline number: local/free embedders (Ollama,
`transformers.js`, Gemini free tier) take the embedding line item to zero or near-zero, and scoping
plus avoiding from-scratch re-indexes reduces the count of embed calls.[^roo-index][^continue-embed]
⚠ No independent before/after token figure yet; the internals (Merkle/hash caching, hosted vs
your-key embedding) are practitioner- and docs-sourced, and one Cursor internals source is a
practitioner explainer rather than Cursor's own documentation.

[^roo-index]: Roo Code docs, "Codebase Indexing" — <https://roocodeinc.github.io/Roo-Code/features/codebase-indexing>
[^kilo-index]: Kilo Code docs, "Codebase Indexing" — <https://kilo.ai/docs/customize/context/codebase-indexing>
[^continue-embed]: Continue docs, "Embed Role" — <https://docs.continue.dev/customize/model-roles/embeddings>
[^cursor-ignore]: Cursor docs, "Ignore Files" — <https://cursor.com/docs/reference/ignore-file>
[^cursor-index-internals]: "How Cursor Actually Indexes Your Codebase" — <https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/>
