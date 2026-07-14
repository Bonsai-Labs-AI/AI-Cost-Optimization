---
title: "Embedding Quantization & MRL Truncation"
category: rag
maturityLevel: 3
maturityProvisional: false
shortDescription: "Shrink embedding vectors with int8/binary quantization and Matryoshka (MRL) dimension truncation to cut vector-database storage, RAM, and ANN search cost at scale — this is vector-DB infrastructure cost, not LLM token cost."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Full-precision float32 vectors stored at large corpus scale (tens of millions of embeddings or more)."
  - "A high and growing vector-database RAM / storage bill that dominates the RAG infra cost."
  - "Embeddings kept at their full native dimensionality (e.g. 1536 / 3072) even where lower dims would suffice."
  - "ANN query latency / compute rising as the index grows, with vectors held in expensive in-memory nodes."
measurementMethods:
  - "Vector-DB storage (GB) and RAM footprint before vs. after compression, and the resulting monthly hosting cost."
  - "ANN query latency / throughput (QPS) before vs. after quantization."
  - "Retrieval recall / nDCG at a fixed quality bar per compression level (float32 vs int8 vs binary vs truncated dims)."
  - "Rescoring oversampling multiplier needed to hold recall, and its added latency."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/embedding-caching"
  - "fine-tuning/specialized-embedding-models"
  - "rag/reducing-retrieved-chunk-count"
sources:
  - id: hf-embed-quant
    title: "Binary and Scalar Embedding Quantization for Significantly Faster & Cheaper Retrieval"
    publisher: "Hugging Face Blog (with mixedbread.ai)"
    authors: "Aarsen, Shakir, Lee, et al."
    year: 2024
    url: "https://huggingface.co/blog/embedding-quantization"
    accessed: "2026-07-03"
    kind: blog
    note: "int8 = exactly 4× smaller (float32→uint8); binary = exactly 32× smaller (1 bit/value). Binary preserves ~92.5% of retrieval performance without rescoring, up to ~96% with rescoring; int8 with rescore_multiplier 4 retains ~99%. Speedups: int8 ~3.66×, binary ~24.76× (CPU exact search). Storage for 250M 1024-d embeddings at $3.8/GB/mo: float32 953.67 GB / $3,623; int8 238.41 GB / $905; binary 29.80 GB / $113.25."
  - id: mrl-paper
    title: "Matryoshka Representation Learning"
    publisher: "arXiv:2205.13147"
    authors: "Kusupati, Bhatt, Rege, Wallingford, et al."
    year: 2022
    url: "https://arxiv.org/abs/2205.13147"
    accessed: "2026-07-03"
    kind: paper
    note: "Trains embeddings so the first N dimensions carry the most information; any prefix of the vector stays usable after simple truncation + normalization. Reports up to 14× smaller embedding size at the same accuracy and up to 14× real-world speed-ups for large-scale retrieval, with no extra inference/deployment cost."
  - id: openai-embed-announce
    title: "New embedding models and API updates"
    publisher: "OpenAI"
    year: 2024
    url: "https://openai.com/index/new-embedding-models-and-api-updates/"
    accessed: "2026-07-03"
    kind: blog
    note: "Jan 25 2024. Developers can shorten embeddings via the `dimensions` parameter without losing concept-representing properties. On MTEB, text-embedding-3-large shortened to 256 dims still outperforms unshortened text-embedding-ada-002 at 1536 dims. Built on the MRL technique (links arXiv:2205.13147)."
  - id: openai-embed-docs
    title: "Vector embeddings — the dimensions parameter"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/embeddings"
    accessed: "2026-07-03"
    kind: docs
    note: "text-embedding-3-small (default 1536) and -3-large (default 3072) accept a `dimensions` parameter to request shorter vectors; the trailing dimensions are dropped without losing concept-representing properties."
  - id: qdrant-quant
    title: "Quantization"
    publisher: "Qdrant Documentation"
    year: 2026
    url: "https://qdrant.tech/documentation/guides/quantization/"
    accessed: "2026-07-03"
    kind: docs
    note: "Scalar (int8) = 4× compression; binary = 32× (fastest method, up to 40× search speedup). Accuracy recovered via oversampling + rescoring against original vectors (e.g. oversampling 2.4 with limit 100 pre-selects 240 candidates on the quantized index, then rescores to top-100). Supports quantized-in-RAM / originals-on-disk hybrid layouts."
  - id: cohere-int8-binary
    title: "Cohere int8 & binary Embeddings — Scale Your Vector Database to Large Datasets"
    publisher: "Cohere Blog"
    year: 2024
    url: "https://cohere.com/blog/int8-binary-embeddings"
    accessed: "2026-07-03"
    kind: blog
    note: "Compression-aware Embed v3 outputs int8/binary directly. Binary compresses a 1024-float (4,096-byte) vector to 128 bytes. Real case: a media company with 10M article embeddings cut vector-DB cost from $5,600/mo to $1,400/mo with int8 and no noticeable quality loss."
  - id: mrl-truncation-robustness
    title: "To MRL or not to MRL: Text Embeddings are Robust to Truncation Without Matryoshka Learning, Except In Heavy Truncation Scenarios"
    publisher: "arXiv:2605.16608"
    year: 2026
    url: "https://arxiv.org/abs/2605.16608"
    accessed: "2026-07-03"
    kind: paper
    note: "Finds that even non-MRL embeddings tolerate truncation with minimal downstream loss until vectors are cut by ~70%+; MRL's clear advantage shows up specifically in heavy-truncation regimes. Caveat against assuming any embedding can be truncated arbitrarily far."
---

## Overview

A RAG system's recurring bill has two very different halves. One is the **LLM token cost**
of generation and (optionally) query embedding calls. The other — the one this technique
targets — is the **vector-database infrastructure cost**: the storage, RAM, and
approximate-nearest-neighbor (ANN) search compute needed to hold and query the corpus of
embedding vectors. **Frame this honestly: embedding quantization and MRL truncation do
not save a single input or output token. They cut vector-DB infra cost, and they only
matter at scale** — at a few hundred thousand vectors the vector store is a rounding error;
at tens or hundreds of millions it can be the largest line in the RAG budget.

Embeddings are stored by default as `float32` vectors — 4 bytes per dimension, so a single
1024-dimension vector is ~4 KB, and 250 million of them are **~954 GB**, costing on the
order of **$3,600/month** at typical managed vector-DB prices.[^hf-embed-quant] Two
orthogonal levers shrink that footprint:

- **Quantization** reduces the *precision* of each stored number: `int8` scalar
  quantization is **exactly 4× smaller** (float32 → 1-byte integer) and **binary**
  quantization is **exactly 32× smaller** (each value collapsed to a single bit).[^hf-embed-quant][^qdrant-quant]
- **MRL (Matryoshka) truncation** reduces the *number* of dimensions by keeping only the
  first N of a Matryoshka-trained vector, because such models are trained to pack the most
  important information into the earliest dimensions.[^mrl-paper][^openai-embed-announce]

Both can be combined, and both trade a controlled amount of retrieval recall for a large
infra saving — with **rescoring/oversampling** available to claw most of that recall back.
That "large infra saving at scale, modest and recoverable recall cost, real engineering to
tune it" profile is why this sits at **Level 3**.

## Detailed Approach & Techniques

### Scalar (int8) quantization — the safe default

Scalar quantization maps each float32 component onto an 8-bit integer by calibrating the
value range of a dimension across the corpus. The result is **4× smaller** storage and RAM,
plus a meaningful search speedup (~**3.66×** on CPU exact search in Hugging Face's
benchmark; Qdrant reports a comparable band).[^hf-embed-quant][^qdrant-quant] Crucially,
the quality cost is tiny: with a rescore step (`rescore_multiplier` of 4) int8 retains
**~99%** of baseline retrieval performance.[^hf-embed-quant] Cohere ships int8 directly
from its Embed v3 model and reports a media company with **10 million** article embeddings
cutting its vector-DB bill from **$5,600/month to $1,400/month** with no noticeable quality
degradation.[^cohere-int8-binary] int8 is the low-risk entry point: adopt it first.

### Binary quantization — 32× smaller, rescored back to quality

Binary quantization stores each dimension as a single bit (1 if positive, 0 otherwise),
giving a **32× reduction** — Cohere notes a 1024-float vector (4,096 bytes) collapses to
just **128 bytes**.[^cohere-int8-binary] Search runs on **Hamming distance** (bitwise XOR +
popcount), which is dramatically faster than float dot products: Qdrant reports binary as
its fastest method with **up to 40× search speedup**, and Hugging Face measured ~**24.76×**
on CPU exact search.[^qdrant-quant][^hf-embed-quant] For the 250M-vector example, the
footprint drops from ~954 GB / ~$3,623/mo to **~30 GB / ~$113/mo**.[^hf-embed-quant]

The catch is recall: raw binary search preserves only **~92.5%** of baseline retrieval
performance. The fix is **rescoring** (also called oversampling): retrieve an over-large
candidate set on the cheap binary/quantized index, then **re-rank those few hundred
candidates against the original (or int8) vectors**. This recovers up to **~96%** of
baseline performance for binary — and is the same primitive Qdrant exposes, e.g.
oversampling 2.4 with a limit of 100 pre-selects 240 candidates on the quantized index and
rescores to the final top-100.[^hf-embed-quant][^qdrant-quant] A common production layout
keeps the **compressed vectors in RAM and the full-precision vectors on disk**, so the fast
first pass is in-memory and only the tiny rescoring set touches disk.[^qdrant-quant]

### MRL dimension truncation — fewer dimensions, not lower precision

Matryoshka Representation Learning trains an encoder so that any **prefix** of the output
vector is itself a usable embedding; the most important information is concentrated in the
earliest dimensions, so you can truncate to the first N dims and re-normalize with minimal
loss.[^mrl-paper] The original paper reports **up to 14× smaller embedding size at the same
accuracy** and up to 14× real-world retrieval speedups, at **no extra inference or
deployment cost**.[^mrl-paper] This is now a first-class API feature: OpenAI's
`text-embedding-3-small`/`-large` accept a **`dimensions` parameter** to request a shorter
vector, and OpenAI reports that `text-embedding-3-large` shortened to **256 dims still
outperforms** the older `text-embedding-ada-002` at its full **1536 dims** on
MTEB.[^openai-embed-announce][^openai-embed-docs]

Truncation is orthogonal to quantization — you can truncate to 512 dims **and** binarize —
so the reductions multiply. One honest caveat: aggressive truncation has limits. Recent
work finds embeddings tolerate truncation with little loss until you cut roughly **70%+** of
the dimensions, at which point MRL-trained models keep a clear edge over naive truncation —
so validate recall at your chosen dimension rather than assuming any vector truncates
arbitrarily far.[^mrl-truncation-robustness]

### Putting it together

1. **Measure first.** Confirm the vector store is actually a material cost (large corpus,
   in-memory nodes). If it isn't, skip this — the effort won't pay back.
2. **Start with int8** for a 4× cut at ~99% recall (near-zero risk).
3. **Add binary + rescoring** where the corpus is huge and search speed matters, tuning the
   oversampling multiplier to hold recall at your bar.
4. **Truncate dimensions (MRL)** if your embedder supports it, validating recall per
   candidate dimension.
5. **Always evaluate recall/nDCG at a fixed bar** per compression level before rolling out.

## Example Where It Works

A legal-research product indexes **80 million** document chunks with a 1024-dimension
embedding model, and serves search from an in-memory ANN index. At `float32` that is
roughly **305 GB** of vectors held in RAM, and RAM is the dominant cost of the deployment.

- Switching to **int8** cuts the footprint **4×** to ~76 GB at ~99% of baseline recall — a
  straightforward win that immediately shrinks the required node size.[^hf-embed-quant]
- Going further to **binary + rescoring** cuts it **32×** to ~10 GB, with search running on
  Hamming distance (up to ~40× faster first pass), and a rescoring pass against int8/float
  vectors restoring recall to ~96% of baseline.[^hf-embed-quant][^qdrant-quant] The team
  keeps binary vectors in RAM and full-precision vectors on cheap disk.[^qdrant-quant]

The scale here is exactly what makes it pay: mirroring Cohere's published case of a 10M-doc
corpus dropping from **$5,600 to $1,400/month** on int8 alone, this larger corpus sees an
even bigger absolute reduction in the vector-DB bill — with a recall loss small enough to
be invisible to users once rescoring is on.[^cohere-int8-binary]

## Example Where It Would NOT Work

- **Small corpora.** A product-docs chatbot with **40,000** chunks has a vector index of a
  few hundred megabytes that fits in the free tier of any managed vector DB. A 32× reduction
  of a rounding-error cost saves nothing meaningful while adding a quantization + rescoring
  pipeline to build and maintain — pure negative ROID at this scale.
- **Token-dominated bills.** If the RAG system's cost is overwhelmingly the **LLM
  generation** tokens (long answers, big retrieved context stuffed into the prompt), this
  technique touches none of it — it is vector-DB infra, not tokens. The right levers there
  are `reducing-retrieved-chunk-count`, context compression, and model right-sizing.
- **Very high precision / heavy truncation demands.** A workload that needs the last few
  points of recall on subtle, near-duplicate distinctions can be hurt by aggressive binary
  quantization or by truncating too many dimensions; recent evidence shows truncation past
  ~70% of dimensions degrades non-MRL embeddings sharply, and even MRL models lose ground in
  heavy-truncation regimes.[^mrl-truncation-robustness] Without a recall eval gate and
  rescoring, over-compression silently ships worse retrieval.

[^hf-embed-quant]: Hugging Face Blog (Aarsen et al.), "Binary and Scalar Embedding Quantization for Significantly Faster & Cheaper Retrieval," 2024 — <https://huggingface.co/blog/embedding-quantization>
[^mrl-paper]: Kusupati, Bhatt, Rege, Wallingford, et al., "Matryoshka Representation Learning," arXiv:2205.13147, 2022 — <https://arxiv.org/abs/2205.13147>
[^openai-embed-announce]: OpenAI, "New embedding models and API updates," 2024 — <https://openai.com/index/new-embedding-models-and-api-updates/>
[^openai-embed-docs]: OpenAI API Docs, "Vector embeddings" (the `dimensions` parameter) — <https://developers.openai.com/api/docs/guides/embeddings>
[^qdrant-quant]: Qdrant Documentation, "Quantization" — <https://qdrant.tech/documentation/guides/quantization/>
[^cohere-int8-binary]: Cohere Blog, "Cohere int8 & binary Embeddings — Scale Your Vector Database to Large Datasets," 2024 — <https://cohere.com/blog/int8-binary-embeddings>
[^mrl-truncation-robustness]: "To MRL or not to MRL: Text Embeddings are Robust to Truncation Without Matryoshka Learning, Except In Heavy Truncation Scenarios," arXiv:2605.16608, 2026 — <https://arxiv.org/abs/2605.16608>
