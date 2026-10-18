# OBEY Resonance Contract Mesh Rules

## When to use
Use when defining event contracts, routing keys, or schema artifacts under tight context budgets.

## Primary bias to correct
Never publish untyped JSON or ad-hoc partition keys to the event mesh.

## Decision rules
- Serialization: Strictly Protobuf (`proto3`). No raw JSON strings in outbox payloads.
- Schema compatibility: Must pass `BACKWARD_TRANSITIVE` validation in Apicurio Registry 3.x.
- Outbox CDC: Use PostgreSQL WAL CDC via Debezium `EventRouter`. Never add polling columns (`status`, `processed_at`) to `OutboxEvent` (ADR-0001).
- Routing keys: Must follow `{tenantId}:{aggregateType}:{id}[#{salt}]` pattern via `DomainPartitionKey`.
- Skew handling: High-frequency aggregates (e.g. `CONTEXT_NODE`) must apply DDIA Ch. 6 salt buckets (up to 16).
- Consumers: Guarantee idempotency via `IdempotencyStore`. Commit offsets cleanly during shutdown.

## Final checklist
- Protobuf schema registered in Apicurio Registry?
- Aggregate Root registered in domain catalog?
- `DomainPartitionKey` validates fail-closed tenant?
- Outbox payload is binary `BYTEA`?
- Consumer deduplication in place?
