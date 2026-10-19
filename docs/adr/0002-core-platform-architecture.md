# ADR 0002: Core Platform Architecture, Event-Driven Topology, and Zero-Trust Multi-Tenancy

## Status
Accepted

## Context

---

## 1. Context & Problem Statement

The Resonance platform requires a scalable, multi-tenant, enterprise-grade architecture capable of processing continuous sensory telemetry, executing complex GraphRAG retrieval under a strict **4.0-second SLA**, and coordinating distributed business workflows. 

To maintain strict data sovereignty for enterprise clients and eliminate cloud vendor lock-in, proprietary cloud data stores (e.g., AWS DynamoDB, Aurora, S3 proprietary extensions) are strictly forbidden. The system must achieve relational integrity, semantic graph exploration, fault tolerance, and zero-trust security using open-source primitives.

---

## 2. Decision Drivers

1. **Multi-Tenant Isolation:** Mathematical guarantee that tenant data cannot bleed across database queries or graph traversals.
2. **Performance & SLA:** GraphRAG query execution must complete within 4.0 seconds end-to-end.
3. **Decoupled Asynchrony:** Sensory ingestion (file staging, user clicks) must not block UI or middle-office processing.
4. **Resilience & Fault Containment:** Poison-pill payloads or tenant anomalies must not cascade across the service mesh.
5. **Contract Stability:** Strictly typed, version-controlled interfaces between services to eliminate runtime schema drift.

---

## 3. Considered Options

*   **Option A:** Monolithic multi-tenant backend with shared PostgreSQL database and synchronous REST APIs.
*   **Option B:** Microservices mesh using distributed transactions (Two-Phase Commit / XA) and cloud-native managed databases.
*   **Option C (Selected):** Event-driven microservices architecture utilizing OSS primitives (Spring Boot 3, PostgreSQL 16, Neo4j 5, Redpanda, MinIO), governed by CQRS, Transactional Outbox, Choreographed Sagas, and Contract-First schemas, secured by Istio Service Mesh.

---

## 4. Decision Outcome

We selected **Option C**. The core architectural decisions are formalized as follows:

### 4.1 CQRS & Transactional Outbox Pattern
*   All state mutations are committed atomically to local PostgreSQL tables alongside an outbox table.
*   Outbox sweepers publish events to Redpanda. 2PC distributed transactions are explicitly banned.
*   Read queries (GraphRAG and projections) operate completely independently from write ingestion pipelines.

### 4.2 Direct-to-Store Resumable Uploads
*   `resonance-upload` negotiates presigned chunk URLs directly with MinIO.
*   Binary uploads bypass JVM memory entirely, eliminating JVM heap saturation on ingestion gateways.

### 4.3 GraphRAG Hybrid Search Architecture
*   Combines PostgreSQL `tsvector` (BM25 lexical scoring) and `pgvector` dense vector embeddings with Neo4j deep Cypher graph traversal.
*   Front-office telemetry continuously projects anticipatory intent edges mapped to the Schema.org ontology.

### 4.4 Contract-First Governance
*   All asynchronous topics enforce Protocol Buffers (`proto3`) + AsyncAPI 3.0 contracts via Apicurio Registry 3.x (`BACKWARD_TRANSITIVE`, Port `:8086`).
*   All internal synchronous RPCs enforce Protobuf contracts (`proto3`) via gRPC over HTTP/2.
*   All external client reads enforce GraphQL schema definitions (`.graphqls`).

### 4.5 Kernel-Level Multi-Tenancy & Zero-Trust Security
*   PostgreSQL tables enforce Row-Level Security (RLS) bound to `tenant_id`.
*   Neo4j Cypher queries enforce parameterized `$tenantId` constraints; dynamic label injection is banned.
*   PII is tokenized at the edge via `resonance-crypto`; plaintext PII never enters the event mesh or graph store.
*   Cross-domain operations are authorized by dynamic Open Policy Agent (OPA) rules in `resonance-policy` and enforced by Istio Service Mesh sidecars.
*   Continuous Access Evaluation Profile (CAEP) and RISC standards are enforced to immediately sever compromised sessions.

### 4.6 API Observability & Tracing
*   API observability with Jaeger tracing is a mandatory requirement across all services.
*   All JVMs MUST utilize the OpenTelemetry (OTEL) Java Agent to propagate traces (W3C traceparent) to a centralized collector exporting to Jaeger.

---

## 5. Consequences

### Positive Consequences
*   **Zero Vendor Lock-In:** 100% open-source software stack deployable on any Kubernetes cluster (K3s/K8s).
*   **Extreme Ingestion Throughput:** Asynchronous event streaming and MinIO direct streaming isolate heavy I/O from compute-intensive services.
*   **Multi-Tenant Safety:** Database-level and graph-level isolation guarantees strict multi-tenant boundary integrity.
*   **Deterministic Evolutions:** Schema registry prevents breaking API mutations from reaching downstream consumers.

### Negative Consequences & Mitigations
*   **Eventual Consistency Lag:** Projections in Neo4j may lag slightly behind PostgreSQL outbox writes. *Mitigation: Clients receive real-time push updates via SSE (`resonance-delivery`) upon graph projection completion.*
*   **Operational Overhead:** Managing Neo4j, PostgreSQL, and Redpanda clusters requires automated GitOps via ArgoCD and robust OpenTelemetry monitoring.