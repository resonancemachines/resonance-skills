# Research Topic: Event-Driven GraphRAG Incremental Synchronization & Hybrid Caching

> **Status:** `RESOLVED_BY_ADR_0005` ([ADR 0005](../adr/ADR-0005-event-driven-graphrag-incremental-sync-hybrid-caching.md))  
> **Date Initialized:** 2026-10-01  
> **Date Resolved:** 2026-10-02  
> **Author / Lead:** Antigravity (Lead OSS SaaS Architect Assistant)  
> **Resolution Artifacts:**
> - Research Document: [`docs/research/2026-10-02-research.md`](../research/2026-10-02-research.md)
> - Architecture Decision Record: [`docs/adr/ADR-0005-event-driven-graphrag-incremental-sync-hybrid-caching.md`](../adr/ADR-0005-event-driven-graphrag-incremental-sync-hybrid-caching.md)  
> **Target Subsystems:**
> - [`resonance-unified-context`](../architecture/ARCHITECTURE.md#L88) (Port `9001` - Continuous GraphRAG Engine)
> - [`resonance-upload`](../architecture/ARCHITECTURE.md#L58) (Port `8008` - Chunk Negotiation & Streaming Ingestion)
> - [`resonance-research`](../architecture/ARCHITECTURE.md#L55) (Port `8005` - Natural Language Query Façade / CQRS Query Side)
> - Redpanda Cluster (`:19092` - Event Mesh) & Debezium Connect (`:8083` - CDC Engine)
> - Persistence: PostgreSQL 16 `pgvector`/`tsvector` (`:5433`), Neo4j 5.20 (`:7687`), MinIO S3 (`:9000`)

---

## 1. Executive Context & Problem Statement

The Resonance Platform guarantees strict data sovereignty, decentralized microservices, and continuous GraphRAG query execution under a **4.0-second end-to-end SLA** ([`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md#L111-L122)). Under current baseline operation:

1. **Document Ingestion (Flow 2):** Resumable document uploads stream directly to MinIO, emitting a `DocumentUploadedEvent` to Redpanda. `resonance-unified-context` consumes this event, runs text extraction via Apache Tika (`resonance-meta`), generates dense vector embeddings via PostgreSQL `pgvector`, computes lexical BM25 tokens via `tsvector`, maps entities to Schema.org, and writes graph nodes and edges to Neo4j.
2. **Hybrid Search Execution (Flow 3):** User queries trigger parallel retrieval across Neo4j (Cypher traversal ≤ 1200ms) and PostgreSQL (pgvector cosine similarity ≤ 800ms), blended via Reciprocal Rank Fusion (RRF ≤ 150ms), and synthesized by the LLM (≤ 1700ms), totaling ≤ 3925ms.

### Identified Architectural Bottlenecks & Gaps

* **Ingestion-to-Retrieval Freshness Lag:** Full-document re-chunking and vector re-indexing during document updates or incremental edits block real-time agent workflows. Large PDF/DOCX modifications cause localized CPU spikes in `resonance-unified-context`, delaying query freshness beyond multi-agent collaboration tolerance.
* **Cross-Store Consistency Drift:** PostgreSQL (`document_chunks`, embeddings, full-text tokens) and Neo4j (semantic entity graph nodes and relationship edges) are updated via application-level sequential writes. A failure during Neo4j projection after PostgreSQL commit introduces dual-write divergence without a formal reconciliation mechanism.
* **Cache Staleness & Cold-Start Penalty:** Repeated GraphRAG queries from multi-agent teams hitting the same tenant knowledge base lack a granular cache invalidation tier. Coarse TTL-based caching causes stale agent reasoning or frequent high-latency full traversals.

---

## 2. Ingestion Feed Insights & Theoretical Foundation

This research topic synthesizes key empirical patterns from the Q3/Q4 2026 industry intelligence stream:

1. **SystemDRD (*Issue 06: Ingestion Pipeline — Kafka to ClickHouse / High-Throughput Streaming* & *Cognitive Agent Workbench*):**
   * Decouple high-velocity mutation ingestion from read-model projections using log-based Change Data Capture (CDC).
   * Monotonic offset sequencing and partition keying by `hash(tenant_id, document_id)` ensure per-document linearized execution without global locking.
2. **InfoQ (*Adaptive Recommenders in the Real World: Retrieval Freshness and Latency Budgeting* — Mallika Rao):**
   * Real-world RAG systems fail when retrieval freshness exceeds query intervals.
   * Recommendation: Implement multi-stage latency budgeting and event-driven cache invalidation keyed to mutated chunk identifiers rather than coarse table-level flushing.
3. **Anthropic (*2026 Agentic Coding Trends Report — Trends 2 & 3*):**
   * Multi-agent architectures run parallel sub-agents over dedicated context windows, producing high read concurrency on semantic graphs. Sub-second grounding data freshness is critical to prevent cascading agent hallucination loops.

---

## 3. Architectural Design: Incremental CDC Projection & Hybrid Caching

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               DOCUMENT INGESTION & MUTATION                             │
│  MinIO (:9000) ──> [Bucket Notification] ──> Redpanda (:19092) ──> [resonance-upload] │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Writes Chunks & Vectors
                                            ▼
                       ┌──────────────────────────────────────────┐
                       │ PostgreSQL 16 (pgvector + tsvector)     │
                       │ Table: document_chunks [RLS tenant_id]   │
                       └────────────────────┬─────────────────────┘
                                            │ WAL (Write-Ahead Log)
                                            ▼
                       ┌──────────────────────────────────────────┐
                       │ Debezium Connect (:8083)                 │
                       │ Outbox / CDC Engine                      │
                       └────────────────────┬─────────────────────┘
                                            │ Topic: cdc.resonance.document_chunks
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RESONANCE-UNIFIED-CONTEXT (:9001)                         │
│                                                                                        │
│  ┌─────────────────────────────────┐       ┌────────────────────────────────────────┐  │
│  │ Incremental Subgraph Projector  │       │ Semantic Cache & Invalidation Bus      │  │
│  │ • Consumes chunk deltas         │       │ • Targeted RRF candidate cache eviction│  │
│  │ • Scoped Neo4j Cypher MERGE     │       │ • Tenant-isolated LRU memory buffer    │  │
│  └────────────────┬────────────────┘       └───────────────────▲────────────────────┘  │
│                   │                                            │                       │
│                   ▼ Bolt (:7687)                               │ Invalidation Key      │
│  ┌─────────────────────────────────┐                           │                       │
│  │ Neo4j 5.20 Graph Database       │ ──────────────────────────┘                       │
│  │ ($tenantId parameterized edges) │                                                   │
└───────────────────┬────────────────────────────────────────────────────────────────────┘
                    │
                    ▼ Synchronous gRPC (:9001) [Latency SLA ≤ 2.1s]
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      FRONT-OFFICE: resonance-research (:8005)                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Pattern 1: Debezium CDC Log-Based Graph Projection
* **Log-Centric Synchronization:** In alignment with [ADR 0001](../adr/0001-transactional-outbox-event-structure.md), custom polling loops are strictly forbidden. Mutations to PostgreSQL `document_chunks` are captured directly from the PostgreSQL Write-Ahead Log (WAL) by Debezium Connect (`:8083`) and published to the Redpanda event bus under `cdc.resonance.document_chunks`.
* **Partition Ordering Guarantee:** The partition key is set to `${tenant_id}:${document_id}` using Debezium Single Message Transforms (SMTs). All chunk operations for a specific document within a tenant partition arrive sequentially, eliminating race conditions during graph restructuring.

### Pattern 2: Incremental Subgraph Mutation via Parameterized Cypher
* Instead of purging and rebuilding the full document entity tree in Neo4j, `resonance-unified-context` executes targeted Cypher delta patches:
  ```cypher
  // Incremental node/relationship reconciliation
  MATCH (t:Tenant {id: $tenantId})-[:OWNS]->(d:Document {id: $documentId})
  MERGE (c:Chunk {id: $chunkId, tenantId: $tenantId})
  ON CREATE SET c.contentHash = $hash, c.updatedAt = timestamp()
  ON MATCH SET c.contentHash = $hash, c.updatedAt = timestamp()
  MERGE (d)-[r:CONTAINS_CHUNK]->(c)
  WITH c
  UNWIND $extractedEntities AS entity
  MERGE (e:Entity {id: entity.id, tenantId: $tenantId})
  MERGE (c)-[:REFERENCES]->(e);
  ```
* **Multi-Tenant Invariant:** Strict parameterized `$tenantId` matching guarantees that entity graph traversals cannot traverse foreign tenant nodes.

### Pattern 3: Two-Tier Reciprocal Rank Fusion (RRF) Semantic Caching
* **Tier 1 (Dense Query Vector Cache):** In-memory LRU cache storing normalized query embeddings and recent vector nearest-neighbor indices, reducing repeated embedding inference costs.
* **Tier 2 (RRF Candidate Fusion Cache):** Cache storing candidate document/chunk IDs from combined Cypher multi-hop and BM25 searches.
* **Event-Driven Invalidation Bus:** Upon receipt of a `ChunkModified` or `ChunkRevoked` CDC event from Redpanda, `resonance-unified-context` extracts affected `${tenant_id}` and `${document_id}` / `${chunk_id}` tags, evicting only matching query results from the RRF cache instantly.

---

## 4. Latency Budget & SLA Breakdown (< 4.0s SLA)

| Step | Operation | Current Baseline | Proposed Target (with Incremental Cache) | Status / Target |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Ingress & Auth / PII Tokenize (`resonance-crypto`) | 75 ms | 75 ms | Preserved |
| 2 | Internal gRPC Dispatch (`resonance-research` -> Context) | 15 ms | 15 ms | Preserved |
| 3 | Semantic Cache Lookup (Tier 1 & 2) | N/A | **20 ms** *(Cache Hit Path)* | **New Fast Path** |
| 4 | Neo4j Cypher Traversal (`$tenantId`) | 1200 ms | **350 ms** *(Incremental Subgraph)* | Optimized |
| 5 | PostgreSQL `pgvector` Cosine Search | 800 ms | **450 ms** *(Partitioned IVFFlat/HNSW)* | Optimized |
| 6 | Reciprocal Rank Fusion Blending | 150 ms | **50 ms** | Optimized |
| 7 | Gemini Context Synthesis & Guardrails | 1700 ms | 1700 ms | Preserved |
| **Total** | **End-to-End Query Cycle** | **3940 ms** | **2640 ms** *(Cold/Miss)* / **1810 ms** *(Cache Hit)* | **< 4.0s SLA Guaranteed** |

---

## 5. Architectural Invariants Compliance Matrix

| Invariant | Requirement | Compliance Strategy in Proposed Architecture |
| :--- | :--- | :--- |
| **Zero Cloud Lock-in** | No proprietary AWS/GCP managed databases or streaming primitives. | 100% open-source: PostgreSQL 16 (`pgvector`), Neo4j 5.20 CE/EE, Redpanda, MinIO, Debezium Connect. |
| **Database-Per-Service** | Isolated relational schemas; no cross-service direct SQL joins. | `resonance-unified-context` maintains exclusive domain ownership over its vector and graph stores. Cross-service sync occurs strictly via Redpanda CDC events. |
| **Kernel-Level Multi-Tenancy** | Mathematical guarantee against cross-tenant data leakage. | PostgreSQL Row-Level Security (`tenant_id`) enforced on all tables; Neo4j parameterized Cypher `$tenantId` validated in all query templates. |
| **No Two-Phase Commit (2PC)** | Distributed transactions must use Choreographed Sagas / Outbox. | Ingestion uses Transactional Outbox + Debezium WAL streaming; graph projection consumer implements idempotent replay logic. |
| **Deterministic Classpaths** | BOM-managed dependencies across Spring Boot 4.x. | Starters defined via `resonance-bom` and `resonance-starter-unifiedcontext`. |

---

## 6. Implementation Milestones & ADR Promotion Criteria

This research topic will remain the active lock until the following empirical milestones are validated:

1. **CDC Event Flow Validation:** Configure Debezium PostgreSQL connector for `document_chunks` and verify partition distribution over Redpanda topic `cdc.resonance.document_chunks`.
2. **Cypher Delta Benchmark:** Verify that parameterized Cypher incremental updates complete in ≤ 100ms per 50-chunk document update batch.
3. **Cache Eviction Test:** Validate that writing a new chunk version to PostgreSQL evicts the corresponding RRF cache key within ≤ 250ms.
4. **End-to-End SLA Verification:** Run `deploy/scripts/platform-benchmark.py` to confirm query SLA ≤ 2.7s on cold queries and ≤ 1.9s on warm/cached queries.
5. **Promotion to ADR:** Upon passing all benchmarks, author and merge **ADR 0005: Event-Driven GraphRAG Incremental Synchronization and Hybrid Semantic Caching** in [`docs/adr/`](../../docs/adr/).
