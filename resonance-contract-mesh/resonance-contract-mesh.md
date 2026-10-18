---
name: resonance-contract-mesh
description: >
  Specialized Contract-First Event Mesh, Schema Registry & Domain Catalog governance skill for the Resonance Platform (https://github.com/resonancemachines).
  Activate this skill when defining or modifying AsyncAPI 3.0 channel specifications, Protocol Buffers (`proto3`) event schemas,
  Apicurio Registry 3.x (:8086) artifacts, Transactional Outbox CDC configurations, Domain Aggregate Root Catalogs,
  or multi-tenant partition key routing policies (DomainPartitionKey, salting, skew mitigation).
  Enforces ADR-0001, ADR-0008, ADR-0010, and ADR-0011.
---

# Resonance Contract Mesh Skill (`resonance-contract-mesh`)

Use this skill when designing, publishing, consuming, or governing asynchronous event streams, schema contracts, Transactional Outbox tables, and partition topologies across the Resonance mesh.

---

## 1. Core Architectural Standards

| Dimension | Platform Standard | Authority |
|:--|:--|:--|
| **Event Interface Definition (IDL)** | Protocol Buffers (`proto3`) | [ADR-0008](docs/adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md) |
| **Mesh Channel Topology** | AsyncAPI 3.0 (`asyncapi.yaml`) | [ADR-0008](docs/adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md) |
| **Schema & Contract Registry** | Apicurio Registry 3.x (`http://localhost:8086/apis/registry/v3`) | [ADR-0008](docs/adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md), [ADR-0010](docs/adr/ADR-0010-target-infrastructure-topology-and-governance.md) |
| **Schema Compatibility Rule** | `BACKWARD_TRANSITIVE` + `VALIDITY: FULL` | Apicurio Rule Enforcement |
| **Domain Catalog & Governance** | OpenMetadata Entity Standard + Apicurio Artifact | [ADR-0011](docs/adr/ADR-0011-domain-aggregate-governance-with-openmetadata.md) |
| **Partition Key Topology** | `{tenantId}:{aggregateType}:{aggregateId}[#{saltBucket}]` | DDIA Ch. 6 & [ADR-0011](docs/adr/ADR-0011-domain-aggregate-governance-with-openmetadata.md) |
| **Reliable Publishing Engine** | PostgreSQL WAL CDC via Debezium `EventRouter` (`outbox_events`) | [ADR-0001](docs/adr/ADR-0001-transactional-outbox-event-structure.md) |

---

## 2. Twelve-Factor Event Stream Principles

Contract-mesh components and event listeners must honor cloud-native Twelve-Factor discipline:

1. **Backing Services as Attached Resources (Factor IV):**
   * Redpanda brokers and Apicurio Registry MUST be treated as swappable attached resources.
   * Connection coordinates must never be hardcoded: use `${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}` and `${APICURIO_REGISTRY_URL:http://localhost:8086/apis/registry/v3}`.
2. **Stateless Processing & Scale-Out Concurrency (Factor VI & VIII):**
   * Stream consumers must remain share-nothing processes. In-memory event caches must be backed by distributed caches (Redis) or local transient caches invalidated via mesh events.
   * Concurrency scales via partition distribution (`spring.kafka.listener.concurrency=3`).
3. **Disposability & Graceful Shutdown (Factor IX):**
   * Consumers must shut down cleanly: commit in-flight offsets before terminating to avoid duplicate reprocessing cascades during K8s rollouts.
   * Configure container termination grace periods: `server.shutdown=graceful` and `spring.lifecycle.timeout-per-shutdown-phase=20s`.
4. **Dev/Prod Parity (Factor X):**
   * Development, CI, and production run identical Apicurio Registry 3.x schema enforcement and Redpanda/Kafka event bus protocols.
5. **Admin Tasks as Scripted Tooling (Factor XII):**
   * Schema and catalog synchronization to Apicurio is automated via CI/CD execution of `deploy/scripts/sync-contracts-to-apicurio.py`.

---

## 3. Domain Aggregate Root Catalog Governance

All event emissions MUST be associated with an authorized **Domain Aggregate Root** registered in:
*   OpenMetadata Declarative Manifest: [`deploy/openmetadata/domain-glossary-manifest.json`](deploy/openmetadata/domain-glossary-manifest.json)
*   Contract Specification Catalog: [`.agents/.contracts/domain-catalog.yaml`](.agents/.contracts/domain-catalog.yaml)
*   Apicurio Registry 3.x: Group `com.resonancemachines.catalog`, Artifact `domain-aggregate-catalog`

### Skew Mitigation & Salt Bucket Matrix (DDIA Ch. 6)

| Celebrity Skew Risk | Salt Buckets | Candidate Aggregate Roots | Routing Key Format |
|:--|:--:|:--|:--|
| **LOW** | $1$ (None) | `INTENT`, `VFS_NODE`, `ORGANIZATION`, `SAGA_INSTANCE`, `INCIDENT_TICKET` | `{tenantId}:{aggregateType}:{aggregateId}` |
| **MEDIUM** | $4 \sim 8$ | `DOCUMENT_CHUNK` ($4$), `USAGE_METER` ($8$) | `{tenantId}:{aggregateType}:{aggregateId}#{0..N-1}` |
| **HIGH** | $16$ | `CONTEXT_NODE` (High-density knowledge graph entities) | `{tenantId}:CONTEXT_NODE:{nodeUri}#{0..15}` |

---

## 4. The 5-Step Workflow for Adding a New Domain Event / Aggregate

### Step 1: Declare or Update the Aggregate Root in the Catalog
Add the aggregate definition to `deploy/openmetadata/domain-glossary-manifest.json` and `.agents/.contracts/domain-catalog.yaml`:
```json
{
  "name": "NEW_AGGREGATE",
  "displayName": "New Domain Aggregate",
  "domain": "OperationalIngress",
  "description": "Domain aggregate root description.",
  "customProperties": {
    "boundedContext": "resonance-action",
    "idField": "entityId",
    "partitionKeyPattern": "{tenantId}:NEW_AGGREGATE:{entityId}",
    "causalScope": "PER_AGGREGATE_INSTANCE",
    "celebritySkewRisk": "LOW",
    "defaultSaltBuckets": 1,
    "cdcOutboxTopic": "resonance.outbox.NEW_AGGREGATE",
    "asyncApiChannel": "resonance.action.newaggregate.v1"
  }
}
```

### Step 2: Define Protobuf Schema & AsyncAPI 3.0 Channel
1. Create/update the `.proto` message under `resonance-dependency/resonance-stubs/src/main/proto/` or `.agents/.contracts/proto/`:
   ```protobuf
   syntax = "proto3";
   package com.resonancemachines.events.action.v1;

   message NewAggregateCreatedEvent {
     string tenant_id = 1;
     string entity_id = 2;
     int64 version = 3;
     int64 created_at_unix_ms = 4;
   }
   ```
2. Declare the channel and message in the emitting service's `src/main/asyncapi/asyncapi.yaml`:
   ```yaml
   channels:
     resonance.action.newaggregate.v1:
       address: resonance.outbox.NEW_AGGREGATE
       messages:
         NewAggregateCreatedEvent:
           $ref: '#/components/messages/NewAggregateCreatedEvent'
   ```

### Step 3: Synchronize Contracts to Apicurio Registry 3.x
Publish the updated catalog and schemas directly into Apicurio Registry via the platform sync script:
```bash
python3 deploy/scripts/sync-contracts-to-apicurio.py
```
Verify registration on port 8086:
```bash
curl -s http://localhost:8086/apis/registry/v3/groups/com.resonancemachines.catalog/artifacts/domain-aggregate-catalog
```

### Step 4: Implement Domain Partition Key & Outbox Persistence
In the microservice domain layer:
```java
// 1. Declare local AggregateType enum
public enum ActionAggregateType implements AggregateType {
    NEW_AGGREGATE
}

// 2. Resolve DomainPartitionKey with fail-closed tenant validation
DomainPartitionKey key = DomainPartitionKey.of(
    tenantId,
    ActionAggregateType.NEW_AGGREGATE,
    entity.getId()
);

// 3. Persist to outbox_events with BYTEA payload (ADR-0001)
OutboxEvent outbox = new OutboxEvent(
    ActionAggregateType.NEW_AGGREGATE.name(),
    entity.getId(),
    "com.resonance.action.newaggregate.v1",
    protoWireBytes,
    correlationId,
    tenantId
);
outboxRepository.save(outbox);
```

### Step 5: Consumer Idempotency & Verification
1. Consumers must guarantee idempotent processing via `IdempotencyStore`:
   ```java
   if (!idempotencyStore.record(eventId, tenantId)) {
       log.info("Duplicate event {} discarded for tenant {}", eventId, tenantId);
       return;
   }
   ```
2. Verify with Architecture Guardrail:
   ```bash
   ./deploy/scripts/enforce-architecture-guardrails.sh
   ```
