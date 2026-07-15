---
title: "Few-Shot Example Selection & Pruning"
category: prompt-context
maturityLevel: 2
maturityProvisional: false
shortDescription: "Cut the in-context example set to the minimum that holds quality, then — for diverse input distributions — switch to per-request retrieval of only the relevant shots. Both moves reduce the example tokens billed on every call."
effort: Medium
gain: Medium
riskToQuality: Medium
effortWhy: "Static pruning needs an eval set to ablate against; dynamic selection adds an embedded example bank and a vector search per request. The pruning step is cheap once you can measure quality; the dynamic step is modest engineering on top of an existing retrieval stack."
gainWhy: "Removes fixed input tokens from every call — modest per call, but compounds at volume and stacks with caching. Dynamic selection can raise accuracy while cutting, if the query distribution is diverse."
riskWhy: "Over-pruning can silently drop accuracy on rare/edge classes; dynamic selection can surface unhelpful neighbours and breaks prefix-cache discounts. An eval gate keeps risk manageable."
detectionSignals:
  - "A long, static block of 10+ few-shot examples that was set once and never revisited."
  - "Many-shot example blocks sent to a reasoning/instruction-following model (o-series, GPT-5.x, Claude 4.x)."
  - "Examples that merely restate what the instructions or the output schema already specify."
  - "Few-shot examples dominate the input token count while the actual user input is short."
  - "The same large static example block is pasted on every call regardless of the input topic or type."
  - "A big few-shot token cost sits on top of a diverse input distribution where most examples are irrelevant to any given query."
  - "No evaluation ever ran to justify how many examples are included or which ones."
measurementMethods:
  - "Input tokens per call before vs. after pruning or dynamic selection (the example block delta is pure savings)."
  - "Task quality on a held-out eval suite at each example count (ablation curve) — confirm quality holds at the bar."
  - "Per-class / edge-case accuracy, not just aggregate score, to catch rare-case regressions from over-pruning."
  - "Task accuracy at the quality bar with dynamic selection vs. the fixed block and vs. random examples."
  - "Retrieval overhead per request (embedding + vector-search cost and added latency) for the dynamic path."
  - "Prefix-cache hit rate before vs. after moving to dynamic selection (expect it to drop for the example region)."
status: published
lastUpdated: "2026-07-14"
related:
  - "prompt-context/prompt-cleanup"
  - "prompt-context/context-window-budgeting"
  - "prompt-context/learned-prompt-compression"
  - "prompt-context/automated-prompt-optimization"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/rag-pipeline-caching"
sources:
  - id: openai-reasoning
    title: "Reasoning best practices"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/reasoning-best-practices"
    accessed: "2026-07-02"
    kind: docs
    note: "\"Reasoning models often don't need few-shot examples to produce good results, so try to write prompts without examples first.\" Few-shot is a fallback for complex output requirements; misaligned examples can degrade results."
  - id: anthropic-multishot
    title: "Prompting best practices (multishot / examples)"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/multishot-prompting"
    accessed: "2026-07-02"
    kind: docs
    note: "\"Include 3–5 examples for best results.\" Examples should be relevant, diverse (cover edge cases without teaching unintended patterns), and wrapped in <example>/<examples> tags."
  - id: openai-prompt-guidance
    title: "Prompt guidance"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-guidance"
    accessed: "2026-07-02"
    kind: docs
    note: "OpenAI's eval-driven prompt guidance: start from a prompt/tool set that works, then remove one group of instructions, examples, or tools at a time and rerun the same evals — the subtractive, eval-driven principle behind empirical pruning."
  - id: manyshot-icl
    title: "Many-Shot In-Context Learning"
    publisher: "arXiv:2404.11018 (NeurIPS 2024)"
    authors: "Agarwal, Singh, Zhang, et al."
    year: 2024
    url: "https://arxiv.org/abs/2404.11018"
    accessed: "2026-07-02"
    kind: paper
    note: "Scaling from few-shot to hundreds/thousands of examples gives significant gains on hard generative/discriminative tasks and can override pretraining biases — the counter-case where MORE examples earn their tokens. Inference cost grows linearly in shots."
  - id: deepmind-manyshot
    title: "Many-Shot In-Context Learning (publication page)"
    publisher: "Google DeepMind"
    year: 2024
    url: "https://deepmind.google/research/publications/88349/"
    accessed: "2026-07-02"
    kind: paper
    note: "Publisher landing page for the many-shot ICL work; harder tasks benefit most from many examples."
  - id: kate
    title: "What Makes Good In-Context Examples for GPT-3?"
    publisher: "arXiv (DeeLIO 2022)"
    authors: "Liu, Shen, Zhang, Dolan, Carin, Chen"
    year: 2021
    url: "https://ar5iv.labs.arxiv.org/html/2101.06804"
    accessed: "2026-07-03"
    kind: paper
    note: "KATE (kNN-augmented in-context example selection): embed each test input, retrieve k nearest training examples by embedding similarity. Beats random selection by +5.5% on IMDB sentiment (3 shots), +10.4 PARENT on ToTTo table-to-text (2 shots), +13.0% on Natural Questions."
  - id: dice
    title: "DICE: Dynamic In-Context Example Selection in LLM Agents via Efficient Knowledge Transfer"
    publisher: "arXiv"
    authors: "Wang, Wu, Xia, Yu, Rossi, McAuley, Yao"
    year: 2025
    url: "https://arxiv.org/abs/2507.23554"
    accessed: "2026-07-03"
    kind: paper
    note: "Per-input dynamic example selection for LLM agents; selecting only relevant demonstrations per input reduces token consumption vs. uniform static example sets."
  - id: langchain-selector
    title: "SemanticSimilarityExampleSelector (langchain_core.example_selectors.semantic_similarity)"
    publisher: "LangChain — GitHub source"
    year: 2026
    url: "https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/example_selectors/semantic_similarity.py"
    accessed: "2026-07-03"
    kind: repo
    note: "Selects examples whose embeddings have the greatest cosine similarity to the inputs via a vectorstore similarity_search; default k = 4. Same file also defines MaxMarginalRelevanceExampleSelector (relevance + diversity re-rank)."
  - id: dspy-knn
    title: "KNNFewShot optimizer"
    publisher: "DSPy Documentation"
    year: 2026
    url: "https://dspy.ai/api/optimizers/KNNFewShot/"
    accessed: "2026-07-03"
    kind: docs
    note: "In-memory KNN retriever finds the k nearest neighbours in the trainset at test time and attaches them as demonstrations per input; feeds them into BootstrapFewShot."
  - id: learnprompting-knn
    title: "K-Nearest Neighbor (KNN) Prompting"
    publisher: "Learn Prompting"
    year: 2026
    url: "https://learnprompting.org/docs/advanced/few_shot/k_nearest_neighbor_knn"
    accessed: "2026-07-03"
    kind: docs
    note: "Selects the k examples from an external dataset most similar to the prompt; notes the drawback that similarity over a large dataset adds computational/retrieval overhead and that choosing k is non-trivial."
  - id: openai-embed-price
    title: "text-embedding-3-small"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/models/text-embedding-3-small"
    accessed: "2026-07-03"
    kind: pricing
    note: "text-embedding-3-small is $0.02 per 1M tokens — the query-embedding overhead of dynamic selection is negligible next to generation-model input pricing."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Cache hits require an exact prefix match; static content (instructions, examples) should go first and variable content last. A per-request-varying example block breaks the prefix cache for everything after it."
---

## Overview

Few-shot (or *multishot*) prompting — pasting worked input→output examples into the
prompt — is one of the most reliable ways to steer an LLM's format, tone, and
accuracy.[^anthropic-multishot] But every example is **input tokens that are re-billed on
every single call**. A block of a dozen examples can quietly become the largest,
most-repeated line item in a prompt, paid tens of thousands of times a day while the
actual user input is a single short sentence.

This technique covers two complementary moves that, taken together, get the example block
to its cost-effective minimum:

1. **Static pruning (first).** Audit the existing example set against an evaluation suite
   and cut it down to the minimum that holds quality — trimming redundant examples,
   shortening verbose ones, and (increasingly) dropping the block entirely when instructions
   plus a schema already do the job.
2. **Dynamic selection (next, for diverse distributions).** Replace the surviving fixed
   block with a per-request retrieval step: embed the incoming input, search a curated
   example bank for the *k* most similar examples, and inject only those. The research
   baseline — KATE ("kNN-augmented in-context example selection") — showed that retrieving
   nearest-neighbour examples beats a generic random set by a wide margin using *fewer*
   shots: +5.5% on IMDB sentiment with just 3 examples, +10.4 PARENT on ToTTo
   table-to-text with 2, and +13.0% on Natural Questions.[^kate]

Both moves reduce the example tokens billed per call. Static pruning is the cheap,
low-infrastructure first step; dynamic selection is the engineering investment for when a
single pruned static set can't serve a highly diverse query distribution.

The reason this sits at **Level 2** rather than being a trivial cleanup is the **2026 shift
in what models need**. Instruction-following and reasoning models are far better at following
a written spec than the GPT-3.5-era models whose prompts most teams inherited. OpenAI's
guidance for reasoning models is now explicit: *"Reasoning models often don't need few-shot
examples to produce good results, so try to write prompts without examples first."*[^openai-reasoning]
Worse, for reasoning-heavy tasks, examples can *actively hurt* by biasing the model toward
the surface pattern of the demonstrations instead of letting it reason.[^openai-reasoning]
Many prompts are still carrying a large few-shot block that predates the current model and
now costs tokens for zero — or negative — benefit.

## Detailed Approach & Techniques

### Step 1 — Static pruning

#### Start from the model, not the prompt

The first question is which regime you are in:

- **Reasoning / strong instruction-followers** (OpenAI o-series and GPT-5.x reasoning,
  Claude Opus/Sonnet 4.x with thinking). Default to **zero-shot**: write the instructions
  and the output schema, run the eval, and add examples only if a *measured* failure mode
  appears.[^openai-reasoning] This mirrors OpenAI's own eval-driven prompt guidance: start
  from a prompt and tool set that already works, then **remove** one group of instructions,
  examples, or tools at a time and rerun the same evals to find what actually earns its
  place.[^openai-prompt-guidance]
- **Classic completion / lighter models.** Examples still pull real weight here, but
  Anthropic's own guidance caps the useful count low: **"Include 3–5 examples for best
  results."**[^anthropic-multishot] If a prompt has 15 examples, that is a strong prior
  that 10+ of them are redundant.

#### Prune empirically against an eval set

Pruning "by feel" is how quality silently regresses. Do it as a measured experiment:

1. **Baseline.** Run the current prompt with all N examples against the eval set; record
   aggregate quality **and per-class / edge-case accuracy** and input tokens/call.
2. **Ablate.** Remove examples one at a time (or in halves — bisect for speed) and
   re-score. An example whose removal doesn't move the metric is not earning its tokens.
3. **Try zero.** Explicitly test the no-example prompt. On modern models it frequently ties
   the few-shot version — converting the entire block to savings.
4. **Keep the survivors.** Retain the smallest set that holds quality at the bar, biasing
   toward examples that cover **rare/edge classes** the instructions can't easily describe.
5. **Re-check per-class metrics**, not just the average — over-pruning shows up as a cliff
   on the tail classes long before it dents the headline score.

#### Shorten, don't just delete

Beyond dropping whole examples, compress the ones you keep: trim examples to the minimal
input needed to demonstrate the pattern, strip prose commentary that repeats the
instructions, and remove examples that merely re-teach the output schema. Wrapping survivors
in `<example>`/`<examples>` tags keeps them parseable and lets the model distinguish them
from instructions.[^anthropic-multishot]

#### Where few-shots still earn their tokens

Pruning is not "always remove examples." Keep them where they demonstrably pay:

- **Format-locking.** When you need an exact, hard-to-describe output shape, one or two
  examples are cheaper and more reliable than a paragraph of formatting rules.[^anthropic-multishot]
- **Rare / edge classes.** A demonstration of the unusual case (an empty result, a refusal,
  an ambiguous input) teaches behavior that is awkward to specify in prose.
- **Style / voice transfer.** Matching a specific tone is often learned faster from examples
  than described.[^anthropic-multishot]
- **The many-shot counter-case.** For genuinely hard tasks, scaling *up* to hundreds or
  thousands of examples can beat few-shot and even rival fine-tuning, and can override
  pretraining biases.[^manyshot-icl][^deepmind-manyshot] If your task is in that regime, the
  right move may be *more* examples plus **prompt caching** to make the fixed block cheap —
  not pruning. Note that inference cost grows linearly with shots,[^manyshot-icl] so many-shot
  is a deliberate quality-for-cost trade, not a default.

### Step 2 — Dynamic selection (for diverse distributions)

After pruning, if different queries genuinely need different examples — i.e. a single
minimal static set can't cover the input distribution without being padded back up — the
next move is to replace the fixed block with a per-request retrieval system.

#### The core mechanism (kNN over an example bank)

1. **Curate an example bank.** Assemble a pool of high-quality `(input → output)` pairs.
   This is the durable asset — the quality and coverage of the bank set the ceiling on
   selection quality.
2. **Embed the bank offline.** Encode every example's *input* with a sentence embedder and
   store the vectors (with the full example as payload) in a vector index.
3. **At request time, embed the query** and retrieve the top-*k* nearest examples by cosine
   similarity.[^kate][^langchain-selector]
4. **Inject only those *k* examples** into the prompt, then the user input.

KATE formalises this exactly: "for each test source *x*, we retrieve its nearest *k*
neighbours from the training set according to distances in the sentence encoder's embedding
space," using an encoder such as RoBERTa; fine-tuning the retriever on task data improves
it further.[^kate]

#### Framework implementations

You rarely build this from scratch:

- **LangChain — `SemanticSimilarityExampleSelector`.** Backs the example bank with a vector
  store and, on each call, returns the examples with the greatest cosine similarity to the
  input. Default **k = 4**. A sibling `MaxMarginalRelevanceExampleSelector` re-ranks for
  *diversity* as well as relevance, so the k shots aren't near-duplicates.[^langchain-selector]
- **DSPy — `KNNFewShot`.** An in-memory kNN retriever finds the k nearest neighbours in the
  trainset at test time and feeds them through `BootstrapFewShot`. Useful precisely "when
  the relevance of examples varies significantly depending on the input."[^dspy-knn]
- **Agentic settings.** DICE extends per-input selection to LLM *agents*, choosing only
  relevant demonstrations per step and cutting token consumption versus a uniform static
  example set carried on every call.[^dice]

#### Costs and the caching caveat

- **Retrieval + embedding overhead.** Each request adds one embedding call plus a vector
  search. The embedding cost is negligible — `text-embedding-3-small` is **$0.02 /
  1M tokens**[^openai-embed-price] — but the vector search adds latency, so an ANN index
  (not brute force) matters at scale.[^learnprompting-knn]
- **Bank curation and maintenance.** The example bank must be assembled, labelled, embedded,
  and kept fresh as the task drifts — ongoing work a static block doesn't need.
- **Choosing k is a tuning problem.** Too few shots and you lose coverage; too many and
  you're back to the padded-block cost.[^learnprompting-knn]
- **It breaks prefix caching — the big one.** Prompt caching only pays off on an **exact,
  stable prefix**; static content must go first and variable content last, or the cache
  misses.[^openai-pc-docs] A per-request example set makes the example region *vary every
  call*, so everything after the first divergence point stops hitting the cache. If your
  fixed few-shot block was previously cached at a deep discount (e.g. Anthropic's 0.1×
  reads), dynamic selection trades a **cheap, cached large block** for an **uncached small
  block** — sometimes a wash. Mitigation: keep the truly-static instructions/tools *before*
  the dynamic examples so at least that region still caches (see *Prompt Caching / Prefix
  Caching*), and cache query embeddings to avoid re-embedding repeated inputs (see
  *Embedding Caching*).

## Example Where It Works

**Static pruning:** A support-ticket classifier was migrated from an older completion model
to a current reasoning model but kept its original prompt with **14 few-shot examples**
(~2,600 tokens) on each of ~400,000 tickets/day. Running the existing eval suite, the team
finds the reasoning model scores within noise on a zero-shot prompt (clear label definitions
+ a JSON schema) versus the 14-shot prompt — except two rare labels ("legal escalation",
"data-deletion request") that drop a few points without a demonstration. They keep **2
examples** for those edge classes and delete the other 12.

The static block goes from ~2,600 to ~450 tokens — roughly **2,150 tokens removed from
every one of ~400,000 calls/day**. Aggregate quality holds; tail-class accuracy is protected
by the two retained examples. Low risk precisely *because* the eval gated the change.

**Dynamic selection:** The same support pipeline later expands to 40 intent categories across
a much more diverse input distribution. The team's fixed 2-example block can no longer cover
the variety, so they stand up dynamic selection: embed each ticket, retrieve the **4** most
similar labelled tickets from a bank of several thousand, and inject only those (~600 tokens).
In line with KATE, the targeted neighbours typically *raise* accuracy over a generic static
block — retrieving near-neighbours beat random selection by +5.5% to +13% across KATE's
tasks.[^kate][^dice] The overhead — one `text-embedding-3-small` call (~$0.02/1M tokens) plus a
vector lookup — is negligible against the input-token saving.[^openai-embed-price]

## Example Where It Would NOT Work

- **No eval, high stakes.** Pruning a medical-coding or legal-classification prompt without
  a held-out eval that measures **per-class** accuracy is how you ship a silent regression
  on exactly the rare cases few-shots were protecting. Without the measurement gate, don't
  prune.
- **Genuinely hard tasks in the many-shot regime.** For difficult reasoning or
  distribution-shifted tasks, performance can keep climbing past a handful of examples —
  sometimes into the hundreds, even overriding pretraining biases.[^manyshot-icl][^deepmind-manyshot]
  Aggressively cutting to 3–5 here trades away real accuracy; the correct lever is caching
  the large block, not pruning it.
- **A small, uniform task with a well-cached block.** If three or four examples already
  cover the whole input distribution and that block is pinned into a prefix cache at a
  0.1×–0.5× discount, dynamic selection adds retrieval complexity and *loses* the cache
  discount for what was already a cheap, tiny block.[^openai-pc-docs] Static pruning
  captures any remaining win with none of the machinery.
- **No good example bank.** Dynamic selection quality is bounded by bank quality; with only
  a handful of examples, or noisy/mislabelled ones, kNN just retrieves the least-bad
  neighbour and accuracy can fall below a carefully hand-curated fixed set.[^kate]
- **Tiny, already-minimal prompts.** If a prompt has one format-locking example on a short
  input, savings are negligible and the risk of breaking output structure outweighs it —
  spend the effort elsewhere (e.g. *context-window-budgeting* on the retrieved-document
  side, which usually dwarfs the example block).
- **Ultra-low latency / low volume.** The added embedding + vector-search hop costs
  milliseconds and engineering; on low-volume endpoints the token savings never repay the
  standing retrieval system, and similarity search over a large bank is itself
  non-trivial.[^learnprompting-knn]

[^openai-reasoning]: OpenAI API Docs, "Reasoning best practices" — <https://developers.openai.com/api/docs/guides/reasoning-best-practices>
[^anthropic-multishot]: Anthropic, "Prompting best practices" (multishot / examples), Claude API Docs — <https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/multishot-prompting>
[^openai-prompt-guidance]: OpenAI API Docs, "Prompt guidance" — <https://developers.openai.com/api/docs/guides/prompt-guidance>
[^manyshot-icl]: Agarwal, Singh, Zhang, et al., "Many-Shot In-Context Learning," arXiv:2404.11018 (NeurIPS 2024) — <https://arxiv.org/abs/2404.11018>
[^deepmind-manyshot]: Google DeepMind, "Many-Shot In-Context Learning" (publication page) — <https://deepmind.google/research/publications/88349/>
[^kate]: Liu et al., "What Makes Good In-Context Examples for GPT-3?" (KATE), 2021 — <https://ar5iv.labs.arxiv.org/html/2101.06804>
[^dice]: Wang et al., "DICE: Dynamic In-Context Example Selection in LLM Agents via Efficient Knowledge Transfer," 2025 — <https://arxiv.org/abs/2507.23554>
[^langchain-selector]: LangChain, "SemanticSimilarityExampleSelector" (source) — <https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/example_selectors/semantic_similarity.py>
[^dspy-knn]: DSPy Documentation, "KNNFewShot optimizer" — <https://dspy.ai/api/optimizers/KNNFewShot/>
[^learnprompting-knn]: Learn Prompting, "K-Nearest Neighbor (KNN) Prompting" — <https://learnprompting.org/docs/advanced/few_shot/k_nearest_neighbor_knn>
[^openai-embed-price]: OpenAI API Docs, "text-embedding-3-small" — <https://developers.openai.com/api/docs/models/text-embedding-3-small>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
