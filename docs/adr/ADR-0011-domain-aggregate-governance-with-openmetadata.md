# ADR 0011: Enterprise Domain Aggregate Governance and Partition Key Topology with OpenMetadata

## Status
Accepted

## Date
2026-10-18

## Context & Problem Statement
In an event-driven microservices architecture spanning 25+ services, 22 Domain Aggregate Roots across 8 Bounded Contexts, Debezium PostgreSQL WAL CDC, and Redpanda topics, two critical governance challenges emerged:

1. **Anti-Pattern of Centralized Aggregate Catalogs (Vernon IDDD Violation):**
   Hardcoding a static 22-value enum in a shared library (`resonance-starter-core`) introduces tight coupling and an organizational bottleneck: adding or evolving any aggregate root in a bounded context requires modifying and re-releasing the common starter library, forcing cascade rebuilds across unrelated microservices.
2. **Infrastructure-Leaking Partition Routing (DDIA Ch. 6 Violation):**
   The initial partitioning utility (`CompoundPartitionKeyRouter`) directly embedded Kafka internal Murmur2 hashing and raw `assignPartition(...)` calculation in domain application code. Furthermore, keying merely on `tenantId:entityId` lacked domain context, risked identifier collision across bounded contexts, and obscured event provenance.
3. **Absence of Unified Data Catalog & Lineage (Control Plane Blind Spot):**
   The enterprise had no standard platform to discover aggregate roots, inspect CDC topic mappings, trace schema contracts (AsyncAPI 3.0 & Protobuf) back to business entities, or monitor celebrity partition skew risk (`LOW`, `MEDIUM`, `HIGH`).

We require a cloud-native, open-standard data governance solution that maintains **100% Bounded Context autonomy** while providing a single source of truth for all domain aggregate roots and partition topology.

---

## 1. High-Level Architectural Decision Matrix

| Dimension | Architectural Decision | Justification |
| :--- | :--- | :--- |
| **Data Governance Standard** | **OpenMetadata (Linux Foundation / Apache 2.0)** | Standardizes Domain hierarchy, Data Products, and Business Glossary Terms. Connects PostgreSQL `outbox_events` tables, Debezium CDC connectors, Redpanda topics, and Apicurio schemas in an open, searchable graph. |
| **Runtime Coupling** | **Control Plane / Data Plane Strict Separation** | Microservice JVMs **never** make synchronous HTTP calls to OpenMetadata during transaction or event publication hot-paths. OpenMetadata operates strictly as the governance control plane and GitOps target. |
| **Partition Key Topology** | **Domain-Driven Compound Partition Key (`{tenantId}:{aggregateType}:{aggregateId}[#{saltBucket}]`)** | Enforces fail-closed multi-tenancy (`TenantGuard.requireTenantId`), strict per-aggregate causal ordering, and collision-free entity routing across all microservices. Hot-spot entities (e.g., `CONTEXT_NODE`) are salted across deterministic buckets. |
| **Microservice Autonomy** | **Decentralized `AggregateType` Contract Interface** | `resonance-starter-core` defines the `AggregateType` SPI and `DomainPartitionKey` record. Each microservice defines its own domain aggregate enum locally (e.g. `ActionAggregateType`). |
| **Specification Synchronization** | **Apicurio Registry 3.x REST API (`:8086`) + OpenMetadata Manifest** | Uses Apicurio Registry's native v3 REST API (`deploy/scripts/sync-contracts-to-apicurio.py`) as the primary synchronization pipeline (`group: com.resonancemachines.catalog`), while OpenMetadata ingests from Apicurio for enterprise data lineage and governance UI. |

---

## 2. Considered Alternatives

### Alternative A: Hardcoded Static Enum in `resonance-starter-core`
* Define a single `enum DomainAggregateType { VFS_NODE, INTENT, ... }` in the common starter library.
* **Pros:** Simple to implement initially.
* **Cons (Rejected):** Violates Bounded Context autonomy; converts `resonance-starter-core` into an anti-pattern "God Module" with constant churn; forces unrelated services to re-deploy when a new domain aggregate is added.

### Alternative B: Proprietary In-House YAML Registry Only
* Store a custom `.agents/.contracts/domain-catalog.yaml` file without OpenMetadata integration.
* **Pros:** Lightweight.
* **Cons (Rejected):** Lacks data lineage, schema discovery, visual UI, access governance, and enterprise data mesh catalog capabilities. Re-invents an ad-hoc metadata standard rather than adopting global standards.

### Alternative C (Selected): Apicurio Registry REST v3 API Synchronization + OpenMetadata Governance Catalog
* Use OpenMetadata's standardized Glossary, Domain, and Custom Property entity schema as the structural standard for the 22 aggregate roots.
* Maintain the declarative manifest in `deploy/openmetadata/domain-glossary-manifest.json` and synchronize it directly into **Apicurio Registry 3.x (`/apis/registry/v3`)** under `group: com.resonancemachines.catalog` using Apicurio's REST API (`deploy/scripts/sync-contracts-to-apicurio.py`).
* Provide `DomainPartitionKey` (Record VO) and `AggregateType` (SPI interface) in `resonance-starter-core`.
* Let each Bounded Context own its domain aggregate enums, while Architecture Guardrails verify alignment.
* OpenMetadata consumes schemas and the domain catalog from Apicurio Registry and Redpanda topics for enterprise lineage visualization.


---

## 3. Detailed Architectural Specification

### 3.1 OpenMetadata Entity Hierarchy
```
OpenMetadata Root
 ├── Glossary: ResonanceDomainCatalog
 │    ├── Domain: Storage & VFS (resonance-vfs)
 │    │    ├── Term: VFS_NODE
 │    │    ├── Term: VFS_DOCUMENT
 │    │    ├── Term: DOCUMENT_METADATA
 │    │    └── Term: DOCUMENT_CHUNK (Salted: 4 buckets)
 │    ├── Domain: Operational Ingress (resonance-action, resonance-upload)
 │    │    ├── Term: INTENT
 │    │    ├── Term: DOWNLOAD_SESSION
 │    │    └── Term: NOTIFICATION
 │    ├── Domain: Reliability & Support (resonance-support)
 │    │    ├── Term: INCIDENT_TICKET
 │    │    ├── Term: DLQ_QUARANTINE
 │    │    └── Term: SUPPORT_TASK
 │    ├── Domain: Organization & Identity (resonance-org)
 │    │    ├── Term: ORGANIZATION
 │    │    ├── Term: WORKSPACE
 │    │    └── Term: WORKSPACE_USER
 │    ├── Domain: Workflow & Orchestration (resonance-workflow, resonance-approval)
 │    │    ├── Term: SAGA_INSTANCE
 │    │    ├── Term: APPROVAL_TASK
 │    │    └── Term: COMPUTE_JOB
 │    ├── Domain: Semantic Brain (resonance-unified-context)
 │    │    ├── Term: SUBGRAPH_SCHEMA
 │    │    └── Term: CONTEXT_NODE (Salted: 16 buckets)
 │    ├── Domain: Security & Cryptography (resonance-crypto)
 │    │    ├── Term: TOKEN_VAULT_ENTRY
 │    │    └── Term: FILE_ENTITLEMENT
 │    └── Domain: Control, Billing & Egress (resonance-control, resonance-webhook)
 │         ├── Term: CONTROL_PLANE
 │         ├── Term: USAGE_METER (Salted: 8 buckets)
 │         ├── Term: DELIVERY_PRODUCT
 │         └── Term: WEBHOOK_DISPATCH
```

### 3.2 Standard Custom Attributes on Glossary Terms
Every aggregate root registered in the catalog must specify:
1. `boundedContext`: Emitting microservice identifier (e.g. `resonance-action`).
2. `idField`: Name of the entity identifier property (e.g. `intentId`).
3. `partitionKeyPattern`: Canonical pattern `{tenantId}:{aggregateType}:{aggregateId}[#{saltBucket}]`.
4. `causalScope`: Ordering boundary (`PER_AGGREGATE_INSTANCE`).
5. `celebritySkewRisk`: Skew susceptibility (`LOW`, `MEDIUM`, `HIGH`).
6. `defaultSaltBuckets`: Salt partition count ($1$ if unsalted, $\ge 4$ if celebrity hot-spot).
7. `cdcOutboxTopic`: Target Redpanda topic (`resonance.outbox.{aggregateType}`).
8. `asyncApiChannel`: Associated AsyncAPI 3.0 event channel.

### 3.3 Domain Partition Key Contract (`DomainPartitionKey`)
In `resonance-starter-core`:
```java
public record DomainPartitionKey(
    String tenantId,
    String aggregateType,
    String aggregateId,
    int saltBucket
) {
    public static DomainPartitionKey of(String tenantId, AggregateType type, String aggregateId);
    public static DomainPartitionKey ofSalted(String tenantId, AggregateType type, String aggregateId, int saltBuckets);
    public String asRoutingKey();
}
```

---

## 4. Consequences & Invariants

### Positive Consequences
* **Bounded Context Autonomy:** No central enum release bottlenecks. Microservices evolve domain models independently.
* **Zero Runtime Overhead:** Microservices use local Java records and never perform synchronous metadata HTTP lookups on the event publication path.
* **End-to-End Lineage & Observability:** Outbox tables, Debezium CDC routes, Redpanda topics, and consumer services are fully cataloged in OpenMetadata.
* **Strict Causal Ordering & Skew Mitigation:** Enforces DDIA Chapter 6 compound keys per aggregate instance and deterministic salting for hot-spot entities like `CONTEXT_NODE`.

### Required Invariants
* Every aggregate root name emitted to the Transactional Outbox must correspond to a valid Glossary Term in `deploy/openmetadata/domain-glossary-manifest.json`.
* Multi-tenant partition keys must always validate `tenantId` via `TenantGuard.requireTenantId(tenantId)` (GR-01).
