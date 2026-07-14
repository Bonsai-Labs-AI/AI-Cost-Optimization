---
title: "Human-in-the-Loop Checkpoints"
category: agent-workflow
maturityLevel: 2
maturityProvisional: false
shortDescription: "Insert cheap human approval gates before expensive, irreversible, or long-running agent actions so the agent doesn't burn tokens (or do damage) on the wrong path without a confirmation."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Agents launch long autonomous chains (many tool-calling steps) with no gate — a single stuck loop can run for hours before anyone notices."
  - "Expensive or irreversible tool calls (bulk jobs, mass emails, deletes, deploys, financial transactions) execute without any confirmation."
  - "Recurring 'that's not what I meant' reruns: the agent finishes an expensive run in the wrong direction and the whole thing is redone."
  - "Post-incident stories of a runaway agent that spent hundreds or thousands of dollars in a single unattended session."
measurementMethods:
  - "Wasted-run cost avoided: estimated $ of autonomous work halted at a checkpoint (rejected/edited steps × their downstream cost)."
  - "% of expensive/irreversible actions that pass through an approval gate vs. execute unattended."
  - "Rework / wrong-direction rerun rate before vs. after adding scope + mid-run checkpoints."
  - "Human-approval overhead: median time-to-decision and share of gated runs, to confirm friction stays acceptable."
status: published
lastUpdated: "2026-07-02"
related:
  - "product-ux/agent-scope-confirmation"
  - "agent-workflow/agent-budget-guardrails"
  - "agent-workflow/tool-use-minimization"
sources:
  - id: langchain-hitl
    title: "Human-in-the-loop"
    publisher: "LangChain — Docs (LangGraph / langchain OSS)"
    year: 2026
    url: "https://docs.langchain.com/oss/python/langchain/human-in-the-loop"
    accessed: "2026-07-02"
    kind: docs
    note: "interrupt() pauses the graph and returns control; four decision types — approve / edit / reject / respond. A `when` predicate on ToolCallRequest gates on tool arguments (e.g. only pause writes outside /workspace, only pause non-SELECT SQL). Requires a checkpointer + thread_id."
  - id: openai-approvals
    title: "Guardrails and human review"
    publisher: "OpenAI — API Docs (Agents)"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/agents/guardrails-approvals"
    accessed: "2026-07-02"
    kind: docs
    note: "Mark a tool with needsApproval/needs_approval (true, or an async function of the args). Flagged calls pause the run and return `interruptions` plus a resumable `state`; app approves/rejects then resumes the same run. Advises approval for irreversible (cancellations, deletions), expensive (financial transactions), and sensitive (data modifications, shell commands) actions."
  - id: openai-hitl-js
    title: "Human-in-the-loop"
    publisher: "OpenAI Agents SDK (JS)"
    year: 2026
    url: "https://openai.github.io/openai-agents-js/guides/human-in-the-loop/"
    accessed: "2026-07-02"
    kind: docs
    note: "needsApproval true or async predicate; run pauses with pending interruptions in a RunResult; resume by passing state back into run(agent, state); state is serializable for async review."
  - id: anthropic-agents
    title: "Building Effective Agents"
    publisher: "Anthropic — Engineering / Research"
    year: 2025
    url: "https://www.anthropic.com/research/building-effective-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "\"Agents can then pause for human feedback at checkpoints or when encountering blockers.\" Recommends stopping conditions (e.g. a max number of iterations) to maintain control; notes the autonomous nature of agents means higher costs and the potential for compounding errors."
  - id: anthropic-trustworthy
    title: "Our framework for developing safe and trustworthy agents"
    publisher: "Anthropic — News"
    year: 2026
    url: "https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents"
    accessed: "2026-07-02"
    kind: blog
    note: "Humans should retain control before high-stakes decisions. Claude Code default: read-only, must ask approval before actions that modify code or systems; users can grant persistent permissions for trusted routine tasks. Example: an agent must get human approval before cancelling subscriptions / downgrading tiers."
  - id: leanops-runaway
    title: "AI Agents Burn 50x More Tokens Than Chats"
    publisher: "LeanOps"
    year: 2026
    url: "https://leanopstech.com/blog/agentic-ai-cost-runaway-token-budget-2026/"
    accessed: "2026-07-02"
    kind: blog
    note: "Agent loop resends accumulated context each step: ~3.2× a chatbot at 5 steps, >30× at 50 steps, >100× at 200 steps. Real runaway: one developer ran up $4,200 in API fees over a long weekend on an autonomous refactoring run. A ~30-second human approval on any job over ~$50 estimated cost prevents the surprise."
---

## Overview

An autonomous agent decides *and acts* in a loop: it proposes a tool call, executes it,
feeds the result back, and repeats — often for dozens or hundreds of steps. Because most
agent architectures resend the whole accumulated context on every step, cost grows
super-linearly with loop length: one write-up measures an agent loop at roughly **3.2× a
plain chatbot at 5 steps, more than 30× at 50 steps, and more than 100× at 200 steps** for
the same underlying task.[^leanops-runaway] The danger is that this spend is **unattended** —
if the agent takes a wrong turn or gets stuck retrying a failing action, it can burn a large
bill before any human sees it. The same source reports a single developer running up
**$4,200 in API fees over one long weekend** on an autonomous refactoring run.[^leanops-runaway]

**Human-in-the-loop (HITL) checkpoints** insert a cheap human approval gate at the points
where an agent is about to do something *expensive or irreversible*: kick off a long
autonomous run, take a costly branch mid-run, or call a high-stakes tool (a bulk job, a mass
email, a delete, a deploy, a financial transaction). The economics are lopsided: a human
"yes / no" costs seconds and effectively **zero tokens**, while the run it authorizes — or,
crucially, the run it *cancels* — can be worth many dollars of model calls plus the real-world
cost of a wrong irreversible action.[^leanops-runaway][^openai-approvals] This is why every
major agent framework and provider now ships a first-class HITL/approval primitive.

This technique absorbs **expensive-action confirmation**. It sits at **Level 2** because
doing it well is deliberate engineering — you must decide *which* actions to gate, wire a
pause/resume mechanism (which needs durable state), and keep the friction low enough that
users don't route around it.

## Detailed Approach & Techniques

### Three places a checkpoint saves cost

1. **Gate the start of an expensive run (scope confirm).** Before committing to a long
   autonomous chain, pause and let the human confirm the objective/scope. This is the
   cheapest possible intervention — a few hundred tokens of plan gate thousands-to-millions
   of tokens of execution. (When this gate is a *product* pattern — the agent asks a
   clarifying question or shows a plan up front — it's covered by
   *Agent Scope / Plan Confirmation*; HITL is the general in-run gate that includes this
   position.)

2. **Gate mid-run before a costly branch.** When the agent reaches a fork that will trigger
   a lot of downstream work (e.g. "process all 4,000 records," "spin up sub-agents,"
   "iterate until tests pass"), interrupt and confirm before spending. Anthropic's guidance
   is explicit: *"Agents can then pause for human feedback at checkpoints or when
   encountering blockers,"* and to include stopping conditions such as a maximum number of
   iterations to maintain control.[^anthropic-agents]

3. **Gate before an irreversible/high-stakes tool call.** Deletes, deploys, sends, purchases,
   and financial transactions should not fire unattended. OpenAI's approvals guidance
   recommends flagging exactly these — *irreversible* (cancellations, deletions), *expensive*
   (financial transactions), and *sensitive* (data modifications, shell commands) — for human
   review.[^openai-approvals] Anthropic's trustworthy-agents framework gives the canonical
   example: an agent that finds wasteful software spend must get **human approval before
   cancelling subscriptions or downgrading tiers**, and Claude Code ships read-only by default,
   asking approval before any action that modifies code or systems.[^anthropic-trustworthy]

### Framework mechanisms

- **LangGraph / LangChain — `interrupt()` + HITL middleware.** `interrupt()` pauses the
  graph and hands control back to the caller; the human decision is one of four types —
  **approve** (run as proposed), **edit** (modify the tool arguments first), **reject** (skip
  the call and feed rejection feedback back to the model), or **respond** (return a synthetic
  tool result). A `when` predicate on the `ToolCallRequest` lets you **gate on the arguments**
  — e.g. only pause writes to paths outside `/workspace`, or only pause SQL that isn't a
  read-only `SELECT` — so cheap/safe calls auto-approve and only risky ones interrupt. A
  checkpointer plus a stable `thread_id` is required so the run can be durably paused and
  resumed.[^langchain-hitl]

- **OpenAI Agents SDK — `needsApproval` / `needs_approval`.** Mark a tool with
  `needsApproval: true`, or with an **async function of the arguments** for conditional gating
  (approve small jobs, pause big ones). A flagged call **pauses the run** and returns
  `interruptions` (pending approval items) plus a resumable `state`; the app approves or
  rejects each interruption and passes `state` back to continue *the same run*, not a new turn.
  Because `state` is serializable, the human review can happen asynchronously.[^openai-approvals][^openai-hitl-js]

The argument-conditional predicate is the key to keeping this cheap: you don't gate *every*
step (that destroys the point of an agent) — you gate only the steps whose expected cost, in
tokens or in real-world consequence, exceeds the cost of a human glance.[^langchain-hitl][^openai-approvals]

### Boundary with the neighbours

- **`agent-scope-confirmation` (product-ux, L2)** is the *up-front* plan/clarify gate — the
  special case of position (1), owned by the product UX.
- **`agent-budget-guardrails` (L1)** is the *automated, in-loop* limit — a hard token/step/$
  cap that pauses or kills the run **with no human**. HITL is the **human** gate: a person
  makes the go/no-go call, which catches *semantic* mistakes ("this is the wrong repo") that a
  numeric cap can't. The two compose — the budget guardrail is the backstop that fires when no
  human is watching; the checkpoint is the judgement call when one is.[^leanops-runaway][^anthropic-agents]

### The cost of the checkpoint itself

A checkpoint is not free: it adds **latency** (the run blocks until a human responds) and
consumes **human time**. That's why the design lever is *selectivity* and *tiering*.
Anthropic's model — read-only by default, approval for mutations, and **persistent
permissions for routine tasks the user trusts** — is the pattern to copy: escalate only the
consequential actions, and let repeat-trusted ones auto-approve so friction doesn't push
users to disable the gate entirely.[^anthropic-trustworthy] Gate too much and you've built an
expensive manual workflow with an LLM bolted on; gate the right 5% and a **~30-second
approval prevents a multi-hundred-dollar surprise**.[^leanops-runaway]

## Example Where It Works

A DevOps assistant agent triages incidents and can run shell commands, restart services, and
open pull requests. Left fully autonomous, a bad reasoning step once had it loop on a failing
migration, resending an ever-growing context each iteration — the kind of chain that runs
**>30×** the cost of a single chat turn by 50 steps and can quietly reach four figures over an
unattended weekend.[^leanops-runaway]

Adding HITL checkpoints:

- **Read-only and diagnostic tools auto-approve** (logs, metrics, `SELECT` queries) — the
  agent keeps its speed on the 90% of steps that are cheap and safe.[^langchain-hitl]
- **Mutating/irreversible tools are gated** with an argument-conditional predicate: any
  `restart-service`, `apply-migration`, `delete`, or shell command that isn't on an allowlist
  pauses and surfaces the exact command for a one-click approve / edit / reject.[^langchain-hitl][^openai-approvals]

Now, when the agent proposes the wrong migration, an engineer **rejects it in seconds** with
feedback, and the run corrects course instead of burning 40 more iterations down a dead end.
The gate cost a few seconds of human time; it saved both the wasted autonomous spend and a
production incident — the asymmetric trade the pattern is built for.[^openai-approvals][^anthropic-trustworthy]

## Example Where It Would NOT Work

- **High-volume, low-stakes, fully-automated tasks.** An agent classifying 50,000 support
  tickets overnight has no room for a human in the loop — a gate per item would make it slower
  and *more* expensive than the model calls it guards, and there's no irreversible action to
  protect. Here the right levers are **automated** budget/step caps (`agent-budget-guardrails`)
  and anomaly alerting, not human approval.[^leanops-runaway]

- **Cheap, trivially-reversible actions.** If a wrong step costs a few cents and is instantly
  undone, the checkpoint's latency and human-time cost exceed what it saves — pure friction.
  OpenAI's own guidance scopes approval to *irreversible / expensive / sensitive* actions for
  exactly this reason; gating everything defeats the purpose of an agent.[^openai-approvals]

- **When no human is actually available to respond.** A checkpoint only works if someone
  answers it. An unattended overnight batch or a latency-critical real-time path can't block on
  a human, so a checkpoint there either stalls the run indefinitely or gets rubber-stamped —
  in both cases the *automated* guardrail (a hard iteration/$ cap, per Anthropic's stopping
  conditions) is the correct control instead.[^anthropic-agents][^leanops-runaway]

[^langchain-hitl]: LangChain, "Human-in-the-loop," LangGraph / langchain OSS docs — <https://docs.langchain.com/oss/python/langchain/human-in-the-loop>
[^openai-approvals]: OpenAI, "Guardrails and human review," Agents API docs — <https://developers.openai.com/api/docs/guides/agents/guardrails-approvals>
[^openai-hitl-js]: OpenAI Agents SDK (JS), "Human-in-the-loop" — <https://openai.github.io/openai-agents-js/guides/human-in-the-loop/>
[^anthropic-agents]: Anthropic, "Building Effective Agents" — <https://www.anthropic.com/research/building-effective-agents>
[^anthropic-trustworthy]: Anthropic, "Our framework for developing safe and trustworthy agents" — <https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents>
[^leanops-runaway]: LeanOps, "AI Agents Burn 50x More Tokens Than Chats" — <https://leanopstech.com/blog/agentic-ai-cost-runaway-token-budget-2026/>
