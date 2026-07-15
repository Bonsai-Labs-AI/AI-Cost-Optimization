---
title: "Agent Budget Guardrails"
category: agent-workflow
maturityLevel: 1
maturityProvisional: false
shortDescription: "Bound an agent run with code-enforced ceilings (max loops, tool calls, retries, wall-clock, dollars) and a surfaced budget tracker, so a single run can never spiral into an unbounded bill."
effort: Low
gain: High
riskToQuality: Low
effortWhy: "The ceilings are a few lines of config in any modern agent framework, which ship loop and turn limits as first-class parameters."
gainWhy: "Guardrails cap the largest single cost risk an agentic product has — a runaway loop — and budget awareness can cut cost ~31% at equal quality."
riskWhy: "The limits fire only on the pathological tail, leaving the median run untouched, so the risk to quality is negligible."
detectionSignals:
  - "No hard stop — agent loops run until the task is 'done', the provider rate-limits the key, or someone notices the bill."
  - "Uncapped retries — retry-on-failure has no cap, so a persistently failing tool produces a retry storm of full-priced calls."
  - "No per-run ceiling — a single run's spend has no upper bound on cost, steps, or wall-clock time."
  - "Prompt-only budget — the only 'budget control' is an instruction in the system prompt telling the model to be frugal or stop at a limit."
  - "Spiraling tail runs — occasional runs re-query the same tool and re-read context, costing orders of magnitude more than the median run."
measurementMethods:
  - "Per-run cost distribution — cost/steps/tool-calls per agent run, watching the p99 and max rather than the mean."
  - "Runaway incident count — runs terminated by a ceiling and the spend they would have reached uncapped."
  - "Ceiling hit-rate — percentage of runs that hit each ceiling; too high means it is mis-set, near-zero with a fat tail means you need one."
  - "Retry-storm rate — repeated identical tool calls or prompts per run."
  - "Completed vs. abandoned cost — cost-per-completed-task vs. cost-per-abandoned-run (the tail you are trying to cap)."
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

An AI agent is, at bottom, a loop: the model proposes an action (usually a tool call),
the environment returns a result, the result is appended to the context, and the model
is called again — repeating until it decides the task is done.[^anthropic-agents] That
"until it decides" is the cost problem. Nothing in the loop itself bounds how many times
it runs. A tool that keeps failing, a model that keeps re-querying the same source, a
plan that never converges, or a context that grows quadratically as every turn is
appended — any of these turns a normal run into an open-ended sequence of full-priced
provider calls. The single most expensive AI incident most teams ever have is not a wrong
answer; it is a loop that nobody capped.[^truefoundry-ratelimit]

**Agent budget guardrails** are the controls that put a hard ceiling on a single agent
run. They absorb what are sometimes listed as separate techniques — loop limits,
tool-call limits, and retry limits — into one idea, because they are the same mechanism
applied to different counters. The technique has **two layers** that are easy to
conflate but must both exist:

1. **Code-enforced ceilings** — deterministic limits checked *before* each model or tool
   call (max loop iterations, max tool calls, max retries, a wall-clock timeout, a
   per-run dollar/token budget), backed by a circuit breaker that trips on pathological
   patterns and terminates or degrades the run.
2. **Prompt-level budget awareness** — a *tracker* that surfaces the remaining (and
   consumed) budget to the model on each iteration so it spends its allowance wisely.

The two layers do different jobs and are not substitutes. Layer 1 is the safety net that
*guarantees* the run stops; layer 2 makes the run *better* within the budget. The cardinal
rule is that **hard enforcement must live in code, never in the system prompt**: an agent
told "stop when you have spent $5" honors it only until it becomes task-motivated not
to.[^relayplane-runaway] This is a Level 1 win because the controls are a few lines of
config in any modern agent framework, they carry essentially no quality risk (they only
fire on the tail), and they cap the largest single cost risk an agentic product has.

## Detailed Approach & Techniques

### Layer 1 — Code-enforced ceilings (the non-negotiable layer)

Every counter the loop can run away on needs a ceiling, checked deterministically by your
runtime before the next call is dispatched:

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

When a ceiling is hit, the run should not simply throw and vanish — it should trigger a
**deterministic circuit-breaker action**: terminate and return the best partial result,
degrade to a safe read-only mode, or escalate to a human checkpoint.[^anthropic-agents]
A circuit breaker can also trip *before* a hard ceiling, on pathological signals like cost
velocity (e.g. spending far faster than budgeted), repeated identical prompts, or
recognizable loop signatures.[^truefoundry-ratelimit]

**Where to enforce — code and gateway, not the prompt.** In-process counters are the
first line, but they have a gap: if the agent process crashes and restarts, the counters
reset, and a per-agent implementation has to be re-written (and is inevitably missed) for
every new agent.[^relayplane-runaway][^truefoundry-ratelimit] The durable pattern is a
**gateway / proxy layer** that enforces token buckets (returning HTTP 429 with
`Retry-After`), circuit breakers, and per-key/-team/-customer dollar caps for *every*
workload uniformly — the same budget-hierarchy machinery covered under *Budget Limits &
Guardrails*, applied at the level of a single run.[^truefoundry-ratelimit] What you must
not do is delegate the hard stop to the model: a budget written into the system prompt is
a *suggestion*, and the model will exceed it the moment the task pushes it to.[^relayplane-runaway]

### Layer 2 — Prompt-level budget awareness (the efficiency layer)

The second layer is more subtle and is backed by recent research. The naive assumption is
that giving an agent a *bigger* tool-call budget makes it perform better. It does not:
agents lack "budget awareness," so extra budget is wasted and performance plateaus.[^bats-paper]
The fix is to **surface the budget to the model on every step** — a lightweight "Budget
Tracker" plug-in that tells the agent how much of its allowance (tool calls, steps, dollars)
remains, so it can condition its planning on the constraint rather than spending blindly.

The payoff is measured, not hypothetical. In the Budget-Aware Tool-Use study, a Budget
Tracker matched a standard ReAct agent's accuracy while using **40.4% fewer search calls
and 31.3% lower cost**; the fuller BATS framework, built on the same awareness, reached
**24.6% accuracy on BrowseComp versus 12.6% for plain ReAct** under a fixed 100-tool-use
budget.[^bats-paper] The lesson for product teams is twofold: surfacing the budget both
*cuts cost at equal quality* and *improves quality at equal budget* — and, critically, it
is the explicit, in-context budget signal that does the work, not a one-time instruction.

### Putting the layers together

A robust agent run therefore: (1) injects the remaining budget into the context each
iteration so the model spends wisely (layer 2); and (2) is wrapped by code/gateway
ceilings that *guarantee* it stops regardless of what the model decides (layer 1). Set
the ceilings from your observed run distribution — a max set just above the legitimate
p99 catches true runaways without clipping real work. Tune them by watching the percentage
of runs that hit each limit: near-zero hits with a fat cost tail means the cap is doing
its job; a high hit-rate means the limit is too tight or the task is mis-scoped (and is a
cue to confirm scope with the user — see *Agent Scope Confirmation*). Reducing the number
of tools and steps a task needs in the first place (*Tool-Use Minimization*) lowers the
budget you have to grant at all.

## Example Where It Works

A research assistant agent answers analyst questions by searching internal documents and
the web, reading results, and synthesizing an answer. The median run makes ~8 tool calls
and costs a few cents. One day a query about an ambiguous entity sends the agent into a
spiral: it keeps re-searching slight rephrasings, each result appended to a context that
grows every turn, every step a full-priced call. Uncapped, that one run would have made
hundreds of tool calls — practitioner reports describe exactly this shape, an agent
burning ~$15 in under ten minutes before anyone noticed.[^relayplane-runaway][^truefoundry-ratelimit]

With guardrails in place, the run is bounded on both layers. A **Budget Tracker** tells
the model on each step how many of its allotted tool calls remain, so it stops re-querying
and commits to an answer earlier — the same effect that cut search calls ~40% at equal
accuracy in the research benchmark.[^bats-paper] And a **code-enforced ceiling**
(`max_turns` / `recursion_limit`, a per-run dollar cap, and a wall-clock timeout) trips
before the run can ever reach the dangerous tail, returning the best partial answer and
flagging the run for review instead of silently spending.[^openai-agents-maxturns][^langgraph-recursion]
The median run is untouched; only the pathological tail is clipped, which is exactly the
distribution you want. Effort is a handful of config lines; the risk to quality is
negligible because the limits fire only on runs that were already failing.

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
  retrieve-then-answer pipeline has no loop to run away, so loop and tool-call ceilings buy
  nothing. The relevant cost control there is a `max_tokens` cap and the spend limits of
  *Budget Limits & Guardrails*, not per-run agent ceilings.
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
