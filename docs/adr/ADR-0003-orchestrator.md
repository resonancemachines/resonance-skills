# ADR 0003: Document Orchestration & Direct-to-Store Multipart Pattern

## Status
Accepted

## Context
### 1. Executive Summary: High-Level Architectural Decision Matrix

Your refactoring blueprint correctly identifies the necessary functional boundaries, but the current design risks creating a severe I/O bottleneck. Manually tracking chunk states in a custom database payload (`"uploadedChunks":[1,2,3]`) and proxying file bytes through your Spring Boot application is an anti-pattern at enterprise scale. Furthermore, utilizing synchronous commands from a central `DocumentOrchestrator` to post-processors will lead to cascading timeouts during heavy vectorization or graph traversal tasks.

To achieve maximum throughput and strict decoupling, we must implement the **Direct-to-Store Multipart Pattern** for uploads, and transition the `DocumentOrchestrator` into an **Event-Driven Choreographed Saga**.

| Dimension | Architectural Decision | Justification |
| --- | --- | --- |
| **Operational Overhead** | **MinIO Native Multipart Uploads** | By leveraging MinIO's S3-compatible Multipart API, we eliminate the need for custom chunk-tracking tables. The backend only generates presigned URLs; the client uploads directly to the storage cluster. |
| **Scalability Boundaries** | **Choreographed Saga via Redpanda** | Heavy compute tasks (Tika parsing, Vector chunking, Neo4j RDF mapping) are decoupled. If the `DocumentNodePostProcessor` is overwhelmed, the `DocumentFactoryPostProcessor` can continue ingesting without blocking thread pools. |
| **Multi-Tenancy Isolation** | **Object Prefixing & RLS** | Files are directly uploaded to MinIO using `tenant_id/session_id/filename` prefixes. The PostgreSQL `DocumentRegistry` enforces Row-Level Security (RLS) to ensure tenants cannot access each other's vectors or metadata. |
| **Developer Velocity** | **Strict DTOs & Standard APIs** | Developers interface with standard S3 protocols for uploads and strongly typed Java 21 Records for Saga events, eliminating brittle custom chunking logic. |

---

### 2. The Stack Breakdown & Refactored Workflow

Here is how your components map to the production-ready microservices architecture (ADR-0007, ADR-0008, ADR-0010):

* **Edge / Storage Tier (`resonance-upload` `:8008`):** Direct-to-store presigned multipart upload negotiation with MinIO (`:9000`). Chunks bypass JVM memory completely; on completion, an atomic `outbox_events` insert records the upload.
* **Text Extraction & Metadata Tier (`resonance-meta` `:8109`):** Listens to upload completion events; extracts raw text and structural metadata using streaming Apache Tika without JVM heap exhaustion.
* **Vector & Relational Tier (`resonance-unified-context` `:9001`):** Computes embeddings via Spring AI and persists vectors (`pgvector`) and lexical tokens (`tsvector` BM25) into PostgreSQL with content-hash deltas (ADR-0005).
* **Semantic Graph Tier (`resonance-unified-context` `:9001`):** Projects entities into the Neo4j Knowledge Graph via parameterized Cypher statements bound to `$tenantId`.
* **Saga Orchestration & Compensation (`resonance-workflow` `:8108`):** Coordinates the distributed ingestion saga using embedded Camunda BPMN 2.0 with compensating unwind transactions (MinIO cleanup, outbox rollback) upon downstream failure.

---

### 3. Resilience & Multi-Tenancy Strategy

**Idempotency & Failure Rollbacks (The Saga Compensations):**
If a file is successfully assembled in MinIO and vectorized in PostgreSQL, but the Neo4j `DocumentNodePostProcessor` crashes due to a malformed ontology mapping, we do *not* drop the database record.

Instead, the `DocumentOrchestrator` catches the `GraphLinkingFailedEvent`. It executes a compensating transaction that updates the PostgreSQL `DocumentRegistry` status to `PARTIAL_DEGRADED_STATE`. The document remains available for vector/BM25 search, but is flagged for a DLQ (Dead Letter Queue) retry for graph insertion.

**Integrity Validation:**
When the client calls the `CompleteUpload` API, it must provide a SHA-256 hash of the entire file. The backend verifies this against MinIO's assembled object hash before emitting the `UploadCompletedEvent`.

---

