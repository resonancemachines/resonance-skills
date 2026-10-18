# Resonance Developer Core Rules (`mini`)

## When to use
Use during daily microservice feature development, bug fixes, refactoring, code reviews, and schema migrations across the Resonance Platform.

## 9 Non-Negotiable Invariants
1. **Zero 2PC (GR-03):** Never import `javax.transaction.xa`, `jakarta.transaction.xa`, or `XAResource`. Distributed coordination uses Choreographed Sagas and Transactional Outbox CDC (`ADR-0001`).
2. **Fail-Closed Multi-Tenancy (GR-01):** Zero `"default-tenant"` placeholders in production code. All ingress points and parameterized outbox constructors must enforce `TenantGuard.requireTenantId(tenantId)`. JPA no-arg constructors must leave `tenantId = null`.
3. **Zero Plaintext PII:** Tokenize all sensitive sensory data at the edge via `resonance-crypto` before emitting events or writing to graphs.
4. **Database-Per-Service:** Zero cross-service SQL joins or shared schemas. Communicate strictly via gRPC (`proto3`) or Redpanda topics.
5. **Deterministic Classpaths (BOM):** Manage all dependencies via `resonance-bom`. Zero rogue `<version>` tags in microservice POMs.
6. **Spring Architecture & DTO Isolation (GR-08, GR-09):** Constructor injection only (zero field `@Autowired`). Configure `spring.jpa.open-in-view=false`. Never expose JPA `@Entity` in `@RestController` endpoints; return Java 21 `record` DTOs.
7. **JPA Entity Integrity (GR-10, GR-11):** Zero Lombok `@Data` on entities. Strictly `FetchType.LAZY`, String enums (`EnumType.STRING`), wrapper `Long version`, and explicit `precision`/`scale` on `BigDecimal`. Collections in `@ManyToMany` must be `Set`, not `List`.
8. **REST InfoSec & Deserialization (GR-12, GR-13):** Zero unpaged `findAll()` in controllers (enforce `Pageable`). Zero `ex.getMessage()` leakage in 500 error responses. Zero wildcard `*` in `spring.json.trusted.packages`.
9. **gRPC Client Timeout Budgeting (GR-14):** All `BlockingStub` calls must enforce `.withDeadlineAfter(...)` to prevent cascading thread exhaustion.

## Twelve-Factor App Compliance
* **Config (Factor III):** All connection URLs must support env overrides: `${SPRING_DATASOURCE_URL:...}`, `${KAFKA_BOOTSTRAP_SERVERS:...}`.
* **Disposability (Factor IX):** Every microservice must configure `server.shutdown=graceful` and `spring.lifecycle.timeout-per-shutdown-phase=20s`.
* **Admin Tasks (Factor XII):** Schema changes must be versioned Flyway scripts (`V{N}__*.sql`). Runtime `ddl-auto` must be `validate`.

## The Spec-Config-Code Triad Workflow
```text
1. Contract: AsyncAPI 3.0 + Protobuf (.proto) -> Apicurio Registry (:8086)
2. Persistence: Flyway V{N}__*.sql + Strict Lazy JPA Entity
3. Core Domain: DomainPartitionKey + Transactional Outbox (BYTEA payload)
4. Ingress/Egress: Record DTO REST Controller + gRPC Deadline Budget
5. Verification: mvn test + ./deploy/scripts/enforce-architecture-guardrails.sh (14/14 PASS)
```
