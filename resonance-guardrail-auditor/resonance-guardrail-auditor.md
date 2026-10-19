# Resonance Platform — Architecture Guardrail Auditor (`resonance-guardrail-auditor`)

The `resonance-guardrail-auditor` skill provides authoritative diagnosis, automated auditing, and deterministic remediation playbooks for all **[14 Executable Architecture Guardrails](../docs/guardrails/GUARDRAILS.md)** across the Resonance Platform.

---

## 1. Executive Guardrail Inventory (The 14 Guardrails)

| Guardrail ID | Dimension | Target Violation | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **GR-01** | Multi-Tenancy | `"default-tenant"` placeholders in `src/main/java` | Static AST / Regex scan (`TenantGuard` validation) |
| **GR-02** | Event Outbox | Polling columns in `OutboxEvent` (`processed`, `retryCount`) | Regex audit for Debezium WAL CDC purity |
| **GR-03** | Transactions | 2PC / XA API imports (`javax.transaction.xa`, `XAResource`) | Static scan banning distributed two-phase commits |
| **GR-04** | Triad Contract | Schema drift between docs, configs, and connectors | Apicurio 3.x, Protobuf `proto3`, AsyncAPI 3.0 check |
| **GR-05** | Documentation | Broken ADR symlinks or superseded draft files | Symlink integrity & file existence audit |
| **GR-06** | Task Tracking | Premature `[x]` checkmarks in `PLAN.md` / `task.md` | Physical disk presence verification of deliverables |
| **GR-07** | Target Infra | Blueprint desynchronization with [`ADR-0010`](../docs/adr/0010-target-infrastructure-topology-and-governance.md) | Synchronization check across architecture docs |
| **GR-08** | Spring DI / JPA | Field `@Autowired` or missing `open-in-view=false` | Static AST scan; constructor injection enforcement |
| **GR-09** | API Boundary | Returning raw JPA `@Entity` from `@RestController` | AST scan checking method signatures for Record DTOs |
| **GR-10** | JPA Integrity | `@Data`, `FetchType.EAGER`, `EnumType.ORDINAL`, primitive `@Version` | Entity annotation hygiene audit |
| **GR-11** | Persistence | Unspecified `BigDecimal` scale or `List` in `@ManyToMany` | JPA `@Column` attribute & Set collection check |
| **GR-12** | InfoSec | Unpaged `findAll()` in controllers; `ex.getMessage()` in 500s | Controller paging check & error masking check |
| **GR-13** | Messaging | Wildcard `*` in `spring.json.trusted.packages` | Deserialization vulnerability static audit |
| **GR-14** | RPC Budget | gRPC `BlockingStub` call without `.withDeadlineAfter(...)` | Static client stub deadline enforcement |

---

## 2. 5-Stage Deterministic SDLC Enforcement Matrix

Guardrails operate through a defense-in-depth model combining **Soft Prompts** and **Hard OS Process Gates**:

```text
Stage 1: AI Prompt Init (Soft Gate)
  └── Workspace AGENTS.md / GEMINI.md loaded into system context
Stage 2: Java Compile & Runtime (Hard Gate)
  └── TenantGuard & OutboxEnvelope throw IllegalStateException immediately
Stage 3: Agent Turn End (Hard Gate)
  └── Antigravity 'Stop' Hook executes enforce-architecture-guardrails.sh
Stage 4: Local Git Commit (Hard Gate)
  └── Git pre-commit hook blocks commit on non-zero exit code
Stage 5: Remote CI/CD Pipeline (Hard Gate)
  └── GitHub Actions Stage 1 runs architecture guardrail script & JUnit suite
```

---

## 3. Diagnosis & Remediation Playbooks (GR-01 ~ GR-14)

### GR-01: Fail-Closed Multi-Tenant Isolation
* **Failure Symptom:** `Invariant 4 Violation: Fail-open tenant placeholder found in src/main/java`.
* **Root Cause:** A test, placeholder, or default fallback used `"default-tenant"`, `"tenant-default"`, or `"default_tenant"` in production code.
* **Remediation:**
  1. Remove all string literals matching `"default-tenant"`.
  2. Enforce strict validation on ingress:
     ```java
     String verifiedTenant = TenantGuard.requireTenantId(tenantHeader);
     ```
  3. Ensure JPA default no-arg constructors explicitly set `this.tenantId = null;`.

### GR-02: [ADR-0001](../docs/adr/0001-transactional-outbox-event-structure.md) Debezium WAL CDC Outbox Purity
* **Failure Symptom:** `ADR-0001 Violation: OutboxEvent entity contains banned polling field`.
* **Root Cause:** Fields like `processed`, `processedAt`, `retryCount`, or `lastError` were added to an `OutboxEvent` entity.
* **Remediation:** Remove polling fields. Debezium reads directly from PostgreSQL WAL logs via logical decoding (`pgoutput`). Use an append-only, zero-polling entity:
  ```java
  @Entity
  @Table(name = "outbox_events")
  public class OutboxEvent {
      @Id
      private UUID id;
      @Column(name = "aggregate_type", nullable = false)
      private String aggregateType;
      @Column(name = "aggregate_id", nullable = false)
      private String aggregateId;
      @Column(name = "type", nullable = false)
      private String type;
      @Column(name = "payload", nullable = false)
      private byte[] payload;
      @Column(name = "tenant_id", nullable = false)
      private String tenantId;
  }
  ```

### GR-03: Zero Two-Phase Commit (XA Transactions)
* **Failure Symptom:** `Invariant 1 Violation: Distributed 2PC / XA API found in production source`.
* **Root Cause:** Import of `javax.transaction.xa`, `jakarta.transaction.xa`, `XADataSource`, or `XAResource`.
* **Remediation:** Delete XA imports. Coordinate distributed state using Choreographed Sagas and Transactional Outbox CDC (`resonance-workflow`).

### GR-04: Spec-Config-Code Triad Synchronization
* **Failure Symptom:** Documentation or configuration drift between Avro/Protobuf, Apicurio, or Postgres databases.
* **Remediation:**
  1. Sync IDL to Protobuf (`proto3`) + AsyncAPI 3.0.
  2. Sync registry references to Apicurio Registry 3.x (`:8086`).
  3. Verify Debezium connector `database.dbname` matches `docker-compose.yml` (`resonance_db`).
  4. Ensure `deploy/openmetadata/domain-glossary-manifest.json` and `.agents/.contracts/domain-catalog.yaml` exist.

### GR-05: ADR & Symlink Hygiene
* **Failure Symptom:** Broken symlinks in `docs/adr/` or superseded duplicate files.
* **Remediation:**
  1. Ensure each `docs/adr/ADR-000X-*.md` has a symlink `docs/adr/000X-*.md`.
  2. Delete superseded files immediately (e.g. `ADR-0006`, draft research notes).

### GR-06: Evidence-Gated Checkmarks
* **Failure Symptom:** Premature `[x]` in `PLAN.md` or missing `task.md`.
* **Remediation:** Do not mark `[x]` until deliverables (`src/main/asyncapi/asyncapi.yaml`, Flyway migrations `db/migration/*.sql`, Java sources) physically exist on disk.

### GR-07: Target Infrastructure Alignment (ADR-0010)
* **Failure Symptom:** Drift in security or gateway architecture.
* **Remediation:** Ensure `ARCHITECTURE.md` specifies Keycloak (PKCE + DCR), HashiCorp Vault, JFrog Artifactory, and Envoy WasmPlugin + gRPC `ext_authz`.

### GR-08: Spring Injection & OSIV Hygiene
* **Failure Symptom:** Field `@Autowired` or missing `open-in-view=false`.
* **Remediation:**
  1. Convert field injections to constructor injection.
  2. Add `spring.jpa.open-in-view=false` in `application.properties` (or `spring.jpa.open-in-view: false` in `application.yaml`).

### GR-09: REST DTO Boundary Hygiene
* **Failure Symptom:** Controller method returns raw `@Entity`.
* **Remediation:** Define Java 21 `record` DTOs and return `ResponseEntity<RecordDto>` or `Page<RecordDto>`. Never return JPA entities across network boundaries.

### GR-10: JPA Anti-Pattern Ban
* **Failure Symptom:** `@Data`, `FetchType.EAGER`, `EnumType.ORDINAL`, or primitive `long version`.
* **Remediation:**
  1. Replace `@Data` on `@Entity` with `@Getter` and `@Setter`.
  2. Change `FetchType.EAGER` to `FetchType.LAZY`.
  3. Use `@Enumerated(EnumType.STRING)`.
  4. Use `@Version private Long version;` (wrapper `Long`).

### GR-11: Persistence Precision & Collection Safety
* **Failure Symptom:** `BigDecimal` missing precision/scale, or `List` in `@ManyToMany`.
* **Remediation:**
  1. `@Column(precision = 19, scale = 4) private BigDecimal amount;`
  2. `@ManyToMany private Set<Role> roles;` (use `Set`, never `List`).

### GR-12: REST Information Security & Paging
* **Failure Symptom:** Unpaged `findAll()` in `@RestController`, or `ex.getMessage()` in 500 handler.
* **Remediation:**
  1. Accept `Pageable` in list endpoints and return `Page<Dto>`.
  2. In 500 error handlers, return a generic error message (e.g. `"Internal server error"`) and mask details.

### GR-13: Kafka Deserialization Security
* **Failure Symptom:** Wildcard `*` in `spring.json.trusted.packages`.
* **Remediation:** Explicitly declare packages:
  ```properties
  spring.kafka.consumer.properties.spring.json.trusted.packages=com.resonancemachines.*
  ```

### GR-14: gRPC Client Timeout Budgeting
* **Failure Symptom:** `BlockingStub` call without `.withDeadlineAfter(...)`.
* **Remediation:**
  ```java
  stub.withDeadlineAfter(3000, TimeUnit.MILLISECONDS).executeRpc(request);
  ```

---

## 4. Execution Commands

Run the full executable architecture guardrail suite:
```bash
./deploy/scripts/enforce-architecture-guardrails.sh
```

Run the companion JUnit 5 architecture test suite:
```bash
mvn -f resonance-dependency/resonance-starter-core/pom.xml test \
  -Dtest=ArchitectureGuardrailTest,TenantGuardTest
```
