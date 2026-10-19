# ADR 0009: Executable Architecture and Change-Management Guardrails

## Status
Accepted

## Date
2026-10-17

## Context & Problem Statement

During the evolution of the Resonance Platform across Phase I and Phase II ([ADR 0001](0001-transactional-outbox-event-structure.md), [ADR 0005](ADR-0005-event-driven-graphrag-incremental-sync-hybrid-caching.md), [ADR 0007](ADR-0007-company-brain-file-system-integration.md), and [ADR 0008](ADR-0008-asyncapi-apicurio-event-contract-governance.md)), passive markdown documentation proved insufficient to prevent architectural drift and change-management decay:

1. **Multi-Tenancy Fail-Open Regression (Violating Invariant 4):** Seven microservices (`resonance-action`, `resonance-support`, `resonance-download`, `resonance-approval`, `resonance-control`, `resonance-crypto`, `resonance-unified-context`) contained `"default-tenant"` or `"tenant-default"` fallback literals in constructors, REST `@RequestHeader(defaultValue = ...)` annotations, or gRPC handlers.
2. **Cross-Document Specification Drift:** [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) still listed `Apache Avro (.avsc)` and `Redpanda Schema Registry`, while [`.agents/.contracts/CONTRACTS.md`](../contracts/CONTRACTS.md) listed `.proto` on port `9644`, and [ADR 0008](ADR-0008-asyncapi-apicurio-event-contract-governance.md) mandated `AsyncAPI 3.0 + Apicurio Registry 3.x (:8086)`.
3. **Infrastructure Configuration Drift:** `deploy/debezium/register-connectors.sh` targeted `"database.dbname": "resonance"` while `docker-compose.yml` provisioned `POSTGRES_DB: resonance_db`.
4. **Unpruned Superseded Artifacts:** Superseded duplicate files (`ADR-0006` and `2026-10-03-research.md`) remained on disk alongside `ADR-0007` and `2026-10-04-research.md`.
5. **Unverified Plan Checkmarks:** Implementation plans (`PLAN.md`) permitted tasks to be marked `[x]` without automated verification that the corresponding code or schema files existed on disk.

We require an **executable, fail-closed guardrail architecture** that continuously audits both runtime execution and repository state (source code, contracts, infrastructure scripts, and per-service plans) and fails the build/commit immediately upon any drift.

---

## Decision Outcome

We adopt a **3-Tier Executable Guardrail Architecture** documented in [`GUARDRAILS.md`](../guardrails/GUARDRAILS.md):

1. **Tier 1 — Runtime Fail-Closed Guardrails (`resonance-starter-core`):**
   - `TenantGuard` rejects `null`, blank, `"default-tenant"`, `"tenant-default"`, and `"default_tenant"` identifiers across all constructors, controllers, and consumers with `IllegalArgumentException`.
   - `OutboxEnvelope` enforces non-blank `tenantId`, CloudEvents 1.0 headers, and non-empty binary `byte[] payload` at instantiation time.
   - `TenantContextFilter` rejects HTTP requests carrying banned placeholder `X-Tenant-Id` headers with `400 Bad Request`.
2. **Tier 2 — Build-Time JUnit 5 Repository Guardrail Suite (`mvn test`):**
   - `ArchitectureGuardrailTest` scans all production `.java` sources, `OutboxEvent` entities, `ARCHITECTURE.md`, `CONTRACTS.md`, `docker-compose.yml`, `register-connectors.sh`, `docs/adr/`, and all 25 module `PLAN.md`/`task.md` pairs during every Maven test execution.
3. **Tier 3 — Pre-Commit & CI Gatekeeper Script (`.git/hooks/pre-commit`):**
   - `deploy/scripts/enforce-architecture-guardrails.sh` runs the 13-stage repository audit in `< 1.5 seconds` prior to every Git commit and CI pipeline stage.

---

## Consequences

### Positive
- **Zero Silent Drift:** Any attempt to re-introduce `"default-tenant"` (GR-01), outbox polling fields (GR-02), XA/2PC imports (GR-03), contradicting contract docs (GR-04), broken ADR symlinks (GR-05), unbacked `[x]` plan checkmarks (GR-06), unaligned infrastructure specs (GR-07), field `@Autowired` or missing OSIV disabled (GR-08), raw JPA `@Entity` controller leaks (GR-09), JPA `@Data`/EAGER/ORDINAL anti-patterns (GR-10), unscaled `BigDecimal` or `@ManyToMany List` (GR-11), REST 500 error message leaks or unpaged `findAll()` (GR-12), or wildcard Kafka trusted packages (GR-13) fails `mvn test` and `git commit` immediately.
- **Deterministic Change Management:** Quarterly and continuous updates are governed by verifiable file-and-code invariants rather than manual memory.

### Negative / Trade-offs
- **Strict Test Fixture Discipline:** Unit and integration tests can no longer rely on implicit `"default-tenant"` fallbacks when instantiating `OutboxEvent` or `TokenVaultEntry` or invoking controllers; every test must supply an explicit tenant context (e.g., `"tenant-acme"`).
