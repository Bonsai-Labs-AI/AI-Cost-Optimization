---
title: "Agent Budget Guardrails"
category: agent-workflow
maturityLevel: 1
maturityProvisional: false
shortDescription: "Put hard limits, enforced in code, on what one agent run can do — max steps, tool calls, retries, time, and dollars — and show the model its remaining budget, so a stuck run gets stopped instead of quietly running up the bill."
effort: Low
gain: High
riskToQuality: Low
effortWhy: "The limits are a few lines of config; every major agent framework ships loop and turn caps as built-in parameters."
gainWhy: "A runaway loop is the biggest single cost risk an agent product has; caps remove it, and showing the model its budget cut cost ~31% at equal quality in one study."
riskWhy: "The limits only trigger on runs that are already failing; normal runs never hit them."
detectionSignals:
  - "No hard stop — the loop runs until the model decides it's done, the provider rate-limits the key, or someone notices the bill."
  - "Uncapped retries — a failing tool gets retried without limit, and every retry is a full-priced call."
  - "No per-run ceiling — nothing limits how much one run can spend in dollars, steps, or time."
  - "Prompt-only budget — the only 'budget control' is a sentence in the system prompt asking the model to stay under a limit."
  - "Expensive outlier runs — an occasional run re-queries the same tool over and over and costs 10–100× a typical run."
measurementMethods:
  - "Cost per run — track cost, steps, and tool calls per run; watch the p99 and the max, not the mean."
  - "Runs stopped by a limit — how many, and an estimate of what each would have spent without it."
  - "Limit hit-rate — share of runs that hit each limit; a high rate means the limit is too tight, and it should stay near zero once set right."
  - "Repeated identical calls — count of identical tool calls or prompts within a single run."
  - "Cost per completed task vs. cost sunk into abandoned runs — the abandoned tail is what the limits should shrink."
status: published
lastUpdated: "2026-06-29"
related:
  - "product-ux/agent-scope-confirmation"
  - "agent-workflow/tool-use-minimization"
sources:
  - id: bats-paper
    title: "Budget-Aware Tool-Use Enables Effective Agent Scaling"
    publisher: "arXiv (Liu et al.)"
    authors: "Tengxiao Liu, et al."
    year: 2025
    url: "https://arxiv.org/abs/2511.17006"
    accessed: "2026-06-29"
    kind: paper
    note: "Granting a larger tool-call budget alone does not raise performance — agents lack budget awareness and plateau. A 'Budget Tracker' that surfaces remaining budget each step matches ReAct accuracy with 40.4% fewer search calls and 31.3% lower cost; BATS reaches 24.6% on BrowseComp vs 12.6% for ReAct under a 100-tool-use budget (Gemini-2.5-Pro)."
  - id: anthropic-agents
    title: "Building Effective AI Agents"
    publisher: "Anthropic"
    year: 2024
    url: "https://www.anthropic.com/research/building-effective-agents"
    accessed: "2026-06-29"
    kind: blog
    note: "Agents run in a loop with environmental feedback; 'it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control.' Recommends sandboxing, guardrails, and human checkpoints before irreversible actions."
  - id: langgraph-recursion
    title: "GRAPH_RECURSION_LIMIT"
    publisher: "LangChain — LangGraph Docs"
    year: 2026
    url: "https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT"
    accessed: "2026-06-29"
    kind: docs
    note: "LangGraph caps the number of super-steps; exceeding it raises GraphRecursionError. The limit is set via recursion_limit in the run config. The common cause is a stuck loop, not genuine task complexity — raising the limit blindly just pays for more calls."
  - id: openai-agents-maxturns
    title: "Running agents — max_turns"
    publisher: "OpenAI Agents SDK"
    year: 2026
    url: "https://openai.github.io/openai-agents-python/running_agents/"
    accessed: "2026-06-29"
    kind: docs
    note: "The Runner enforces a max_turns ceiling; exceeding it raises MaxTurnsExceeded. Code-level limit independent of the model's own judgment; pass max_turns=None to disable."
  - id: relayplane-runaway
    title: "Agent Runaway Costs: How to Set LLM Budget Limits Before Costs Spiral"
    publisher: "RelayPlane Blog"
    year: 2026
    url: "https://relayplane.com/blog/agent-runaway-costs-2026"
    accessed: "2026-06-29"
    kind: blog
    note: "Concrete limits: turn counter with a hard stop, per-request max_tokens cap, per-session dollar budget, plus infra-level daily/hourly caps. Application counters reset if the agent crashes and restarts, so a proxy layer is needed for durable enforcement. Cites a real agent that burned $15 in under 10 minutes."
  - id: truefoundry-ratelimit
    title: "Rate Limiting AI Agents: Preventing LLM API Exhaustion with a 3-Layer Gateway"
    publisher: "TrueFoundry Blog"
    year: 2026
    url: "https://www.truefoundry.com/blog/rate-limiting-ai-agents-preventing-llm-api-exhaustion"
    accessed: "2026-06-29"
    kind: blog
    note: "'The most expensive AI incident most teams have ever had wasn't a wrong answer. It was a loop.' 3-layer gateway: token buckets returning 429s, circuit breakers tripping on cost velocity / repeated prompts / loop signatures, and fallback chains. Argues for centralized gateway enforcement over per-agent code so no workload is missed."
---

## Overview

An agent is a loop: the model picks an action (usually a tool call), the result comes
back and is appended to the context, and the model is called again — until the model
decides the task is done.[^anthropic-agents] That last part is the cost problem. Nothing
in the loop itself limits how many times it runs. A tool that keeps failing, a model that
keeps re-querying the same source, a plan that never settles, a context that gets bigger
every turn so each call costs more than the last — any of these turns a normal run into
an open-ended series of full-priced API calls. As one practitioner write-up puts it: the
most expensive AI incident most teams have had "wasn't a wrong answer. It was a
loop."[^truefoundry-ratelimit]

**Agent budget guardrails** put a hard ceiling on what a single run can spend. Loop
limits, tool-call limits, and retry limits are sometimes listed as separate techniques,
but they are the same mechanism applied to different counters, so this page treats them
as one. There are **two layers**, and both need to exist:

1. **Limits enforced in code** — checked before each model or tool call: max steps, max
   tool calls, max retries, a wall-clock timeout, a per-run dollar or token budget. When
   one trips, a circuit breaker stops the run or drops it into a degraded mode.
2. **Budget awareness in the prompt** — a tracker that tells the model, on each step,
   how much of its budget is left, so it plans within the constraint instead of spending
   blindly.

The layers do different jobs and don't substitute for each other: layer 1 guarantees the
run stops; layer 2 makes the run cheaper and better within the budget. One rule matters
more than the rest: **the hard stop lives in code, never in the system prompt.** An agent
told "stop when you have spent $5" follows that instruction right up until finishing the
task tempts it not to.[^relayplane-runaway] This sits at Level 1 because the limits are a
few lines of config in any current agent framework, they only trigger on runs that were
already failing, and they remove the biggest single cost risk an agent product has.

## Detailed Approach & Techniques

### Layer 1 — Limits enforced in code (the layer you must have)

Every counter the loop can run away on needs a limit, checked by your runtime before the
next call goes out:

- **Max loop iterations / steps.** A hard stop on the number of agent turns. Frameworks
  ship this as a first-class parameter: LangGraph caps super-steps and raises
  `GraphRecursionError` when the `recursion_limit` is exceeded;[^langgraph-recursion] the
  OpenAI Agents SDK enforces `max_turns` and raises `MaxTurnsExceeded`.[^openai-agents-maxturns]
  Anthropic's guidance is explicit that a maximum iteration count is the standard way to
  "maintain control" of an agent loop.[^anthropic-agents]
- **Max tool calls.** A separate budget on tool invocations, which are often the dominant
  cost (each can append a large observation back into context).
- **Max retries per tool / per error.** The retry storm — an agent re-issuing a failing
  call, each retry a full provider round-trip that also grows context — is one of the most
  common runaway patterns.[^truefoundry-ratelimit] Cap retries and apply backoff.
- **Wall-clock timeout.** A run that exceeds N seconds is almost always stuck; kill it.
- **Per-run cost / token budget.** Track cumulative spend across the run against a dollar
  or token ceiling and stop when it is reached.[^relayplane-runaway]

When a limit is hit, the run should not just throw an error and vanish. Decide what
happens next: return the best partial result, drop to a safe read-only mode, or hand off
to a human.[^anthropic-agents] A circuit breaker can also trip *before* any hard limit,
on warning signs: spend rising much faster than planned, repeated identical prompts, or a
recognizable loop pattern.[^truefoundry-ratelimit]

**Where to enforce — code and gateway, not the prompt.** In-process counters are the
first line, but they have a gap: if the agent process crashes and restarts, the counters
reset, and a per-agent implementation has to be re-written (and is inevitably missed) for
every new agent.[^relayplane-runaway][^truefoundry-ratelimit] The durable pattern is a
**gateway / proxy layer** that enforces token buckets (returning HTTP 429 with
`Retry-After`), circuit breakers, and per-key, per-team, and per-customer dollar caps for
*every* workload uniformly, so no agent is missed.[^truefoundry-ratelimit] What you must
not do is delegate the hard stop to the model: a budget written into the system prompt is
a *suggestion*, and the model will exceed it the moment the task pushes it to.[^relayplane-runaway]

### Layer 2 — Budget awareness in the prompt (the efficiency layer)

You might assume that giving an agent a *bigger* tool-call budget makes it perform
better. Measured directly, it doesn't: agents don't track their own spending, so the
extra budget is wasted and performance plateaus.[^bats-paper] The fix is to **show the
model its budget on every step** — a lightweight "Budget Tracker" that tells the agent
how much of its allowance (tool calls, steps, dollars) remains, so its planning takes the
constraint into account.

In the Budget-Aware Tool-Use study, a Budget Tracker matched a standard ReAct agent's
accuracy while using **40.4% fewer search calls and 31.3% lower cost**; the fuller BATS
framework, built on the same awareness, reached **24.6% accuracy on BrowseComp versus
12.6% for plain ReAct** under a fixed 100-tool-use budget.[^bats-paper] Two takeaways:
showing the budget cuts cost at equal quality, and improves quality at equal budget. And
it is the per-step, in-context signal that does the work — a one-time instruction at the
start does not.

### Putting the layers together

A well-guarded run does two things: (1) it shows the model its remaining budget on every
iteration so the model spends it deliberately (layer 2); and (2) it is wrapped in code and
gateway limits that stop it no matter what the model decides (layer 1). Set the limits
from your observed run distribution — a max just above the legitimate p99 catches real
runaways without cutting off real work. Then watch the share of runs that hit each limit:
a high rate means the limit is too tight or the task is mis-scoped (a cue to confirm scope
with the user — see *Agent Scope Confirmation*); done right, almost no run hits the limit
and the expensive tail disappears from your cost distribution. Reducing the tools and
steps a task needs in the first place (*Tool-Use Minimization*) lowers the budget you have
to grant at all.

## Example Where It Works

A research assistant agent answers analyst questions by searching internal documents and
the web, reading results, and synthesizing an answer. The median run makes ~8 tool calls
and costs a few cents. One day a query about an ambiguous entity sends the agent into a
spiral: it keeps re-searching slight rephrasings, each result appended to a context that
grows every turn, every step a full-priced call. Uncapped, that one run would have made
hundreds of tool calls — one practitioner report describes an agent burning ~$15 in under
ten minutes before anyone noticed.[^relayplane-runaway][^truefoundry-ratelimit]

With guardrails in place, the run is bounded on both layers. A **Budget Tracker** tells
the model on each step how many of its allotted tool calls remain, so it stops re-querying
and commits to an answer earlier — the same effect that cut search calls ~40% at equal
accuracy in the research benchmark.[^bats-paper] And a **limit enforced in code**
(`max_turns` / `recursion_limit`, a per-run dollar cap, and a wall-clock timeout) stops
the run long before it gets expensive, returning the best partial answer and flagging the
run for review instead of silently spending.[^openai-agents-maxturns][^langgraph-recursion]
Normal runs never notice the limits; only the broken ones get cut off. The effort is a
handful of config lines, and the quality risk is near zero because the limits only fire
on runs that were already failing.

## Example Where It Would NOT Work

- **Ceilings set too low on legitimately long tasks.** A genuine deep-research or
  multi-file refactoring task may *need* 50+ steps. A `recursion_limit` left at a small
  default will throw mid-task and waste everything spent so far — and the common failure
  mode is treating that as "task too complex" and raising the limit blindly, which just
  pays for more calls without fixing a stuck loop.[^langgraph-recursion] The cap must be
  set from the real run distribution, not guessed; a too-tight limit degrades quality
  rather than protecting cost.
- **Prompt-only "budgets" as the safety net.** Putting "you have a budget of $2, do not
  exceed it" in the system prompt and nothing in code is *not* this technique. The model
  treats the budget as advisory and will blow past it when the task motivates it; the hard
  stop has to be enforced outside the model's judgment.[^relayplane-runaway] (The prompt
  budget tracker is valuable — but only *alongside* the code ceiling, never instead of it.)
- **Non-agentic / single-shot calls.** A one-shot completion or a simple
  retrieve-then-answer pipeline has no loop to run away, so loop and tool-call limits buy
  nothing. The relevant cost controls there are a `max_tokens` cap and account-level spend
  limits at the provider or gateway, not per-run agent limits.
- **In-process counters alone for a crash-restart workload.** If an agent can crash and be
  restarted by an orchestrator, application-level counters reset to zero on each restart and
  a relentless loop simply resumes spending. Durable enforcement has to live in a gateway or
  external store that survives the restart.[^relayplane-runaway][^truefoundry-ratelimit]

[^bats-paper]: Liu et al., "Budget-Aware Tool-Use Enables Effective Agent Scaling," arXiv 2511.17006 — <https://arxiv.org/abs/2511.17006>
[^anthropic-agents]: Anthropic, "Building Effective AI Agents" — <https://www.anthropic.com/research/building-effective-agents>
[^langgraph-recursion]: LangChain, "GRAPH_RECURSION_LIMIT," LangGraph Docs — <https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT>
[^openai-agents-maxturns]: OpenAI Agents SDK, "Running agents" (max_turns / MaxTurnsExceeded) — <https://openai.github.io/openai-agents-python/running_agents/>
[^relayplane-runaway]: RelayPlane, "Agent Runaway Costs: How to Set LLM Budget Limits Before Costs Spiral" — <https://relayplane.com/blog/agent-runaway-costs-2026>
[^truefoundry-ratelimit]: TrueFoundry, "Rate Limiting AI Agents: Preventing LLM API Exhaustion with a 3-Layer Gateway" — <https://www.truefoundry.com/blog/rate-limiting-ai-agents-preventing-llm-api-exhaustion>
