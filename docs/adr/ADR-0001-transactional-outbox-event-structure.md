# ADR 0001: Debezium CDC and Native Auditing Architecture

## Status
Accepted

## Date
2026-09-14 (Updated 2026-10-19 for ADR-0008 Greenfield BYTEA Alignment)

## Context
We are deprecating custom application-level outbox polling in favor of an infrastructure-centric CDC architecture using open-source tools. 

1. **Platform-Wide Outbox:** Debezium monitors the PostgreSQL WAL to capture inserts into `outbox_events`, handling topic routing and partition keying via SMTs (`EventRouter`). All state-mutating bounded contexts (including front-office ingestion and middle-office sagas) commit events atomically to `outbox_events`.
2. **Payload & Wire Protocol:** Payloads are serialized to Apicurio wire-framed Protobuf bytes stored as native `BYTEA NOT NULL` (ADR-0008) with CloudEvents 1.0 headers (`ce_source`, `correlation_id`, `causation_id`, `traceparent`).
3. **Historical Auditing:** Hibernate Envers manages `_AUD` tables for CQRS tracking of business entities.
4. **Workflow Telemetry:** The Camunda BPMN engine coordinates distributed sagas in `resonance-workflow`, emitting transactional outbox events and utilizing native history event handlers.
5. **Object Storage:** MinIO uses native bucket notifications to publish lifecycle events directly to Redpanda.

## Refactoring Directives for Code Generation
* DELETE all `@Scheduled` database polling loops in standard Spring Boot microservices.
* Prohibit application-level polling columns (`processed`, `processed_at`, `retry_count`, `last_error`) on all `OutboxEvent` entities (strictly enforced by Guardrail GR-02).
* Replace old direct publishing logic with atomic JPA repository persistence to a standardized `OutboxEvent` entity (`aggregate_type`, `aggregate_id`, `payload BYTEA`, `correlation_id`, `tenant_id`, CloudEvents headers) within the main business transaction.
* Enforce the Idempotent Consumer pattern in all Kafka listeners.
