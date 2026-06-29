---
title: "Metadata Filtering Before Vector Search"
category: rag
maturityLevel: 1
maturityProvisional: false
shortDescription: "Pre-filter the candidate set by metadata (tenant, date, doc-type, ACL) before the nearest-neighbor search so the vector DB scans far fewer vectors — cutting retrieval compute and improving precision, with tenant/ACL isolation as a correctness and security bonus."
effort: Low
gain: Low
riskToQuality: Low
effortWhy: "Most vector databases make a pre-filter a one-line addition to the query, so adoption is near-zero engineering effort."
gainWhy: "The direct win lands on vector-DB compute and precision, not LLM tokens, so the cost saving is real but modest."
riskWhy: "Done right with correct engine config, a pre-filter only narrows scope to eligible vectors, so there is essentially no quality risk."
detectionSignals:
  - "Whole-corpus search — vector search runs across every tenant, recency, and document type, so every query touches every customer's vectors."
  - "App-code post-filtering — the app retrieves a wide top-k then discards chunks in your own code by checking metadata after the fact."
  - "Unscoped multi-tenant index — no per-tenant scoping, so one customer's query can surface another customer's documents."
  - "Archive over-scan — queries over a 'current quarter' or 'this product' slice still scan years of archived or unrelated content."
measurementMethods:
  - "Candidate-set size — number of vectors actually scanned per query with vs. without the metadata filter."
  - "Retrieval latency and DB cost — p50/p95 latency and vector-DB query cost/compute per query, filtered vs. unfiltered."
  - "Result precision — share of retrieved chunks that pass the tenant/recency/type constraint (should be 100% with a correct pre-filter)."
  - "Cross-tenant leakage — documents returned that belong to a different tenant/ACL scope (target zero)."
status: published
lastUpdated: "2026-06-29"
related:
  - "rag/reducing-retrieved-chunk-count"
  - "rag/reranking-before-generation"
sources:
  - id: pinecone-filtering
    title: "The Missing WHERE Clause in Vector Search"
    publisher: "Pinecone — Learn"
    year: 2026
    url: "https://www.pinecone.io/learn/vector-search-filtering/"
    accessed: "2026-06-29"
    kind: docs
    note: "Pre-filtering forces brute-force over every remaining vector ('not manageable for datasets in the millions or billions'); post-filtering can return fewer than k or zero results; single-stage filtering merges the vector and metadata indexes. Benchmark on 1.2M 768-dim vectors: 79.2ms unfiltered → 51.6ms with strict equality filter."
  - id: pinecone-research
    title: "Accurate and Efficient Metadata Filtering in Pinecone's Serverless Vector Database"
    publisher: "Pinecone — Research"
    authors: "Amir Ingber, Edo Liberty"
    year: 2025
    url: "https://www.pinecone.io/research/accurate-and-efficient-metadata-filtering-in-pinecones-serverless-vector-database/"
    accessed: "2026-06-29"
    kind: paper
    note: "Integrates filtering into the vector retrieval path for scalable performance while maintaining exact filtering accuracy across public datasets and production data."
  - id: pinecone-namespaces
    title: "Indexing overview — namespaces for multitenancy"
    publisher: "Pinecone — Docs"
    year: 2026
    url: "https://docs.pinecone.io/guides/index-data/indexing-overview"
    accessed: "2026-06-29"
    kind: docs
    note: "One namespace per customer isolates tenant data and 'speeds up queries by ensuring only relevant records are scanned'; namespaces (not metadata) are the recommended tenant-isolation mechanism."
  - id: pinecone-filter-docs
    title: "Filter by metadata"
    publisher: "Pinecone — Docs"
    year: 2026
    url: "https://docs.pinecone.io/guides/search/filter-by-metadata"
    accessed: "2026-06-29"
    kind: docs
    note: "Records carry metadata key-value pairs; a filter expression passed at query time limits the search to records matching the filter."
  - id: qdrant-filtering
    title: "A Complete Guide to Filtering in Vector Search"
    publisher: "Qdrant"
    year: 2026
    url: "https://qdrant.tech/articles/vector-search-filtering/"
    accessed: "2026-06-29"
    kind: docs
    note: "Naive pre-filtering on low-cardinality filters fragments the HNSW graph; post-filtering discards too many candidates. Filterable HNSW filters during traversal; payload index used below a cardinality threshold (default full-scan threshold 10KB); falls back to full scan when very selective."
  - id: weaviate-filtering
    title: "Filtering"
    publisher: "Weaviate — Documentation"
    year: 2026
    url: "https://docs.weaviate.io/weaviate/concepts/filtering"
    accessed: "2026-06-29"
    kind: docs
    note: "Pre-filtering builds an inverted-index allowlist of eligible candidate IDs before search; HNSW traverses edges normally but only adds allow-listed IDs to results. Roaring Bitmaps for match-based filters; ACORN default strategy (v1.34+) for low-correlation filters."
  - id: pgvector-readme
    title: "pgvector — filtering and iterative index scans"
    publisher: "pgvector (GitHub)"
    year: 2026
    url: "https://github.com/pgvector/pgvector"
    accessed: "2026-06-29"
    kind: repo
    note: "With approximate indexes, a WHERE filter is applied after the index scan: 'If a condition matches 10% of rows, with HNSW and the default hnsw.ef_search of 40, only 4 rows will match on average.' Iterative scans (hnsw.iterative_scan = strict_order|relaxed_order, 0.8.0+) and partitioning/partial indexes mitigate over-filtering."
  - id: pgvector-issue
    title: "HNSW index bypassed when LIMIT or filter selectivity exceeds threshold (#721)"
    publisher: "pgvector (GitHub Issues)"
    year: 2025
    url: "https://github.com/pgvector/pgvector/issues/721"
    accessed: "2026-06-29"
    kind: repo
    note: "Illustrates that filter selectivity and LIMIT interact with the approximate index and can change which plan Postgres chooses — filtering behaviour is plan- and selectivity-dependent."
---

## Overview

A vector search answers "which stored chunks are most similar to this query?" by an
approximate-nearest-neighbor (ANN) traversal over an index of embeddings. By default that
search considers the **entire corpus** — every tenant's documents, every revision, every
archived report. But most real queries only care about a slice of it: *this customer's*
documents, the *current* quarter, *PDF contracts* only, the records a user is *allowed* to
see. **Metadata filtering** attaches structured fields to each vector (tenant id, date,
doc-type, ACL/permission, source, language) and constrains the search by those fields *before*
the ANN step, so the engine only searches the candidate set that matches — for example,
shrinking a 10-million-vector index down to the ~1,000 vectors belonging to one customer's
current project.[^pinecone-filter-docs][^pinecone-namespaces]

It is important to be honest about **where the win actually lands**, because this technique is
easy to oversell. The primary, direct benefit is **vector-database compute and precision**:
fewer vectors scanned means less ANN work per query, lower retrieval latency, and a returned
set that is *exactly* on-scope rather than padded with off-tenant or stale matches.[^pinecone-filtering]
There is a real but **downstream and secondary** token benefit — a tighter, more relevant
candidate set means fewer junk chunks slip into the generation prompt — but the LLM-token
savings come mostly from *how many chunks you ultimately pass* (see *Reducing Retrieved Chunk
Count*), not from the filter itself. And there is a third payoff that is arguably more
important than cost in regulated or multi-tenant products: **correctness and security**.
Scoping a query to a tenant or an ACL is the mechanism that stops one customer's vectors from
ever surfacing in another customer's results.[^pinecone-namespaces]

That profile — near-zero engineering effort, modest-but-real infra/precision gain, and a
correctness bonus, with essentially no quality risk when done right — is why it sits at
**Level 1 (Basic Optimization)**. Almost every production RAG system with more than one tenant,
a time dimension, or distinct document types should be filtering, and most vector databases
make it a one-line addition to the query.

## Detailed Approach & Techniques

### Pre-filter vs. post-filter (the distinction that matters)

There are two naive ways to combine a filter with an ANN search, and both have failure modes:

- **Post-filtering** runs the vector search first over the whole corpus, then drops results
  that fail the metadata predicate. The problem is that the ANN search returns a *fixed* top-k,
  and the filter can decimate it: if you ask for `k=10` but six of those ten fail the filter,
  "we've returned four" — and if none of the top-k match, "that leaves us with no results at
  all."[^pinecone-filtering] You can crank k way up to compensate, but that "circles back to
  slow search times." This is also what *application-code filtering* effectively is: retrieve
  wide, then discard by metadata in your own code — paying for the wide retrieval and still
  risking empty result sets.

- **Pre-filtering** restricts the candidate set *before* the similarity search, so the ANN step
  only ever considers eligible vectors. This gives the accurate, on-scope results you want —
  but a *naive* implementation breaks ANN indexes: the HNSW graph relies on full connectivity,
  and removing most nodes "disrupt[s] the connections within the graph," producing "fragmented
  search paths" and poor recall.[^qdrant-filtering] On approximate indexes the predicate is
  often applied *after* the index scan for exactly this reason — which reintroduces the
  over-filtering problem.

The job of a modern vector DB is to deliver pre-filter *accuracy* without the
brute-force-or-broken-graph penalty. The vendors solve it differently, and the configuration
differs accordingly.

### How the major vector DBs implement filtered search

- **Pinecone — single-stage filtering.** Rather than filter-then-search or search-then-filter,
  Pinecone "merg[es] the vector and metadata indexes into a single index," giving pre-filter
  accuracy "without being restricted to small datasets."[^pinecone-filtering] You attach
  metadata to each record and pass a `filter` expression at query time.[^pinecone-filter-docs]
  Because the filter narrows the work, a filtered query can be *as fast or faster* than an
  unfiltered one — their benchmark on 1.2M 768-dim vectors drops from **79.2 ms unfiltered to
  51.6 ms** with a strict equality filter.[^pinecone-filtering] For **tenant isolation
  specifically**, Pinecone recommends **namespaces** (one per customer) over metadata filtering
  — a namespace both isolates data and "speeds up queries by ensuring only relevant records are
  scanned."[^pinecone-namespaces]

- **Qdrant — filterable HNSW.** Qdrant builds **payload indexes** (inverted indexes on metadata)
  and adapts based on filter selectivity. When a filter matches many points it does a normal
  HNSW traversal that skips non-matching nodes in place; when the matching set is tiny it can
  skip the graph entirely and **full-scan** (the default full-scan threshold is **10 KB** of
  matching payload), which is faster than fighting a fragmented graph.[^qdrant-filtering] You
  must create a payload index on the fields you filter on for this to engage.

- **Weaviate — allowlist pre-filtering.** Weaviate builds an **inverted-index allowlist** of
  eligible candidate IDs *before* search; the HNSW search "will move along any node's edges
  normally, but will only add ids to the result set that are present on the allow
  list."[^weaviate-filtering] Match-based filters use **Roaring Bitmaps** for fast set
  operations, and the default **ACORN** strategy (v1.34+) accelerates cases where the filter has
  low correlation with the query vector.[^weaviate-filtering]

- **pgvector (Postgres) — post-filter by default, iterative scans to fix it.** With an
  approximate index, "filtering is applied *after* the index is scanned," so an over-selective
  WHERE clause under-fills the LIMIT — "if a condition matches 10% of rows, with HNSW and the
  default `hnsw.ef_search` of 40, only 4 rows will match on average."[^pgvector-readme] The fix
  is **iterative scans** (`SET hnsw.iterative_scan = strict_order` or `relaxed_order`, 0.8.0+),
  which keep pulling candidates until the filter is satisfied; for high-cardinality dimensions
  like tenant, **partitioning the table** (or a **partial index** per category) makes the filter
  effectively a pre-filter.[^pgvector-readme] Be aware that the planner's choice flips with
  selectivity and LIMIT, so filtered behaviour is plan-dependent and worth checking with
  `EXPLAIN`.[^pgvector-issue]

### Practical guidance

1. **Index the fields you filter on.** Every engine needs the metadata field to be indexed
   (payload index, inverted index, or a Postgres b-tree/partition) for filtering to be cheap;
   filtering on an unindexed field degrades back toward a scan.[^qdrant-filtering][^pgvector-readme]
2. **Use the strongest isolation primitive for tenancy.** Where the engine offers
   **namespaces/collections/partitions**, prefer them for hard tenant or ACL isolation over a
   metadata equality filter — they give both a security boundary and a scan-size reduction.[^pinecone-namespaces][^pgvector-readme]
3. **Keep filters low-dimensional and high-signal.** Tenant, date range, doc-type, language,
   and permission scope cover most needs; over-engineering dozens of rarely-used filter fields
   adds index maintenance for little gain.
4. **Don't filter in app code.** Retrieving wide and discarding by metadata afterwards is the
   post-filter anti-pattern: you pay for the wide search and can still come up short.[^pinecone-filtering]

## Example Where It Works

A B2B SaaS knowledge assistant serves **2,000 customer tenants** sharing one vector index of
**10 million** chunks. A user at one tenant asks a question scoped to their own "Q2 2026
contracts."

- **Without filtering:** every query runs ANN over all 10M vectors. Results are padded with
  other tenants' and prior-year documents, which must be discarded in app code — and worse, a
  near-miss could surface *another customer's* contract, a correctness and security defect.
- **With a pre-filter** (`tenant_id = T` AND `doc_type = "contract"` AND `date in Q2-2026`),
  the engine searches only the ~1,000 vectors in that slice. ANN work and retrieval latency
  drop sharply — filtered queries can run *as fast as or faster than* the unfiltered baseline,
  as in Pinecone's 79.2 ms → 51.6 ms benchmark[^pinecone-filtering] — every returned chunk is
  on-scope, and cross-tenant leakage is structurally impossible because the search never
  considered other tenants' vectors.[^pinecone-namespaces] The downstream prompt is also
  cleaner: with only relevant chunks surfacing, fewer junk chunks reach the generation step, so
  a tight top-k spends its budget on signal — the token win is real but secondary to the
  compute, precision, and isolation wins.

## Example Where It Would NOT Work

- **A small, single-tenant corpus.** A 20,000-chunk internal wiki with one tenant and no
  meaningful date/type axis has nothing to pre-filter on; the ANN search is already cheap and
  fast, so adding filter infrastructure buys essentially nothing. The cost lever there is
  *reducing retrieved chunk count* and *reranking*, not filtering.
- **Filters that match almost the whole corpus.** If 95% of vectors satisfy the predicate, the
  candidate set barely shrinks and the compute/precision win evaporates — and on a naive
  pre-filter against an HNSW graph, a *low-cardinality* filter can even *hurt* recall by
  fragmenting the graph.[^qdrant-filtering] Filtering pays off when it is selective.
- **Expecting it to be a token-savings headline.** If the goal is to cut LLM input tokens, the
  filter is the wrong primary lever: it improves *which* chunks are candidates, but the prompt
  size is set by your top-k. A team that pre-filters but still passes 20 chunks to the model
  saves on vector-DB compute, not on generation tokens — the token win comes from *Reducing
  Retrieved Chunk Count* and *Reranking Before Generation*.
- **Mis-tuned engine config that silently post-filters.** On pgvector without iterative scans
  (or on any engine filtering an unindexed field), a selective filter under an approximate index
  can return fewer rows than the LIMIT — "only 4 rows will match on average" for a 10%-selective
  filter at default `ef_search` — degrading recall while looking like the feature
  works.[^pgvector-readme][^pgvector-issue] The remedy is correct configuration (iterative scans,
  payload/partition indexes), not abandoning the filter.

[^pinecone-filtering]: Pinecone, "The Missing WHERE Clause in Vector Search," Learn — <https://www.pinecone.io/learn/vector-search-filtering/>
[^pinecone-research]: A. Ingber & E. Liberty, "Accurate and Efficient Metadata Filtering in Pinecone's Serverless Vector Database," Pinecone Research — <https://www.pinecone.io/research/accurate-and-efficient-metadata-filtering-in-pinecones-serverless-vector-database/>
[^pinecone-namespaces]: Pinecone Docs, "Indexing overview" (namespaces for multitenancy) — <https://docs.pinecone.io/guides/index-data/indexing-overview>
[^pinecone-filter-docs]: Pinecone Docs, "Filter by metadata" — <https://docs.pinecone.io/guides/search/filter-by-metadata>
[^qdrant-filtering]: Qdrant, "A Complete Guide to Filtering in Vector Search" — <https://qdrant.tech/articles/vector-search-filtering/>
[^weaviate-filtering]: Weaviate Documentation, "Filtering" — <https://docs.weaviate.io/weaviate/concepts/filtering>
[^pgvector-readme]: pgvector, README — filtering & iterative index scans — <https://github.com/pgvector/pgvector>
[^pgvector-issue]: pgvector, Issue #721 — "HNSW index bypassed when LIMIT or filter selectivity exceeds threshold" — <https://github.com/pgvector/pgvector/issues/721>
