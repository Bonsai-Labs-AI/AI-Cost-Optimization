---
title: "Conversation Summarization"
category: prompt-context
maturityLevel: 3
maturityProvisional: false
shortDescription: "Replace a growing chat/agent transcript with a rolling summary once it crosses a token budget (compaction), so each turn re-sends a compact summary plus recent turns instead of the full history — capping the per-turn input cost that otherwise grows quadratically over a long session."
effort: Medium
gain: High
riskToQuality: Medium
detectionSignals:
  - "The full conversation transcript is re-sent to the model on every turn, so per-turn input tokens climb steadily with session length."
  - "Long agent runs or long-lived chats hit or approach the context-window limit."
  - "Total tokens billed for a session grow roughly with the square of its length (each of N turns re-processes the accumulated N-turn history)."
  - "No compaction trigger or summary step exists; history only ever grows (append-only) until it is truncated or errors out."
measurementMethods:
  - "Input tokens per turn plotted over a long session, before vs. after (flat/capped instead of rising)."
  - "Total tokens billed per session (sum across all turns), before vs. after."
  - "Compaction/summary trigger rate: how often the threshold fires per session."
  - "Task success / answer quality held at the eval bar after compaction (to catch dropped-detail regressions)."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/summary-caching"
  - "prompt-context/provider-native-context-management"
  - "prompt-context/context-pruning"
  - "prompt-context/context-offloading"
  - "agent-workflow/state-compression-for-agents"
sources:
  - id: anthropic-compaction
    title: "Compaction"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/compaction"
    accessed: "2026-07-03"
    kind: docs
    note: "Server-side compaction: default trigger 150,000 input tokens, minimum 50,000; summarizes older content into a compaction block and drops all blocks before it on subsequent requests; pause_after_compaction keeps recent messages verbatim; adds a separate compaction sampling step (billed in usage.iterations)."
  - id: anthropic-context-editing
    title: "Context editing"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/context-editing"
    accessed: "2026-07-03"
    kind: docs
    note: "Complementary server-side trimming: clear_tool_uses / clear_thinking with keep and trigger params; count_tokens preview shows e.g. 70,000 original → 25,000 after clearing (45,000 tokens saved)."
  - id: anthropic-context-engineering
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2026
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "Compaction 'distills the contents of a context window in a high-fidelity manner'; preserves architectural decisions/unresolved bugs while discarding redundant tool outputs; introduces 'context rot' — recall degrades as tokens grow; warns over-aggressive compression drops subtle-but-critical context."
  - id: bedrock-compaction
    title: "Compaction (Anthropic Claude Messages API)"
    publisher: "Amazon Bedrock User Guide"
    year: 2026
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html"
    accessed: "2026-07-03"
    kind: docs
    note: "Same compaction feature exposed on Bedrock via InvokeModel; default summarization prompt text; re-applying a previous compaction block incurs no additional compaction cost; cache_control can be placed on a compaction block."
  - id: langchain-summary-buffer
    title: "ConversationSummaryBufferMemory"
    publisher: "LangChain — Python Reference (langchain-classic)"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-classic/memory/summary_buffer/ConversationSummaryBufferMemory"
    accessed: "2026-07-03"
    kind: docs
    note: "DIY rolling summary: keeps recent interactions verbatim, compiles older ones into a running summary, uses token length (max_token_limit) to decide when to flush older turns into the summary."
  - id: langchain-summary
    title: "ConversationSummaryMemory"
    publisher: "LangChain — Python Reference (langchain-classic)"
    year: 2026
    url: "https://reference.langchain.com/python/langchain-classic/memory/summary/ConversationSummaryMemory"
    accessed: "2026-07-03"
    kind: docs
    note: "Continuously updates one running summary after each turn so token consumption does not grow proportionally with dialogue length."
  - id: llamaindex-summary-buffer
    title: "Chat Summary Memory Buffer"
    publisher: "LlamaIndex — Documentation"
    year: 2026
    url: "https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/"
    accessed: "2026-07-03"
    kind: docs
    note: "ChatSummaryMemoryBuffer stores the last messages that fit into a token_limit (example 40,000) and summarizes older chat history into a single message."
---

## Overview

Every turn of a stateless chat or agent API re-sends the **entire conversation so far**. The
model re-processes the full transcript on each call, so the input cost of a session does not
grow linearly with its length — it grows **quadratically**. A session of *N* turns re-processes
roughly turns `1..1`, then `1..2`, then `1..3`, …, `1..N`, which sums to on the order of `N²/2`
input-token-turns. Left unchecked, a long support chat or a multi-hour agent run spends most of
its budget re-encoding old context, and eventually slams into the context-window limit.[^anthropic-compaction][^anthropic-context-engineering]

**Conversation summarization** — the standard 2026 term is **compaction** — breaks that curve.
Once the accumulated history crosses a token budget, the older turns are replaced by a compact
**rolling summary**, while the most recent turns are kept **verbatim**. Each subsequent turn then
re-sends *summary + recent turns* instead of the full transcript, so the per-turn input size is
**capped** rather than ever-growing.[^anthropic-compaction][^langchain-summary-buffer]

Beyond cost, this also protects quality: Anthropic documents **"context rot"** — as the number of
tokens in the window rises, the model's ability to accurately recall any given fact *decreases*, so
a bloated transcript is both more expensive *and* less reliable than a well-compacted one.[^anthropic-context-engineering]
It sits at **Level 3** because doing it well is real engineering — choosing a trigger threshold,
deciding what to keep verbatim, tuning the summary prompt, and validating that no load-bearing
detail is lost — even though managed **provider-native compaction** now removes much of that lift.[^anthropic-compaction]

## Detailed Approach & Techniques

### The rolling-summary / compaction pattern

The core loop has three moving parts:

1. **A trigger threshold.** Track the running input-token count and fire compaction when it crosses
   a budget. Anthropic's server-side compaction defaults to a **150,000-token** trigger with a
   **50,000-token minimum** (a lower value returns an API error).[^anthropic-compaction] DIY memory
   classes use the same idea keyed on a `max_token_limit` / `token_limit`.[^langchain-summary-buffer][^llamaindex-summary-buffer]
2. **Summarize-older.** When triggered, an LLM call condenses the older portion of the transcript
   into a summary. Anthropic's default prompt asks the model to "write a summary of the transcript…
   to provide continuity… write down anything that would be helpful, including the state, next steps,
   learnings," wrapped in a `<summary>` block.[^bedrock-compaction] The summary then *replaces* the
   older turns — on Claude the API emits a `compaction` block and **drops all message blocks before
   it** on subsequent requests.[^anthropic-compaction]
3. **Keep-recent-verbatim.** The last few turns are preserved exactly, because they carry the
   live task state and the user's most recent intent. LangChain's `ConversationSummaryBufferMemory`
   keeps recent interactions in full and folds only the overflow into the summary;[^langchain-summary-buffer]
   Anthropic's `pause_after_compaction: true` pauses after the summary so you can re-append, say, the
   last three messages verbatim before continuing.[^anthropic-compaction]

### DIY vs. provider-native compaction

- **DIY (framework memory).** LangChain's `ConversationSummaryMemory` maintains a single running
  summary updated after each turn so token use "does not grow proportionally with dialogue length";
  `ConversationSummaryBufferMemory` adds the recent-verbatim buffer.[^langchain-summary][^langchain-summary-buffer]
  LlamaIndex's `ChatSummaryMemoryBuffer` keeps the last messages that fit a `token_limit` and
  summarizes the rest into one message.[^llamaindex-summary-buffer] You control the prompt and the
  keep/summarize split, but you own the trigger logic, the summary quality, and the extra call.
- **Provider-native.** Anthropic (and the same feature on Amazon Bedrock) offers **server-side
  compaction**: enable the `compact_20260112` edit and the API summarizes and prunes automatically,
  with no client-side summarization code — the recommended path for long-running conversations and
  agentic workflows.[^anthropic-compaction][^bedrock-compaction] A closely related lever is
  **context editing** (`clear_tool_uses` / `clear_thinking`), which trims stale tool outputs and
  thinking blocks rather than summarizing prose; its token-count preview shows, e.g., **70,000 → 25,000
  tokens (45,000 saved)** on an agent with heavy tool output.[^anthropic-context-editing] Compaction
  and context editing compose: clear the raw tool bloat, summarize the rest.

### Cost mechanism (and the honest overhead)

Compaction converts an **O(N²)** transcript-resend curve into a **capped** per-turn input size: once
the summary caps the history at, say, ~150k tokens of effective context, later turns stop re-paying
for the full linear-growing prefix.[^anthropic-compaction][^langchain-summary] The saving scales with
how long sessions run — short chats gain little, multi-hour agent runs gain a lot.

Be honest about the cost it *adds*: each compaction is a **separate sampling step** that reads the
whole current history and writes a summary, billed on top of the normal turn. Anthropic reports it in
`usage.iterations` (e.g. a compaction iteration of **180,000 input / 3,500 output tokens** alongside
the follow-on message iteration), and the top-level `input_tokens` deliberately **excludes** that
compaction usage — so cost tracking must sum across iterations.[^anthropic-compaction][^bedrock-compaction]
Re-applying an existing compaction block on later turns incurs **no additional** compaction cost, so
the amortized overhead is one summary call per threshold crossing, not per turn.[^bedrock-compaction]

### Quality risk and how to bound it

The failure mode is **lost detail**: a fact dropped during summarization that a later turn needs (a
constraint the user stated 40 turns ago, an unresolved bug, an ID). Anthropic warns that overly
aggressive compression can discard "subtle but critical context whose importance only becomes apparent
later," and recommends **tuning the summary prompt toward high recall first**, then trimming.[^anthropic-context-engineering]
Practical guards: keep enough recent turns verbatim; use custom `instructions` to force-preserve
load-bearing categories (IDs, decisions, open tasks); offload durable facts to an external store
before compacting; and gate changes on an eval suite so a regression in dropped-detail tasks is caught
before it ships.[^anthropic-compaction][^anthropic-context-engineering]

## Example Where It Works

A coding agent works a multi-hour task: it reads files, runs tools, reasons, and accumulates
transcript on every step. Without compaction, step 200 re-sends everything from steps 1–199, the
per-step input climbs past 150k tokens, and the run eventually hits the context limit — while the
last third of the run spends most of its budget re-encoding early tool output that no longer matters.

With **server-side compaction** enabled, the moment input crosses the 150k-token trigger the API
distills the history into a summary that "preserves architectural decisions, unresolved bugs, and
implementation details while discarding redundant tool outputs," drops the pre-summary blocks, and
keeps the recent steps verbatim.[^anthropic-compaction][^anthropic-context-engineering] Per-step input
is now **capped near the trigger** instead of climbing toward the limit, so the quadratic tail of the
run flattens — the run both **costs less and stays coherent** (dodging context rot), at the price of
one extra summary call each time the threshold fires.[^anthropic-context-engineering] Pairing it with
context editing to clear stale tool results first compounds the win (the 70k→25k preview shows how much
raw tool bloat there is to shed before summarizing).[^anthropic-context-editing]

## Example Where It Would NOT Work

- **Short sessions.** A two- or three-turn Q&A never approaches the trigger; the quadratic tail never
  develops. Compaction adds a summary call and lost-detail risk for a saving that rounds to zero — the
  minimum sensible trigger is already **50,000 tokens** for a reason.[^anthropic-compaction]
- **Every detail is load-bearing.** A legal, medical, or financial dialogue where a paraphrased summary
  could silently drop an exact figure, clause, or identifier is a poor fit — the recall risk Anthropic
  flags is unacceptable there.[^anthropic-context-engineering] Prefer keeping more verbatim, offloading
  facts to an external store, or (for the stable prefix) prompt caching, which cuts the *cost* of
  re-sending history **without altering** what the model sees.
- **A stable, cacheable prefix does the job more cheaply.** If the growth is a fixed, unchanging prefix
  (system prompt, tools, a document) rather than genuinely new per-turn content, prompt/prefix caching
  already discounts the resend at near-zero risk; summarizing it throws away detail for a cost win you
  could have gotten losslessly. Note compaction and caching are in mild tension — triggering a
  compaction can cause a **cache miss** on the next request.[^bedrock-compaction]
- **Wrong provider/model.** Server-side compaction is a beta on specific models (Claude Sonnet/Opus 4.6+
  and newer) behind the `compact-2026-01-12` header; on other stacks you must build the DIY rolling
  summary yourself, and the effort/quality tradeoff shifts.[^anthropic-compaction][^bedrock-compaction]

[^anthropic-compaction]: Anthropic, "Compaction," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/compaction>
[^anthropic-context-editing]: Anthropic, "Context editing," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/context-editing>
[^anthropic-context-engineering]: Anthropic, "Effective context engineering for AI agents," Engineering Blog — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^bedrock-compaction]: Amazon Bedrock User Guide, "Compaction (Anthropic Claude Messages API)" — <https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html>
[^langchain-summary-buffer]: LangChain, "ConversationSummaryBufferMemory," Python Reference — <https://reference.langchain.com/python/langchain-classic/memory/summary_buffer/ConversationSummaryBufferMemory>
[^langchain-summary]: LangChain, "ConversationSummaryMemory," Python Reference — <https://reference.langchain.com/python/langchain-classic/memory/summary/ConversationSummaryMemory>
[^llamaindex-summary-buffer]: LlamaIndex, "Chat Summary Memory Buffer," Documentation — <https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/>
