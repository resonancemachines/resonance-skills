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

Here is how your components map to a production-ready, cloud-native OSS stack:

**A. Edge / Storage Tier: `DocumentUploadService**`

* **The Gap:** Proxying chunks through Java wastes memory.
* **The Fix:** The client requests an upload session. Spring Boot calls MinIO to initiate a `MultipartUpload` and generates `N` Presigned URLs (one for each chunk). The client pushes bytes directly to MinIO. Upon completion, the client sends the MinIO-generated ETags back to Spring Boot to assemble the final file.

**B. Relational & Vector Tier: `DocumentDefinition` & `DocumentFactoryPostProcessor**`

* **The Gap:** Populating vectors requires text extraction, which isn't explicitly defined.
* **The Fix:** Upon successful assembly, an `UploadCompletedEvent` triggers the Factory. It utilizes Apache Tika to extract raw text, generates standard chunks (e.g., 512 tokens), and persists the structural metadata, `tsvector` (for BM25 keyword search), and `pgvector` (for semantic search) into PostgreSQL.

**C. Semantic Tier: `DocumentNodePostProcessor**`

* **The Gap:** Mapping taxonomies synchronously risks locking the relational database transaction.
* **The Fix:** Listens for a `DocumentRegisteredEvent` from Redpanda. It maps the entities to Schema.org standards, generates RDF/OWL nodes, and links them into the Neo4j Knowledge Graph.

**D. Orchestration: `DocumentOrchestrator**`

* **The Gap:** Centralized command orchestration creates a single point of failure.
* **The Fix:** Implement as a Saga Coordinator utilizing the **Routing Slip** or pure **Choreography** pattern over Redpanda. It tracks the state of the document (`UPLOADED`, `VECTORIZED`, `GRAPH_LINKED`, `FAILED`).

---

### 3. Resilience & Multi-Tenancy Strategy

**Idempotency & Failure Rollbacks (The Saga Compensations):**
If a file is successfully assembled in MinIO and vectorized in PostgreSQL, but the Neo4j `DocumentNodePostProcessor` crashes due to a malformed ontology mapping, we do *not* drop the database record.

Instead, the `DocumentOrchestrator` catches the `GraphLinkingFailedEvent`. It executes a compensating transaction that updates the PostgreSQL `DocumentRegistry` status to `PARTIAL_DEGRADED_STATE`. The document remains available for vector/BM25 search, but is flagged for a DLQ (Dead Letter Queue) retry for graph insertion.

**Integrity Validation:**
When the client calls the `CompleteUpload` API, it must provide a SHA-256 hash of the entire file. The backend verifies this against MinIO's assembled object hash before emitting the `UploadCompletedEvent`.

---

