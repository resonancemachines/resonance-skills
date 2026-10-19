---
name: resonance-developer
description: >
  Official all-in-one Enterprise Microservices Architecture (MSA) development skill for the Resonance Platform (https://github.com/resonancemachines).
  Activate this skill when creating, modifying, refactoring, or reviewing Java/Spring Boot microservices, REST controllers, JPA entities,
  Transactional Outbox events, gRPC services, or Choreographed Sagas in the Resonance Platform repository.
  Enforces all 9 Architectural Invariants, the Spec-Config-Code Triad, and the 14 Executable Guardrails ([GUARDRAILS.md](../docs/guardrails/GUARDRAILS.md)).
---

# Resonance Developer Skill (`resonance-developer`)

Use this skill whenever working on backend microservices across `resonance-office/`, `resonance-dependency/`, or `resonance-unified-context/`.
This skill guides the implementation flow from **Contract-First Specification** to **Clean Architecture Implementation** and **Evidence-Gated Guardrail Verification**.

---

## 1. Non-Negotiable Architectural Invariants (Always Enforced)

Every code change must adhere to the 9 Core Platform Invariants:

1. **No Two-Phase Commit (GR-03):**
   * Never import or configure `javax.transaction.xa`, `jakarta.transaction.xa`, `XADataSource`, or `XAResource`.
   * Distributed transactions strictly use **Choreographed Sagas** with explicit compensating transactions (`resonance-workflow`) and Transactional Outbox CDC ([`ADR-0001`](../docs/adr/0001-transactional-outbox-event-structure.md)).
2. **Fail-Closed Multi-Tenant Isolation (GR-01):**
   * **NEVER** write `"default-tenant"`, `"tenant-default"`, or `"default_tenant"` anywhere under `src/main/java`.
   * Every ingress controller, gRPC handler, and `OutboxEvent` parameterized constructor MUST validate `tenantId` via:
     ```java
     String verifiedTenant = TenantGuard.requireTenantId(tenantId);
     ```
   * JPA no-arg constructors (`public OutboxEvent()`) must initialize `this.tenantId = null;`.
3. **Zero Plaintext PII in Mesh:**
   * All sensitive data must be tokenized at the sensory edge via `resonance-crypto` before event emission or graph projection.
4. **Database-Per-Service:**
   * Relational schemas are strictly isolated per microservice. Zero cross-service SQL joins.
   * Inter-service communication strictly uses gRPC (`proto3`) or Redpanda topics (`resonance.outbox.*`).
5. **Deterministic Classpaths (BOM):**
   * Never declare explicit `<version>` tags in microservice `pom.xml` files for dependencies managed by `resonance-bom`.
6. **Spring Architecture & DTO Isolation (GR-08, GR-09):**
   * Use **constructor injection only**. Zero field-level `@Autowired` in `src/main/java`.
   * Every JPA microservice MUST explicitly configure `spring.jpa.open-in-view=false` in `application.properties`/`application.yml`.
   * Zero raw JPA `@Entity` types exposed in `@RestController` response entities or method signatures. Return Java 21 `record` DTOs.
7. **JPA Entity Integrity & Persistence Safety (GR-10, GR-11):**
   * Zero Lombok `@Data` or `@EqualsAndHashCode` on JPA `@Entity` classes (use `@Getter`/`@Setter` and proxy-safe identity).
   * Zero `FetchType.EAGER` in JPA associations (strictly `FetchType.LAZY`).
   * Zero `EnumType.ORDINAL` (strictly `@Enumerated(EnumType.STRING)`).
   * Zero primitive `long version` (strictly wrapper `Long version`).
   * All `BigDecimal` fields in `@Entity` MUST specify explicit `precision` and `scale` in `@Column`.
   * All `@ManyToMany` associations MUST use `Set<...>`, never `List<...>`.
8. **REST Information Security & Kafka Deserialization (GR-12, GR-13):**
   * Zero raw exception message leakage (`ex.getMessage()`) in 500 error handlers (`HttpStatus.INTERNAL_SERVER_ERROR`).
   * Zero unpaged `findAll()` in `@RestController` endpoints (enforce `Pageable`, `Slice`, or `Limit`).
   * Zero wildcard `*` in `spring.json.trusted.packages` configurations.
9. **gRPC Client Timeout Budgeting (GR-14):**
   * All gRPC `BlockingStub` calls MUST specify client-side `.withDeadlineAfter(...)` to prevent thread exhaustion and cascading failures:
     ```java
     stub.withDeadlineAfter(3000, TimeUnit.MILLISECONDS).execute(request);
     ```

---

## 2. Twelve-Factor Cloud-Native MSA Compliance

Every microservice in the Resonance Platform must strictly adhere to the Twelve-Factor App principles:

| Factor | Platform Implementation Rule | Enforcement |
|:--|:--|:--|
| **I. Codebase** | Single monorepo in revision control (`git`), many deploys via K8s/ArgoCD. | Monorepo Structure |
| **II. Dependencies** | Fully declared and isolated via `resonance-bom`. Zero rogue `<version>` tags. | Invariant 5 (BOM) |
| **III. Config** | **Zero hardcoded credentials or ports.** All properties MUST support environment variable overrides: `${SPRING_DATASOURCE_URL:...}`, `${KAFKA_BOOTSTRAP_SERVERS:...}`. | Config Audit |
| **IV. Backing Services** | Databases, Redpanda, MinIO, Vault, and Apicurio are attached resources referenced via URL/credentials. | Attached Resources |
| **V. Build, Release, Run** | Immutable container images via Docker multi-stage builds (`Dockerfile.jvm`), GitOps CD via ArgoCD. | [`ADR-0010`](../docs/adr/0010-target-infrastructure-topology-and-governance.md) |
| **VI. Processes** | Microservices are strictly **stateless processes**. Zero sticky in-memory sessions; shared state resides in Postgres / Neo4j / Redis. | Share-Nothing Architecture |
| **VII. Port Binding** | Microservices export services by binding to ports (HTTP `8001..8205`, gRPC `9001..9205`). | Embedded Netty/Tomcat |
| **VIII. Concurrency** | Horizontal scaling via Kubernetes HPA and Kafka partition consumer concurrency (`spring.kafka.listener.concurrency`). | Process Model |
| **IX. Disposability** | **Graceful Shutdown is mandatory.** Every microservice MUST configure `server.shutdown=graceful` and `spring.lifecycle.timeout-per-shutdown-phase=20s` to prevent connection drops and outbox truncation during K8s rolling updates. | Factor IX Rule |
| **X. Dev/Prod Parity** | Local dev (`docker-compose.yml`) and production use identical engines: PostgreSQL 16 (`resonance_db`), Redpanda, and Apicurio Registry 3.x. Integration tests use Testcontainers. | Testcontainers |
| **XI. Logs** | Logs strictly to `stdout`/`stderr` as event streams; zero local log files. Collected via Loki and OTel Collector. | Log Streams |
| **XII. Admin Tasks** | Database schema migrations MUST be managed via Flyway (`db/migration/V{N}__*.sql`). Runtime `spring.jpa.hibernate.ddl-auto` MUST be set to `validate` (never `update` in production). Catalog sync runs via CI CLI (`sync-contracts-to-apicurio.py`). | Flyway & CI CLI |

---

## 3. The Spec-Config-Code Triad Development Lifecycle


When adding or updating microservice features, execute tasks in the following strict order:

```
Step 1: Event / RPC Contract
  ├── AsyncAPI 3.0: src/main/asyncapi/asyncapi.yaml
  ├── Protobuf: .proto schema in resonance-stubs or .agents/.contracts/proto/
  └── Sync to Apicurio Registry (:8086) via deploy/scripts/sync-contracts-to-apicurio.py
        │
        ▼
Step 2: Database Persistence
  ├── Flyway Migration: src/main/resources/db/migration/V{N}__*.sql
  └── JPA Entity: Strict Lazy, String Enum, Wrapper Long Version, Tenant-scoped
        │
        ▼
Step 3: Core Domain & Event Outbox
  ├── Domain Partition Key: DomainPartitionKey.of(tenantId, aggregateType, entityId)
  └── Outbox Persistence: OutboxEnvelope with CloudEvents 1.0 headers
        │
        ▼
Step 4: API Egress / Ingress
  ├── REST Controller: Java 21 Record DTOs + Paged Responses + TenantContext
  └── gRPC Client: BlockingStub with client-side deadline budgeting (.withDeadlineAfter)
        │
        ▼
Step 5: Verification & Gatekeeping
  ├── Unit / Integration Tests: mvn test -pl <module>
  └── All 14 Architecture Guardrails: ./deploy/scripts/enforce-architecture-guardrails.sh
```

---

## 4. Code Templates & Reference Patterns

### 3.1 Ingress REST Controller Template (Record DTO + TenantGuard)
```java
@RestController
@RequestMapping("/api/v1/intents")
public class IntentController {

    private final IntentService intentService;

    // Strict constructor injection (GR-08)
    public IntentController(IntentService intentService) {
        this.intentService = Objects.requireNonNull(intentService);
    }

    @PostMapping
    public ResponseEntity<IntentResponseDto> createIntent(
            @RequestHeader(name = "X-Tenant-Id") String tenantHeader,
            @Valid @RequestBody CreateIntentRequest request) {

        // Fail-closed tenant validation (GR-01)
        String tenantId = TenantGuard.requireTenantId(tenantHeader);
        IntentResponseDto response = intentService.createIntent(tenantId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<Page<IntentResponseDto>> listIntents(
            @RequestHeader(name = "X-Tenant-Id") String tenantHeader,
            @PageableDefault(size = 20) Pageable pageable) {

        String tenantId = TenantGuard.requireTenantId(tenantHeader);
        // Strictly paged (GR-12)
        return ResponseEntity.ok(intentService.listIntents(tenantId, pageable));
    }
}
```

### 3.2 Transactional Outbox Pattern with Domain Partition Key
```java
@Transactional
public IntentResponseDto createIntent(String tenantId, CreateIntentRequest request) {
    String verifiedTenant = TenantGuard.requireTenantId(tenantId);
    
    // 1. Mutate domain entity
    IntentEntity entity = new IntentEntity(verifiedTenant, request.actionName(), request.payload());
    entityRepository.save(entity);

    // 2. Resolve domain-driven partition key (ADR-0011 & DDIA Ch. 6)
    DomainPartitionKey partitionKey = DomainPartitionKey.of(
            verifiedTenant,
            ActionAggregateType.INTENT,
            entity.getId().toString()
    );

    // 3. Persist outbox event with wire-framed Protobuf payload (ADR-0001, ADR-0008)
    byte[] protoPayload = serializeProtobuf(entity);
    OutboxEvent outbox = new OutboxEvent(
            ActionAggregateType.INTENT.name(),
            entity.getId().toString(),
            "com.resonance.intent.signaled.v1",
            protoPayload,
            UUID.randomUUID().toString(),
            verifiedTenant
    );
    outboxRepository.save(outbox);

    return IntentResponseDto.from(entity);
}
```

### 3.3 gRPC Client with Timeout Budgeting (GR-14)
```java
public EvaluationResult evaluatePolicy(String tenantId, String resourceId, String action) {
    String verifiedTenant = TenantGuard.requireTenantId(tenantId);
    
    PolicyRequest request = PolicyRequest.newBuilder()
            .setTenantId(verifiedTenant)
            .setResourceId(resourceId)
            .setAction(action)
            .build();

    // Client-side deadline enforcement to avoid cascading thread hangs (GR-14)
    PolicyDecision decision = policyStub
            .withDeadlineAfter(3000, TimeUnit.MILLISECONDS)
            .evaluate(request);

    return new EvaluationResult(decision.getAllowed(), decision.getReason());
}
```

---

## 5. Pre-Completion Audit Protocol

Before declaring any task complete or submitting edits:
1. **Never mark `[x]` prematurely (GR-06):** Check that physical files (`asyncapi.yaml`, Flyway migrations, Java sources) exist on disk.
2. **Execute module tests:**
   ```bash
   mvn test -pl <target-module>
   ```
3. **Execute the executable guardrails suite:**
   ```bash
   ./deploy/scripts/enforce-architecture-guardrails.sh
   ```
   All 14 checks MUST output `[PASS]` with exit code 0.
