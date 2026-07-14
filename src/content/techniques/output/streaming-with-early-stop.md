---
title: "Streaming With Early Stop"
category: output
maturityLevel: 2
maturityProvisional: false
shortDescription: "Stream the response and halt generation the moment the useful content is produced — via stop sequences or client-side cancellation — so you stop paying for output tokens after the answer is complete."
effort: Medium
gain: Low
riskToQuality: Low
detectionSignals:
  - "Full generations always run to max_tokens (or a natural end) and are truncated client-side after the useful part."
  - "No stop_sequences configured on tasks with a clear, parseable answer boundary."
  - "The model reliably emits trailing boilerplate — justifications, closing remarks, extra list items — that the client ignores."
  - "A structured/JSON object is complete well before the model keeps 'explaining' it."
measurementMethods:
  - "Output tokens per request before vs. after (from the usage object)."
  - "Distribution of stop_reason values (stop_sequence vs. end_turn vs. max_tokens)."
  - "Tokens generated after the answer boundary — the tail you eliminated."
  - "Time-to-last-useful-token (a latency/UX co-metric)."
status: published
lastUpdated: "2026-07-02"
related:
  - "output/output-length-control"
  - "output/max-token-policies"
  - "model-routing/reasoning-token-budgeting"
  - "output/structured-outputs"
sources:
  - id: openai-stop-help
    title: "How do I use stop sequences in the OpenAI API?"
    publisher: "OpenAI Help Center"
    year: 2026
    url: "https://help.openai.com/en/articles/5072263-how-do-i-use-stop-sequences"
    accessed: "2026-07-02"
    kind: docs
    note: "Stop sequences make the model stop generating at a desired point; up to four per request; the stop sequence itself is not included in the output."
  - id: openai-prod
    title: "Production best practices"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/production-best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "Cost is a function of tokens; lower max_tokens and use stop sequences to prevent generating unneeded tokens. You are billed for generated tokens. Streaming reduces time-to-first-token, not total generation time."
  - id: openai-reasoning
    title: "Reasoning models"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning"
    accessed: "2026-07-02"
    kind: docs
    note: "Reasoning tokens are billed as output tokens, are not visible via the API, and are generated before visible output. max_output_tokens covers reasoning + visible output; a request can exhaust the budget during reasoning and return no visible text."
  - id: anthropic-stream
    title: "Streaming messages"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/streaming"
    accessed: "2026-07-02"
    kind: docs
    note: "Set stream:true for SSE deltas. Two equivalent ways to cancel: break the async iterator or call stream.controller.abort(); after cancel, stream.aborted is true. stop_reason and token usage arrive in the message_delta event."
  - id: anthropic-stop
    title: "Stop reasons and fallback"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons"
    accessed: "2026-07-02"
    kind: docs
    note: "stop_sequences halt generation server-side; response returns stop_reason='stop_sequence' and the stop_sequence that fired. The sequence is not included in the output. In streaming, stop_reason appears in message_delta."
  - id: openai-close-thread
    title: "API Billing for streaming if I close connection midway"
    publisher: "OpenAI Developer Community"
    year: 2024
    url: "https://community.openai.com/t/api-billing-for-streaming-if-i-close-connection-midway/624323"
    accessed: "2026-07-02"
    kind: other
    note: "Community consensus: terminating the connection ends generation, so you are charged only for tokens generated up to that point (plus a few in transit). Requires the connection to actually be cancelled."
  - id: gemini-disconnect
    title: "Do I get charged for generated tokens if the client disconnects during a Vertex AI streaming response?"
    publisher: "Google AI Developers Forum"
    year: 2025
    url: "https://discuss.ai.google.dev/t/do-i-get-charged-for-generated-tokens-if-client-disconnects-during-a-vertex-ai-streaming-response/89490"
    accessed: "2026-07-02"
    kind: other
    note: "You are charged for all tokens the model had already generated, regardless of client disconnection/timeout/cancellation — billing is on tokens produced, not tokens delivered."
---

## Overview

Output tokens are the expensive half of most LLM bills — typically **several times the
price of input tokens** — and a model will often keep generating well past the point
where the *useful* answer is done: a justification the caller never reads, a closing
paragraph, extra list items, or prose "explaining" a JSON object that was already
complete. Every one of those trailing tokens is billed.[^openai-prod]

**Streaming with early stop** combines two mechanisms to cut that tail:

1. **Stream** the response so tokens arrive incrementally as they are produced (SSE),
   which also lets the client watch for the point where it has "enough."[^anthropic-stream]
2. **Stop generation** as soon as the needed content exists — either by giving the
   model a **stop sequence** that ends generation server-side at a known boundary, or
   by **cancelling** the stream client-side once a parser has what it needs.[^openai-stop-help][^anthropic-stream]

The honest framing up front: this is primarily a **latency and UX** technique with a
**cost side-benefit**. Streaming itself does not reduce the number of tokens generated
or their price — it reduces time-to-first-token but "does not change the time to get all
the tokens."[^openai-prod] The *cost* savings come entirely from the **stop**: tokens
you never generate. That tail is real but usually modest, which is why this sits at
**Level 2** with a **Low** cost gain — a deliberate, measured trim, not an order-of-magnitude cut.

## Detailed Approach & Techniques

### Mechanism 1 — Stop sequences (server-side, the clean win)

A **stop sequence** is a string that tells the model to halt generation the instant it
would emit it. OpenAI accepts **up to four** stop sequences per request, and the stop
string itself is **not included** in the returned text.[^openai-stop-help] Anthropic's
Messages API takes `stop_sequences` and, when one fires, returns
`stop_reason: "stop_sequence"` plus the `stop_sequence` value that triggered it, so you
can tell *why* it stopped.[^anthropic-stop]

Because the stop happens **on the server**, the tokens after the boundary are **never
generated and never billed** — this is the cleanest form of early stop. Typical uses:

- **Answer-then-stop-before-justification.** Prompt the model to emit the answer,
  then a sentinel like `\n###END`, then (in theory) its reasoning. Set
  `stop: ["###END"]` and you pay for the answer only — the justification is never
  produced.
- **Structured/delimited generation.** Stop at a closing delimiter (`</result>`, a
  fenced-block terminator) once the object is complete, so the model can't ramble past
  it.
- **List/enumeration caps.** OpenAI's own guidance shows stopping at `"11."` to bound a
  ten-item list.[^openai-prod]

OpenAI's production guidance lists stop sequences alongside lowering `max_tokens` as the
two direct ways to "prevent generating unneeded tokens."[^openai-prod]

### Mechanism 2 — Client-side cancellation (abort the stream)

When the boundary isn't a fixed string — e.g. a **parser** consuming the stream decides
it has a complete, valid object — you **cancel** the request. Anthropic's SDKs give two
equivalent ways: **break out of the async iterator**, or call
`stream.controller.abort()` (which can fire from outside the loop, e.g. a timeout);
afterward `stream.aborted` is `true`.[^anthropic-stream]

**Critically: does cancelling actually stop the bill?** The answer is *provider- and
implementation-dependent*, and this is the trap.

- On **OpenAI**, terminating the connection ends generation, so you are billed only for
  tokens generated **up to the cancel** (plus a handful already in transit) — but
  *only if the connection is genuinely torn down*. A stream that keeps a socket open
  after you "stop" reading keeps generating and keeps billing.[^openai-close-thread]
- On **Google Vertex/Gemini**, the stated behavior is the opposite tail-risk: you are
  charged for **all tokens the model had already generated**, regardless of client
  disconnect, timeout, or cancellation — billing is on tokens *produced*, not tokens
  *delivered*.[^gemini-disconnect]

The general rule across providers: **you are billed for what was generated, not for
what you received.**[^openai-prod][^gemini-disconnect] So client-side cancel only saves
money to the extent it actually stops *generation* — which a **server-side stop
sequence guarantees and a client abort does not**. Prefer stop sequences when a fixed
boundary exists; treat client cancel as a best-effort trim (and always confirm the
underlying request is cancelled, not just the local read).[^openai-close-thread]

### The reasoning-model caveat (where early stop has almost no leverage)

On reasoning models (OpenAI o-series / GPT-5.x thinking, Claude extended thinking,
Gemini thinking), the bulk of output-token spend is often the **hidden reasoning
tokens**. These are **billed as output tokens**, are **not visible via the API**, and
are generated **before** any visible answer streams.[^openai-reasoning] Early-stopping
the *visible* stream therefore trims a tail that has already been paid for behind it —
the reasoning is spent. Worse, on OpenAI a reasoning request can burn its entire
`max_output_tokens` budget **during reasoning** and return **no visible output at
all**, still billing you for the reasoning.[^openai-reasoning] For reasoning models the
right lever is **reasoning/thinking-token budgeting** (effort levels, thinking budgets),
not output early-stop. Early stop applies cleanly to **non-reasoning** generation.

### Where it fits with sibling techniques

Early stop is the *dynamic* cousin of two static controls: **`max_tokens` policies**
(a hard ceiling on the whole output) and **output-length-control** (asking for brevity
in the prompt). Stop sequences complement both — `max_tokens` caps the worst case,
while a stop sequence ends at the *semantic* boundary, usually well before the cap.
**Structured outputs** make the boundary crisp: a schema-constrained object has an
unambiguous end a parser can cancel on.

## Example Where It Works

A support-triage service asks a non-reasoning model to classify a ticket and emit a
short structured verdict, but the model habitually appends a 2–3 sentence justification
the pipeline discards.

- **Prompt shape:** `{"category": "...", "priority": "..."}` followed by a rationale.
- **Without early stop:** the model emits ~40 tokens of JSON **plus ~120 tokens** of
  unused justification — ~160 output tokens/ticket. At 2M tickets/month and \$10/M
  output tokens, that's ~\$3,200/month, of which **~\$2,400 is the ignored tail.**
- **With a stop sequence:** instruct the model to emit the JSON, then `\n---`, then the
  rationale, and set `stop_sequences: ["\n---"]`. Generation halts server-side right
  after the JSON.[^openai-stop-help][^anthropic-stop] Output drops to ~40 tokens/ticket
  → ~\$800/month, a **~75% cut on this endpoint's output cost**, with lower latency as a
  bonus. Because the stop is server-side, the savings are guaranteed, not best-effort.

The fit is ideal here: a **deterministic answer boundary**, a **non-reasoning** model,
and a **verbose tail** that dominates output.

## Example Where It Would NOT Work

- **Reasoning model, short visible answer.** A GPT-5-thinking request spends thousands
  of hidden reasoning tokens (billed as output) and streams a 30-token answer.
  Early-stopping the visible stream saves ~0 — the expensive reasoning was generated
  first and is already billed.[^openai-reasoning] The lever is reasoning-token
  budgeting, not early stop.
- **Cancellation on a provider that bills produced tokens.** On Gemini/Vertex, aborting
  the client stream does **not** avoid the charge — you pay for everything the model had
  already generated.[^gemini-disconnect] Client-side "early stop" here is a UX win with
  **no cost benefit**; only a server-side stop sequence saves money.
- **Genuinely long-form output that is all wanted.** An article or a full report has no
  early boundary to cut — there's no useless tail, so there's nothing to stop early.
  Reach for output-length-control or template-plus-fill instead.
- **Open-ended chat with no parseable boundary.** When you can't define a stop string
  and can't tell programmatically that you have "enough," a client abort is guesswork
  that risks truncating a real answer for a few tokens of savings — the risk isn't worth
  it. Streaming still helps *latency*, but not cost.[^openai-prod]

[^openai-stop-help]: OpenAI Help Center, "How do I use stop sequences in the OpenAI API?" — <https://help.openai.com/en/articles/5072263-how-do-i-use-stop-sequences>
[^openai-prod]: OpenAI API Docs, "Production best practices" — <https://developers.openai.com/api/docs/guides/production-best-practices>
[^openai-reasoning]: OpenAI API Docs, "Reasoning models" — <https://developers.openai.com/api/docs/guides/reasoning>
[^anthropic-stream]: Anthropic, "Streaming messages," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/streaming>
[^anthropic-stop]: Anthropic, "Stop reasons and fallback," Claude Platform Docs — <https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons>
[^openai-close-thread]: OpenAI Developer Community, "API Billing for streaming if I close connection midway" — <https://community.openai.com/t/api-billing-for-streaming-if-i-close-connection-midway/624323>
[^gemini-disconnect]: Google AI Developers Forum, "Do I get charged for generated tokens if the client disconnects during a Vertex AI streaming response?" — <https://discuss.ai.google.dev/t/do-i-get-charged-for-generated-tokens-if-client-disconnects-during-a-vertex-ai-streaming-response/89490>
