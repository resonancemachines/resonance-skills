# OBEY Resonance Developer Platform Invariants

## When to use
Use when tight context still needs to enforce the 9 non-negotiable architectural invariants and 14 executable guardrails.

## Primary bias to correct
Never sacrifice architectural boundaries, tenant isolation, or thread safety for quick local progress.

## Decision rules
- Distributed transactions: Choreographed Sagas + Transactional Outbox CDC only. Zero 2PC / XA (GR-03).
- Multi-tenancy: Fail-closed only via `TenantGuard.requireTenantId(...)`. Zero `"default-tenant"` (GR-01).
- Dependency injection: Constructor injection only. Zero field `@Autowired` (GR-08).
- JPA: Strictly `FetchType.LAZY`, String enums, wrapper `Long version`, no `@Data`, `open-in-view=false` (GR-08, GR-10).
- REST API: Return Java 21 `record` DTOs, never `@Entity`. Enforce `Pageable` on collections. No `ex.getMessage()` in 500s (GR-09, GR-12).
- gRPC: Budget client timeouts on all stubs via `.withDeadlineAfter(...)` (GR-14).
- 12-Factor: Graceful shutdown (`server.shutdown=graceful`), env configs `${...}`, Flyway migrations (`ddl-auto=validate`).

## Final checklist
- `TenantGuard` validated on ingress?
- DTO records returned instead of entities?
- gRPC stubs have client-side deadlines?
- `server.shutdown=graceful` configured?
- Flyway migration script matches entity?
- `./deploy/scripts/enforce-architecture-guardrails.sh` outputs 14/14 PASS?
