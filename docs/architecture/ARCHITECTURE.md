# System Architecture: Resonance Platform

> Last updated: 2026-10-18  
> Frameworks & Governance: [`GUARDRAILS.md`](GUARDRAILS.md) (Executable Rules) | [`docs/HARNESS_ENGINEERING.md`](docs/HARNESS_ENGINEERING.md) (Harness Framework) | [`ADR-0010`](docs/adr/ADR-0010-target-infrastructure-topology-and-governance.md) (Target Infrastructure)

## 1. System Overview

Resonance is an enterprise-grade, decentralized microservices platform designed for data sovereignty, continuous GraphRAG, zero cloud lock-in, and strict multi-tenant isolation. It cleanly segregates sensory ingestion, dynamic governance, immutable persistence, and semantic graph exploration across **24 microservices** organized into 4 operational tiers.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT / EXTERNAL TRAFFIC                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (443 / 8080)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY (Edge Router)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               FRONT-OFFICE TIER: SENSORY & INTERACTION                 │
│  [action] [delivery] [download] [notification] [research] [support]    │
│  [ticket] [upload]                                                     │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │ Transactional Outbox (Redpanda :19092) │ Sync gRPC (:9001)
                ▼                                        ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────┐
│ MIDDLE-OFFICE TIER: GOVERNANCE & SAGAS    │ │ PLATFORM BRAIN:          │
│ [approval] [control] [crypto] [entitlement│ │ resonance-unified-context│
│ [meta] [performance] [policy] [skills]    │ │ • Neo4j Bolt (:7687)     │
│ [workflow]                                │ │ • PostgreSQL pgvector    │
└───────────────────┬───────────────────────┘ │ • Schema.org Projection  │
                    │ Async Mutations         └──────────────────────────┘
                    ▼
┌───────────────────────────────────────────┐
│ BACK-OFFICE TIER: SYSTEM OF RECORD        │
│ [billing] [compute] [event] [org] [report]│
│ [webhook] ────────────────────────────────┼──> EXTERNAL PARTNER APIS
└───────────────────────────────────────────┘    (Egress Port 8206 ONLY)
```

---

## 2. Component Boundaries (By Operational Tier)

### 2.1 Front-Office (Sensory / Ingestion Layer)
*   **Location:** `resonance-office/front-office/`
*   **Port Block:** `8001–8008`
*   **Profile:** High I/O, WebFlux reactive pipelines, GraphQL termination, multipart direct MinIO ingestion.
*   **Components:**
    *   `resonance-action` (`:8001`): Ingestion Command Gateway *(Transactional Outbox pattern)*.
    *   `resonance-delivery` (`:8002`): Outbound artifact distribution layer *(SFTP, Email, Slack/Webhooks)*.
    *   `resonance-download` (`:8003`): MinIO presigned download egress *(Direct-to-Client)*.
    *   `resonance-notification` (`:8004`): Communication alert dispatcher *(Idempotent Consumer)*.
    *   `resonance-research` (`:8005`): Natural language query façade *(CQRS Query Side)*.
    *   `resonance-support` (`:8006`): HITL and DLQ quarantine resolver *(Poison Pill Isolation)*.
    *   `resonance-ticket` (`:8007`): Async job tracking and task status polling *(Materialized View)*.
    *   `resonance-upload` (`:8008`): Multipart chunk negotiation *(Direct-to-Store MinIO Streaming)*.

### 2.2 Middle-Office (Governance & Saga Layer)
*   **Location:** `resonance-office/middle-office/`
*   **Port Block:** `8101–8109`
*   **Profile:** CPU intensive, Open Policy Agent (OPA) evaluations, choreographed Saga state machines, edge encryption.
*   **Components:**
    *   `resonance-approval` (`:8101`): Multi-party sign-off and consensus *(Asynchronous Saga Pause)*.
    *   `resonance-control` (`:8102`): Traffic shaping and rate limiting *(Token Bucket / Circuit Breaker)*.
    *   `resonance-crypto` (`:8103`): PII tokenization and key rotation *(Symmetrical Masking Interceptor)*.
    *   `resonance-entitlement` (`:8104`): Access resolution and CAEP revocation *(Policy Enforcement Point)*.
    *   `resonance-performance` (`:8105`): OTel telemetry aggregation and SLA monitoring *(Time-Series Aggregator)*.
    *   `resonance-policy` (`:8106`): Dynamic compliance and data residency rules *(OPA Policy Decision Point)*.
    *   `resonance-skills` (`:8107`): Dynamic action ontology for agentic workflows *(Semantic Registry)*.
    *   `resonance-workflow` (`:8108`): Distributed transaction management *(Choreographed Saga Coordinator)*.
    *   `resonance-meta` (`:8109`): Metadata extraction via Apache Tika *(Streaming Processor)*.

### 2.3 Back-Office (System of Record Layer)
*   **Location:** `resonance-office/back-office/`
*   **Port Block:** `8201–8206`
*   **Profile:** Disk I/O intensive, PostgreSQL persistence, immutable event sourcing, external partner federation.
*   **Components:**
    *   `resonance-billing` (`:8201`): Tenant usage metering and quota ledgers *(Event Sourcing)*.
    *   `resonance-compute` (`:8202`): Heavy batch job dispatching *(Kubernetes Job Dispatcher)*.
    *   `resonance-event` (`:8203`): Master audit log and event store *(Append-Only Partitioned Log)*.
    *   `resonance-org` (`:8204`): Root tenant structures and workspace hierarchies *(Relational State)*.
    *   `resonance-report` (`:8205`): Analytical reporting queries across read-replicas *(Read-Model Projection)*.
    *   `resonance-webhook` (`:8206`): Outbound signed webhooks *(Resilient HMAC Dispatcher with DLQ)*.

### 2.4 Platform Core & Governance
*   **`resonance-unified-context` (Port `9001`):** Continuous GraphRAG engine combining Neo4j multi-hop Cypher traversal with PostgreSQL `pgvector` and `tsvector` hybrid scoring.
*   **`resonance-dependency`:** Centralized Maven Bill of Materials (`resonance-bom`) and Spring Boot starters (`resonance-starter-core`, `frontoffice`, `middleoffice`, `backoffice`, `unifiedcontext`).
*   **`resonance-machine`:** Next.js 16 frontend application with Convex real-time backend, WorkOS authentication, knowledge graph visualization, and AI agent orchestration.

---

## 3. Core Data Flows

### Flow 1: Command / Interaction Ingestion
1. Client submits action to `api-gateway`.
2. `resonance-crypto` intercepts and tokenizes PII.
3. `resonance-action` writes action to local PostgreSQL `user_actions` and `outbox_events` atomically.
4. Outbox sweeper publishes `IntentSignaledEvent` to Redpanda (`19092`).
5. `resonance-workflow` coordinates Saga steps asynchronously.
6. `resonance-event` records the event in the master append-only ledger.

### Flow 2: Document Ingestion & Vectorization
1. Client negotiates upload with `resonance-upload`.
2. `resonance-upload` generates presigned MinIO multipart URLs.
3. Client streams binary chunks directly to MinIO (`:9000`), bypassing JVM heap.
4. MinIO notification triggers `DocumentUploadedEvent` into Redpanda.
5. `resonance-unified-context` ingests event, extracts text (Tika), generates `pgvector` dense embeddings and `tsvector` BM25 tokens, maps entities to Schema.org, and writes nodes/edges to Neo4j.

### Flow 3: Hybrid Search & GraphRAG Query (<4.0s SLA)
1. User enters natural language prompt into client UI.
2. `resonance-research` receives query via GraphQL/REST (≤ 75ms).
3. `resonance-research` invokes `resonance-unified-context` via internal gRPC (≤ 15ms).
4. `resonance-unified-context` performs parallel retrieval:
   - Neo4j Cypher traversal with parameterized `$tenantId` (≤ 1200ms)
   - PostgreSQL `pgvector` dense similarity scoring (≤ 800ms)
   - Reciprocal Rank Fusion blending (≤ 150ms)
5. Gemini LLM synthesizes ground-truth context (≤ 1700ms).
6. Result returned through `resonance-research` to client (Total ≤ 3925ms).

---

## 4. Integration Points & Schema Contracts

| Target Boundary | Protocol | Serialization / Contract | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **External Ingress** | HTTPS / WSS | JSON / GraphQL | API Gateway, OAuth2 Resource Server |
| **Inter-Service Mesh**| gRPC over HTTP/2 | Protocol Buffers (`proto3`) | `grpc-spring-boot-starter` & Protobuf compiler |
| **Event Mesh** | Kafka Protocol | Protocol Buffers (`proto3`) + AsyncAPI 3.0 | Apicurio Registry 3.x (`BACKWARD_TRANSITIVE`, `:8086`) |
| **Data & Domain Catalog** | REST / OpenMetadata API | OpenMetadata Entity JSON Schema | OpenMetadata (`:8585`, ADR-0011) + `domain-glossary-manifest.json` |
| **Object Store** | S3 API | Multipart Streaming | MinIO SDK (Presigned Direct URLs) |
| **External Egress** | HTTPS POST | JSON with HMAC-SHA256 | `resonance-webhook` (`X-Resonance-Signature`) |

---

## 5. Architectural Invariants & Governance

All invariants below are continuously enforced at runtime, `mvn test`, and `.git/hooks/pre-commit` per [GUARDRAILS.md](GUARDRAILS.md) and [ADR-0009](docs/adr/ADR-0009-executable-architecture-and-change-management-guardrails.md):

1. **No Two-Phase Commit:** Distributed transactions MUST use Choreographed Sagas with explicit compensating transactions.
2. **Zero Plaintext PII in Mesh:** All PII tokenized at the edge before event emission.
3. **Database-Per-Service:** Relational schemas are isolated per service; direct cross-database joins are forbidden.
4. **Multi-Tenant Isolation:** PostgreSQL Row-Level Security (`tenant_id`) and Neo4j Cypher `$tenantId` parameters strictly enforced. Fail-open fallbacks (e.g., `"default-tenant"`) are strictly forbidden.
5. **Deterministic Classpaths:** No service POM may declare explicit versions for dependencies managed by `resonance-bom`.
6. **Domain Catalog & Partition Governance (ADR-0011):** All 22 Domain Aggregate Roots across 8 Bounded Contexts are governed via OpenMetadata Glossary Terms. Outbox events route on canonical domain keys formatted as `{tenantId}:{aggregateType}:{aggregateId}[#{saltBucket}]`.


---

## 6. Infrastructure Topology

See [TOPOLOGY.md](.agents/.contracts/TOPOLOGY.md) for complete port allocations.

### Local Development Stack (Docker Compose)

| Component | Image | Port(s) |
|:--|:--|:--|
| Redpanda | `redpandadata/redpanda:v24.1.2` | 19092 (Kafka), 9644 (Admin API) |
| Apicurio Registry | `apicurio/apicurio-registry:3.0.4` | 8086 (REST v3 Contract Registry) |
| PostgreSQL | `pgvector/pgvector:pg16` | 5433 |
| Neo4j | `neo4j:5.20.0` | 7474 (HTTP), 7687 (Bolt) |
| MinIO | `minio/minio` | 9000 (S3), 9001 (Console) |
| Debezium Connect | `debezium/connect:2.7.3.Final` | 8083 (REST API) |
| OTel Collector | `otel/opentelemetry-collector-contrib:0.97.0` | 4317 (gRPC), 4318 (HTTP) |
| Jaeger | `jaegertracing/all-in-one:1.55` | 16686 (UI) |
| Loki | `grafana/loki:2.9.4` | 3100 (Log API) |
| Prometheus | `prom/prometheus:v2.54.0` | 9090 |
| Grafana | `grafana/grafana:10.4.0` | 3001 (Dashboards) |
| Kiali | `quay.io/kiali/kiali:v1.89` | 20001 (Istio Mesh Console) |
| OpenMetadata | `docker.getcollate.io/openmetadata/server:1.4.0` | 8585 (Data & Domain Catalog UI/API) |

### Target Enterprise Infrastructure Topology (Cloud-Native Blueprint, ADR-0010)

For production deployment and cluster environments, the Resonance Platform architecture standardizes on the following 9-layer cloud-native stack:

| Layer | Standard Technology | Role & Integration in Resonance Platform |
|:--|:--|:--|
| **Platform** | **Kubernetes (v1.30+)** | Container runtime & orchestration, Horizontal Pod Autoscaling (HPA), and multi-tenant namespace isolation. |
| **Service Mesh** | **Istio** | Zero-Trust mTLS STRICT enforcement across all namespaces, Envoy sidecar injection, and intra-mesh routing. |
| **Proxy & Ingress** | **Envoy (WasmPlugin + gRPC ext_authz)** | **Lua Filter Decoupling:** Envoy transitions completely away from synchronous Lua filters to **WebAssembly (`WasmPlugin`)** for sandboxed, high-throughput in-proxy transformations and dedicated **gRPC `ext_authz`** services for external authorization and multi-tenant RBAC decisions. |
| **Identity (IAM)** | **Keycloak (PKCE + DCR)** | OAuth 2.1 / OIDC identity provider. Enforces PKCE (RFC 7636) for public SPAs (`resonance-ui`, `resonance-machine`) and Dynamic Client Registration (RFC 7591 DCR) for autonomous AI agents and MCP servers. Maps `tenant_id` claim into signed JWTs. |
| **Packaging** | **Helm 3** | Umbrella chart packaging (`deploy/helm/resonance-platform`), parameterized values files, and OCI registry distribution (`helm push`). |
| **CI/CD & GitOps** | **GitHub Actions + ArgoCD** | **Separation of CI and CD:** GitHub Actions executes CI (compile, tests, guardrails, image/chart push). ArgoCD performs declarative, in-cluster GitOps deployment with automated drift healing and zero CI runner credential exposure. |
| **Secrets** | **HashiCorp Vault** | Centralized secrets management via External Secrets Operator (ESO) / Vault CSI (`secrets-store.csi.k8s.io`), dynamic PostgreSQL credentials, and Vault Transit engine envelope encryption for `resonance-crypto`. |
| **Observability** | **Prometheus, Grafana, Jaeger, Kiali, Loki** | Complete 4-pillar telemetry: Prometheus (metrics), Grafana (dashboards :3001, including Platform Overview, SLA Performance, Business Flows, and Apicurio Registry Schema Governance), Jaeger (tracing :16686), Kiali (Istio mesh console :20001), Loki (structured logs :3100), and OpenTelemetry Collector (:4317/:4318). |
| **Registries** | **JFrog Artifactory + Apicurio 3.x** | **Dual Registry Architecture:** JFrog Artifactory stores container images, OCI Helm charts, and Maven/npm mirrors. Apicurio Registry 3.x (`:8086`) enforces Protobuf event schema governance with `BACKWARD_TRANSITIVE` evolution (ADR-0008). |
