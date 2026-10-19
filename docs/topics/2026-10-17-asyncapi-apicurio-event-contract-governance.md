# Research Topic: Company Brain Platform - Unified Event Contract Governance & Schema Registry Architecture (AsyncAPI 3.0 & Apicurio Registry 3.x)

> **Status:** `RESOLVED_BY_ADR_0008` ([ADR 0008](../adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md))  
> **Date Initialized:** 2026-10-17  
> **Date Resolved:** 2026-10-17  
> **Author / Lead:** Antigravity (Lead OSS SaaS Architect, Resonance Platform)  
> **Resolution Artifacts:**
> - Research Document: [`docs/research/2026-10-17-research.md`](../research/2026-10-17-research.md)
> - Architecture Decision Record: [`docs/adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md`](../adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md)  
> **Target Subsystems:**
> - [`resonance-action`](../architecture/ARCHITECTURE.md#L51) (Port `:8001` - Transactional Outbox Command Gateway)
> - [`resonance-upload`](../architecture/ARCHITECTURE.md#L58) (Port `:8008` - Multipart Ingestion & VFS Outbox Producer)
> - [`resonance-workflow`](../architecture/ARCHITECTURE.md#L72) (Port `:8108` - Choreographed Saga Coordinator)
> - [`resonance-crypto`](../architecture/ARCHITECTURE.md#L67) (Port `:8103` - Zero Plaintext PII Edge Tokenization Interceptor)
> - [`resonance-support`](../architecture/ARCHITECTURE.md#L56) (Port `:8006` - DLQ / Poison Pill Quarantine Resolver)
> - [`resonance-event`](../architecture/ARCHITECTURE.md#L82) (Port `:8203` - Append-Only Master Event Store)
> - [`resonance-unified-context`](../architecture/ARCHITECTURE.md#L88) (Port `:9001` - Continuous GraphRAG & Architectural Topology Graph)
> - [`resonance-dependency`](../architecture/ARCHITECTURE.md#L89) (`resonance-bom` & `resonance-starter-core`)
> - Persistence & Mesh: Apicurio Registry 3.x (`:8086`), Redpanda (`:19092`), Debezium Connect (`:8083`), PostgreSQL 16 (`:5433`), Neo4j 5.20 (`:7687`)

---

## 1. Executive Context & Problem Statement

The Resonance Platform relies on an asynchronous, decoupled event mesh (Redpanda) fed by the Transactional Outbox pattern (`outbox_events` + Debezium PostgreSQL WAL CDC) and consumed by Choreographed Sagas (`resonance-workflow`) and the Platform Brain (`resonance-unified-context`).

An architectural audit of the repository exposed a **three-way contract drift**:
1. [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md#L130) specifies **Apache Avro (`.avsc`)** with `BACKWARD_TRANSITIVE` compatibility.
2. [`.agents/.contracts/CONTRACTS.md`](../contracts/CONTRACTS.md#L9-L17) specifies **Protocol Buffers (`proto3`)** with CloudEvents headers (`ce_specversion`, `ce_type`, `ce_source`, `tenant_id`, `traceparent`).
3. **Actual Runtime Implementation** across `resonance-action`, `resonance-workflow`, and `resonance-unified-context` uses untyped `StringSerializer` over raw `TEXT` columns in `outbox_events` with **zero runtime or build-time schema registry validation**. Furthermore, `OutboxEvent` contains a fail-open fallback (`tenantId = "default-tenant"`), risking violations of **Architectural Invariant 4 (Multi-Tenant Isolation)**.

We must unify our asynchronous API specifications and runtime schema governance using 100% open-source primitives: **[AsyncAPI 3.0](https://www.asyncapi.com/en)** and **[Apicurio Registry 3.x](https://www.apicur.io/registry/)**.

---

## 2. Core Architectural Synergies: AsyncAPI 3.0 + Apicurio Registry 3.x

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    ASYNCAPI 3.0 + APICURIO REGISTRY 3.x SYNERGY                        │
├──────────────────────────────┬─────────────────────────────────────────────────────────┤
│ 1. Operational Overhead      │ Apicurio Registry 3.x backed by existing PostgreSQL 16; │
│                              │ single unified registry for AsyncAPI, OpenAPI, Protobuf.│
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 2. Scalability Boundaries    │ Local JVM schema ID cache (O(1) hot path); compact      │
│                              │ Protobuf binary wire format in outbox_events (bytea).   │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 3. Multi-Tenancy Isolation   │ Mandatory UUID tenantId envelope enforced before outbox │
│                              │ commit; eliminates "default-tenant" fail-open bug.      │
├──────────────────────────────┼─────────────────────────────────────────────────────────┤
│ 4. Developer Velocity        │ Design-first AsyncAPI 3.0 specs + Protobuf contracts;   │
│                              │ Maven CI gates for BACKWARD_TRANSITIVE + INTEGRITY.     │
└──────────────────────────────┴─────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Milestones & ADR Promotion Criteria

1. **Standardize Wire Format on Protobuf (`proto3`) + CloudEvents Headers:** Reconcile `ARCHITECTURE.md` and `CONTRACTS.md` around Protobuf payloads referenced by AsyncAPI 3.0 channel/message definitions.
2. **Deploy Apicurio Registry 3.x on PostgreSQL 16:** Configure `VALIDITY`, `COMPATIBILITY (BACKWARD_TRANSITIVE)`, and `INTEGRITY` rules across artifact groups `resonance.events` and `resonance.asyncapi`.
3. **Fail-Closed Outbox Serialization (`resonance-starter-core`):** Validate mandatory `tenantId` (UUID) and serialize Protobuf payloads into `bytea` inside the caller's `@Transactional` boundary before writing to `outbox_events`.
4. **Debezium Passthrough Routing:** Configure `EventRouter` with `BinaryDataConverter` so wire-framed Apicurio Protobuf bytes flow directly to Redpanda topics without double-serialization.
5. **Architectural Self-Awareness in `resonance-unified-context`:** Project registered AsyncAPI 3.0 specifications into Neo4j (`(:Service)-[:PUBLISHES_TO]->(:Channel)-[:CARRIES_SCHEMA]->(:Artifact)`) under the platform system graph.
6. **Promotion to ADR:** Author and merge **ADR 0008: Unified Event Contract Governance and Schema Registry Architecture with AsyncAPI 3.0 and Apicurio Registry 3.x**.
