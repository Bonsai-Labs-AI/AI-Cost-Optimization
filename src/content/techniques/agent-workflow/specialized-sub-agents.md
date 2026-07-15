---
title: "Specialized Sub-Agents"
category: agent-workflow
maturityLevel: 3
maturityProvisional: false
shortDescription: "Decompose a task across purpose-built sub-agents — each with its own context, tools, and (often) a right-sized model — coordinated by an orchestrator; a net cost win only when work genuinely parallelizes or cheap sub-agents offset the ~15× token multiplier, and a cost sink otherwise."
effort: High
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "A broad task with genuinely independent subtasks (breadth-first search, multi-source gathering) is run on one big single-threaded agent."
  - "Every sub-agent — including trivial ones — runs on the same frontier model, with no right-sizing."
  - "The orchestrator's context window is bloated with low-level sub-task detail instead of condensed results."
  - "Sub-agent count and token spend grow with no measured wall-clock or quality payoff — the 15× multiplier is being paid on coupled/sequential work."
measurementMethods:
  - "$/task for multi-agent vs. single-agent vs. a deterministic workflow on the same evaluation set."
  - "Token multiplier (multi-agent tokens ÷ single-chat tokens) weighed against the wall-clock and quality gain it buys."
  - "Sub-agent model mix and the blended $/token it produces vs. an all-frontier baseline."
  - "Fraction of subtasks that actually run in parallel (parallel work is what justifies the multiplier)."
status: published
lastUpdated: "2026-07-03"
related:
  - "agent-workflow/workflow-decomposition"
  - "agent-workflow/programmatic-tool-calling"
  - "agent-workflow/agent-memory-management"
  - "model-routing/dynamic-model-routing"
sources:
  - id: anthropic-multiagent
    title: "How we built our multi-agent research system"
    publisher: "Anthropic — Engineering"
    year: 2025
    url: "https://www.anthropic.com/engineering/multi-agent-research-system"
    accessed: "2026-07-03"
    kind: blog
    note: "Agents use ~4× the tokens of chat; multi-agent systems ~15× the tokens of chat. Economically viable only for high-value tasks with heavy parallelization, information exceeding a single context window, or many complex tools. Subagents run in parallel with their own context windows and condense results for the lead agent. Domains needing shared context / many inter-agent dependencies are a poor fit."
  - id: single-vs-multi
    title: "Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets"
    publisher: "arXiv"
    authors: "Dat Tran, Douwe Kiela"
    year: 2026
    url: "https://arxiv.org/abs/2604.02460"
    accessed: "2026-07-03"
    kind: paper
    note: "Under equal thinking-token budgets, a single agent beats multi-agent systems on multi-hop reasoning across Qwen3, DeepSeek-R1-Distill-Llama, and Gemini 2.5. Many reported multi-agent 'wins' are explained by unaccounted extra computation and context effects, not architecture. Uses the Data Processing Inequality to argue single-agent information efficiency under fixed token budgets."
  - id: langchain-subagents
    title: "Build a personal assistant with subagents"
    publisher: "LangChain — Docs"
    year: 2026
    url: "https://docs.langchain.com/oss/python/langchain/multi-agent/subagents-personal-assistant"
    accessed: "2026-07-03"
    kind: docs
    note: "Supervisor pattern: a central supervisor coordinates specialized workers, partitioning tools across workers each with their own prompt/instructions. Supervisor sees high-level tools (schedule_event), not low-level ones. Use it when there are multiple distinct domains each with complex logic; for a few tools, use a single agent."
  - id: crewai-agents
    title: "Agents"
    publisher: "CrewAI — Docs"
    year: 2026
    url: "https://docs.crewai.com/en/concepts/agents"
    accessed: "2026-07-03"
    kind: docs
    note: "Each agent is a specialized team member (role, goal, backstory, tools). Supports per-agent LLM assignment — a main llm for complex reasoning and a cheaper function_calling_llm (e.g. gpt-4o-mini) for tool use — i.e. right-sizing the model per sub-agent."
  - id: coordination-overhead
    title: "Analyzing Information Sharing and Coordination in Multi-Agent Planning"
    publisher: "arXiv"
    year: 2025
    url: "https://arxiv.org/abs/2508.12981"
    accessed: "2026-07-03"
    kind: paper
    note: "Multi-agent planning incurs coordination/communication overhead from inter-agent message passing and repeated context sharing; a shared-notebook + orchestrator design reached 25% vs 7.5% single-agent pass rate on TravelPlanner."
---

## Overview

A **specialized sub-agent** architecture breaks a task into pieces handled by
purpose-built agents — a lead/orchestrator agent that plans and delegates, plus worker
sub-agents that each have their **own context window, their own tool set, their own
system prompt, and (often) a right-sized model** — then synthesizes their results.[^langchain-subagents]
It is the most autonomous, most flexible end of agent design, and it is genuinely
powerful for open-ended work that a single agent cannot hold in one context.

But as a **cost** technique it is dangerous, and honesty about that is the entire point
of putting it at **Level 3**. Anthropic's own production numbers are the headline: in
their multi-agent research system, "agents typically use about 4× more tokens than chat
interactions, and multi-agent systems use about 15× more tokens as chats."[^anthropic-multiagent]
That 15× multiplier means a multi-agent design **starts ~15× more expensive per task**
and only becomes a *net cost win* if it buys back more than it spends. It does that in
exactly three ways:

1. **Parallelism** — decomposable work runs concurrently across sub-agents, so you trade
   token spend for wall-clock (not always for money);
2. **Right-sizing** — each sub-agent runs on the cheapest model that can do its narrow
   job, so the blended $/token falls below an all-frontier single agent;[^crewai-agents]
3. **Context compression** — sub-agents explore in their own windows and return only
   condensed results, keeping the expensive orchestrator's context small.[^anthropic-multiagent]

Absent those levers — on **sequential, tightly-coupled** tasks — the 15× multiplier
simply dominates and the system costs *more* than a single agent for the same or worse
quality.[^single-vs-multi] So this page is a conditional recommendation, not a blanket
one: reach for specialized sub-agents when the task genuinely parallelizes and you can
right-size the workers; otherwise a single agent or a deterministic **workflow** is
cheaper.

## Detailed Approach & Techniques

### The honest cost math

Model a task as a single agent costing `C` tokens. A naive multi-agent version of the
*same* task tends toward **~15× `C`** in Anthropic's data because the orchestrator
prompt, each sub-agent's system prompt and tool schema, the delegated instructions, and
the returned results are all re-tokenized, and inter-agent messages add
coordination overhead on top.[^anthropic-multiagent][^coordination-overhead] For the
architecture to *save* money rather than just spend it, one of the three offsets must
apply:

- **Parallel, independent subtasks.** If a task is really *N* independent lookups (search
  5 sources, analyze 5 files), running them as *N* parallel sub-agents doesn't reduce the
  token count — it's still ~15× — but it collapses **latency** and lets each sub-agent use
  a **cheaper model**. The cost win comes from the *model mix*, not the parallelism per
  se. Anthropic frames viability precisely this way: multi-agent pays off for "valuable
  tasks that involve heavy parallelization, information that exceeds single context
  windows, and interfacing with numerous complex tools."[^anthropic-multiagent]
- **Right-sized sub-agents.** Frameworks let you assign a different LLM per agent — e.g.
  CrewAI's `function_calling_llm="gpt-4o-mini"` for tool-heavy workers while the reasoning
  agent keeps a frontier model.[^crewai-agents] If ten of your fifteen token-units run on
  a model that is 10–20× cheaper, the blended bill can fall *below* a single all-frontier
  agent even at 15× the raw tokens. This is where the real cost saving lives — it is
  `model-right-sizing` applied per role.
- **Context compression via delegation.** Sub-agents "operate in parallel with their own
  context windows … before condensing the most important tokens for the lead research
  agent," which keeps the (expensive) orchestrator's context — and therefore its
  per-step input cost — small even as total work grows.[^anthropic-multiagent] This pairs
  with `state-compression-for-agents`.

### The orchestrator / supervisor pattern

The dominant implementation is a **supervisor**: a central agent that coordinates
specialized workers, "partition[ing] tools across workers, each with their own individual
prompts or instructions," and exposing only high-level actions to itself ("`schedule_event`,
not … `create_calendar_event`").[^langchain-subagents] Keeping the supervisor's tool
surface and context abstract is what prevents its context from bloating with every
sub-agent's low-level detail — the difference between a 15× system that pays and one that
just burns tokens.

### Where it wins vs. where it is a cost sink

- **Cost win — parallelizable / independent work + cheap sub-agents.** Breadth-first
  tasks (gather-from-many-sources, fan-out-then-synthesize) that exceed one context
  window, with workers right-sized down. Here the 15× buys parallel coverage and a cheaper
  model mix.[^anthropic-multiagent][^crewai-agents]
- **Cost sink — sequential / coupled work.** When steps depend on each other or all agents
  need the same shared context, the multiplier is paid with nothing to buy it back. A
  controlled study found that **under equal token budgets a single agent outperforms
  multi-agent systems on multi-hop reasoning**, and that many apparent multi-agent gains
  are artifacts of unaccounted extra computation and context, not architecture.[^single-vs-multi]
  Anthropic agrees the anti-pattern exists: "some domains that require all agents to share
  the same context or involve many dependencies between agents are not a good fit for
  multi-agent systems today."[^anthropic-multiagent]

### When to prefer a deterministic workflow instead

If the task is actually a **fixed pipeline** — the same ordered steps every time — a
deterministic `workflow-decomposition` (L2) is almost always cheaper: it captures the
"specialized roles, small context per step" benefit *without* an autonomous
orchestrator's exploratory token overhead or the 15× multiplier. The LangChain guidance
maps to the same rule from the other side: "for simpler cases with just a few tools, use a
single agent"; add specialized sub-agents only when there are genuinely multiple distinct
domains with complex logic.[^langchain-subagents] Reserve autonomous multi-agent for
tasks whose *shape is unknown at design time*; if you can draw the flowchart, build the
workflow.

## Example Where It Works

A research assistant answers open-ended questions like *"compare how our top 8
competitors price their enterprise tier and summarize the differences."* The task is
**breadth-first and parallel**: eight independent investigations, each exceeding what one
agent can comfortably hold, feeding a final synthesis.

- An orchestrator on a frontier model plans and spawns **8 sub-agents**, each researching
  one competitor **in parallel**, each in its **own context window**.
- The sub-agents run on a **cheaper model** (they browse, extract, and condense — not deep
  reasoning), so most of the token volume is billed at a fraction of frontier
  price.[^crewai-agents]
- Each returns a short condensed summary; the orchestrator's context stays small and it
  synthesizes the final answer.[^anthropic-multiagent]

Total tokens are still several-fold a single agent's, but wall-clock drops from serial to
roughly one round, and because the bulk of tokens ran on a cheap model, the **blended
cost can beat a single frontier agent that would have had to do all eight serially in one
overflowing context.** This is the exact profile — high-value, heavily parallel,
context-exceeding — Anthropic calls economically viable.[^anthropic-multiagent]

## Example Where It Would NOT Work

A coding agent must **refactor a function, then update its callers, then fix the tests
that break** — a strictly **sequential, tightly-coupled** chain where each step depends on
the previous one's output and all steps share the same code context.

- There is nothing to parallelize: step 2 cannot start until step 1's diff exists.
- Splitting it across sub-agents forces the shared code context to be re-passed and
  re-tokenized between them, and the hand-offs add coordination overhead[^coordination-overhead]
  — you pay much of the **~15×** multiplier and get *no* parallel speedup.[^anthropic-multiagent]
- On this class of coupled, multi-hop task, a **single agent with the full budget
  outperforms the multi-agent split** under equal token budgets — so you spend far more to
  get equal-or-worse results.[^single-vs-multi]

Here a single agent (cheaper, and better) or, if the pipeline is fixed, a deterministic
`workflow-decomposition` is the correct choice. Multi-agent would be paying frontier
prices, several times over, to *lose*.

[^anthropic-multiagent]: Anthropic Engineering, "How we built our multi-agent research system," 2025 — <https://www.anthropic.com/engineering/multi-agent-research-system>
[^single-vs-multi]: Tran & Kiela, "Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets," arXiv, 2026 — <https://arxiv.org/abs/2604.02460>
[^langchain-subagents]: LangChain Docs, "Build a personal assistant with subagents" — <https://docs.langchain.com/oss/python/langchain/multi-agent/subagents-personal-assistant>
[^crewai-agents]: CrewAI Docs, "Agents" — <https://docs.crewai.com/en/concepts/agents>
[^coordination-overhead]: "Analyzing Information Sharing and Coordination in Multi-Agent Planning," arXiv, 2025 — <https://arxiv.org/abs/2508.12981>
