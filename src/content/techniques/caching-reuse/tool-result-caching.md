---
title: "Tool Result Caching"
category: caching-reuse
maturityLevel: 3
maturityProvisional: false
shortDescription: "Cache the results of agent tool calls (lookups, fetches, pure computations) keyed by tool + arguments so repeated identical calls don't re-execute — saving both the external tool cost and the tokens of re-processing the result."
effort: Medium
gain: Medium
riskToQuality: Medium
effortWhy: "A keyed cache over tool calls is straightforward; the real work is per-tool cacheability classification and correct TTL/invalidation so agents never see stale external data."
gainWhy: "Agent loops re-call the same read tools with identical args; caching cuts the external API/DB/fetch cost and the tokens to re-embed the result — but it saves tool + retokenization cost, not the surrounding LLM generation."
riskWhy: "A cached result served past its freshness window feeds the agent stale external data; caching a write or time-sensitive call is a correctness bug."
detectionSignals:
  - "Agents re-call the same tool with identical arguments within a run (repeated web-fetch, DB lookup, or catalog query)."
  - "The same read tools are invoked across separate runs/sessions for the same inputs, each hitting the external system fresh."
  - "No tool-result memoization layer — every tool_use block re-executes end to end."
  - "Fat, deterministic tool outputs (documents, API payloads) are re-fetched and re-tokenized into context repeatedly."
measurementMethods:
  - "Tool-call cache hit rate (cached tool results ÷ total tool invocations), overall and per tool."
  - "External tool cost saved (API/search/fetch charges avoided) and tool-execution latency saved."
  - "Input tokens saved from not re-inserting re-fetched results into context."
  - "Stale-result incident rate (sampled): cached results served past their true freshness window."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/cache-aware-agent-design"
  - "caching-reuse/cache-invalidation-strategies"
  - "caching-reuse/retrieval-result-caching"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "agent-workflow/reusable-memory-artifact-store"
sources:
  - id: anthropic-tool-use
    title: "Tool use with Claude"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview"
    accessed: "2026-07-03"
    kind: docs
    note: "Client tools run in your app: Claude returns tool_use blocks, your code executes and sends back tool_result. tool_result blocks count as input tokens on every subsequent request; server tools (web_search, web_fetch) add per-request usage-based charges on top of tokens."
  - id: anthropic-web-fetch
    title: "Web fetch tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-fetch-tool"
    accessed: "2026-07-03"
    kind: docs
    note: "Native tool-result caching primitive with the freshness caveat: 'The web fetch tool caches results to improve performance and reduce redundant requests. The content returned may not always reflect the latest version available at the URL... To fetch fresh content, set use_cache: false.' Token costs: ~2,500 tokens per 10 kB page, ~25,000 per 100 kB doc, ~125,000 per 500 kB PDF."
  - id: channel-idempotent
    title: "How to Build Idempotent Tool Calls for AI Agents"
    publisher: "Chanl Blog"
    year: 2026
    url: "https://www.channel.tel/blog/idempotent-tool-calls-agent-retry-safety"
    accessed: "2026-07-03"
    kind: blog
    note: "Agents re-issue identical tool calls via retry logic, LLM re-planning after context truncation, and parallel-execution races. Reads ('Get customer profile', 'Check order status', 'Search knowledge base') are naturally idempotent and safe to repeat/cache; writes ('Process payment', 'Send email', 'Book appointment') are not."
  - id: dev-idempotent
    title: "Make Your Agent's API Calls Idempotent Before You Need To"
    publisher: "DEV Community"
    authors: "Mukunda Katta"
    year: 2026
    url: "https://dev.to/mukundakatta/make-your-agents-api-calls-idempotent-before-you-need-to-2994"
    accessed: "2026-07-03"
    kind: blog
    note: "Cache key = same session + same tool + same args, hashed with SHA-256 so argument dict-ordering doesn't matter. Safe to cache: read-only lookups stable within a session window (customer lookups, config fetches, catalog queries). Unsafe alone: payments, email sends, writes, live stock prices."
  - id: langgraph-cachepolicy
    title: "CachePolicy — LangGraph API reference"
    publisher: "LangChain"
    year: 2026
    url: "https://reference.langchain.com/python/langgraph/types/CachePolicy"
    accessed: "2026-07-03"
    kind: docs
    note: "CachePolicy has ttl (optional int) and key_func (defaults to default_cache_key, deriving the key from node input)."
  - id: langgraph-nodecache
    title: "Use the graph API — Node caching"
    publisher: "LangChain — LangGraph Docs"
    year: 2026
    url: "https://docs.langchain.com/oss/python/langgraph/use-graph-api"
    accessed: "2026-07-03"
    kind: docs
    note: "Attach cache_policy=CachePolicy(ttl=120) (seconds) to a node and compile with cache=InMemoryCache()/SqliteCache(); prevents repeated expensive operations within the TTL window by caching results keyed on node input."
  - id: gfg-invalidation
    title: "Cache Invalidation and the Methods to Invalidate Cache"
    publisher: "GeeksforGeeks"
    year: 2026
    url: "https://www.geeksforgeeks.org/system-design/cache-invalidation-and-the-methods-to-invalidate-cache/"
    accessed: "2026-07-03"
    kind: blog
    note: "TTL = fixed expiry after which data is stale; write-through updates cache when the source changes; purge/write-invalidate removes a specific object on update; event-based ban removes matching entries. Long TTL risks staleness, short TTL loses hit rate — pick by data volatility."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Distinguishes tool-result caching (avoid re-executing the tool) from prompt/prefix caching (discount the re-processing of tool_result text already in the prefix); the two compose."
---

## Overview

An agent runs a loop: the model emits a `tool_use` call, your code executes it (an API
lookup, a database query, a web fetch, a computation), and the `tool_result` is appended
to the conversation and sent back for the next step.[^anthropic-tool-use] Two costs stack
up every time a tool runs. First, the **external cost of executing the tool** — the API
charge, the database load, the search/fetch fee (server tools such as `web_search` add
per-request usage-based charges on top of tokens).[^anthropic-tool-use] Second, the
**tokens of the result itself**, which are inserted into context and then re-processed as
input on *every subsequent turn* of the run.[^anthropic-tool-use]

Agents make this worse than a normal application because they **re-issue identical calls**.
A well-designed agent retries transient failures; the model re-plans and reissues a call
when context was truncated or a multi-step plan got interrupted; and parallel tool calls
can race two identical requests at once.[^channel-idempotent] Across a multi-step run — or
across many runs of the same workflow — the same `get_customer`, `search_knowledge_base`,
or `fetch(url)` is executed repeatedly with the exact same arguments.

**Tool result caching** memoizes those results. Key each tool call by `(tool name, arguments)`
and, on a repeat, return the stored result instead of re-executing.[^dev-idempotent] A hit
saves both the external execution cost **and** the work of re-fetching and re-tokenizing the
result into context. It sits at **Level 3** not because the cache is hard to build — it
isn't — but because of the **freshness problem**: external data changes underneath you, so a
naïvely-cached tool result can silently feed the agent **stale** information. Getting the
per-tool TTL and invalidation right is the real engineering, and it is why this is a
custom-systems technique rather than a config toggle.

## Detailed Approach & Techniques

### What is cacheable — and what is never

The dividing line is **idempotency and determinism**:

- **Safe to cache** — read-only, deterministic tool calls whose result is stable within a
  reasonable window: customer/record lookups, config fetches, catalog and knowledge-base
  queries, static document/URL fetches, and **pure computations** (a unit conversion or a
  deterministic calculation returns the same value for the same
  input).[^channel-idempotent][^dev-idempotent]
- **Never cache (without extra care)** — **writes and side-effecting calls** (process
  payment, send email, create ticket, book appointment, database writes) and
  **time-sensitive reads** (live stock prices, current inventory, "now"
  queries).[^channel-idempotent][^dev-idempotent] Caching a write is a correctness bug;
  caching a volatile read is a *freshness* bug.

A crucial distinction: **caching a read is not the same as an idempotency key on a write.**
The read cache exists to skip redundant work in the agent loop; an idempotency key exists to
stop a retried *write* from firing twice.[^channel-idempotent] Cacheability is a **per-tool
property** — the engineer must classify each tool, not blanket-cache the toolset.[^dev-idempotent]

### Key design

The standard key is `(session/scope + tool name + arguments)`, hashed so that argument order
doesn't matter — e.g. SHA-256 over the normalized argument JSON, which makes two calls with
the same arguments collide on the same key regardless of dict ordering.[^dev-idempotent]
Framework primitives expose exactly this shape: LangGraph's `CachePolicy` takes a `key_func`
(defaulting to a key derived from the node's input) and a `ttl`, attached per node so a tool
node can cache its output while a volatile node stays uncached.[^langgraph-cachepolicy][^langgraph-nodecache]

```python
# LangGraph: cache a tool node's result for 120 s, keyed on its input
builder.add_node("lookup_tool", lookup_fn, cache_policy=CachePolicy(ttl=120))
graph = builder.compile(cache=InMemoryCache())   # or SqliteCache() to persist across runs
```

The cache scope also decides the *reuse horizon*. An **in-run / in-session** cache kills the
retry-and-replan duplication of a single task; a **persistent** store (SqliteCache, Redis)
extends reuse **across runs** of the same workflow — overlapping with a durable
memory/artifact store.[^langgraph-nodecache]

### The L3 driver — freshness and invalidation

This is the hard part and the reason the technique is Level 3. External data changes, so
every cached tool result needs a **staleness bound** matched to how fast its source moves.
The invalidation toolkit is the standard cache one, applied per tool type:[^gfg-invalidation]

- **TTL by volatility.** Assign each tool a time-to-live from its data's change rate: hours
  or days for a product catalog or a static document, minutes for a semi-live feed, and
  *no cache* for truly live data. Long TTL risks stale reads; short TTL loses hit rate — the
  tradeoff is explicit and per-tool.[^gfg-invalidation]
- **Write-through / write-invalidate.** When the agent (or another system) writes to a
  record, purge or update the cached reads for that record so the next lookup doesn't serve a
  pre-write copy.[^gfg-invalidation]
- **Event-based purge.** On an upstream change event (an index rebuild, a data-source
  update), ban the affected keys.[^gfg-invalidation]

Providers ship this as a native primitive with the caveat stated plainly. Anthropic's server
`web_fetch` tool **caches fetched results** and warns: *"The content returned may not always
reflect the latest version available at the URL,"* offering a `use_cache: false` **cache
bypass** for when the user asks for fresh content or the source changes
rapidly.[^anthropic-web-fetch] That is exactly the tool-result-caching pattern — reuse by
default, an explicit escape hatch for freshness. (Invalidation is cross-cutting enough that
it is its own technique; see *Cache Invalidation Strategies*.)

### The two cost levers it pulls

1. **External execution cost.** A hit skips the API call / DB query / fetch entirely — and
   for metered server tools, the per-request charge with it.[^anthropic-tool-use]
2. **Retokenization cost.** A re-fetched result would be re-inserted and re-processed as
   input; a large fetch is expensive (Anthropic estimates ~2,500 tokens for a 10 kB page,
   ~25,000 for a 100 kB doc, ~125,000 for a 500 kB PDF), so avoiding the re-fetch avoids
   re-embedding all of that.[^anthropic-web-fetch]

Tool result caching is **complementary to prompt caching**, not a substitute: prompt/prefix
caching discounts the re-processing of `tool_result` text that is *already sitting in the
prefix*, whereas tool result caching stops the tool from *executing and re-emitting* that
text in the first place. Use both.[^anthropic-pc]

## Example Where It Works

A customer-support agent resolves tickets in a loop that calls three read tools:
`get_customer(id)`, `get_order_history(id)`, and `search_kb(query)`. A typical ticket takes
**15–25 model steps**, and the model re-requests `get_customer` and `get_order_history`
several times per ticket as it re-plans — and again on any retried step.[^channel-idempotent]

Cache these three tools keyed on their arguments, with a TTL matched to volatility: customer
profile and order history at **10 minutes** (stable within a ticket), KB search at **1 hour**
(docs change slowly).[^gfg-invalidation]

- **Without caching:** every `get_customer` / `get_order_history` re-hits the CRM and DB, and
  each result (often a few thousand tokens) is re-fetched and re-processed into context on
  the steps that request it.
- **With caching:** the first call per ticket pays; the **repeated calls within the ticket
  hit the cache** — no CRM/DB round-trip and no re-fetch of the payload. On a workflow where
  the same handful of records is queried 3–5× per run, the tool-call hit rate lands high and
  cuts both the external DB/CRM load and the re-tokenized input for those
  results.[^dev-idempotent][^anthropic-tool-use] Persisting the KB-search cache across
  tickets (SqliteCache/Redis) extends the win to *cross-run* reuse of common queries.[^langgraph-nodecache]

Web-fetch-heavy research agents are an even cleaner fit: the same URLs are fetched repeatedly
across a session, and the native `web_fetch` cache serves them without re-paying the fetch or
re-inserting a large page — with `use_cache: false` reserved for the sources that must be
live.[^anthropic-web-fetch]

## Example Where It Would NOT Work

- **Time-sensitive tools.** A trading or logistics agent calling `get_price(symbol)` or
  `get_live_inventory(sku)` must **not** cache — a stale hit feeds the agent a wrong number
  and the cost saving is dwarfed by a bad decision. These are cache-exempt (or sub-second
  TTL, which defeats the point).[^channel-idempotent][^dev-idempotent]
- **Write / side-effecting tools.** `send_email`, `process_payment`, `book_appointment`:
  serving a cached "result" here doesn't re-do the action, but treating the tool as cacheable
  masks that the side effect may or may not have happened. Writes need **idempotency keys**,
  not a result cache — a different mechanism for a different problem.[^channel-idempotent][^dev-idempotent]
- **Unique, non-repeating arguments.** If every tool call carries a fresh argument (a
  per-request UUID, a distinct free-text query that never recurs), the key never repeats and
  the hit rate is ~0 — the cache adds bookkeeping with no return.[^dev-idempotent]
- **Low-volume / short agents.** A 2–3 step agent that calls each tool once has nothing to
  memoize within the run; unless results are reused *across* runs, the persistent-cache
  machinery isn't worth it. Below meaningful call-repetition volume, this loses to simply not
  caching.[^langgraph-nodecache]
- **Data that changes faster than you can invalidate.** If the underlying source updates
  unpredictably and you have no write-through or event hook, any TTL long enough to earn hits
  is long enough to serve stale data — here the honest answer is a very short TTL or no cache,
  and the freshness risk outweighs the saving.[^gfg-invalidation]

[^anthropic-tool-use]: Anthropic, "Tool use with Claude," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>
[^anthropic-web-fetch]: Anthropic, "Web fetch tool," Claude Platform Docs — <https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-fetch-tool>
[^channel-idempotent]: Chanl, "How to Build Idempotent Tool Calls for AI Agents" — <https://www.channel.tel/blog/idempotent-tool-calls-agent-retry-safety>
[^dev-idempotent]: Mukunda Katta, "Make Your Agent's API Calls Idempotent Before You Need To," DEV Community — <https://dev.to/mukundakatta/make-your-agents-api-calls-idempotent-before-you-need-to-2994>
[^langgraph-cachepolicy]: LangChain, "CachePolicy — LangGraph API reference" — <https://reference.langchain.com/python/langgraph/types/CachePolicy>
[^langgraph-nodecache]: LangChain, "Use the graph API — Node caching," LangGraph Docs — <https://docs.langchain.com/oss/python/langgraph/use-graph-api>
[^gfg-invalidation]: GeeksforGeeks, "Cache Invalidation and the Methods to Invalidate Cache" — <https://www.geeksforgeeks.org/system-design/cache-invalidation-and-the-methods-to-invalidate-cache/>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
