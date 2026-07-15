---
title: "Task-Specific Lightweight Models"
category: fine-tuning
maturityLevel: 3
maturityProvisional: false
shortDescription: "Replace an LLM doing a bounded NLP task — classifying inputs into a fixed label set, routing requests, or pulling structured fields from documents — with a small specialist model that runs at a fraction of the per-call cost once trained on your data."
effort: High
gain: Very High
riskToQuality: Medium
detectionSignals:
  - "An LLM classifies inputs into a small, fixed label set (intent, topic, sentiment, moderation, routing) at high volume."
  - "An LLM extracts the same fixed set of fields from a high, steady volume of documents (invoices, forms, receipts, contracts, KYC packets)."
  - "Classification or extraction is a large and growing share of the AI bill, but the task is narrow and stable month after month."
  - "Per-request latency is dominated by an LLM call that returns a one-word label or a short structured record."
  - "Each document is long (5k–20k tokens) so per-call LLM cost is high even on a cheap model."
  - "You already have — or can cheaply label — thousands of examples with ground-truth outputs."
measurementMethods:
  - "Cost per 1,000 (or 1M) inferences: trained specialist model vs. the incumbent LLM."
  - "p50 / p95 latency per call, LLM vs. specialist model."
  - "Held-out accuracy / macro-F1 (classifiers) or field-level precision/recall/F1 (extractors) vs. the LLM baseline."
  - "One-time training + labeling cost and the break-even volume where the specialist turns cheaper."
  - "Escalation rate — share of inputs the specialist can't handle that must fall back to the LLM."
  - "Retrain cadence and cost as labels, schemas, or templates drift."
status: published
lastUpdated: "2026-07-14"
related:
  - "batching-async/bulk-extraction-classification"
  - "model-routing/model-right-sizing"
  - "fine-tuning/fine-tuning-cheaper-models"
  - "model-routing/dynamic-model-routing"
  - "fine-tuning/specialized-embedding-models"
  - "output/structured-outputs"
sources:
  - id: costaware-encoders
    title: "Cost-Aware Model Selection for Text Classification: Multi-Objective Trade-offs Between Fine-Tuned Encoders and LLM Prompting in Production"
    publisher: "arXiv"
    year: 2026
    url: "https://arxiv.org/html/2602.06370v1"
    accessed: "2026-07-03"
    kind: paper
    note: "IMDB: DistilBERT $12.44/1M requests vs GPT-4o zero-shot $842.78/1M and Claude 4.5 $1,174.95/1M. AG News: DistilBERT $5.73/1M vs GPT-4o $276.00/1M. SST-2 latency p50/p95: DistilBERT 98/124 ms vs GPT-4o 377/591 ms vs Claude 4.5 1,394/2,048 ms. DBPedia macro-F1: BERT 99.40% vs Claude 4.5 zero-shot 98.83%. Conclusion: fine-tuned encoders match or beat LLM prompting at one to two orders of magnitude lower cost and latency for fixed-label classification."
  - id: setfit-blog
    title: "SetFit: Efficient Few-Shot Learning Without Prompts"
    publisher: "Hugging Face Blog"
    authors: "Tunstall, Reimers, et al."
    year: 2022
    url: "https://huggingface.co/blog/setfit"
    accessed: "2026-07-03"
    kind: blog
    note: "Two-stage: contrastive fine-tune a Sentence Transformer on text pairs, then train a classification head on the embeddings. Competitive with only 8 labeled examples per class (comparable to fine-tuning RoBERTa Large on 3,000 examples). Training on a V100 with 8 examples/class takes ~30 seconds at ~$0.025 vs T-Few 3B's 11 minutes / ~$0.70 (28× cheaper). 27× smaller than T-Few 3B at comparable accuracy."
  - id: setfit-paper
    title: "Efficient Few-Shot Learning Without Prompts"
    publisher: "arXiv"
    authors: "Tunstall, Reimers, Jo, Bates, Korat, Wasserblat, Pereg"
    year: 2022
    url: "https://arxiv.org/abs/2209.11055"
    accessed: "2026-07-03"
    kind: paper
    note: "SetFit achieves high accuracy with orders of magnitude fewer parameters than existing few-shot techniques and is an order of magnitude faster to train, without prompts or verbalizers; matches PEFT/PET despite needing no billion-parameter LM."
  - id: setfit-docs
    title: "SetFit documentation"
    publisher: "Hugging Face"
    year: 2026
    url: "https://huggingface.co/docs/setfit/en/index"
    accessed: "2026-07-03"
    kind: docs
    note: "Prompt-free framework for few-shot fine-tuning of Sentence Transformers; fast to train, does not require large-scale models (CPU-trainable)."
  - id: modernbert-ft
    title: "Fine-tune classifier with ModernBERT in 2025"
    publisher: "philschmid.de"
    authors: "Philipp Schmid"
    year: 2025
    url: "https://www.philschmid.de/fine-tune-modern-bert-in-2025"
    accessed: "2026-07-03"
    kind: blog
    note: "ModernBERT-base (139M params) fine-tuned for LLM-routing classification reaches F1 0.993, training in 321 seconds; on banking77 (77 intents) scores 0.93 vs original BERT 0.90. Encoders are 2–4× faster and remain critical for high-throughput, latency-sensitive classification like routing."
  - id: setfit-repo
    title: "huggingface/setfit — Efficient few-shot learning with Sentence Transformers"
    publisher: "GitHub"
    year: 2026
    url: "https://github.com/huggingface/setfit"
    accessed: "2026-07-03"
    kind: repo
    note: "Open-source SetFit implementation; open-weight Sentence Transformer bodies + scikit-learn/torch classification heads."
  - id: hf-token-classification
    title: "Token classification — Hugging Face NLP Course, Chapter 7"
    publisher: "Hugging Face"
    year: 2026
    url: "https://huggingface.co/learn/nlp-course/chapter7/2"
    accessed: "2026-07-03"
    kind: docs
    note: "Token classification = attribute a label to each token (NER/field extraction) with BIO tagging. Uses AutoModelForTokenClassification on a BERT base, subword-label realignment (-100 for special tokens), CoNLL-2003 dataset, seqeval metric."
  - id: layoutlmv3-paper
    title: "LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking"
    publisher: "Huang, Lv, Cui, Lu, Wei — ACM Multimedia 2022 (arXiv:2204.08387)"
    authors: "Yupan Huang, Tengchao Lv, Lei Cui, Yutong Lu, Furu Wei"
    year: 2022
    url: "https://arxiv.org/abs/2204.08387"
    accessed: "2026-07-03"
    kind: paper
    note: "Layout-aware multimodal model; SOTA on text-centric Document AI tasks including form understanding, receipt understanding, and document VQA — the canonical family for structured field extraction from visually-rich documents."
  - id: hf-layoutlmv3-docs
    title: "LayoutLMv3 — Transformers documentation"
    publisher: "Hugging Face"
    year: 2026
    url: "https://huggingface.co/docs/transformers/model_doc/layoutlmv3"
    accessed: "2026-07-03"
    kind: docs
    note: "LayoutLMv3ForTokenClassification / ForQuestionAnswering; combines text + layout (bounding boxes) + image patches. The practical API for fine-tuning a layout extractor."
  - id: philschmid-layoutlm
    title: "Document AI: Fine-tuning LayoutLM for document-understanding using Hugging Face Transformers"
    publisher: "philschmid.de"
    authors: "Philipp Schmid"
    year: 2022
    url: "https://www.philschmid.de/fine-tuning-layoutlm"
    accessed: "2026-07-03"
    kind: blog
    note: "Fine-tunes microsoft/layoutlm-base-uncased for token-classification KIE on FUNSD. Reached 0.787 overall F1 with only 149 training examples on a single NVIDIA T4 GPU (15 epochs, batch 16, LR 3e-5, FP16)."
  - id: few-good-clauses
    title: "A Few Good Clauses: Comparing LLMs vs Domain-Trained Small Language Models on Structured Contract Extraction"
    publisher: "arXiv:2605.05532"
    authors: "Nicole Lincoln, Nick Whitehouse, Jaron Mar, Rivindu Perera"
    year: 2026
    url: "https://arxiv.org/abs/2605.05532"
    accessed: "2026-07-03"
    kind: paper
    note: "Domain-trained small extractor (Olava Extract) ran at $0.018/document batched vs frontier LLM APIs at $0.149–$0.456/document (Gemini 2.5 Pro $0.149, Gemini 3.1 Pro Preview $0.187, Claude Opus 4.6 $0.258, GPT-5.4 $0.262, Claude Sonnet 4.6 $0.456) — 8–25× cheaper, 78–97% cost reduction — while beating all five on macro F1 0.812 / micro F1 0.842 with higher precision (fewer hallucinated extractions)."
  - id: mindee-cost
    title: "LLMs vs OCR APIs for document processing: the hidden cost trap"
    publisher: "Mindee Blog"
    year: 2026
    url: "https://www.mindee.com/blog/llm-vs-ocr-api-cost-comparison"
    accessed: "2026-07-03"
    kind: blog
    note: "LLMs scale per-token, not per-document: a typical invoice ≈5,000 tokens, multi-page contracts 20,000+, giving $0.20–$1+/document. At 1M docs/month that is $200,000+ for LLMs vs ~€10,000 for a specialized extraction API. Plus hidden retry/repair/validation costs."
  - id: openai-deprecations
    title: "Deprecations"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/deprecations"
    accessed: "2026-07-03"
    kind: docs
    note: "Self-serve fine-tuning is winding down: from May 7 2026 no new orgs can create fine-tuning jobs; from Jul 2 2026 restricted to orgs that ran inference on a fine-tuned model in the past 60 days; Jan 6 2027 active existing customers can no longer create new fine-tuning jobs. Inference on existing fine-tuned models continues until the base model is deprecated."
---

## Overview

A large share of "AI" in production is neither open-ended generation nor creative reasoning —
it is a **bounded NLP task**: assigning one label from a fixed set, routing a request to the
right queue, or pulling a specific set of fields out of a document. When a frontier LLM handles
these tasks, you pay **per-token generation prices and hundreds of milliseconds of network
round-trips** to produce a one-word answer or a short JSON record — on every request, at scale,
forever.

**Task-specific lightweight models** replace those LLM calls with a **small model trained once
on your data**: either a fine-tuned encoder (BERT / DeBERTa / ModernBERT with a classification
head), an embedding plus a lightweight head (embed the text, run a logistic-regression or small
MLP over the vector), a token-classification model (label each span with a field tag), or a
layout-aware model like the LayoutLM family (text plus bounding-box position plus page image for
visually-rich documents). Once trained, these run at **effectively zero marginal cost** —
single-digit-millisecond to low-hundred-millisecond inference on modest hardware, no per-token
API bill — and on narrow fixed-schema tasks, they can *match or beat* frontier LLMs on
accuracy.

The economics are stark across both the classification and extraction variants:

- **Classification.** A 2026 production study found DistilBERT cost **\$12.44 per 1M
  classification requests** on IMDB sentiment versus **\$842.78 for GPT-4o** and **\$1,174.95
  for Claude 4.5** zero-shot — roughly a **70–95× per-call gap** — while beating frontier
  models on the DBPedia ontology task (BERT macro-F1 99.40% vs Claude 4.5
  98.83%).[^costaware-encoders]
- **Extraction.** A controlled 2026 study on structured contract extraction found a
  domain-trained small extractor ran at **\$0.018 per document** versus **\$0.149–\$0.456 per
  document** for frontier APIs (Gemini 2.5 Pro, Claude, GPT-5.4) — **8–25× cheaper, a 78–97%
  cost reduction** — while achieving *higher* accuracy (macro F1 0.812 / micro F1 0.842) and
  fewer hallucinated field values than all five baselines.[^few-good-clauses]

This technique sits at **Level 3** because it is real engineering investment: you need labeled
data, a training pipeline, a per-field or per-class evaluation harness, a serving path, and a
retraining cadence. But for a narrow, high-volume, stable workload, the ROI is among the largest
in the entire catalog — the recurring LLM cost approaches zero when replaced by a model you own.

## Detailed Approach & Techniques

### When a specialist model beats an LLM

The core decision rule is: train a specialist when the task has a **fixed output schema** (a
label set or a field schema), **high volume**, and is **stable over time**. All three conditions
point the same way. High volume means the one-time training cost is amortized quickly. Fixed
output schema means a narrow model can reach or exceed LLM accuracy without needing open-ended
reasoning. Stability means retraining is infrequent. Add latency sensitivity — a classifier or
extractor runs orders of magnitude faster than an LLM call — and the specialist wins on every
dimension simultaneously.[^costaware-encoders]

The latency gap is concrete: on SST-2 sentiment, DistilBERT ran at **98 ms p50 / 124 ms p95**
versus GPT-4o at **377 / 591 ms** and Claude 4.5 at **1,394 / 2,048 ms** — a one-to-two
order-of-magnitude latency win *in addition to* the cost win.[^costaware-encoders]

### Variant A — Classification and routing

Use when the task assigns **one label per input** from a fixed set: intent detection, topic
routing, sentiment, moderation, ticket triage, complexity scoring for model routing.

**Method 1: Fine-tuned encoder (BERT / DeBERTa / ModernBERT).** Attach a classification head
to an open-weight encoder and fine-tune on your labeled examples. This is the highest-ceiling
option when you have at least a few hundred labeled examples per class. A 2025 example fine-tunes
**ModernBERT-base (139M params)** for LLM-routing classification and reaches **F1 0.993,
training in 321 seconds**; on the harder 77-class banking77 intent set it scores **0.93** (vs
original BERT's 0.90). ModernBERT adds an 8,192-token context window and is 2–4× faster than
older encoders, which is precisely why it is used as a **router and moderation classifier** in
front of expensive models.[^modernbert-ft]

**Method 2: Embedding + classification head (SetFit, few-shot).** When labels are scarce,
**SetFit** avoids full encoder fine-tuning: it contrastively fine-tunes a Sentence Transformer
on in-class/out-class text pairs, then trains a small classification head over the resulting
embeddings.[^setfit-blog][^setfit-paper] It is competitive with **only 8 labeled examples per
class** — comparable to fine-tuning RoBERTa Large on 3,000 examples — and trains in **~30
seconds for ~\$0.025** on a single V100 (28× cheaper than a T-Few 3B baseline, and 27× smaller
at comparable accuracy).[^setfit-blog] If you already embed inputs for search or dedup, a
logistic head over those vectors is nearly free to add. SetFit is prompt-free and small enough
to train and serve on CPU.[^setfit-docs][^setfit-repo]

### Variant B — Structured field extraction

Use when the task identifies **which spans are which fields** within a document: invoice fields,
form fields, contract clauses, NER over support tickets, KYC entity extraction.

**Method 1: Token classification (sequence labeling).** The workhorse for text extraction. Every
token gets a label from a fixed tag set using a BIO scheme (`B-VENDOR`, `I-VENDOR`, `O`,
`B-TOTAL`, …), so contiguous labeled spans become extracted fields. You fine-tune an encoder
with `AutoModelForTokenClassification`; the key subtlety is **realigning labels to subword
tokens** and evaluating with `seqeval` for entity-level precision/recall/F1.[^hf-token-classification]
This handles entity and field extraction from plain text or OCR'd text where spatial position
isn't essential.

**Method 2: Layout-aware extraction (LayoutLM family).** For *visually-rich* documents —
invoices, forms, receipts — where a field's **spatial position on the page** and the image carry
as much signal as the words, the LayoutLM family fuses **text + 2-D bounding boxes + image
patches**. LayoutLMv3 reaches state-of-the-art on form understanding, receipt understanding, and
document VQA in one unified model.[^layoutlmv3-paper] In practice you fine-tune
`LayoutLMv3ForTokenClassification`, feeding OCR tokens with their coordinates.[^hf-layoutlmv3-docs]
The data efficiency is striking: a worked fine-tune on the FUNSD form benchmark reached
**0.787 F1 with only 149 training documents on a single T4 GPU** — a usable extractor for the
cost of a few GPU-hours and a modest labeling effort.[^philschmid-layoutlm]

**Method 3: Fine-tuned small seq2seq / generative extractor.** Instead of tagging spans, train
a small model to emit the structured record (JSON) directly — the closest analog to what an LLM
does, but with a cheap model specialized to your schema. The contract-extraction study uses a
domain-trained small model that outputs structured fields and beats five frontier LLMs on accuracy
*and* precision.[^few-good-clauses] Constrained decoding keeps the output schema-valid (see
*Structured Outputs*).

**Method 4: Span extraction (extractive QA).** For a handful of fields, frame each as "find the
span answering this question," fine-tuning an extractive-QA head. Useful when fields are sparse
and full token-level annotation is more effort than the task warrants.

### The economics: training once vs. LLM-per-call × volume

The trade is a **one-time (plus periodic) training and labeling cost** against **per-call LLM
cost × volume**. Training is cheap — seconds to hours on a single GPU, or ~\$0.025 for a SetFit
few-shot run.[^setfit-blog] Layout extractors need far fewer examples than you'd expect
(~150 documents to a usable F1).[^philschmid-layoutlm] Labeling is the real cost, and it is
bounded; a teacher LLM can bootstrap the labels (a distillation flywheel), then humans spot-check.

Against that, the LLM side scales *linearly and forever* with traffic:

- **Classification:** at **\$276–\$1,175 per 1M requests** for a frontier zero-shot classifier
  versus **\$6–\$33 per 1M** for an encoder,[^costaware-encoders] the break-even arrives at
  modest volume. A workload doing even **100k classifications/day** pays back the entire training
  and labeling cost in **days**, then keeps ~90–99% of the per-call spend indefinitely.
- **Extraction:** at **\$0.149–\$0.456 per document** for frontier APIs versus **\$0.018 per
  document** for a trained extractor,[^few-good-clauses] and roughly **\$200k+/month at 1M
  docs** for an LLM pipeline versus ~\$10k for a specialized model,[^mindee-cost] the break-even
  arrives within weeks at high volume.

This is also why the specialist pattern pairs well with the L2 technique *Bulk Extraction &
Classification*: run the LLM version first to prove the task and generate labeled examples, then
graduate the stable, high-volume slice to a trained model.

### Owning the model: labeling, serving, and drift

- **Labeling** is the primary up-front cost, but weak supervision, template rules, or using the
  incumbent LLM as an auto-labeler (then human-spot-checking) cut it sharply.
- **Serving** a small encoder is cheap (CPU or a modest GPU), but you now own an inference
  stack, monitoring, and an evaluation harness — **per-field precision/recall** for extractors,
  not just document-level accuracy.
- **Drift** is the standing liability: a new ticket category, a changed form template, or a new
  field degrades a narrow model silently. Budget for **periodic retraining** and maintain an LLM
  fallback for out-of-distribution inputs.

### Vendor-availability caveat (2026)

The center of gravity for training these models is **open-weight encoders** (BERT / DeBERTa /
ModernBERT / LayoutLM family) and **few-shot toolkits like SetFit** — self-hosted or trained on
any GPU, with no dependence on a single vendor's fine-tuning API.[^setfit-repo][^hf-layoutlmv3-docs]
This matters now because **OpenAI's self-serve fine-tuning is winding down**: from **May 7 2026**
new organizations can no longer create fine-tuning jobs, tightened further on **Jul 2 2026**, and
by **Jan 6 2027** even active existing customers can't create new jobs (inference on existing
fine-tunes continues only until the base model is deprecated).[^openai-deprecations] Open-weight
specialist models sidestep this entirely — the models and training stacks are open and portable.

## Example Where It Works

**Classification — support ticket routing.** A support platform routes **2 million inbound
tickets/month** into one of ~40 stable queues and flags a toxicity label, today via a
frontier-LLM call per ticket. At roughly the study's frontier rate (~\$300–\$800 per 1M
classification requests), that is **tens of thousands of dollars/month** just to assign a queue
and a boolean — plus 400 ms–1.4 s of latency on every ticket.[^costaware-encoders]

Because the 40 queues are fixed and the platform already has years of human-routed tickets as
labels, a **fine-tuned ModernBERT classifier** is a near-perfect fit: comparable setups reach
**F1 ≈ 0.93–0.99** on multi-class intent routing, train in minutes, and then run at **~\$6–\$33
per 1M calls** at **~100 ms** latency.[^modernbert-ft][^costaware-encoders] The per-call LLM
cost is replaced by an owned model at ~zero marginal cost, cutting classification spend by ~90%+
while improving latency — with a monthly retrain to absorb new ticket patterns.

**Extraction — accounts-payable processing.** An accounts-payable SaaS processes **500,000
invoices/month** from a bounded set of vendor templates, extracting the same ~12 fields (invoice
number, PO number, vendor, date, line items, subtotal, tax, total). Today it runs each invoice
through a frontier LLM at roughly **\$0.30/document** (≈5k tokens in plus structured JSON out),
about **\$150,000/month**, and still needs a validation pass on malformed JSON.[^mindee-cost]

They fine-tune a **LayoutLMv3 token-classification** extractor on a few thousand human-verified
invoices — feasible given LayoutLM's data efficiency (usable F1 from ~150 examples on one
GPU)[^philschmid-layoutlm] — and route stable template traffic to it. Per the controlled study,
a trained small extractor lands near **\$0.018/document**, an **8–25× per-document reduction**
while *improving* field precision (fewer hallucinated values than the LLM).[^few-good-clauses]
Monthly extraction cost falls from ~\$150k toward the low thousands; the one-time labeling and
training is repaid within the first weeks of volume. Unseen templates and garbled scans are
escalated to the LLM fallback. This is the archetypal fit: **fixed schema, bounded formats, very
high volume, stable over time.**

## Example Where It Would NOT Work

- **Fluid or open-ended label sets.** A product-discovery tool that tags user notes into an
  ever-growing, user-defined set of themes has no fixed label set — new categories appear weekly.
  A trained classifier would be perpetually stale and need constant relabeling and retraining;
  the LLM's zero-shot classification is the right tool here despite its per-call
  cost.[^costaware-encoders]
- **Varied or unseen schemas.** A due-diligence tool that ingests *arbitrary* documents and
  extracts *different* fields per request has no fixed tag set to train against. Every new schema
  would need new labels and a retrain; the LLM's zero-shot flexibility is the whole product.
  Here the L2 *Bulk Extraction & Classification* approach with *Structured Outputs* is correct.
- **Low volume.** A workflow doing a few hundred classifications or a few thousand document
  extractions per month never accumulates enough traffic for the per-call savings to repay the
  labeling, training, serving, and retrain overhead — the managed LLM call is simpler and
  cheaper in total. The 70–95× per-call win on classification and the 8–25× win on extraction
  only matter once multiplied by high volume.[^few-good-clauses][^costaware-encoders]
- **Messy long-tail formats or reasoning-heavy tasks.** Pipelines dominated by highly variable
  or poorly-scanned documents defeat a narrow trained model (accuracy craters on
  out-of-distribution inputs), while a frontier LLM degrades gracefully. Similarly, if the
  "classification" or "extraction" actually requires multi-step reasoning over context — not just
  pattern-matching to a known schema — the encoder won't reach the quality bar and the LLM
  remains the pragmatic choice until a better dataset accumulates.[^setfit-blog][^costaware-encoders]
- **Rapidly changing fields or templates.** If the target fields, categories, or document
  templates shift every few weeks, a trained specialist is a perpetual retraining treadmill — the
  maintenance cost swamps the per-call savings, and a prompt edit on an LLM is far cheaper to
  adapt.

[^costaware-encoders]: "Cost-Aware Model Selection for Text Classification: Multi-Objective Trade-offs Between Fine-Tuned Encoders and LLM Prompting in Production," arXiv, 2026 — <https://arxiv.org/html/2602.06370v1>
[^setfit-blog]: Tunstall, Reimers, et al., "SetFit: Efficient Few-Shot Learning Without Prompts," Hugging Face Blog, 2022 — <https://huggingface.co/blog/setfit>
[^setfit-paper]: Tunstall et al., "Efficient Few-Shot Learning Without Prompts," arXiv:2209.11055, 2022 — <https://arxiv.org/abs/2209.11055>
[^setfit-docs]: Hugging Face, "SetFit documentation" — <https://huggingface.co/docs/setfit/en/index>
[^modernbert-ft]: Philipp Schmid, "Fine-tune classifier with ModernBERT in 2025" — <https://www.philschmid.de/fine-tune-modern-bert-in-2025>
[^setfit-repo]: "huggingface/setfit — Efficient few-shot learning with Sentence Transformers," GitHub — <https://github.com/huggingface/setfit>
[^hf-token-classification]: Hugging Face, "Token classification," NLP Course Ch. 7 — <https://huggingface.co/learn/nlp-course/chapter7/2>
[^layoutlmv3-paper]: Huang, Lv, Cui, Lu, Wei, "LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking," arXiv:2204.08387 (ACM MM 2022) — <https://arxiv.org/abs/2204.08387>
[^hf-layoutlmv3-docs]: Hugging Face, "LayoutLMv3 — Transformers documentation" — <https://huggingface.co/docs/transformers/model_doc/layoutlmv3>
[^philschmid-layoutlm]: Philipp Schmid, "Document AI: Fine-tuning LayoutLM for document-understanding using Hugging Face Transformers" — <https://www.philschmid.de/fine-tuning-layoutlm>
[^few-good-clauses]: Lincoln, Whitehouse, Mar, Perera, "A Few Good Clauses: Comparing LLMs vs Domain-Trained Small Language Models on Structured Contract Extraction," arXiv:2605.05532 — <https://arxiv.org/abs/2605.05532>
[^mindee-cost]: Mindee, "LLMs vs OCR APIs for document processing: the hidden cost trap" — <https://www.mindee.com/blog/llm-vs-ocr-api-cost-comparison>
[^openai-deprecations]: OpenAI API Docs, "Deprecations" — <https://developers.openai.com/api/docs/deprecations>
