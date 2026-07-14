---
title: "Workflow Decomposition"
category: agent-workflow
maturityLevel: 3
maturityProvisional: false
shortDescription: "Replace one open-ended autonomous agent loop with a fixed, code-orchestrated workflow of smaller scoped steps — each on the cheapest sufficient model with minimal context — so you stop paying a frontier model to re-carry the whole task, and bounded steps stop runaway loops."
effort: High
gain: High
riskToQuality: Medium
detectionSignals:
  - "One big autonomous agent is used for a task that is really a fixed pipeline (the same 3–6 steps run in the same order every time)."
  - "A frontier model runs every step, including trivial ones (extraction, formatting, classification, routing)."
  - "Agent loops are unbounded — no step ceiling or token budget — and occasionally 'wander,' retry, or spiral."
  - "High token use on structurally repetitive work; per-task cost is many multiples of a single call because the whole history re-inflates every step."
measurementMethods:
  - "$/task for the decomposed workflow vs. the monolithic agent, at a held quality bar."
  - "Total tokens/task and tokens/step (watch for O(N²) growth in the agent baseline)."
  - "Number of model steps per task, and whether it is bounded (fixed DAG) vs. variable (open loop)."
  - "Task success rate / quality at bar, and run-to-run variance (workflows should be more consistent)."
  - "Blended model mix — share of steps served by a cheap right-sized model vs. a frontier model."
status: published
lastUpdated: "2026-07-03"
related:
  - "agent-workflow/state-compression-for-agents"
  - "agent-workflow/reusable-memory-artifact-store"
  - "model-routing/dynamic-model-routing"
  - "visibility-measurement/budget-limits-guardrails"
  - "batching-async/latency-tiered-processing"
sources:
  - id: anthropic-bea
    title: "Building Effective AI Agents"
    publisher: "Anthropic — Engineering"
    year: 2024
    url: "https://www.anthropic.com/engineering/building-effective-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Defines workflows (LLMs + tools orchestrated through predefined code paths) vs. agents (LLMs dynamically direct their own processes). Prompt chaining decomposes a task into fixed subtasks, trading latency for accuracy by making each call easier. Routing classifies input to a specialized follow-up. 'The autonomous nature of agents means higher costs, and the potential for compounding errors.' Recommends 'finding the simplest solution possible, and only increasing complexity when needed'; 'For many applications … optimizing single LLM calls with retrieval and in-context examples is usually enough.'"
  - id: cobol-orchestration
    title: "Deterministic vs. LLM-Controlled Orchestration for COBOL-to-Python Modernization"
    publisher: "arXiv"
    authors: "Naing Oo Lwin, Rajesh Kumar"
    year: 2026
    url: "https://arxiv.org/abs/2605.09894"
    accessed: "2026-07-03"
    kind: paper
    note: "Deterministic (code-orchestrated) execution reduces token consumption by up to 3.5× vs. LLM-controlled/agentic orchestration, at comparable functional correctness, with improved robustness and lower run-to-run variability."
  - id: augment-loop-cost
    title: "AI Agent Loop Token Costs: How to Constrain Context"
    publisher: "Augment Code"
    year: 2026
    url: "https://www.augmentcode.com/guides/ai-agent-loop-token-cost-context-constraints"
    accessed: "2026-07-03"
    kind: blog
    note: "Naive agent loops rebill prior context every call, so input-token cost grows quadratically (triangular N(N+1)/2 term). A 20-step loop at 1,000 tokens/step produces 210,000 cumulative input tokens vs. the 20,000 a per-step estimate suggests. A 10-step file-reading agent on Claude Sonnet 4.6 = 472,500 input tokens ($1.49) vs. 9,000 single-pass ($0.03) — 43.3×."
  - id: leanops-agent-cost
    title: "AI Agents Burn 50x More Tokens Than Chats"
    publisher: "LeanOps"
    year: 2026
    url: "https://leanopstech.com/blog/agentic-ai-cost-runaway-token-budget-2026/"
    accessed: "2026-07-03"
    kind: blog
    note: "Agents burn 10–100× the tokens of a chatbot due to context re-sending each tool call; a 5-step loop ≈ 3.2× a single call, ~30× at 50 steps, >100× at 200 steps. Recommends per-step model routing (cheap models for file reads, expensive only for reasoning), context trimming/summarization, and token budgets — reported 55–75% cost cut."
  - id: techahead-inference
    title: "The Inference Cost Trap: Why Your AI Agent Economics Break At Scale"
    publisher: "TechAhead"
    year: 2026
    url: "https://www.techaheadcorp.com/blog/inference-cost-explosion/"
    accessed: "2026-07-03"
    kind: blog
    note: "Agentic systems cost 5–25× more per task than non-agentic alternatives; ~10,000–50,000 tokens per agentic task ($0.10–$0.50/request) vs. ~800 tokens for simple chat."
  - id: faas-agentic
    title: "Optimizing FaaS Platforms for MCP-enabled Agentic Workflows"
    publisher: "arXiv"
    authors: "Varad Kulkarni, Vaibhav Jha, Nikhil Reddy, Anand Eswaran, Praveen Jayachandran, Yogesh Simmhan"
    year: 2026
    url: "https://arxiv.org/pdf/2601.14735"
    accessed: "2026-07-03"
    kind: paper
    note: "Studies FaaS/cost optimization for MCP-enabled agentic workflows (reports ~66% cost savings from its scheduling approach); model-token cost is the dominant line item, so cutting per-step tokens and model tier is where the money is."
---

## Overview

The default way to build an "AI feature" in 2026 is to hand a frontier model a goal, a
pile of tools, and a loop, and let it figure out the rest. That is an **agent** — a
system where "LLMs dynamically direct their own processes and tool usage."[^anthropic-bea]
It is flexible, and for genuinely open-ended tasks it is the right tool. But for the large
class of tasks that are actually *predictable* — the same handful of steps in roughly the
same order every time — an open agent loop is an expensive way to run a pipeline.

**Workflow decomposition** replaces that single loop with a **workflow**: "LLMs and tools
orchestrated through predefined code paths."[^anthropic-bea] You break the task into
scoped steps (a chain, a router, a fixed DAG), give each step the *cheapest model that
can do that step* and only the context that step needs, and let ordinary code — not the
model — decide what runs next.

The cost problem it solves is specific and large. An open agent loop **re-bills the entire
growing conversation history on every step**, so input-token cost grows *quadratically*:
a 20-step loop at 1,000 tokens/step produces ~**210,000** cumulative input tokens, not the
~20,000 a per-step estimate suggests.[^augment-loop-cost] On top of that it runs a frontier
model on trivial steps and can **wander, retry, and spiral** with no natural stopping point.
The result is that agentic tasks routinely cost **5–25× more per task** than a non-agentic
equivalent,[^techahead-inference] with model-token cost the **dominant line item** — each step
re-sends a growing context to a frontier model.[^augment-loop-cost] So per-step token count and
model tier are exactly the levers to pull, and optimizing that token flow is where the savings
come from: one study of MCP-enabled agentic workflows reports ~66% lower cost and ~88% fewer
input tokens from scheduling/decomposition.[^faas-agentic]

This is **Level 3**: it is real engineering (orchestration code, per-step prompts, an eval
harness to prove the workflow matches the agent), and the ROI is strongest at scale on a
task you run over and over.

## Detailed Approach & Techniques

### Workflow vs. agent — the decision that comes first

Anthropic's guidance is blunt: "find the simplest solution possible, and only increase
complexity when needed," and "for many applications, optimizing single LLM calls with
retrieval and in-context examples is usually enough."[^anthropic-bea] The autonomous agent
is the *high-cost, high-variance* end of the spectrum — "the autonomous nature of agents
means higher costs, and the potential for compounding errors."[^anthropic-bea] Decomposition
is the discipline of pushing a task **down** that spectrum toward predefined code paths
whenever the task's structure allows it.

The predefined patterns you decompose *into* are well catalogued:[^anthropic-bea]

- **Prompt chaining** — "decompose a task into a sequence of steps, where each LLM call
  processes the output of the previous one." Ideal when the task "can be easily and cleanly
  decomposed into fixed subtasks"; it trades a little latency for higher accuracy "by making
  each LLM call an easier task." (e.g. outline → draft → polish; extract → validate → format.)
- **Routing** — classify the input once, then send it to a specialized downstream path.
  This lets each branch use a smaller, sharper prompt (and a cheaper model) instead of one
  giant do-everything prompt.
- **Parallelization** — run independent sub-tasks concurrently (sectioning) and aggregate
  in code, cutting latency and letting each section run on a right-sized model.
- **Fixed DAG** — a hand-drawn graph of steps with code-controlled edges. The number of
  model calls is **bounded and known**, which is what kills runaway-loop cost.

The line to hold: keep the **orchestrator-workers / open-loop agent** pattern for the parts
that are genuinely unpredictable, and decompose everything else.

### The cost mechanism, quantified

Three effects compound in a monolithic agent, and decomposition attacks each:

1. **Quadratic context re-billing → linear.** A naive loop re-sends the whole transcript
   each step, so total input tokens follow the triangular term `N(N+1)/2`. A concrete case:
   a 10-step file-reading agent on Claude Sonnet 4.6 consumed **472,500 input tokens
   ($1.49)** as an open loop, versus **9,000 tokens ($0.03)** when the same work was done as
   a scoped single-pass — a **43.3×** difference.[^augment-loop-cost] Decomposing into steps
   that each carry only their own inputs turns that curve back to roughly linear. Independent
   measurements agree on the shape: a 5-step loop ≈ 3.2× a single call, ~**30× at 50 steps**,
   **>100× at 200 steps**.[^leanops-agent-cost]

2. **Right-sized model per step.** In an agent, *every* step — including "read this file,"
   "pull field X," "pick a category" — pays frontier-model rates. In a workflow you assign
   the cheap model to the cheap steps and reserve the expensive model for the one or two
   steps that need reasoning.[^leanops-agent-cost] Because model tokens are the dominant cost
   line in agentic systems,[^augment-loop-cost] this mix change is most of the win. (This is the per-step
   application of *model right-sizing* and *dynamic model routing*.)

3. **Bounded steps stop the spiral.** A fixed workflow has a known number of calls; it
   cannot decide to retry-and-retry until the wallet empties. A controlled study of
   deterministic (code-orchestrated) vs. LLM-controlled orchestration on a real modernization
   task found deterministic execution cut token consumption by **up to 3.5×** *at comparable
   correctness*, with **less run-to-run variability** — the consistency benefit, not just the
   cost one.[^cobol-orchestration] Where you still want a loop, cap it with a step ceiling and
   a token budget (see *Budget Limits & Guardrails*).

### Implementation checklist

1. **Confirm the task is decomposable.** Trace real runs. If the step sequence is stable and
   predictable, it is a workflow in disguise. If steps genuinely can't be predicted, keep it
   an agent (see below).
2. **Draw the graph and gate it.** Turn the sequence into a chain/router/DAG with programmatic
   checks ("gates") between steps so a bad intermediate result is caught in code, not carried
   forward.[^anthropic-bea]
3. **Right-size each step.** Assign the cheapest sufficient model and the minimal context per
   step; don't pass the whole history where a step needs one field.[^leanops-agent-cost]
4. **Bound everything.** Even inside a decomposed step that loops, set a step ceiling and token
   budget.
5. **Prove parity with evals.** Decomposition changes behavior; hold the quality bar with an
   eval suite before cutting over, and track $/task and tokens/task both ways.

## Example Where It Works

A B2B product generates a structured "company brief" from a domain: fetch the site, pull
key facts, classify the industry, draft a summary, and format to a schema. Built as an
**autonomous agent** on a frontier model with a browse tool, it averages ~14 loop steps,
re-inflates its transcript each step, and lands around **35,000 tokens/task** — well inside
the observed 10k–50k agentic band[^techahead-inference] — occasionally spiraling on sites it
can't parse.

Decomposed, it becomes a fixed 5-step chain: **fetch (code) → extract (cheap model) →
classify (cheap model) → draft (mid model) → format-to-schema (cheap model)**, with the
frontier model reserved for the single draft step. Each step carries only its own input, so
tokens grow linearly instead of quadratically,[^augment-loop-cost] most steps run on a cheap
model,[^leanops-agent-cost] and the step count is bounded so a bad site fails fast instead of
looping. On a task like this the reported wins line up: on the order of **3.5×** fewer tokens
at equal correctness,[^cobol-orchestration] with far less run-to-run variance — and at
tens of thousands of briefs/day that is the difference between a profitable feature and an
unprofitable one, since LLM tokens are the dominant cost line.[^augment-loop-cost]

## Example Where It Would NOT Work

Decomposition is the wrong move — or a net loss — when the task is **genuinely open-ended**.
Anthropic reserves agents precisely for "open-ended problems where it's difficult or
impossible to predict the required number of steps,"[^anthropic-bea] and forcing such a task
into a rigid DAG fails in two ways:

- **A novel, exploratory task** — e.g. an open-ended debugging or research agent where the
  next step truly depends on what the last step discovered, and the branching is unbounded.
  Hand-coding every path is impossible; a rigid workflow will hit an unmodeled case and
  produce a worse answer than a flexible agent would. Here the right levers are *state
  compression* and *bounded guardrails* on the agent, not decomposition.
- **Over-decomposition of a simple task.** If the whole job is *one* good model call with
  retrieval and a few examples, splitting it into a chain adds orchestration steps, extra
  calls, and more tokens for no accuracy gain — the opposite of the goal. Anthropic's own
  advice is that a single well-built call "is usually enough" for many applications.[^anthropic-bea]
- **Low-volume / one-off work.** The build cost (orchestration, per-step prompts, an eval
  harness to prove parity) is **High**; on a task you run rarely, that engineering never
  amortizes and a plain agent — or a single call — is cheaper end-to-end. The payoff is real
  only at sustained volume on a predictable task.

[^anthropic-bea]: Anthropic Engineering, "Building Effective AI Agents" — <https://www.anthropic.com/engineering/building-effective-agents>
[^cobol-orchestration]: Lwin & Kumar, "Deterministic vs. LLM-Controlled Orchestration for COBOL-to-Python Modernization," arXiv — <https://arxiv.org/abs/2605.09894>
[^augment-loop-cost]: Augment Code, "AI Agent Loop Token Costs: How to Constrain Context" — <https://www.augmentcode.com/guides/ai-agent-loop-token-cost-context-constraints>
[^leanops-agent-cost]: LeanOps, "AI Agents Burn 50x More Tokens Than Chats" — <https://leanopstech.com/blog/agentic-ai-cost-runaway-token-budget-2026/>
[^techahead-inference]: TechAhead, "The Inference Cost Trap: Why Your AI Agent Economics Break At Scale" — <https://www.techaheadcorp.com/blog/inference-cost-explosion/>
[^faas-agentic]: Kulkarni et al., "Optimizing FaaS Platforms for MCP-enabled Agentic Workflows," arXiv — <https://arxiv.org/pdf/2601.14735>
