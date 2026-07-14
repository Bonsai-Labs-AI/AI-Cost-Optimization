---
title: "Reusable Memory / Artifact Store"
category: agent-workflow
maturityLevel: 3
maturityProvisional: false
shortDescription: "Persist reusable artifacts and learned facts in a durable store so agents reuse prior work across runs instead of re-deriving (and re-paying for) the same results every session."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Agents re-derive the same intermediate results (computed answers, generated code/docs, extracted facts) on every new session instead of reusing prior work."
  - "The same sub-task or lookup is executed and paid for on every run, with no cross-run reuse."
  - "Each session starts cold — re-exploring a codebase, re-summarizing the same documents, or re-learning user preferences it already learned last time."
  - "No durable memory/artifact store exists; everything lives inside a single run's context window and is discarded when the run ends."
measurementMethods:
  - "Artifact/memory reuse rate (share of runs that read a stored artifact instead of regenerating it)."
  - "Tokens and tool cost avoided per run by serving a stored artifact vs. re-deriving it."
  - "Blended $/task across a repeated-task workload before vs. after adding the store."
  - "Staleness incidents: how often a stored artifact was served but was out of date."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/context-offloading"
  - "agent-workflow/state-compression-for-agents"
  - "caching-reuse/tool-result-caching"
  - "prompt-context/provider-native-context-management"
sources:
  - id: anthropic-memory-tool
    title: "Memory tool"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool"
    accessed: "2026-07-03"
    kind: docs
    note: "Claude stores and retrieves information across conversations in a client-side /memories directory (create/view/str_replace/insert/delete/rename). Persists between sessions; a later conversation continues from the same store. Tool type memory_20250818; GA on the Messages API, available on Claude 4+."
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "'Structured note-taking, or agentic memory' persists notes outside the context window; just-in-time retrieval keeps lightweight identifiers and loads data on demand. After context resets the agent reads its own notes and continues without re-deriving prior decisions."
  - id: anthropic-harnesses
    title: "Effective harnesses for long-running agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Multi-session pattern: a progress file, a feature-list registry, and git history let a new session read prior state instead of re-exploring — 'saves Claude some tokens in every session since it doesn't have to figure out how to test the code.'"
  - id: mem0-paper
    title: "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"
    publisher: "arXiv:2504.19413"
    year: 2026
    url: "https://arxiv.org/abs/2504.19413"
    accessed: "2026-07-03"
    kind: paper
    note: "On the LOCOMO benchmark, selective external memory saves >90% token cost and attains 91% lower p95 latency vs. processing the entire conversation history, at a modest accuracy trade."
  - id: redis-ltm
    title: "Long-Term Memory Architectures for AI Agents"
    publisher: "Redis Blog"
    year: 2026
    url: "https://redis.io/blog/long-term-memory-architectures-ai-agents/"
    accessed: "2026-07-03"
    kind: blog
    note: "Long-term memory splits into semantic (facts), episodic (events), procedural (skills); read-before-reasoning / write-after-acting loop; ingestion→embed→retrieve→consolidate pipeline. LOCOMO figures: full-context 72.9% acc / 17.12s p95 / ~26,031 tokens vs. selective memory 66.9% / 1.44s / ~1,764 tokens. Consolidation/forgetting is the hard, unsolved part."
  - id: mem0-cost
    title: "How to Reduce LLM Token Costs for AI Agent Memory"
    publisher: "Mem0 Blog"
    year: 2026
    url: "https://mem0.ai/blog/6-techniques-to-cut-ai-agent-memory-cost-beyond-basic-retrieval"
    accessed: "2026-07-03"
    kind: blog
    note: "Measured with real GPT-4o-mini calls: top-5 retrieval 166 tokens vs. 594-token naive full dump = 72% reduction; token-budgeting, hierarchical summarization and eviction stack to a claimed 3–4× total cost reduction. Storage: int8 quantization = 4× smaller."
  - id: mem0-ltm
    title: "Long-Term Memory for AI Agents: The What, Why and How"
    publisher: "Mem0 Blog"
    year: 2026
    url: "https://mem0.ai/blog/long-term-memory-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Pipeline: extract facts from raw text → consolidate (merge on similarity >0.85, dedupe >0.9) → store (vectors/graph) → retrieve by relevance×recency×type. Turns 'stateless AI agents into stateful knowledge accumulators.'"
---

## Overview

Most agents are **stateless between runs**: they start every session from a cold context,
re-read the same codebase, re-summarize the same documents, re-run the same lookups, and
re-learn the same user preferences — then throw all of it away when the run ends.[^redis-ltm]
Every one of those re-derivations is paid for again, in tokens and tool calls, on the next
run.

A **reusable memory / artifact store** breaks that cycle. It is a *durable* store —
outside any single run's context window — of the reusable outputs an agent produces:
computed results, generated code or documents, extracted or learned facts, plans, and
checkpoints. Each artifact is keyed so that a later run can look it up and **reuse** it
instead of regenerating it.[^anthropic-memory-tool][^mem0-ltm]

The distinction from ordinary caching matters. Prompt/prefix caching and tool-result
caching largely save work *within* a run (or a short cache window). A reusable memory store
saves work **across runs and across sessions** — often days or weeks apart — by making the
*results* of prior work first-class, retrievable objects. Anthropic frames the underlying
practice as "structured note-taking, or agentic memory … the agent regularly writes notes
persisted to memory *outside of the context window*," then reads them back on demand.[^anthropic-context-engineering]
This is **Level 3** work: it is not a config flag but a small system — a store, keys, a
write policy, a retrieval step, and (the hard part) invalidation — worth building once an
agent repeatedly overlaps its own past work at meaningful volume.

## Detailed Approach & Techniques

### What goes in the store

Long-term agent memory is usually split into three kinds, and a good store holds all
three:[^redis-ltm]

- **Semantic** — durable facts and distilled knowledge: user preferences ("deploys to
  Railway, prefers Python"), domain rules, a project's architecture summary.
- **Episodic** — time-indexed records of what happened: past decisions, tool calls, a run's
  outcome, so a later run can recall "we already tried X and it failed."
- **Procedural** — reusable skills and artifacts: generated code/utilities, document
  summaries, extraction templates, a solved sub-task's output — the things most expensive to
  re-derive.

### Native primitive: the memory tool

Anthropic's **memory tool** (`memory_20250818`, GA on the Messages API, Claude 4+) is the
provider-native entry point. Claude stores and retrieves files in a `/memories` directory
that **persists between sessions**; when the memory tool is present, the API automatically
tells the model to *view its memory directory before doing anything else*, and "a later
conversation continues from the same memory" as long as your handler serves the same
store.[^anthropic-memory-tool] Crucially it is **client-side** — Claude only *requests*
`create`/`view`/`str_replace`/`delete`/`rename`; your application executes each against
storage you control (a per-user directory, S3, or a database), so you own retention,
size caps, and expiry.[^anthropic-memory-tool]

Anthropic's long-running-agent harness shows the pattern concretely for multi-session
software work: a `claude-progress.txt` log, a feature-list registry, and git history let a
new session **read prior state instead of re-exploring** the codebase — which, in their
words, "saves Claude some tokens in every session since it doesn't have to figure out how to
test the code."[^anthropic-harnesses]

### The read/write loop and the pipeline

Framework memory systems (mem0, Redis Agent Memory Server, LangGraph stores) implement a
**read-before-reasoning, write-after-acting** loop: on input, query the long-term store and
inject only what's relevant; after acting, extract new facts/artifacts and write them
back.[^redis-ltm] The write path is a small pipeline — **extract** facts from raw text →
**consolidate** (merge near-duplicates above a similarity threshold, e.g. >0.85; dedupe
>0.9) → **store** as vectors or a graph → **retrieve** later by a relevance × recency ×
type score.[^mem0-ltm] Consolidation is what keeps the store from growing without bound and
keeps retrieval sharp.

### The cost mechanism — reuse vs. re-derive

The saving has two components. First, **retrieval instead of re-injection**: pulling only
the relevant stored facts is far cheaper than re-sending full history. On the LOCOMO
long-conversation benchmark, selective external memory used **~1,764 tokens per
conversation vs. ~26,031 for full-context — a >90% token-cost reduction and 91% lower p95
latency (1.44s vs. 17.12s)**, for a ~6-point accuracy trade.[^redis-ltm][^mem0-paper]
Measured directly against real GPT-4o-mini calls, top-5 retrieval from a memory store cost
**166 tokens vs. 594 for a naive full dump — a 72% reduction** — and stacking budgeting,
summarization and eviction reached a claimed **3–4× total cost reduction**.[^mem0-cost]

Second — and specific to *this* technique — **not regenerating the artifact at all**. If run
#2 needs a document summary, an extracted schema, or a code utility that run #1 already
produced, reading it back costs a cheap retrieval; regenerating it costs a full (often
multi-thousand-token, multi-tool) derivation. The more a workload repeats or overlaps across
runs, the larger this share.

### Managing the store

- **Keying & scope.** Key artifacts by their inputs (and a version) and namespace by
  user/project so runs don't cross-contaminate.[^mem0-ltm]
- **Retrieval overhead.** Every run pays an embedding + vector-search step; keep it cheap
  (hybrid dense+lexical retrieval is a strong default) so retrieval never costs more than the
  work it replaces.[^redis-ltm]
- **Size & eviction.** Cap file sizes and expire cold entries; the memory-tool docs
  explicitly recommend tracking sizes and "periodically delete memory files that haven't been
  accessed in a long time."[^anthropic-memory-tool]

## Example Where It Works

A coding agent maintains ~200 internal microservices and runs a nightly **dependency-upgrade
task** per service. Without a store, each run re-derives the same context: it re-reads the
service's architecture, re-summarizes its README and CI config, and re-discovers the test
command — thousands of tokens and several tool calls of "getting oriented" *before it does
any actual work*, repeated every night for every service.

With a reusable memory store, the first run writes a per-service artifact — architecture
summary, test command, known-flaky tests, prior upgrade decisions — into `/memories`. Every
subsequent night's run **reads that artifact** instead of rebuilding it, exactly the
progress-file pattern Anthropic documents ("saves Claude some tokens in every session since
it doesn't have to figure out how to test the code").[^anthropic-harnesses] Because the
orientation phase is pure re-derivation of stable facts, retrieving it rather than
regenerating it eliminates the large fixed per-run overhead — in the same class as the
**>90% token reduction** selective memory shows on repeated long-context work[^mem0-paper] —
and the store's cost is one cheap retrieval per run plus occasional refresh writes.

## Example Where It Would NOT Work

- **Low overlap between runs.** If every task is genuinely novel — one-off research
  questions, unique user requests with no shared sub-problems — there is nothing to reuse.
  The store adds retrieval latency and storage/ops burden on every run while almost never
  scoring a hit; you pay for infrastructure that returns cold. Below meaningful repetition,
  a stateless agent (plus ordinary within-run prompt/tool caching) is cheaper.

- **Fast-changing underlying data → stale artifacts.** The core risk is serving a stored
  artifact as if it were fresh when the world moved on: a cached architecture summary after a
  refactor, an extracted price after it changed, a "learned fact" that's now wrong. Deciding
  what to safely drop or refresh — **forgetting/consolidation — "remains a major open
  problem"**, and getting it wrong "can hurt answer quality, inflate storage costs, or leak
  stale context into new sessions."[^redis-ltm] For volatile data, per-artifact TTLs and
  event-based invalidation are mandatory (see *Tool Result Caching* and cache-invalidation
  discipline), and where correctness is safety-critical, re-derivation may simply be the right
  call.

- **The overhead exceeds the artifact.** If an artifact is cheap to regenerate (a one-line
  computation, a trivially re-fetched value), the embed-store-retrieve round-trip can cost
  more than just recomputing it — reuse only pays when the *derivation* is expensive relative
  to a lookup.[^mem0-cost]

[^anthropic-memory-tool]: Anthropic, "Memory tool," Claude Platform Docs — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^anthropic-harnesses]: Anthropic, "Effective harnesses for long-running agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
[^mem0-paper]: Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory," arXiv:2504.19413 — <https://arxiv.org/abs/2504.19413>
[^redis-ltm]: Redis, "Long-Term Memory Architectures for AI Agents" — <https://redis.io/blog/long-term-memory-architectures-ai-agents/>
[^mem0-cost]: Mem0, "How to Reduce LLM Token Costs for AI Agent Memory" — <https://mem0.ai/blog/6-techniques-to-cut-ai-agent-memory-cost-beyond-basic-retrieval>
[^mem0-ltm]: Mem0, "Long-Term Memory for AI Agents: The What, Why and How" — <https://mem0.ai/blog/long-term-memory-ai-agents>
