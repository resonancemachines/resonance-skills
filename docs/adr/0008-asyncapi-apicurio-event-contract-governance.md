# ADR 0008: Unified Event Contract Governance and Schema Registry Architecture with AsyncAPI 3.0 and Apicurio Registry 3.x

## Status
Accepted

## Date
2026-10-17

## Context & Problem Statement

The Resonance Platform relies on an asynchronous, decoupled event mesh (Redpanda) fed by the Transactional Outbox pattern (`outbox_events` + Debezium PostgreSQL WAL CDC) and consumed by Choreographed Sagas (`resonance-workflow`) and the Platform Brain (`resonance-unified-context`) (`README.md`, [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)).

An architectural audit conducted in [`2026-10-17-research.md`](../research/2026-10-17-research.md) uncovered three critical deficiencies:

1. **Three-Way Contract Drift:** [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md#L130) mandates Apache Avro (`.avsc`), [`.agents/.contracts/CONTRACTS.md`](../contracts/CONTRACTS.md#L9-L17) mandates Protocol Buffers (`proto3`), and the actual runtime services (`resonance-action`, `resonance-workflow`, `resonance-unified-context`) emit unvalidated JSON strings via `StringSerializer` stored in `TEXT` columns with zero schema registry integration.
2. **Multi-Tenancy Fail-Open Defect (Invariant 4 Risk):** `OutboxEvent.java` silently defaults `tenantId` to `"default-tenant"` when null or blank, risking cross-tenant leakage on the event mesh.
3. **Outbox Producer Blind Spot:** Because Front-Office services publish events by inserting rows into PostgreSQL `outbox_events` (streamed by Debezium Connect) rather than calling `KafkaTemplate.send(...)` directly, code-scanning documentation tools cannot discover our event producers or validate payloads prior to database commit.

We require a unified, 100% open-source event contract and schema governance architecture that enforces strict compile-time and pre-commit runtime validation across all 24 microservices while preserving our **$\le 4.0\text{ second}$ GraphRAG SLA**.

---

## 1. High-Level Architectural Decision Matrix

| Dimension | Architectural Decision | Justification |
| :--- | :--- | :--- |
| **Operational Overhead** | **Apicurio Registry 3.x backed by existing PostgreSQL 16** | Consolidates `ASYNCAPI`, `OPENAPI`, `GRAPHQL`, and `PROTOBUF` artifacts in a single Apache-2.0 registry without adding a new database engine. Replaces the limited Redpanda SR listener (`:9644`). |
| **Scalability Boundaries** | **Pre-Commit Apicurio Protobuf Wire Framing (`BYTEA`) + Local JVM Cache** | Serializes Protobuf payloads to `[0x00 + 8B globalId + proto bytes]` before outbox `INSERT`. Local JVM schema ID cache guarantees $\mathcal{O}(1)$ hot-path lookup ($0.047\text{ ms}$) with zero per-message HTTP calls. |
| **Multi-Tenancy Isolation** | **Fail-Closed `OutboxEnvelope` + Consumer Header/Payload Equality Gate** | Rejects null or `"default-tenant"` at construction time; consumers verify `Header("tenantId") == Payload.getTenantId()` before processing. |
| **Developer Velocity** | **Design-First AsyncAPI 3.0 + Unified Protobuf IDL (`proto3`)** | Reuses Protobuf across both gRPC and Redpanda events; enforces `VALIDITY`, `BACKWARD_TRANSITIVE`, and `INTEGRITY` (`ALL_REFS_MAPPED`) in CI before merge. |

---

## 2. Considered Options

### Option A: Status Quo (Untyped JSON Strings over `TEXT` Outbox Columns)
* Keep `StringSerializer` and unvalidated JSON strings in `outbox_events.payload`.
* **Pros:** Zero migration effort.
* **Cons (Rejected):** Zero schema enforcement; allows breaking changes and `"default-tenant"` fail-open events to reach Redpanda consumers; violates contract governance requirements.

### Option B: Code-First Only (Springwolf Annotation Scanning + Redpanda Schema Registry)
* Rely on Springwolf to generate AsyncAPI docs from `@KafkaListener` / `@AsyncPublisher` annotations and use Redpanda's built-in Schema Registry (`:9644`) for runtime schemas.
* **Pros:** No separate registry container; minimal YAML authoring.
* **Cons (Rejected):** Code scanners cannot inspect Debezium WAL outbox producers (`INSERT INTO outbox_events`), leaving half the mesh undocumented. Furthermore, Redpanda's built-in Schema Registry only stores Avro/Protobuf/JSON schemas—it cannot store AsyncAPI 3.0 documents or enforce cross-artifact reference integrity (`INTEGRITY` rule) between AsyncAPI channels and Protobuf payloads.

### Option C: Dual Registry Split (Apicurio for AsyncAPI Docs + Redpanda SR for Runtime SerDes)
* Store AsyncAPI 3.0 specs in Apicurio Registry for human discovery while using Redpanda SR for runtime Kafka serialization.
* **Pros:** Uses existing Redpanda SR port.
* **Cons (Rejected):** Splits governance across two registries with incompatible schema IDs, creating a new two-way drift vector between documented contracts and runtime wire schemas.

### Option D (Selected): Design-First AsyncAPI 3.0 + Apicurio Registry 3.x (PostgreSQL-Backed) + Pre-Commit Protobuf Outbox Serialization
* Author `asyncapi.yaml` (AsyncAPI 3.0) per service in git, referencing canonical `.proto` (`proto3`) event schemas via `MultiFormatSchema`.
* Run **Apicurio Registry 3.x** (Apache-2.0) backed by PostgreSQL 16 as the single source of truth for both `PROTOBUF` schemas (`group: resonance.events`) and `ASYNCAPI` specifications (`group: resonance.asyncapi`), enforcing `VALIDITY`, `COMPATIBILITY (BACKWARD_TRANSITIVE)`, and `INTEGRITY (ALL_REFS_MAPPED)`.
* Serialize and validate events inside the caller's `@Transactional` boundary via `ContractedOutboxWriter` (`resonance-starter-core`), storing Apicurio wire-framed Protobuf bytes in `outbox_events.payload` (`BYTEA`) and routing them untouched through Debezium `EventRouter` + `BinaryDataConverter`.
* Project registered AsyncAPI 3.0 topologies into Neo4j (`resonance-unified-context`) for architectural blast-radius queries.

---

## 3. Decision Outcome & Architectural Blueprint

We selected **Option D**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DESIGN-TIME & CI/CD CONTRACT GOVERNANCE                         │
│                                                                                        │
│  [.proto Event Schemas] + [Service asyncapi.yaml (AsyncAPI 3.0)]                       │
│         │                                                                              │
│         ▼ (Maven verify: asyncapi validate + apicurio test-update)                     │
│  [Apicurio Registry 3.x (:8086)] ◄──► [PostgreSQL 16: apicurio database]               │
│  • Enforces VALIDITY + COMPATIBILITY (BACKWARD_TRANSITIVE) + INTEGRITY                 │
└─────────────────────────┬───────────────────────────────────────────┬──────────────────┘
                          │ Cached Schema IDs                         │ Topology Sync
                          ▼                                           ▼
┌───────────────────────────────────────────────────┐ ┌──────────────────────────────────┐
│ FRONT-OFFICE (:8001, :8008)                       │ │ PLATFORM BRAIN (:9001)           │
│ • OutboxEnvelope requires UUID tenantId           │ │ • Consumes typed Protobuf events │
│ • Apicurio ProtobufKafkaSerializer (autoReg=false)│ │ • Projects (:Microservice)-      │
│ • Writes wire-framed BYTEA to outbox_events       │ │   [:PUBLISHES_TO]->(:Channel)    │
└─────────────────────────┬─────────────────────────┘ │   into Neo4j system graph        │
                          │ PostgreSQL WAL            └───────────────▲──────────────────┘
                          ▼                                           │
┌───────────────────────────────────────────────────┐                 │
│ DEBEZIUM CONNECT (:8083)                          │                 │
│ • EventRouter SMT + BinaryDataConverter           │                 │
│ • Maps CloudEvents + tenantId headers to Redpanda │                 │
└─────────────────────────┬─────────────────────────┘                 │
                          │ Wire-Framed Protobuf                      │
                          ▼                                           │
            Redpanda Topics (resonance.outbox.*) ─────────────────────┤
                          │                                           │
                          ▼                                           │
┌───────────────────────────────────────────────────┐                 │
│ MIDDLE-OFFICE SAGAS (:8101-:8109)                 │─────────────────┘
│ • Apicurio ProtobufKafkaDeserializer              │
│ • Verifies Header(tenantId) == Payload.tenant_id  │
│ • Idempotent ce_id ledger + Saga state transitions│
└───────────────────────────────────────────────────┘
```

---

## 4. Technical Consequences

### Positive Consequences
- **Single Source of Truth:** Reconciles the three-way drift between `ARCHITECTURE.md`, `CONTRACTS.md`, and runtime code around **Protobuf (`proto3`) payloads** governed by **AsyncAPI 3.0** channel contracts in **Apicurio Registry 3.x**.
- **Pre-Commit Poison Pill Prevention:** Because `ContractedOutboxWriter` runs Apicurio's `ProtobufKafkaSerializer` inside the PostgreSQL transaction with `AUTO_REGISTER_ARTIFACT=false`, unregistered or malformed events roll back the local transaction before ever reaching the WAL or Redpanda.
- **Strict Multi-Tenant Enforcement:** Eliminates the `"default-tenant"` fallback in `OutboxEvent` and enforces dual header/payload `tenantId` verification on every consumer.
- **Architectural Self-Awareness:** Projecting AsyncAPI 3.0 specs into Neo4j enables `resonance-unified-context` to answer live lineage and blast-radius queries across all 24 microservices.

### Negative Consequences / Trade-offs
- **Additional Stateless Service:** Adds `apicurio-registry` (`:8086`) to the deployment topology (though it reuses the existing PostgreSQL 16 instance).
- **Schema Migration for `outbox_events`:** Requires a Flyway migration converting `outbox_events.payload` from `TEXT` to `BYTEA` and configuring Debezium with `BinaryDataConverter`.

---

## 5. Compliance with Architectural Invariants

| Invariant | Status | Verification Mechanism |
| :--- | :--- | :--- |
| **1. No Two-Phase Commit** | **COMPLIANT** | Outbox serialization occurs within the single local PostgreSQL transaction; cross-service workflows use AsyncAPI 3.0 choreographed sagas. |
| **2. Zero Plaintext PII in Mesh** | **COMPLIANT** | Protobuf schemas classify PII fields via custom options; `resonance-crypto` tokenizes prior to outbox serialization. |
| **3. Database-Per-Service** | **COMPLIANT** | Apicurio uses an isolated `apicurio` database; microservices communicate exclusively via Redpanda and gRPC. |
| **4. Multi-Tenant Isolation** | **COMPLIANT** | `OutboxEnvelope` rejects null/default `tenantId`; consumers verify `Header("tenantId") == Payload.getTenantId()`. |
| **5. Deterministic Classpaths** | **COMPLIANT** | All Apicurio SerDe and Protobuf dependencies are version-pinned exclusively in `resonance-bom`. |

---

## 6. Verification & Test Plan

1. **Fail-Closed Tenant Unit Test:** Verify that constructing an `OutboxEnvelope` with `null` tenant or non-UUID `tenantId` throws an immediate `NullPointerException` / `IllegalArgumentException`.
2. **Pre-Commit Unregistered Schema Rejection Test:** Configure `ContractedOutboxWriter` with `AUTO_REGISTER_ARTIFACT=false` and verify that attempting to append an unregistered Protobuf message rolls back the surrounding `@Transactional` method.
3. **CI Compatibility Gate Test:** Introduce a synthetic breaking field type change in `DocumentUploadedEvent.proto` and verify that `apicurio-registry-maven-plugin:test-update` fails the build under `BACKWARD_TRANSITIVE`.
4. **Consumer Header/Payload Mismatch Quarantine Test:** Emit a record where the Kafka `tenantId` header differs from `payload.getTenantId()` and assert that `ContractedDocumentEventConsumer` rejects the record to `resonance.events.dlq` without mutating Neo4j or PostgreSQL state.
