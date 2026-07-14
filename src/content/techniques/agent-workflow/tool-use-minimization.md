---
title: "Tool-Use Minimization"
category: agent-workflow
maturityLevel: 2
maturityProvisional: false
shortDescription: "Cut the token cost of an agent's tools — trim tool count and description bloat, and load tools and skills lazily — so you stop re-sending a huge static tool catalog on every single agent step."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "Dozens of tools (or several full MCP servers) are loaded on every request, whether or not they're used."
  - "Input tokens per step are dominated by tool/function definitions rather than the conversation."
  - "Tool-definition block is tens of thousands of tokens and is resent on every turn of a multi-step loop."
  - "Tool-selection accuracy degrades as the toolset grows past ~30–50 tools."
  - "All agent skills are pre-loaded into context at startup instead of on demand."
measurementMethods:
  - "Tool-definition tokens as a share of input tokens per step."
  - "Input tokens per step before vs. after (multiplied by steps-per-run for the compounding cost)."
  - "Number of tools actually loaded into context per request vs. total available."
  - "Tool-selection accuracy on an eval set (wrong-tool / no-tool-found rate) before vs. after."
status: published
lastUpdated: "2026-07-02"
related:
  - "agent-workflow/programmatic-tool-calling"
  - "agent-workflow/agent-budget-guardrails"
  - "prompt-context/provider-native-context-management"
  - "agent-workflow/state-compression-for-agents"
sources:
  - id: anthropic-advanced-tool-use
    title: "Introducing advanced tool use on the Claude Developer Platform"
    publisher: "Anthropic — Engineering"
    year: 2026
    url: "https://www.anthropic.com/engineering/advanced-tool-use"
    accessed: "2026-07-02"
    kind: blog
    note: "Tool definitions consumed 134K tokens before optimization; ~72K for 50+ MCP tools → ~8.7K with Tool Search (85% reduction). Tool-selection accuracy: Opus 4 49%→74%, Opus 4.5 79.5%→88.1%. Programmatic Tool Calling: 43,588→27,297 tokens (37%)."
  - id: anthropic-tool-search
    title: "Tool search tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool"
    accessed: "2026-07-02"
    kind: docs
    note: "defer_loading: true excludes tools from the system-prompt prefix; ~55K token multi-server setup reduced >85%, loading only the 3–5 tools needed. Selection degrades past 30–50 tools. Use when ≥10 tools or >10k token defs. Deferred tools preserve prompt caching."
  - id: anthropic-code-exec-mcp
    title: "Code execution with MCP: building more efficient AI agents"
    publisher: "Anthropic — Engineering"
    year: 2026
    url: "https://www.anthropic.com/engineering/code-execution-with-mcp"
    accessed: "2026-07-02"
    kind: blog
    note: "Loading all tool definitions up front + passing intermediate results through context = 150,000 tokens; on-demand discovery = 2,000 tokens, a 98.7% saving. Progressive disclosure: read tool defs on-demand."
  - id: anthropic-skills
    title: "Agent Skills"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"
    accessed: "2026-07-02"
    kind: docs
    note: "Three-level progressive disclosure: Level 1 metadata (name+description, ~100 tokens/skill, always loaded); Level 2 full SKILL.md (<5k tokens, only when triggered); Level 3 bundled files (loaded only when referenced)."
  - id: layered-token-tax
    title: "MCP Tool Schema Bloat: The Hidden Token Tax (and How to Fix It)"
    publisher: "Layered System"
    year: 2026
    url: "https://layered.dev/mcp-tool-schema-bloat-the-hidden-token-tax-and-how-to-fix-it/"
    accessed: "2026-07-02"
    kind: blog
    note: "A single MySQL MCP server: 106 tools, ~54,600 tokens on every initialization despite needing 2–3 tools/request; lazy hydration cut 54,604→4,899 tokens (91%). Claude Code: 10K+→~3K per request (85%)."
  - id: mcp-context-tax
    title: "MCP's Context Bloat Crisis: Why Loading 1,000+ Tool Definitions Is Breaking Enterprise AI Agents"
    publisher: "AgentMarketCap"
    year: 2026
    url: "https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget"
    accessed: "2026-07-02"
    kind: blog
    note: "GitHub + Slack + Sentry (~40 tools, 3 servers) consumed 143,000 of a 200,000-token context window (72%) before the first query. A well-documented tool = 500–1,500 tokens; a 50-tool server = 25,000–75,000. A 200-turn conversation at 100,000 tokens of schema = 20M tokens of overhead."
---

## Overview

An agent's tools are not free context. Every function/tool definition — its name, its
description, and the full JSON schema for each argument — is serialized into the request
and counts as input tokens. Critically, **the entire tool catalog is re-sent on every
step of an agent loop**, because the model must see all available tools to decide what to
call next. So a large static tool block is not a one-time cost: it is a per-step tax that
multiplies by the number of turns in a run.[^anthropic-advanced-tool-use][^mcp-context-tax]

With the rise of MCP (Model Context Protocol), it became easy to bolt many servers onto
one agent — and easy to blow up the context. Connecting just three common servers (GitHub,
Slack, Sentry — roughly 40 tools) can consume **~143,000 of a 200,000-token window (72%)
before the user even types a query**, and that block is repaid on every turn.[^mcp-context-tax]
Anthropic itself measured internal tool definitions consuming **134K tokens** before
optimization.[^anthropic-advanced-tool-use] A single MySQL MCP server exposing 106 tools
serializes **~54,600 tokens on every initialization**, despite a typical request needing
only 2–3 of those tools.[^layered-token-tax]

Tool-Use Minimization attacks this on three fronts: **use fewer tools**, **make each tool
definition leaner**, and **load tools (and agent skills) lazily** — only the ones relevant
to the current step. It is a **double win**: cutting the catalog both saves tokens *and*
improves the model's ability to pick the right tool, since selection accuracy degrades once
a toolset grows past ~30–50 tools.[^anthropic-tool-search] It sits at **Level 2** because
doing it well is deliberate engineering (retrieval/deferred-loading wiring, description
audits, an eval to prove selection didn't regress) rather than a config flag.

## Detailed Approach & Techniques

### 1. The MCP init tax — quantify what you're actually paying

Before optimizing, measure the tool-definition block as a share of input tokens *per step*
and multiply by steps-per-run. A well-documented tool typically costs 500–1,500 tokens;
a 50-tool server lands in the 25K–75K range.[^mcp-context-tax] Because the block is resent
every turn, a 100K-token tool schema across a 200-turn run represents on the order of 20M
tokens of pure schema overhead for one conversation.[^mcp-context-tax] This is the number
that justifies the work.

### 2. Trim the tool count (fewer tools, better selection)

The cheapest lever is simply **not loading tools you don't need**. Audit which tools an
agent actually calls and remove or gate the rest. This is a genuine double win: Anthropic's
own evals show tool-selection accuracy *rising* when the model isn't drowning in options —
Opus 4 went from **49% → 74%** and Opus 4.5 from **79.5% → 88.1%** on MCP evaluations once
only the relevant tools were surfaced.[^anthropic-advanced-tool-use] Fewer tools = fewer
tokens *and* fewer wrong-tool calls (each of which is itself a wasted, billed step).

### 3. Tool-description dieting

Because schemas are resent every turn, verbose descriptions and bloated argument schemas
are a recurring cost, not a one-off. Tighten them: drop redundant prose, collapse rarely-used
optional parameters, use concise enums instead of long free-text descriptions, and avoid
restating in a description what the schema already encodes. A "lazy hydration" experiment on
the 106-tool MySQL server that served a minimal manifest first and only fetched full schemas
on demand cut the block from **54,604 → 4,899 tokens (~91%)**.[^layered-token-tax]

### 4. Deferred / dynamic tool loading (the big lever)

Rather than sending the full catalog into context on every step, **retrieve only the tools
relevant to the current step**. Anthropic's **Tool Search Tool** implements this natively:
you still send every tool definition in the request, but mark the non-essential ones
`defer_loading: true`. Deferred tools are excluded from the system-prompt prefix; the model
sees only the search tool plus your 3–5 most-used tools, then *searches* (regex or BM25) the
catalog and the API expands the matches into full definitions on demand.[^anthropic-tool-search]

- A typical multi-server setup (~**55K tokens** of definitions) is reduced by **over 85%**,
  loading only the 3–5 tools a given request needs.[^anthropic-tool-search]
- Anthropic reports the same 85% reduction on its internal library (~72K → ~8.7K tokens,
  preserving ~95% of the window).[^anthropic-advanced-tool-use]
- In Claude Code, search-based discovery dropped tool definitions from **10K+ → ~3K tokens
  per request**.[^layered-token-tax]
- Crucially, `defer_loading` **preserves prompt caching**: deferred tools are kept out of the
  cached prefix, so the static prefix stays byte-identical and cache hits are not
  broken.[^anthropic-tool-search]

Guidance: reach for deferred loading once you have **≥10 tools**, tool definitions exceed
**~10k tokens**, or you aggregate multiple MCP servers.[^anthropic-tool-search] The related
"code execution with MCP" pattern goes further — exposing tools as files the model reads
on-demand rather than pre-loaded schemas — and reports **150,000 → 2,000 tokens (98.7%)** on
a workflow that also kept intermediate results out of context.[^anthropic-code-exec-mcp]

### 5. Agent-skill lazy-loading

The same principle applies to **agent skills** (SKILL.md-packaged capabilities). Anthropic's
Skills use three-level **progressive disclosure**: only a skill's *metadata* (name +
description, **~100 tokens per skill**) is loaded at startup; the full `SKILL.md` body
(**under 5k tokens**) is read into context *only when the skill is triggered*; and bundled
reference files/scripts load only when referenced (script code never enters context at
all).[^anthropic-skills] This lets you install many skills "without context penalty" — the
model knows a skill *exists* and *when to use it* for ~100 tokens, and pays the full
instruction cost only on the rare turn it's needed.[^anthropic-skills] Pre-loading every
skill's full instructions up front is the anti-pattern this replaces.

### 6. Prove it with an eval

Because a wrongly-deferred tool can make a step fail ("tool not found"), gate changes on an
eval: track wrong-tool / no-tool-found rate and task success alongside the token savings.
Keep the 3–5 highest-frequency tools non-deferred so common paths never pay a search
round-trip.[^anthropic-tool-search]

## Example Where It Works

A customer-operations agent aggregates five MCP servers — GitHub, Slack, Sentry, Grafana,
and Splunk — for **58 tools totaling ~55K tokens** of definitions.[^anthropic-advanced-tool-use]
A typical ticket ("summarize the Sentry errors for service X and post to Slack") runs ~12
loop steps and touches **2 tools**.

- **Before:** the full ~55K-token catalog is resent on all 12 steps → **~660K input tokens**
  of tool schema for one ticket, plus the model occasionally mis-picks among 58 lookalike
  tools.
- **After (deferred loading):** only the search tool + 3–5 core tools sit in context; the
  agent searches and pulls the 2 relevant tools on demand. Tool-definition tokens drop
  **>85%** (to well under 10K/step), and tool-selection accuracy *improves* because the model
  chooses from a focused set instead of 58.[^anthropic-tool-search][^anthropic-advanced-tool-use]
  Prompt caching still applies to the stable prefix, so the remaining static content stays
  cheap.[^anthropic-tool-search]

Adding skill lazy-loading compounds it: ten installed skills cost ~1,000 tokens of metadata
at startup instead of tens of thousands of pre-loaded instructions, with full bodies pulled
only on the turn they fire.[^anthropic-skills]

## Example Where It Would NOT Work

- **Few tools, all used every request.** With **under ~10 tools**, small definitions
  (<100 tokens each), and every tool exercised on nearly every call, deferred loading adds a
  search round-trip and latency for no saving — standard tool calling is the right
  choice.[^anthropic-tool-search] The init tax simply isn't large enough to amortize the
  machinery.
- **Latency-critical single-shot calls.** A search-then-call round-trip inserts an extra
  inference hop. On a hot path where every needed tool is already tiny and known, that hop can
  cost more (in latency, and the search tool's own tokens) than it saves.[^anthropic-tool-search]
- **The real problem is intermediate-result bloat, not tool defs.** If your tokens are burned
  by large tool *outputs* flowing through context (a 50K-token document retrieved then
  re-written), trimming definitions barely helps; the fix is keeping results out of context
  via code execution, provider-native context management, or state compression — not tool-count
  minimization.[^anthropic-code-exec-mcp]
- **Over-aggressive deferral breaking steps.** Deferring a tool the agent genuinely needs every
  run (and that search phrasing doesn't reliably surface) trades a small token saving for
  failed steps and retries — a net *loss*. Keep high-frequency tools non-deferred and validate
  with an eval before shipping.[^anthropic-tool-search]

[^anthropic-advanced-tool-use]: Anthropic Engineering, "Introducing advanced tool use on the Claude Developer Platform" — <https://www.anthropic.com/engineering/advanced-tool-use>
[^anthropic-tool-search]: Anthropic, "Tool search tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool>
[^anthropic-code-exec-mcp]: Anthropic Engineering, "Code execution with MCP: building more efficient AI agents" — <https://www.anthropic.com/engineering/code-execution-with-mcp>
[^anthropic-skills]: Anthropic, "Agent Skills," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview>
[^layered-token-tax]: Layered System, "MCP Tool Schema Bloat: The Hidden Token Tax (and How to Fix It)" — <https://layered.dev/mcp-tool-schema-bloat-the-hidden-token-tax-and-how-to-fix-it/>
[^mcp-context-tax]: AgentMarketCap, "MCP's Context Bloat Crisis: Why Loading 1,000+ Tool Definitions Is Breaking Enterprise AI Agents" — <https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget>
