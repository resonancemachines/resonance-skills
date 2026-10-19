# Research Topic: Company Brain Platform - Unified Virtual File System (VFS) & Object Storage Integration

> **Status:** `RESOLVED_BY_ADR_0007` ([ADR 0007](../adr/ADR-0007-company-brain-file-system-integration.md))  
> **Date Initialized:** 2026-10-03  
> **Date Resolved:** 2026-10-05  
> **Author / Lead:** Antigravity (Lead OSS SaaS Architect, Resonance Platform)  
> **Resolution Artifacts:**
> - Research Documents: [`docs/research/2026-10-04-research.md`](../research/2026-10-04-research.md), [`docs/research/2026-10-05-research.md`](../research/2026-10-05-research.md)
> - Architecture Decision Record: [`docs/adr/ADR-0007-company-brain-file-system-integration.md`](../adr/ADR-0007-company-brain-file-system-integration.md)  
> **Target Subsystems:**
> - [`resonance-upload`](../architecture/ARCHITECTURE.md#L58) (Port `8008` - Multipart Presigned Ingestion & Direct-to-MinIO Negotiation)
> - [`resonance-download`](../architecture/ARCHITECTURE.md#L53) (Port `8003` - Direct Presigned Egress Gateway)
> - [`resonance-action`](../architecture/ARCHITECTURE.md#L51) (Port `8001` - Transactional Outbox Command Gateway)
> - [`resonance-workflow`](../architecture/ARCHITECTURE.md#L69) (Port `8108` - Choreographed Saga Coordinator & State Machine)
> - [`resonance-meta`](../architecture/ARCHITECTURE.md#L73) (Port `8109` - Apache Tika Streaming Structural Extraction)
> - [`resonance-crypto`](../architecture/ARCHITECTURE.md#L67) (Port `8103` - Zero Plaintext PII Edge Tokenization Interceptor)
> - [`resonance-entitlement`](../architecture/ARCHITECTURE.md#L68) (Port `8104` - ABAC/RBAC VFS Path Security Enforcement Point)
> - [`resonance-unified-context`](../architecture/ARCHITECTURE.md#L88) (Port `9001` - Continuous GraphRAG & VFS Knowledge Cosmos Projection)
> - Persistence & Mesh: MinIO S3 (`:9000`), PostgreSQL 16 (`:5433`), Neo4j 5.20 (`:7687`), Redpanda (`:19092`), Debezium Connect (`:8083`)

---

## 1. Executive Context & Problem Statement

The Resonance Platform's **Company Brain** represents an enterprise cognitive backbone where autonomous AI agents and human knowledge workers collaborate across multi-tenant organizations. Modern enterprise knowledge does not exist solely as flat document uploads; it resides in dynamic, hierarchical file systems composed of structured directories, collaborative team drives, automated agent inbox/outbox pipelines, symlinks across personal workspaces, and external enterprise webhooks (e.g., meeting recordings, video transcripts, code repositories, specifications).

Under baseline platform operation ([ADR 0001](../../docs/adr/0001-transactional-outbox-event-structure.md), [ADR 0002](../../docs/adr/0002-core-platform-architecture.md), [ADR 0004](../../docs/adr/0004-upload.md), and [ADR 0005](../../docs/adr/ADR-0005-event-driven-graphrag-incremental-sync-hybrid-caching.md)):
1. **Document Storage:** Binary blobs stream to MinIO (`:9000`), producing raw chunk embeddings in PostgreSQL `pgvector` and flat semantic entities in Neo4j.
2. **Virtual Hierarchy Gap:** The frontend VFS (`/drive/[Org]/[Team]/[inbox]`, `[outbox]`, `(*Personal Space)`) operates largely decoupled from the backend Java microservices, lacking an authoritative relational ledger, transactional outbox synchronization, and choreographed saga governance for file tree restructuring, moves, renames, and deletions.
3. **Retrieval Scoping Limitation:** GraphRAG hybrid retrieval queries flat vector and entity spaces without hierarchical containment pruning. AI agents cannot efficiently bound knowledge queries to specific folder scopes (e.g., "Summarize specifications within `/drive/Engineering/Platform/v2/`").
4. **Storage Proliferation:** Redundant file uploads across personal and team drives generate duplicate MinIO objects and uncoordinated vector indexing jobs without a Content-Addressable Storage (CAS) deduplication layer.

---

## 2. Ingestion Feed Insights & Theoretical Foundation

This research synthesizes architectural intelligence from leading distributed systems, event-driven engineering, and agentic workbench research:

1. **SystemDRD (*Issue 06: Cognitive Agent Workbench & High-Throughput Streaming*):**
   - Autonomous agent teams require dedicated, isolated file spaces with bidirectional symlinks to collaborate with organizational teams without global locking or data leakage.
   - Decouple sensory ingestion from cognitive processing through strict event-driven outbox pipelines.
2. **Platform Engineering for AI (*Hot Trends in Platform Engineering for AI - Knowledge Fabric Subsystems*):**
   - Enterprise AI platforms fail when knowledge retrieval cannot respect organizational access control lists (ACLs) and hierarchical folder structures.
   - GraphRAG must navigate both structural containment edges (`CONTAINS_NODE`, `SYMLINK_TO`) and semantic conceptual edges (`MENTIONS`, `HAS_FACT`).
3. **Anthropic (*2026 Agentic Coding Trends Report — Agent Workspaces & Multi-Agent Collaboration*):**
   - Multi-agent collaboration relies heavily on deterministic inbox/outbox patterns: worker agents consume raw payloads from `[inbox]`, normalize insights, and write structural "Semantic Deltas" into `[outbox]`, where supervisory agents merge them into parent graphs.

---

## 3. Four Core Architectural Dimensions

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         FOUR CORE ARCHITECTURAL DIMENSIONS                             │
├──────────────────────────────┬─────────────────────────────────────────────────────────┤
│ 1. Operational Overhead      │ Zero custom file-system daemons; MinIO S3 notifications;│
│                              │ Debezium PostgreSQL WAL CDC; 100% self-hostable OSS.    │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 2. Scalability Boundaries    │ Direct-to-MinIO zero-heap streaming; Content-Addressable│
│                              │ Storage (CAS) SHA-256 deduplication; O(log N) VFS paths.│
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 3. Multi-Tenancy Isolation   │ PostgreSQL RLS (tenant_id, org_id); Neo4j $tenantId Cypher;│
│                              │ ABAC/RBAC entitlement enforcement on all VFS paths.     │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 4. Developer Velocity        │ Java 21 sealed hierarchies; Spring Boot starters;       │
│                              │ Redpanda Avro schemas; deterministic classpath via BOM. │
└──────────────────────────────┴─────────────────────────────────────────────────────────┘
```

1. **Operational Overhead:** No proprietary AWS S3 EventBridge, SNS/SQS, or Lambda triggers. All storage events flow through MinIO native bucket notifications and Debezium PostgreSQL WAL CDC directly to Redpanda topics.
2. **Scalability Boundaries:** JVM heap memory never buffers binary payloads. Multi-part negotiation generates presigned URLs for direct MinIO data plane streaming. Content-Addressable Storage (CAS) ensures identical files share underlying storage and embedding vectors.
3. **Multi-Tenancy Isolation:** Complete mathematical tenant isolation via PostgreSQL Row-Level Security, Neo4j parameterized Cypher labels/properties, MinIO tenant bucket/key prefixing, and runtime ABAC evaluation in `resonance-entitlement`.
4. **Developer Velocity:** Strict Java 21 typing with sealed interfaces, records, Spring Boot 4.x autoconfiguration, and shared starters across the front-office, middle-office, and platform brain.

---

## 4. Architectural Target: Unified VFS & Brain Integration

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FRONT-OFFICE: SENSORY & COMMAND INGRESS                         │
│                                                                                        │
│  [Client / Agent] ──(1. Negotiate Multipart)──> [resonance-upload :8008]              │
│         │                                                 │                            │
│         ├──(2. Direct PUT Chunks)──> [MinIO :9000]        └──(JPA Save)                │
│         │                                                         ▼                    │
│         └──(3. VFS Command: Create/Move/Link) ──> [resonance-action :8001]             │
│                                                           │                            │
│                                                           └──(Atomic Outbox)           │
│                                                                   ▼                    │
│                                                       PostgreSQL outbox_events         │
└───────────────────────────────────────────────────────────────────┬────────────────────┘
                                                                    │ Debezium WAL CDC
                                                                    ▼
                                                 Redpanda Topic: resonance.vfs.events
                                                                    │
                                    ┌───────────────────────────────┴────────────────────┐
                                    ▼                                                    ▼
┌───────────────────────────────────────────────────────┐ ┌──────────────────────────────┐
│       MIDDLE-OFFICE: SAGA & GOVERNANCE LAYER          │ │ PLATFORM BRAIN:              │
│                                                       │ │ resonance-unified-context    │
│  [resonance-workflow :8108]                           │ │ (:9001)                      │
│  • Orchestrates Ingestion / Move / Delete Sagas       │ │ • Neo4j VFS Tree Projection  │
│  • Compenses on failure (MinIO delete, VFS rollback)  │ │ • Hierarchical GraphRAG      │
│  • Coordinates:                                       │ │ • Scoped Cypher Traversals   │
│    - [resonance-meta :8109] (Tika Streaming)         │ │ • Hybrid RRF Search          │
│    - [resonance-crypto :8103] (PII Tokenization)      │ └──────────────────────────────┘
│    - [resonance-entitlement :8104] (VFS ABAC / ACL)   │
└───────────────────────────────────────────────────────┘
```

---

## 5. Implementation Milestones & ADR Promotion Criteria

1. **VFS Canonical Relational Schema:** Codify `vfs_nodes` table in PostgreSQL with RLS and closure-table / materialized-path hierarchy support.
2. **Front-Office Outbox Integration:** Ensure all VFS node mutations (insert, rename, move, delete, symlink) emit transactional outbox events to `resonance.vfs.events`.
3. **Middle-Office Saga Coordination:** Implement `VfsIngestionSaga` and `VfsRestructureSaga` in `resonance-workflow` with explicit reverse compensation.
4. **Neo4j VFS Graph Projection:** Project virtual folders, files, and bidirectional symlinks into Neo4j with `$tenantId` scoping, enabling path-bounded GraphRAG.
5. **CAS Deduplication:** Implement SHA-256 CAS deduplication between MinIO object storage and PostgreSQL embedding entities.
6. **Promotion to ADR:** Author and merge **ADR 0006: Company Brain Platform - Unified Virtual File System (VFS) and Object Storage Integration Architecture**.
