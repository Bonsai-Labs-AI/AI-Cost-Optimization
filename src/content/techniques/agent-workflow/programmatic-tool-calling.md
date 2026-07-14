---
title: "Programmatic Tool Calling (Code Execution with MCP)"
category: agent-workflow
maturityLevel: 4
maturityProvisional: false
shortDescription: "Have the agent write code that calls tools as APIs inside a sandbox — intermediate tool results stay in the sandbox and only the filtered final answer returns to context — instead of round-tripping every tool call and its full result through the model's window."
effort: High
gain: Very High
riskToQuality: Medium
detectionSignals:
  - "Agents make many sequential tool calls whose full results round-trip through the context window on every step."
  - "Tool-result tokens (not the model's own reasoning) dominate an agent's token bill."
  - "Data-heavy tool chains: query N records, filter/aggregate, then act on a handful — but all N records pass through context first."
  - "A large MCP tool catalog whose definitions alone consume a big fraction of the window before any work is done."
measurementMethods:
  - "Tokens per task with standard tool use vs. programmatic tool calling, on the same task set."
  - "Intermediate-result tokens kept out of context (sandbox-processed bytes vs. bytes returned to the model)."
  - "Task success / answer quality at a fixed bar, before vs. after."
  - "Blended $/task and end-to-end latency for multi-tool workflows."
status: published
lastUpdated: "2026-07-03"
related:
  - "agent-workflow/tool-use-minimization"
  - "agent-workflow/workflow-decomposition"
  - "agent-workflow/state-compression-for-agents"
  - "agent-workflow/specialized-sub-agents"
sources:
  - id: anthropic-cewmcp
    title: "Code execution with MCP: building more efficient AI agents"
    publisher: "Anthropic — Engineering"
    year: 2025
    url: "https://www.anthropic.com/engineering/code-execution-with-mcp"
    accessed: "2026-07-03"
    kind: blog
    note: "Loading all tool definitions upfront + passing intermediate results through context cost ~150,000 tokens; presenting MCP servers as code APIs and filtering in the execution environment dropped it to ~2,000 tokens — a 98.7% saving. Both failure modes named: tool definitions overload the window AND intermediate results consume additional tokens."
  - id: anthropic-atu
    title: "Introducing advanced tool use on the Claude Developer Platform"
    publisher: "Anthropic — Engineering"
    year: 2025
    url: "https://www.anthropic.com/engineering/advanced-tool-use"
    accessed: "2026-07-03"
    kind: blog
    note: "Programmatic Tool Calling: Claude writes Python that orchestrates tools in a sandbox; results are processed by the script, only final output enters context. Average usage dropped from 43,588 to 27,297 tokens, a 37% reduction on complex research tasks; internal knowledge retrieval 25.6%→28.5%, GIA 46.5%→51.2%. Launched in beta Nov 24 2025."
  - id: anthropic-ptc-docs
    title: "Programmatic tool calling"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling"
    accessed: "2026-07-03"
    kind: docs
    note: "Mechanism, allowed_callers setup, and limits. Tool results from programmatic invocations do not count toward input/output token usage — only the final code output does. Incompatibilities: strict:true structured outputs, forced tool_choice, disable_parallel_tool_use:true, and recursive $ref input schemas. On BrowseComp/DeepSearchQA, PTC on top of basic search improved performance ~11% while using 24% fewer input tokens."
  - id: anthropic-ce-docs
    title: "Code execution tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool"
    accessed: "2026-07-03"
    kind: docs
    note: "Sandboxed Python/bash container. code_execution_20260120 adds REPL state persistence + programmatic tool calling and is available on Opus 4.5+ and Sonnet 4.5+ (and newer) only; code_execution_20250825 is the base version. 90-second per-cell wall-clock limit. Not available on Bedrock/Google Cloud; not ZDR-eligible."
  - id: anthropic-dynamic-filtering
    title: "Improved web search with dynamic filtering"
    publisher: "Anthropic (claude.com Blog)"
    year: 2026
    url: "https://claude.com/blog/improved-web-search-with-dynamic-filtering"
    accessed: "2026-07-03"
    kind: benchmark
    note: "Feb 17 2026 GA-era result. Adding code-execution dynamic filtering lifted BrowseComp from 33.3%→46.6% (Sonnet 4.6) and 45.3%→61.6% (Opus 4.6); DeepSearchQA F1 52.6%→59.4% and 69.8%→77.3%. Caveat: price-weighted tokens fell for Sonnet but rose for Opus — savings depend on how much filtering code the model writes."
  - id: simonw-cemcp
    title: "Code execution with MCP: Building more efficient agents"
    publisher: "Simon Willison's Weblog"
    year: 2025
    url: "https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/"
    accessed: "2026-07-03"
    kind: blog
    note: "Independent write-up of Anthropic's Nov 4 2025 post; frames the MCP 'token tax' and the code-execution fix."
---

## Overview

Standard tool calling makes the model the bus for all data. On every step the model
emits a `tool_use` block, your app runs the tool, and the **entire result** is pasted
back into the context window as a `tool_result` — then the model is re-sampled over that
now-larger context to decide the next call. For an agent that queries 20 employees'
expenses, pages through a large API response, or chains a dozen dependent lookups, this
means every intermediate byte round-trips through the window, and the model pays to
re-read all of it on every subsequent turn. There are actually **two** taxes: the tool
*definitions* (a large MCP catalog can fill much of the window before any work happens)
and the tool *results* (raw, unfiltered, re-read repeatedly).[^anthropic-cewmcp]

**Programmatic tool calling (PTC)** inverts the control flow. Instead of the model
requesting one tool at a time, the model **writes code** that calls the tools as ordinary
async functions inside a code-execution sandbox. The code runs the loop, filters and
aggregates the intermediate results *in the sandbox*, and returns **only the final,
small output** to the model's context. The 200 KB of raw expense line items never enter
the window; the two-line "these 3 employees exceeded their limit" does.[^anthropic-ptc-docs]

The headline number is the point: in Anthropic's canonical example (pull a meeting
transcript from Google Drive, attach it to Salesforce), loading all tool definitions plus
routing intermediate results through context cost **~150,000 tokens**; the code-execution
approach cut that to **~2,000 tokens — a 98.7% reduction**.[^anthropic-cewmcp] Because
intermediate-result tokens are frequently the *dominant* line item in an agent's bill,
this is one of the highest-leverage cost levers available — but it sits at **Level 4**
because it demands a real code-execution runtime and a model good enough to write correct
orchestration code, and it is incompatible with several standard tool-use controls.

## Detailed Approach & Techniques

### The mechanism (Anthropic implementation)

You add the **code execution tool** to the request and mark the tools you want callable
from code with `allowed_callers`:[^anthropic-ptc-docs]

```python
tools=[
    {"type": "code_execution_20260120", "name": "code_execution"},
    {
        "name": "query_database",
        "description": "Run SQL. Returns rows as JSON.",
        "input_schema": {...},
        "allowed_callers": ["code_execution_20260120"],  # opt this tool into PTC
    },
]
```

The lifecycle is: (1) Claude writes Python that invokes the tool as an async function
(with loops, filters, `asyncio.gather` for parallelism, and pre/post-processing);
(2) the code runs in a sandboxed container; (3) when a tool function is called, execution
**pauses** and the API returns a `tool_use` block for your app to fulfil; (4) you return
the result and execution **continues** — *these intermediate results are not loaded into
Claude's context*; (5) once the code finishes, Claude receives only the final output and
continues the task.[^anthropic-ptc-docs] Critically for billing, **tool results from
programmatic invocations do not count toward your input/output token usage** — only the
final code output and Claude's response do.[^anthropic-ptc-docs]

`code_execution_20260120` is the version that adds programmatic tool calling (and REPL
state persistence); it is available on **Opus 4.5+ and Sonnet 4.5+ (and newer models)**,
while the base `code_execution_20250825` is Python/bash only. Each sandbox cell has a
**90-second wall-clock limit**. Code execution is **not** available on Amazon Bedrock or
Google Cloud and is **not** ZDR-eligible.[^anthropic-ce-docs]

### Why it cuts tokens

Three distinct savings stack:[^anthropic-ptc-docs]

- **Results stay in the sandbox.** Filtering, aggregation, and joins happen in code, so
  large intermediate payloads never enter the window — and are never re-read on later
  turns.
- **No re-sampling between calls.** Chained calls, loops, and conditionals are ordinary
  Python control flow, not a series of model round-trips, so the model isn't re-invoked
  (and re-billed for the whole growing context) between each tool call.[^anthropic-ptc-docs]
- **Definitions on demand.** Presenting MCP servers as code modules lets the agent load
  only the tools it needs rather than pasting the full catalog upfront.[^anthropic-cewmcp]

### The measured effect

Beyond the 98.7% best case, the aggregate figures are more sober but still large. On
complex research tasks, average usage **dropped from 43,588 to 27,297 tokens — a 37%
reduction** — while *raising* task quality (internal knowledge retrieval 25.6%→28.5%,
GIA benchmark 46.5%→51.2%).[^anthropic-atu] On the agentic-search benchmarks BrowseComp
and DeepSearchQA, adding PTC on top of basic search improved performance by **~11% on
average while using 24% fewer input tokens**.[^anthropic-ptc-docs] The GA-era dynamic-
filtering rollout lifted BrowseComp accuracy from **33.3%→46.6%** (Sonnet 4.6) and
**45.3%→61.6%** (Opus 4.6).[^anthropic-dynamic-filtering]

### Costs, limits, and when NOT to enable it

- **You need the sandbox.** PTC only exists inside a code-execution runtime with pause/
  resume tool invocation; that's a managed dependency (Anthropic's container, or your own
  equivalent) — real infrastructure, not a config flag.[^anthropic-ce-docs]
- **Generated-code correctness is a new failure surface.** The model must write correct
  orchestration; a bug in its Python is now a task failure. Savings also *depend on how
  much filtering code the model writes* — on the dynamic-filtering benchmark, price-
  weighted tokens fell for Sonnet 4.6 but **rose** for Opus 4.6 on the same tasks.[^anthropic-dynamic-filtering]
- **Feature incompatibilities.** PTC is not compatible with `strict: true` structured
  outputs, with forcing a tool via `tool_choice`, or with `disable_parallel_tool_use:
  true`; and a tool whose `input_schema` has a recursive `$ref` cannot be made
  programmatically callable (it fails with `Circular $ref detected`).[^anthropic-ptc-docs]
- **`allowed_callers` is guidance, not a security boundary** — your client must still
  handle a direct `tool_use` for any tool it defines.[^anthropic-ptc-docs]

**Scale gate.** PTC pays when tool-result tokens dominate the bill — many sequential
calls, large intermediates that get filtered, real data transformations. Below that (a
one-shot single tool call, tiny results), the sandbox and code-writing overhead aren't
worth it: the cheaper L2 lever is **tool-use minimization** (fewer, coarser-grained
tools), and for a *fixed* pipeline a deterministic **workflow decomposition** (L3) beats
letting the model write orchestration code at all.

## Example Where It Works

A finance-ops agent audits budget compliance across **20 employees**. The traditional
approach makes **20 separate model round-trips**, each pulling that employee's full
expense ledger — thousands of line items, hundreds of kilobytes — into context, then
re-reads all of it on every subsequent turn.[^anthropic-ptc-docs]

With PTC, Claude writes one script: loop over the 20 employees, call
`get_expenses(employee)` in the sandbox, sum against each limit, and return **only the
handful who exceeded budget**. The raw ledgers — roughly **200 KB** — are filtered down
to **~1 KB of results** before anything reaches the model, and the intermediate
`tool_result`s don't count toward token usage at all.[^anthropic-atu][^anthropic-ptc-docs]
This is the same shape as the canonical Drive→Salesforce transcript task where the token
cost fell from **~150,000 to ~2,000 (98.7%)**: many calls, big intermediates, tiny final
answer — exactly the profile PTC is built for.[^anthropic-cewmcp]

## Example Where It Would NOT Work

A support assistant answers a question by calling **one** tool — `lookup_order(id)` — that
returns a small JSON object the model then summarizes. There is no loop, no large
intermediate to filter, and no chain of dependent calls: the single result is small and
enters context exactly once. Wrapping this in a code-execution sandbox adds a container
dependency, the risk that the model writes buggy Python, and no offsetting token saving —
plain tool calling is strictly simpler and cheaper here. Tool-use minimization (L2) is the
right lever if anything.

Two more mismatches make PTC net-negative:

- **You need a hard guarantee on tool behavior.** If the workflow *requires* forcing a
  specific tool (`tool_choice`) or `strict: true` structured output, those are
  incompatible with programmatic calling — you'd have to give up the guardrails that
  keep the task correct.[^anthropic-ptc-docs]
- **A fixed, deterministic pipeline.** If the sequence of tool calls is known and stable,
  hand-writing it as a **workflow** (L3) is cheaper and more reliable than paying a
  frontier model to regenerate orchestration code — and it avoids the code-correctness
  failure mode. And note savings aren't guaranteed even in-profile: on the same benchmark,
  filtering-code overhead pushed price-weighted tokens *up* for one model while cutting
  them for another, so PTC must be measured on your own task mix, not assumed.[^anthropic-dynamic-filtering][^simonw-cemcp]

[^anthropic-cewmcp]: Anthropic Engineering, "Code execution with MCP: building more efficient AI agents" (Nov 4 2025) — <https://www.anthropic.com/engineering/code-execution-with-mcp>
[^anthropic-atu]: Anthropic Engineering, "Introducing advanced tool use on the Claude Developer Platform" (Nov 24 2025) — <https://www.anthropic.com/engineering/advanced-tool-use>
[^anthropic-ptc-docs]: Anthropic, "Programmatic tool calling," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling>
[^anthropic-ce-docs]: Anthropic, "Code execution tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool>
[^anthropic-dynamic-filtering]: Anthropic, "Improved web search with dynamic filtering" (Feb 17 2026) — <https://claude.com/blog/improved-web-search-with-dynamic-filtering>
[^simonw-cemcp]: Simon Willison, "Code execution with MCP: Building more efficient agents" (Nov 4 2025) — <https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/>
