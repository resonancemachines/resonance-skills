# ADR 0001: Debezium CDC and Native Auditing Architecture

## Decision
We are deprecating custom application-level outbox polling in favor of an infrastructure-centric CDC architecture using open-source tools. 

1. **Platform-Wide Outbox:** Debezium monitors the PostgreSQL WAL to capture inserts into `outbox_events`, handling topic routing and partition keying via SMTs.
2. **Historical Auditing:** Hibernate Envers manages `_AUD` tables for CQRS tracking of business entities.
3. **Workflow Telemetry:** The Camunda BPMN engine utilizes native history event handlers to push state changes to the event bus.
4. **Object Storage:** MinIO uses native bucket notifications to publish lifecycle events directly to Kafka.

## Refactoring Directives for Code Generation
*   DELETE all `@Scheduled` database polling loops in standard Spring Boot microservices.
*   DO NOT implement Debezium outbox entities in `resonance-workflow` or `resonance-upload`.
*   Replace old publishing logic with a simple JPA repository save to a standardized `OutboxEvent` entity (`aggregate_type`, `aggregate_id`, `correlation_id`, `tenant_id`) within the main business transaction.
*   Enforce the Idempotent Consumer pattern in all Kafka listeners.