---
title: "Dynamic Few-Shot Selection"
category: prompt-context
maturityLevel: 3
maturityProvisional: false
shortDescription: "Retrieve only the few-shot examples relevant to this specific input (embedding/kNN over a curated example bank) instead of pasting a large fixed example block on every call — fewer example tokens per request at equal or better accuracy."
effort: Medium
gain: Medium
riskToQuality: Low
effortWhy: "Needs an embedded example bank, a vector search per request, and a prompt-assembly step — modest engineering on top of an existing embedding/retrieval stack."
gainWhy: "Cuts the per-request example block from ~10–20 generic shots to ~2–4 targeted ones, often while raising accuracy — but it saves example tokens only, not the whole call."
riskWhy: "Selection can occasionally surface an unhelpful neighbour; the main downside is losing the prefix-cache discount, which can partly offset the token savings."
detectionSignals:
  - "The same large static example block is pasted on every call regardless of the input."
  - "Few-shot examples were chosen once by hand and never vary per request."
  - "A big few-shot token cost sits on top of a diverse input distribution where most examples are irrelevant to any given query."
  - "Adding more static examples 'to be safe' keeps inflating input tokens without a clear accuracy ceiling."
measurementMethods:
  - "Example tokens per call before vs. after (static block size vs. k retrieved shots)."
  - "Task accuracy at the quality bar with dynamic selection vs. the fixed block and vs. random examples."
  - "Retrieval overhead per request (embedding + vector-search cost and added latency)."
  - "Prefix-cache hit rate before vs. after (expect it to drop for the example region)."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/few-shot-example-pruning"
  - "caching-reuse/embedding-caching"
  - "prompt-context/learned-prompt-compression"
  - "prompt-context/automated-prompt-optimization"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
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

Few-shot prompting works, but the naïve version is wasteful: teams paste a **large, fixed
block of examples** — often 10–20 shots chosen once by hand — into *every* request, on the
theory that "more examples, more coverage." For a diverse input distribution most of those
examples are irrelevant to any given query, yet you pay full input price to re-encode all of
them on every call, and the padding can even *dilute* the signal the model needs.

**Dynamic few-shot selection** replaces the fixed block with a per-request retrieval step:
embed the incoming input, search a curated **example bank** for the handful of examples most
similar to *this* input, and inject only those. The canonical result — KATE
("kNN-augmented in-context example selection") — showed that retrieving the nearest examples
by embedding similarity beats random selection by a wide margin while using **fewer** shots:
+5.5% on IMDB sentiment with just **3** examples, +10.4 PARENT points on ToTTo table-to-text
with **2**, and +13.0% on Natural Questions.[^kate] The cost lever falls out directly:
**2–4 targeted examples instead of 10–20 generic ones** means far fewer example tokens per
call, often at *equal or higher* accuracy.[^kate][^dice]

This is distinct from **few-shot example pruning** (a Level-2 technique): pruning shrinks the
*static* set once, offline, and ships the same reduced block to everyone. Dynamic selection
tailors the set **per request** — a standing retrieval system, not a one-time edit. That extra
machinery (an embedded bank, a vector search per call, and the loss of the prefix-cache
discount on the example region) is what places it at **Level 3**.

## Detailed Approach & Techniques

### The core mechanism (kNN over an example bank)

1. **Curate an example bank.** Assemble a pool of high-quality `(input → output)` pairs. This
   is the durable asset — quality and coverage of the bank set the ceiling on selection quality.
2. **Embed the bank offline.** Encode every example's *input* with a sentence embedder and store
   the vectors (with the full example as payload) in a vector index.
3. **At request time, embed the query** and retrieve the top-*k* nearest examples by cosine
   similarity (or Euclidean distance in embedding space).[^kate][^langchain-selector]
4. **Inject only those *k* examples** into the prompt, then the user input.

KATE formalises exactly this: "for each test source *x*, we retrieve its nearest *k* neighbours
from the training set according to distances in the sentence encoder's embedding space," using
an encoder such as RoBERTa; fine-tuning the retriever on task data improves it further.[^kate]

### Framework implementations

You rarely build this from scratch:

- **LangChain — `SemanticSimilarityExampleSelector`.** Backs the example bank with a vector store
  and, on each call, returns the examples whose embeddings have the greatest cosine similarity to
  the inputs. Default **k = 4**. A sibling `MaxMarginalRelevanceExampleSelector` re-ranks for
  *diversity* as well as relevance, so the k shots aren't near-duplicates of each other.[^langchain-selector]
- **DSPy — `KNNFewShot`.** An in-memory kNN retriever finds the k nearest neighbours in the
  trainset at test time and attaches them as demonstrations per input, then feeds them through
  `BootstrapFewShot`. Useful precisely "when the relevance of examples varies significantly
  depending on the input."[^dspy-knn]
- **Agentic settings.** DICE extends per-input selection to LLM *agents*, choosing only relevant
  demonstrations per step and thereby cutting token consumption versus a uniform static example
  set carried on every call.[^dice]

### Costs and the caching caveat (why this is not free)

- **Retrieval + embedding overhead.** Each request adds one embedding call plus a vector search.
  The embedding cost is trivial next to generation — `text-embedding-3-small` is **$0.02 / 1M
  tokens**[^openai-embed-price] — but the vector search adds latency, and similarity search over a
  large bank has real compute cost, so an ANN index (not brute force) matters at scale.[^learnprompting-knn]
- **Bank curation and maintenance.** The example bank must be assembled, labelled, embedded, and
  kept fresh as the task drifts — ongoing work that a static block doesn't need.
- **Choosing k is a tuning problem.** Too few shots and you lose coverage; too many and you're back
  to the padded-block cost. There is no default that's right without dataset knowledge.[^learnprompting-knn]
- **It breaks prefix caching — the big one.** Prompt caching only pays off on an **exact,
  stable prefix**; static content must go first and variable content last, or the cache misses.[^openai-pc-docs]
  A per-request example set makes the example region *vary every call*, so everything after the
  first divergence point stops hitting the cache. If your fixed few-shot block was previously
  cached at a deep discount (e.g. Anthropic's 0.1× reads), dynamic selection trades a **cheap,
  cached large block** for an **uncached small block** — sometimes a wash. Mitigation: keep the
  truly-static instructions/tools *before* the dynamic examples so at least that region still
  caches (see *Prompt Caching / Prefix Caching*), and reuse a query-embedding cache to avoid
  re-embedding repeated inputs (see *Embedding Caching*).

## Example Where It Works

A support-triage classifier routes incoming tickets into one of 40 intent categories across a
very diverse input distribution. The team's fixed prompt carries **18 hand-picked examples**
(~2,500 tokens) on every one of ~400,000 calls/day, and accuracy has plateaued because most of
those 18 examples are irrelevant to any single ticket.

Switching to dynamic selection: embed each ticket, retrieve the **4** most similar labelled
tickets from a bank of a few thousand, and inject only those (~600 tokens).

- **Tokens:** the example region drops from ~2,500 to ~600 tokens per call — a ~1,900-token cut
  on 400k calls/day.
- **Accuracy:** in line with KATE, the *targeted* neighbours typically *raise* accuracy over the
  generic block, not just match it — retrieving near-neighbours beat random selection by
  +5.5% to +13% across KATE's tasks.[^kate][^dice]
- **Overhead:** one `text-embedding-3-small` call (~$0.02/1M) plus a vector lookup per ticket —
  negligible against the input-token saving.[^openai-embed-price]

Classification and extraction over heterogeneous inputs — where the *right* examples differ
sharply per query — is the sweet spot.[^dspy-knn]

## Example Where It Would NOT Work

- **A small, uniform task with a well-cached block.** If three or four examples already cover the
  whole input distribution and that block is pinned into a **prefix cache** at a 0.1×–0.5×
  discount, dynamic selection adds retrieval complexity and *loses* the cache discount for what
  was already a cheap, tiny block. Here **few-shot example pruning** (L2 — trim the static set
  once) captures the win with none of the machinery.[^openai-pc-docs]
- **No good example bank.** Selection quality is bounded by bank quality; with only a handful of
  examples, or noisy/mislabelled ones, kNN just retrieves the least-bad neighbour and accuracy can
  fall below a carefully hand-curated fixed set.[^kate]
- **Output-dominated or example-light costs.** If input examples are a small share of spend (cost
  is dominated by long generations, or the prompt barely uses few-shot), shrinking the example
  block saves little — target output or model-level levers instead.
- **Ultra-low latency / low volume.** The added embedding + vector-search hop costs milliseconds
  and engineering; on low-volume endpoints the token savings never repay the standing retrieval
  system, and the per-query similarity search over a large bank is itself non-trivial.[^learnprompting-knn]

[^kate]: Liu et al., "What Makes Good In-Context Examples for GPT-3?" (KATE), 2021 — <https://ar5iv.labs.arxiv.org/html/2101.06804>
[^dice]: Wang et al., "DICE: Dynamic In-Context Example Selection in LLM Agents via Efficient Knowledge Transfer," 2025 — <https://arxiv.org/abs/2507.23554>
[^langchain-selector]: LangChain, "SemanticSimilarityExampleSelector" (source) — <https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/example_selectors/semantic_similarity.py>
[^dspy-knn]: DSPy Documentation, "KNNFewShot optimizer" — <https://dspy.ai/api/optimizers/KNNFewShot/>
[^learnprompting-knn]: Learn Prompting, "K-Nearest Neighbor (KNN) Prompting" — <https://learnprompting.org/docs/advanced/few_shot/k_nearest_neighbor_knn>
[^openai-embed-price]: OpenAI API Docs, "text-embedding-3-small" — <https://developers.openai.com/api/docs/models/text-embedding-3-small>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
