# Resonance Contract Mesh Core Rules (`mini`)

## When to use
Use when defining AsyncAPI 3.0 channels, Protobuf (`proto3`) schemas, registering artifacts in Apicurio Registry 3.x, configuring Debezium Outbox CDC, or defining `DomainPartitionKey` hashing strategies.

## Core Architectural Standards
* **Event IDL:** Protocol Buffers (`proto3`). Binary payloads stored in `outbox_events.payload` (`BYTEA`).
* **Mesh Channel Topology:** AsyncAPI 3.0 (`src/main/asyncapi/asyncapi.yaml`).
* **Schema Registry:** Apicurio Registry 3.x (`http://localhost:8086/apis/registry/v3`). Rule: `BACKWARD_TRANSITIVE` + `VALIDITY: FULL`.
* **Domain Aggregate Catalog:** OpenMetadata standard manifest ([`domain-glossary-manifest.json`](../docs/contracts/domain-glossary-manifest.json)) and catalog specification ([`domain-catalog.yaml`](../docs/contracts/domain-catalog.yaml)).
* **Partition Key Topology:** `{tenantId}:{aggregateType}:{aggregateId}[#{saltBucket}]`.
* **Publishing Engine:** PostgreSQL WAL CDC via Debezium `EventRouter`. Zero polling columns in Outbox table ([ADR-0001](../docs/adr/0001-transactional-outbox-event-structure.md)).

## DDIA Ch. 6 Skew Mitigation & Salt Bucket Matrix
* **LOW Skew (1 bucket):** `INTENT`, `VFS_NODE`, `ORGANIZATION`, `SAGA_INSTANCE`, `INCIDENT_TICKET`. Key: `{tenantId}:{aggregateType}:{id}`.
* **MEDIUM Skew (4~8 buckets):** `DOCUMENT_CHUNK` (4), `USAGE_METER` (8). Key: `{tenantId}:{aggregateType}:{id}#{0..N-1}`.
* **HIGH Skew (16 buckets):** `CONTEXT_NODE` (16). Key: `{tenantId}:CONTEXT_NODE:{nodeUri}#{0..15}`.

## 5-Step Workflow
1. **Catalog Registration:** Register aggregate in `domain-glossary-manifest.json` and `domain-catalog.yaml`.
2. **Schema & Channel:** Author `.proto` and declare channel in `asyncapi.yaml`.
3. **Apicurio Sync:** Run `python3 deploy/scripts/sync-contracts-to-apicurio.py`.
4. **Outbox Persistence:** Resolve `DomainPartitionKey.of(...)`, serialize Protobuf, save `OutboxEvent`.
5. **Consumer Idempotency:** Check deduplication via `IdempotencyStore` before executing side-effects.
