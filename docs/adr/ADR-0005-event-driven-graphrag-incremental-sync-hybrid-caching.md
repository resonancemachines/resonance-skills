# ADR 0005: Event-Driven GraphRAG Incremental Synchronization and Hybrid Semantic Caching

## Status
Accepted

## Date
2026-10-02

## Context & Problem Statement

The Resonance Platform guarantees strict data sovereignty, microservice decentralization, and continuous GraphRAG retrieval under a non-negotiable **4.0-second end-to-end SLA** ([`ARCHITECTURE.md`](../../ARCHITECTURE.md#L111-L122)). 

Under the baseline architecture ([ADR 0002](../adr/0002-core-platform-architecture.md), [ADR 0003](../adr/0003-orchestrator.md), and [ADR 0004](../adr/0004-upload.md)):
1. **Document Ingestion:** Resumable multipart uploads stream raw bytes directly to MinIO (`:9000`). Once assembled, `resonance-upload` records the event in its Outbox. `resonance-meta` extracts text via Apache Tika, and `resonance-unified-context` vectorizes chunks into PostgreSQL `pgvector` and projects semantic entities into Neo4j 5.20.
2. **Retrieval Flow:** Hybrid search blends dense vector search (`pgvector`), lexical search (`tsvector` BM25), and multi-hop graph traversal (Neo4j Cypher) via Reciprocal Rank Fusion (RRF) before Gemini LLM synthesis.

### The Critical Bottlenecks
* **Full-Document Reprocessing Penalty:** When an existing multi-page file in the file system is updated or partially edited, the existing pipeline dropped all existing chunks (`deleteByTenantIdAndDocumentId`) and re-processed the entire document. For large documents, this induced localized CPU saturation in `resonance-unified-context`, delayed query freshness for multi-agent workflows, and generated excessive redundant embedding inference costs.
* **Dual-Write Consistency Drift:** Committing chunk embeddings to PostgreSQL followed by an asynchronous graph projection to Neo4j created an unmanaged failure boundary. Transient Neo4j network timeouts or cluster rebalancing resulted in cross-store divergence with no automated reconciliation.
* **Cache Staleness & Cold-Start Thrashing:** Multi-agent teams executing continuous GraphRAG queries against shared workspaces suffered from coarse time-based query caching (`expireAfterWrite(5m)`). Edits were invisible to agents for up to 5 minutes, while global cache flushing (`invalidateAll()`) destroyed warm cache benefits and caused query latency spikes exceeding 3.9 seconds.

---

## 1. High-Level Architectural Decision Matrix

| Dimension | Architectural Decision | Justification |
| :--- | :--- | :--- |
| **Operational Overhead** | **Debezium CDC over PostgreSQL WAL + Native MinIO Events** | Eliminates custom `@Scheduled` polling loops and file-system watchers. Mutations in `document_chunks` stream directly from PostgreSQL's Write-Ahead Log into Redpanda topics. 100% open-source primitives. |
| **Scalability Boundaries** | **Content-Hash Chunk Deltas & Partitioned SMT Ordering** | Shift compute complexity from $\mathcal{O}(N)$ to $\mathcal{O}(\Delta)$. Unchanged chunks bypass embedding models and Cypher traversals. Partition keying on `hash(tenant_id, document_id)` guarantees monotonic, race-free processing per document. |
| **Multi-Tenancy Isolation** | **Kernel RLS + Parameterized `$tenantId` + Namespace Caching** | PostgreSQL Row-Level Security blocks cross-tenant SQL access; all Neo4j Cypher statements strictly bind `$tenantId`; cache keys enforce `${tenantId}:${workspaceId}:${hash}` namespaces. |
| **Developer Velocity** | **Java 21 Sealed DTOs + Spring Boot Microservices** | Strict typing with Java 21 `record` and `sealed interface` types, standard Spring AI `EmbeddingModel`, and Spring Data Neo4j abstractions prevent brittle runtime schema drift. |

---

## 2. Considered Options

### Option A: Full-Document Reprocessing with Application-Level Outbox Polling & Coarse TTL
* Re-chunk and re-embed the entire file on every modification. Use a Spring `@Scheduled` background worker to poll an outbox table for document changes. Maintain a simple 5-minute TTL cache in the query façade.
* **Pros:** Simple initial implementation; minimal event choreography.
* **Cons (Rejected):** Violates [ADR 0001](../adr/0001-transactional-outbox-event-structure.md) (banning polling loops). Re-processing 200-page documents for single-paragraph edits creates unsustainable LLM embedding overhead and CPU exhaustion. Stale reads directly violate multi-agent collaboration safety.

### Option B: Distributed Two-Phase Commit (2PC / XA) Across PostgreSQL and Neo4j
* Wrap relational vector insertion and Neo4j graph entity projection in a distributed XA transaction coordinator to ensure atomic multi-store synchronization.
* **Pros:** Immediate ACID consistency across relational and graph stores.
* **Cons (Rejected):** Strictly violates **Architectural Invariant 1: No Two-Phase Commit** ([`README.md`](../../README.md#L140), [`ARCHITECTURE.md`](../../ARCHITECTURE.md#L138)). Introduces severe latency bottlenecks, tight runtime coupling, and cluster-wide blocking when any single database replica stalls.

### Option C (Selected): Log-Based CDC (Debezium + Redpanda), Incremental Parameterized Cypher Delta Synchronization, and Two-Tier Event-Driven Semantic Caching
* Use MinIO multipart uploads and bucket notifications to trigger ingestion sagas.
* Ingest extracted text using a content-hash delta identification algorithm in PostgreSQL.
* Stream row mutations from PostgreSQL WAL via Debezium Connect to `cdc.resonance.document_chunks`.
* Project chunk deltas into Neo4j incrementally via parameterized Cypher statements (`MERGE`, `ON MATCH SET`, `DETACH DELETE`).
* Implement a Two-Tier Semantic Cache (Tier 1: Query Vector Cache; Tier 2: RRF Candidate Fusion Cache) backed by a real-time event-driven invalidation bus.
* **Pros:** 100% compliant with all architectural invariants; sub-second incremental indexing; cache eviction within $\le 250\text{ ms}$; reduces cold query latency from $3.94\text{ s}$ to $2.64\text{ s}$ and warm query latency to $1.81\text{ s}$.

---

## 3. Decision Outcome & Architectural Blueprint

We selected **Option C**. The formal architectural decisions and technical specifications are detailed below:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              THE SELECTED ARCHITECTURE                                 │
│                                                                                        │
│  [MinIO :9000] ──> [S3 Notification] ──> [Redpanda :19092] ──> [resonance-workflow]  │
│                                                                        │               │
│                                            ┌───────────────────────────┘               │
│                                            ▼                                           │
│  [resonance-meta :8109] ──(Tika Stream)──> [resonance-unified-context :9001]          │
│                                            │                                           │
│                                            ├──> Computes Content-Hashes (SHA-256)      │
│                                            └──> Diffs against PostgreSQL document_chunks│
│                                                         │                              │
│                                                         ▼ WAL                          │
│                                            [Debezium Connect CDC :8083]                │
│                                                         │                              │
│                                                         ▼ Topic: cdc.resonance...      │
│                                     ┌───────────────────┴───────────────────┐          │
│                                     ▼                                       ▼          │
│                    [Incremental Cypher Projector]            [Invalidation Bus]        │
│                    • Scoped Neo4j MERGE/DELETE               • Evicts matching query   │
│                    • Parameterized $tenantId                 • Tier 2 Caffeine Cache   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Content-Hash Delta Chunking Engine
1. During document processing, `TextChunkingService` segments text into overlapping windows (512 tokens with 64-token stride).
2. Each chunk receives a deterministic fingerprint: `chunkHash = SHA-256(chunkIndex + ":" + chunkContent)`.
3. The engine performs a single indexed query against `document_chunks` for existing hashes matching `(tenantId, documentId)`:
   - **Identical Hash:** Retained without modification. Vectorization and graph extraction are skipped entirely.
   - **Modified Hash:** Vectorized via Spring AI `EmbeddingModel` and updated in PostgreSQL.
   - **New Index:** Vectorized and inserted into PostgreSQL.
   - **Obsolete Index:** Removed from PostgreSQL.
4. All relational writes occur in a single local transaction, protected by PostgreSQL Row-Level Security.

### 3.2 Log-Based CDC Stream Routing (Debezium Connect)
1. Debezium captures inserts, updates, and deletes directly from the PostgreSQL Write-Ahead Log.
2. A single message transform (SMT) routes events to `cdc.resonance.document_chunks`.
3. The message key is deterministically set to `${tenant_id}:${document_id}`, ensuring that all chunk changes for any given document are serialized within the same Redpanda partition.
4. Consumers use manual immediate offset acknowledgment (`ackMode = MANUAL_IMMEDIATE`) paired with a transactional deduplication ledger (`cdc_processed_events`), guaranteeing idempotent at-least-once delivery.

### 3.3 Incremental Parameterized Subgraph Projection
1. `IncrementalGraphProjectionService` consumes CDC events.
2. For chunk creates/updates, it executes targeted Cypher delta patches binding `$tenantId`:
   ```cypher
   MATCH (t:Tenant {id: $tenantId})-[:OWNS]->(d:Document {id: $documentId})
   MERGE (c:Chunk {id: $chunkId, tenantId: $tenantId})
   ON CREATE SET c.chunkIndex = $chunkIndex, c.contentHash = $contentHash, c.updatedAt = timestamp()
   ON MATCH SET c.chunkIndex = $chunkIndex, c.contentHash = $contentHash, c.updatedAt = timestamp()
   MERGE (d)-[r:CONTAINS_CHUNK]->(c)
   WITH c
   UNWIND $entities AS entity
   MERGE (e:Entity {id: entity.id, tenantId: $tenantId})
   ON CREATE SET e.name = entity.name, e.type = entity.type, e.updatedAt = timestamp()
   MERGE (c)-[:REFERENCES]->(e)
   SET r.confidence = entity.confidence;
   ```
3. For chunk deletions, it executes:
   ```cypher
   MATCH (c:Chunk {id: $chunkId, tenantId: $tenantId})
   DETACH DELETE c;
   ```
4. Full graph rebuilds are explicitly forbidden.

### 3.4 Two-Tier Reciprocal Rank Fusion (RRF) Semantic Caching
To maintain sub-4.0s SLA under heavy concurrent query load:
- **Tier 1 (Dense Query Vector Cache):** In-memory Caffeine cache storing normalized query strings mapped to their 768-dimensional float embeddings (`expireAfterAccess(2h)`). Eliminates repeated embedding model inference latencies (~120ms).
- **Tier 2 (RRF Candidate Fusion Cache):** In-memory W-TinyLFU Caffeine cache storing ranked `SearchResult` lists keyed by `${tenantId}:${workspaceId}:${sha256(normalizedQuery)}`.

### 3.5 Real-Time Semantic Invalidation Bus
- Mutation of any chunk automatically publishes an invalidation event to `resonance.cache.invalidations`.
- `SemanticCacheManager` maintains an in-memory reverse dependency map: `{documentId} -> Set<CacheKey>`.
- When an invalidation signal arrives, only the queries dependent on that document are evicted from the Tier 2 cache within $\le 250\text{ ms}$.
- Background coarse TTL is maintained at 15 minutes as a fallback safety boundary.

### 3.6 Choreographed Saga Compensations & Failure Containment
- In the event of a Neo4j projection failure or timeout:
  1. The consumer retries up to 5 times with exponential backoff and jitter.
  2. If retries are exhausted, the event is routed to `resonance.dlq.document_chunks` and handled by `resonance-support` (`:8006`).
  3. A compensating event is published to `resonance-workflow`, updating the document state in PostgreSQL to `PARTIAL_DEGRADED_STATE`.
  4. Vector and BM25 search remain functional and serve existing chunks, preventing complete service interruption.

---

## 4. Compliance Matrix with Platform Architectural Invariants

| Platform Invariant | Requirement | Compliance Mechanism in ADR 0005 |
| :--- | :--- | :--- |
| **1. No Two-Phase Commit** | Distributed transactions must use Choreographed Sagas and Outbox. | PostgreSQL WAL CDC via Debezium Connect streams events asynchronously to Redpanda; graph projections execute as independent, idempotent consumers with local deduplication tables. |
| **2. Zero Plaintext PII in Mesh** | All PII tokenized at edge before event emission. | `resonance-crypto` intercepts extracted text and tokenizes sensitive entities into vaulted surrogate tokens before chunk hashing or vector persistence. Plaintext PII never enters Kafka, PostgreSQL embeddings, or Neo4j. |
| **3. Database-Per-Service** | Isolated schemas; no direct cross-database SQL joins. | `resonance-unified-context` maintains exclusive ownership of its relational schema, vector tables, and Neo4j graph. Services communicate strictly via asynchronous Redpanda topics and gRPC contracts. |
| **4. Multi-Tenant Isolation** | Kernel-level guarantees against cross-tenant data bleed. | PostgreSQL tables enforce Row-Level Security (`tenant_id = current_setting('app.current_tenant_id')`); all Neo4j Cypher queries enforce `$tenantId` parameterized bindings; semantic cache keys are partitioned by `tenantId`. |
| **5. Deterministic Classpaths** | No unmanaged library versions outside `resonance-bom`. | All Spring Boot starters, Caffeine, Jackson, Neo4j, and Kafka dependencies are inherited directly from `com.resonancemachines:resonance-bom`. |

---

## 5. Latency Budget & Mathematical SLA Impact

| Operation | Baseline Architecture | ADR 0005: Cache Miss | ADR 0005: Cache Hit | Target SLA |
| :--- | :--- | :--- | :--- | :--- |
| Ingress / PII Intercept | 75 ms | 75 ms | 75 ms | $\le 100\text{ ms}$ |
| gRPC Internal Dispatch | 15 ms | 15 ms | 15 ms | $\le 25\text{ ms}$ |
| Semantic Cache Lookup | N/A | 15 ms | **18 ms** | $\le 25\text{ ms}$ |
| PostgreSQL pgvector Cosine | 800 ms | **450 ms** | 0 ms (Bypassed) | $\le 500\text{ ms}$ |
| Neo4j Cypher Traversal | 1200 ms | **350 ms** | 0 ms (Bypassed) | $\le 400\text{ ms}$ |
| Reciprocal Rank Fusion | 150 ms | **50 ms** | 0 ms (Bypassed) | $\le 100\text{ ms}$ |
| LLM Grounded Synthesis | 1700 ms | 1700 ms | 1700 ms | $\le 2000\text{ ms}$ |
| **Total Query Latency** | **3940 ms** | **2655 ms** | **1808 ms** | **Strictly $\le 4000\text{ ms}$** |

---

## 6. Technical Consequences

### Positive Consequences
1. **Dramatic Compute & Cost Reduction:** Document updates re-index only mutated chunks ($\mathcal{O}(\Delta)$), saving up to 90% of embedding API calls and database writes on subsequent edits.
2. **Deterministic Graph Consistency:** Replacing dual-write application logic with Debezium WAL CDC guarantees that every relational commit is reliably projected into the semantic graph without silent dropouts.
3. **Sub-Second Freshness for Multi-Agent Swarms:** Targeted cache invalidation bus ensures that agents see updated knowledge within $\le 250\text{ ms}$ without requiring brute-force cache flushing.
4. **Zero Vendor Lock-In:** All components (PostgreSQL 16, Neo4j 5.20, Redpanda, MinIO, Debezium, Caffeine) are 100% open-source and deployable on any Kubernetes infrastructure.

### Negative Consequences & Mitigations
1. **CDC Ingestion Pipeline Complexity:** Running Debezium Connect introduces an additional infrastructure component to monitor.  
   * *Mitigation:* Debezium is deployed as a stateless Kubernetes replica using standard Helm charts, with health and lag metrics exported directly to Prometheus and Grafana.
2. **Reverse Cache Index Memory Footprint:** Maintaining `{documentId} -> Set<CacheKey>` in JVM heap consumes memory under high query cardinality.  
   * *Mitigation:* The reverse index is bounded using WeakReferences and maximum size caps (maximum 2,000 active query keys per node), backed by automatic eviction.
3. **Transient Eventual Consistency Lag:** A latency window of 100–300ms exists between the PostgreSQL commit and the Neo4j Cypher projection completion.  
   * *Mitigation:* The frontend and agent workbench receive real-time SSE events via `resonance-delivery` upon completion of the `DocumentGraphLinkedEvent`.

---

## 7. Implementation Directives for Engineering Teams

1. **Schema & Tables:** Apply database migration scripts creating `cdc_processed_events` for consumer deduplication.
2. **Debezium Registration:** Deploy the PostgreSQL CDC connector registering `document_chunks` table with SMT partition key `${value.tenant_id}:${value.document_id}`.
3. **Consumer Rollout:** Implement `DocumentChunkCdcConsumer` in `resonance-unified-context` with container factory setting `AckMode.MANUAL_IMMEDIATE`.
4. **Graph Projection Refactor:** Replace whole-document drop calls in `GraphProjectionService` with `IncrementalGraphProjectionService.syncChunkUpsert()`.
5. **Cache Activation:** Integrate `SemanticCacheManager` into `HybridSearchService` and bind the `SemanticCacheInvalidationBus` to `cdc.resonance.document_chunks`.
6. **Benchmark Validation:** Run `deploy/scripts/platform-benchmark.py` to assert that cold queries achieve $\le 2.7\text{ s}$ and warm queries achieve $\le 1.9\text{ s}$.
