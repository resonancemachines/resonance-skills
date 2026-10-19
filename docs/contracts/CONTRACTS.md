# Platform Contracts & Interface Specifications

This document defines the contract-first protocols, schema standards, and serialization constraints governing inter-service communication across the Resonance mesh.

---

## 1. Schema Enforcement & Event Contracts

### 1.1 Kafka / Redpanda Topics (.proto & AsyncAPI 3.0)
*   **Registry Enforcement:** Every event emitted to Redpanda MUST be governed by an AsyncAPI 3.0 topology specification (`asyncapi.yaml`) and a Protocol Buffers schema (`proto3`) registered in **Apicurio Registry 3.x** (Port `8086`, Group `com.resonancemachines.events`) per [ADR-0008](../../docs/adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md).
*   **Compatibility Level:** `BACKWARD_TRANSITIVE` and `VALIDITY: FULL` are mandated across all production topics. Breaking schema changes or unregistered schemas are rejected at build and produce time.
*   **Standard Metadata Headers (Fail-Closed):**
    *   `ce_specversion`: CloudEvents 1.0 specification (`"1.0"`)
    *   `ce_type`: Fully qualified event domain type (e.g., `com.resonance.intent.signaled.v1`)
    *   `ce_source`: Emitting service identifier (e.g., `urn:resonance:service:resonance-action`)
    *   `tenant_id`: Mandatory non-blank tenant identifier for multi-tenant routing (literal `"default-tenant"` is strictly prohibited)
    *   `traceparent`: W3C distributed tracing context header

### 1.2 Core Domain Event Schemas
*   **`IntentSignaledEvent.proto`:** Emitted by `resonance-action` and `resonance-upload` via the Transactional Outbox pattern when user telemetry or document staging occurs.
*   **`DocumentUploadedEvent.proto`:** Contains MinIO object key, checksum, MIME type, and tenant metadata for asynchronous vectorization.
*   **`ContextEdgeProjectedEvent.proto`:** Emitted by `resonance-unified-context` upon persisting Schema.org-aligned entity nodes and relationship edges.

### 1.3 Multi-Tenant Domain Partition Key & Hot-Key Mitigation Strategy (DDIA Ch 6 & ADR-0011)
*   **The Celebrity Hot-Spot Problem:** Keying Kafka messages solely by `tenantId` causes extreme partition skew when high-throughput enterprise mega-tenants emit bursts of events, funneling all traffic into a single partition and causing severe consumer thread lag while other brokers sit idle.
*   **Domain-Driven Compound Partition Key Standard:** All event publishers and Outbox routers must route using domain-driven compound partition keys formatted as `{tenantId}:{aggregateType}:{aggregateId}` via `DomainPartitionKey.of(tenantId, aggregateType, aggregateId)` or `CompoundPartitionKeyRouter.resolveDomainKey(tenantId, aggregateType, aggregateId)` in `resonance-starter-core`.
*   **OpenMetadata Domain Catalog Governance:** Every `aggregateType` emitted on the mesh must correspond to an authorized Glossary Term in [`deploy/openmetadata/domain-glossary-manifest.json`](domain-glossary-manifest.json) and [`.agents/.contracts/domain-catalog.yaml`](domain-catalog.yaml) per [ADR-0011](../../docs/adr/ADR-0011-domain-aggregate-governance-with-openmetadata.md).
*   **Causal Ordering Boundary:** Strict causal ordering is guaranteed per-aggregate root instance within each tenant (`tenantId:aggregateType:aggregateId`), while distinct entities belonging to the same mega-tenant are uniformly distributed across all topic partitions.
*   **Salted Routing for Ultra-Hot Entities:** For hot entities exceeding single-partition ingestion thresholds (e.g. `CONTEXT_NODE` with high celebrity skew risk), use `DomainPartitionKey.ofSalted(tenantId, aggregateType, aggregateId, saltBuckets)` to distribute writes across $N$ deterministic salt buckets formatted as `{tenantId}:{aggregateType}:{aggregateId}#{saltBucket}`.



---

## 2. Synchronous Inter-Service Contracts (Protobuf & gRPC)

*   **Contract-First Definition:** All internal synchronous RPCs must be declared using Protocol Buffers (`proto3`). Code generation is managed via the `protobuf-maven-plugin`.
*   **Transport:** HTTP/2 with Netty shaded transport.
*   **Zero-Trust Identity Propagation:** JWT bearer tokens and tenant context are propagated as gRPC metadata (`tenant-id`, `authorization`).
*   **RPC Boundary Catalog:**
    *   `research.v1.ResearchService`: Query facade between `resonance-research` and `resonance-unified-context`.
    *   `policy.v1.PolicyDecisionService`: Open Policy Agent evaluation calls from middle-office components to `resonance-policy`.
    *   `workflow.v1.SagaCoordinatorService`: Choreographed Saga step invocations coordinated by `resonance-workflow`.
    *   `crypto.v1.TokenizationService`: PII masking and token retrieval via `resonance-crypto`.

---

## 3. External Egress & Edge Contracts (GraphQL & SSE)

### 3.1 GraphQL Schema First
*   **Egress Gateway:** Client-facing read operations are served via GraphQL schema definitions (`schema.graphqls`).
*   **Direct-to-Store Presigned URLs:** Ingestion endpoints negotiate multipart upload contracts directly with MinIO, returning presigned PUT URLs to avoid streaming binaries through application gateways.

### 3.2 Server-Sent Events (SSE) & Reactive Push
*   **Service:** `resonance-delivery` (Port `8002`)
*   **Protocol:** Reactive SSE / WebSockets pushing graph mutation diffs and intent fulfillment progress to connected client sessions.

---

## 4. External Federation & Webhook Contracts

### 4.1 HMAC-SHA256 Signed Webhooks (`resonance-webhook`)
*   **Payload Signature:** All outbound partner webhook requests must include the header:
    ```
    X-Resonance-Signature: sha256={HMAC-SHA256(payload, shared_secret)}
    X-Resonance-Timestamp: {epoch_seconds}
    ```
*   **Delivery Guarantees:** Resilient at-least-once delivery with exponential backoff and Dead-Letter Queue (DLQ) quarantine upon 5xx failure.

### 4.2 Dynamic Capability Registration (`resonance-skills`)
*   **Registry Format:** JSON-Schema contract defining action ontology, input parameters, execution constraints, and required entitlements.

---

## 5. Security & Continuous Access Contracts

### 5.1 PII Tokenization Contract (`resonance-crypto`)
*   Plaintext PII is transformed into surrogate UUIDs before crossing the sensory boundary.
*   The event mesh and graph database persist only tokenized references.

### 5.2 CAEP / RISC Event Specifications
*   **Standard:** Continuous Access Evaluation Profile (CAEP) and Risk Information Sharing and Coordination (RISC).
*   **Action:** When a session threat or compromise is identified, a CAEP revocation event terminates agent tokens immediately across all service checkpoints.

---

## 6. Middle-Office Architectural Contracts

### 6.1 Camunda Workflow Engine (`resonance-workflow`)
*   **Primary Workflow Framework:** Embedded Camunda BPMN 2.0 engine (`camunda-bpm-spring-boot-starter:7.21.0`) coordinating cross-service sagas and document ingestion pipelines (`document_ingestion_workflow.bpmn`).
*   **Delegate SPI Contracts:**
    *   `ValidateMetadataDelegate`: Validates document mime-type, content boundaries, and tenant scope.
    *   `VectorizeAndProjectDelegate`: Initiates asynchronous dense vectorization and knowledge graph ontology projection.
*   **REST Webhook Trigger Endpoint:** `POST /api/v1/workflows/trigger`
    *   Payload: `{"workflowType": string, "businessKey": string, "variables": map<string, object>}`
    *   Returns: `{"processInstanceId": string, "businessKey": string, "status": "STARTED"}`
*   **Message Correlation Endpoint:** `POST /api/v1/workflows/signal`
    *   Payload: `{"messageName": string, "businessKey": string, "variables": map<string, object>}`
    *   Correlates intermediate catch events to resume waiting process instances.

### 6.2 Approval Governance Integration (`resonance-approval`)
*   **`resonance-org` Contract:**
    *   `OrgClient.validateApprover(tenantId, approverId, requiredRole)`: Queries `resonance-org` to verify that the approver belongs to the active tenant workspace and holds the appropriate organizational authority.
*   **`resonance-workflow` Contract:**
    *   `WorkflowClient.notifyApprovalResolved(approvalId, sagaId, approved, comments)`: Signals `resonance-workflow` upon decision resolution, unblocking dependent saga execution or triggering compensating rollback steps.

### 6.3 OpenTelemetry Observability (`resonance-performance`)
*   **W3C Distributed Trace Context:**
    *   Consumes and parses standard W3C `traceparent` headers (`00-${traceId}-${spanId}-${traceFlags}`) via `W3CTraceContextParser`.
    *   Propagates trace and span contexts to downstream calls and internal trace spans.
*   **OTEL Instrumentation & SLA Monitoring:**
    *   `performance.executions.total` (`LongCounter`): Total transaction volume tagged by tenant, service, and operation.
    *   `performance.execution.latency` (`DoubleHistogram`): Latency distribution in milliseconds.
    *   `performance.sla.breaches` (`LongCounter`): Incremented when latencies exceed SLA thresholds (e.g. 4000ms GraphRAG SLA), emitting autoscaling and alerting signals.

### 6.4 Middle-Office Control Plane (`resonance-control`)
*   **Central Control Governance:**
    *   `CircuitBreakerConfigRegistry`: Service-level threshold policies (`failureRateThreshold`, `slowCallRateThreshold`, `waitDurationInOpenStateSeconds`).
    *   `RateLimitPolicyRegistry`: Dynamic token bucket routing policies per endpoint (`capacity`, `refillTokens`, `refillPeriodSeconds`).
*   **Management Endpoints:**
    *   `GET /api/v1/control/configs`: Returns all dynamic control configurations.
    *   `POST /api/v1/control/circuit-breakers`: Registers or updates circuit breaker thresholds.
    *   `POST /api/v1/control/rate-limits`: Registers or updates rate-limiting token buckets.
*   **Transactional Outbox Event Propagation:**
    *   Configuration mutations write `OutboxEvent` records within the local transaction, which are published asynchronously to Redpanda topic `control.config.events` for edge-proxy and sidecar synchronization.

### 6.5 Cryptographic Protection & Tokenization (`resonance-crypto`)
*   **PII Tokenization:**
    *   Inbound sensitive fields (emails, SSNs, credit cards) are tokenized into surrogate UUIDs via `TokenizationService` prior to event mesh persistence.
*   **Multi-Tenant Authenticated Field Encryption:**
    *   AES-256-GCM authenticated cipher with 128-bit authentication tags.
    *   **Cryptographic Multi-Tenancy Isolation:** The `tenantId` is passed as Additional Authenticated Data (`cipher.updateAAD(tenantId.getBytes())`). Decryption under an unauthorized or mismatched tenant ID causes an instant `AEADBadTagException`.
*   **Key Rotation:**
    *   Versioned encryption keys (`KeyRotationService`) supporting dynamic key version migration (`v1`, `v2`, etc.) with transparent backwards decryption and forward re-encryption.
*   **HMAC Signing & Verification:**
    *   `HmacSigningService` generates and verifies SHA-256 HMAC signatures for outbound webhooks and inter-service authentication tokens.

### 6.6 Multi-Tenant Access Control with Org Hierarchy (`resonance-entitlement`)
*   **Tenant & Workspace Validation:**
    *   Incorporates `resonance-org` via `OrgClient.validateTenantWorkspace(tenantId, workspaceId)` prior to capability evaluation.
    *   Cross-tenant and invalid workspace requests are rejected with access denied.
*   **Entitlement Matrix:**
    *   Evaluates resource permissions, actions, and user capabilities in strict alignment with tenant contract tiers and workspace boundaries.

### 6.7 Document Metadata Extraction & Webhook Ingestion (`resonance-meta`)
*   **Streaming Apache Camel + Tika Route (`tika-camel`):**
    *   Ingestion route `direct:extract-metadata` streams document bytes through Apache Tika parsers, extracting MIME types, content lengths, SHA-256 digests, and document properties without JVM heap overhead.
*   **Automated Workflow Webhook Trigger:**
    *   `WorkflowWebhookTrigger` dispatches POST requests to `resonance-workflow` (`/api/v1/workflows/trigger`).
    *   Launches Camunda `document_ingestion_workflow` with parsed metadata variables upon document ingestion completion.

### 6.8 Dynamic Policy Decision Point (`resonance-policy`)
*   **Embedded OPA Evaluation Engine:**
    *   Evaluates Open Policy Agent (OPA) rules with a sub-15ms Caffeine cache (`expireAfterWrite(5m)`).
    *   Enforces multi-tenant zero-trust isolation: denies cross-tenant access instantly.
    *   Enforces Data Loss Prevention (DLP): blocks public sharing of documents containing PII or SSN.
*   **gRPC Contract (`policy.v1.PolicyDecisionService`):**
    *   `EvaluateAccess(PolicyRequest)`: Returns `PolicyResponse` with `allowed`, `reason`, and required `obligations` (e.g., `audit_log=REQUIRED`).
    *   `GetDeliveryProfile`: Retrieves delivery requirements for users.

### 6.9 Capability & Token Quota Governance (`resonance-skills`)
*   **Agent Capability Discovery (`skills.v1.CapabilityRegistryService`):**
    *   `DiscoverCapabilities`: Exposes dynamic tool registry for agent intent mapping (e.g., `graph`, `all`).
    *   Tool definitions enforce Draft 2020-12 JSON-Schema formats for safe LLM interaction.
*   **Token Budget Quotas:**
    *   `TokenBudgetService` manages token quotas per tenant, ensuring AI agents do not exceed their allocated resource limits (e.g., deducting tokens per interaction and blocking upon exhaustion).

