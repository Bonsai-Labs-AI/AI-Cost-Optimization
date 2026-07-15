// =============================================================================
// TAXONOMY — single source of truth for the research site.
// Imported by both Astro (build) and scripts/generate-stubs.mjs (Node).
//
// - MATURITY_LEVELS: the 3 tiers of the pyramid (0..2).
// - CATEGORIES: the 9 thematic groupings (used as filters/tags).
// - TECHNIQUES_BY_CATEGORY: every technique, with its category, slug, and
//   maturity level. Levels were confirmed in the fine-grained review (see
//   docs/DECISIONS.md and docs/TECHNIQUE_REVIEW.md); most are no longer
//   provisional. New stubs default to maturityProvisional: true.
//
// `effort`, `gain`, and `riskToQuality` are research outputs and live in each
// technique's markdown frontmatter, not here.
// =============================================================================

/** @typedef {1|2|3} Level */

export const MATURITY_LEVELS = [
  {
    level: 1,
    name: 'Basic Optimization',
    tagline: 'Foundational hygiene & easy wins',
    description:
      'Remove blatant waste and adopt the low-effort, high-confidence wins almost ' +
      'every AI product should have: right-sizing, prompt cleanup, exact and prefix ' +
      'caching, output limits, structured outputs, and basic budget guardrails.',
  },
  {
    level: 2,
    name: 'Advanced Optimization',
    tagline: 'Deliberate, measured engineering',
    description:
      'Systematic context/RAG/agent engineering backed by evaluation. Requires ' +
      'real measurement and a quality bar, but uses mostly off-the-shelf tooling.',
  },
  {
    level: 3,
    name: 'Highly Optimized',
    tagline: 'Custom systems & the cost/quality frontier',
    description:
      'Dynamic routing, semantic caching, fine-tuned and self-hosted models, ' +
      'compression and graph-retrieval pipelines, calibrated quantization, and ' +
      'router-training flywheels. Significant engineering investment with strong ROI ' +
      'at scale — the frontier of cost/quality.',
  },
];

export const CATEGORIES = [
  {
    slug: 'model-routing',
    label: 'Model Choice & Routing',
    short: 'Model Routing',
    blurb: 'Send each request to the cheapest model that can do the job well enough.',
  },
  {
    slug: 'prompt-context',
    label: 'Prompt & Context Optimization',
    short: 'Prompt & Context',
    blurb: 'Spend fewer input tokens per call without losing the information the model needs.',
  },
  {
    slug: 'caching-reuse',
    label: 'Caching & Reuse',
    short: 'Caching',
    blurb: 'Never pay twice for the same (or similar) computation.',
  },
  {
    slug: 'batching-async',
    label: 'Batching & Async Processing',
    short: 'Batching & Async',
    blurb: 'Trade latency for cost by deferring, queueing, and batching non-urgent work.',
  },
  {
    slug: 'rag',
    label: 'RAG-Specific Optimization',
    short: 'RAG',
    blurb: 'Retrieve less, retrieve better — cut context bloat in retrieval pipelines.',
  },
  {
    slug: 'output',
    label: 'Output Optimization',
    short: 'Output',
    blurb: 'Generate fewer, cheaper, more deterministic output tokens.',
  },
  {
    slug: 'fine-tuning',
    label: 'Fine-Tuning, Distillation & Specialized Models',
    short: 'Fine-Tuning',
    blurb: 'Replace a big general model with a small specialized one you own.',
  },
  {
    slug: 'agent-workflow',
    label: 'Agent & Workflow Optimization',
    short: 'Agents',
    blurb: 'Bound, decompose, and compress agentic loops so they stop burning tokens.',
  },
  {
    slug: 'product-ux',
    label: 'Product & UX-Level Optimization',
    short: 'Product & UX',
    blurb: 'Shape product and UX so users pull expensive AI only when it is worth it.',
  },
];

// Helper to keep the technique list compact: [slug, title, level]
const t = (slug, title, level) => ({ slug, title, level });

// TECHNIQUES grouped by category slug. Levels confirmed in the review.
export const TECHNIQUES_BY_CATEGORY = {
  'model-routing': [
    t('model-right-sizing', 'Model Right-Sizing', 1),
    t('provider-and-fallback-routing', 'Provider & Fallback Routing', 2),
    t('reasoning-token-budgeting', 'Reasoning / Thinking-Token Budgeting', 2),
    t('dynamic-model-routing', 'Dynamic Model Routing', 3),
    t('llm-cascades', 'LLM Cascades', 3),
    t('local-open-weight-substitution', 'Local / Open-Weight Model Substitution', 3),
    t('router-training-from-traffic', 'Router Training From Production Traffic', 3),
  ],
  'prompt-context': [
    t('prompt-cleanup', 'Prompt Cleanup', 1),
    t('prompt-modularization', 'Prompt Modularization', 1),
    t('long-context-avoidance', 'Long-Context Avoidance', 1),
    t('few-shot-example-selection', 'Few-Shot Example Selection & Pruning', 2),
    t('structured-context-packing', 'Structured Context Packing', 2),
    t('context-window-budgeting', 'Context Window Budgeting', 1),
    t('provider-native-context-management', 'Provider-Native Context Management', 2),
    t('learned-prompt-compression', 'Learned Prompt Compression (LLMLingua)', 3),
    t('context-reduction', 'Context Reduction', 2),
    t('context-offloading', 'Context Offloading / Filesystem-as-Memory', 2),
    t('automated-prompt-optimization', 'Automated Prompt Optimization (DSPy / GEPA)', 3),
  ],
  'caching-reuse': [
    t('prompt-caching-prefix-caching', 'Prompt Caching / Prefix Caching', 1),
    t('exact-response-caching', 'Exact Response Caching', 1),
    t('rag-pipeline-caching', 'RAG Pipeline Caching', 2),
    t('summary-caching', 'Summary Caching', 2),
    t('semantic-caching', 'Semantic Caching', 3),
    t('tool-result-caching', 'Tool Result Caching', 2),
    t('cache-aware-agent-design', 'Cache-Aware Agent Design', 3),
    t('cache-invalidation-strategies', 'Cache Invalidation Strategies', 2),
  ],
  'batching-async': [
    t('batch-api-usage', 'Batch API Usage', 1),
    t('bulk-extraction-classification', 'Bulk Extraction / Classification Pipelines', 2),
    t('deferred-and-speculative-generation', 'Deferred & Speculative Generation', 2),
  ],
  rag: [
    t('metadata-filtering', 'Metadata Filtering Before Vector Search', 1),
    t('reducing-retrieved-chunk-count', 'Reducing Retrieved Chunk Count', 1),
    t('chunking-parameter-tuning', 'Chunking-Parameter Tuning', 2),
    t('reranking-before-generation', 'Reranking Before Generation', 2),
    t('retrieval-chunk-deduplication', 'Retrieval-Time Chunk Deduplication', 2),
    t('hierarchical-retrieval', 'Hierarchical Retrieval', 2),
    t('precomputed-document-summaries', 'Precomputed Document Summaries', 2),
    t('embedding-quantization-mrl', 'Embedding Quantization & MRL Truncation', 3),
    t('contextual-compression', 'Contextual Compression', 3),
    t('graphrag-vs-vector-tradeoff', 'GraphRAG vs Vector Tradeoff', 3),
  ],
  output: [
    t('output-length-control', 'Output Length Control', 1),
    t('structured-outputs', 'Structured Outputs', 1),
    t('verbosity-controls', 'Verbosity Controls', 1),
    t('streaming-with-early-stop', 'Streaming With Early Stop', 2),
    t('template-plus-fill', 'Template-Plus-Fill Generation', 1),
    t('post-processing-instead-of-generation', 'Post-Processing Instead of Generation', 2),
    t('constrained-decoding', 'Constrained Decoding / Grammars', 3),
  ],
  'fine-tuning': [
    t('fine-tuning-cheaper-models', 'Fine-Tuning Cheaper Models', 3),
    t('task-specific-lightweight-models', 'Task-Specific Lightweight Models', 3),
    t('specialized-embedding-models', 'Specialized Embedding Models', 3),
    t('local-model-deployment', 'Local Model Deployment', 3),
    t('calibrated-quantization', 'Calibrated Quantization (GPTQ / AWQ / QAT)', 3),
    t('multi-lora-serving', 'Multi-LoRA Serving', 3),
  ],
  'agent-workflow': [
    t('agent-budget-guardrails', 'Agent Budget Guardrails', 1),
    t('tool-use-minimization', 'Tool-Use Minimization', 1),
    t('human-in-the-loop-checkpoints', 'Human-in-the-Loop Checkpoints', 2),
    t('agent-memory-management', 'Agent Memory Management', 2),
    t('workflow-decomposition', 'Workflow Decomposition', 2),
    t('programmatic-tool-calling', 'Programmatic Tool Calling (Code Execution with MCP)', 3),
    t('specialized-sub-agents', 'Specialized Sub-Agents', 3),
  ],
  'product-ux': [
    t('ai-feature-gating', 'AI Feature Gating', 1),
    t('user-controlled-quality-mode', 'User-Controlled Quality Mode', 2),
    t('ai-non-ai-hybrid-ux', 'AI / Non-AI Hybrid UX', 1),
    t('precomputed-content-surfacing', 'Precomputed Content Surfacing', 2),
    t('agent-scope-confirmation', 'Agent Scope / Plan Confirmation', 2),
    t('cost-aware-product-tiers', 'Cost-Aware Product Tiers', 2),
  ],
};

// Flattened convenience list: every technique with its category attached.
export const ALL_TECHNIQUES = Object.entries(TECHNIQUES_BY_CATEGORY).flatMap(
  ([category, list]) => list.map((tech) => ({ ...tech, category }))
);

export const EFFORT_VALUES = ['Low', 'Medium', 'High'];
export const GAIN_VALUES = ['Low', 'Medium', 'High', 'Very High'];
export const RISK_VALUES = ['Low', 'Medium', 'High'];
export const STATUS_VALUES = ['planned', 'in-progress', 'researched', 'published'];

export function categoryBySlug(slug) {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function levelByNumber(level) {
  return MATURITY_LEVELS.find((l) => l.level === level);
}
