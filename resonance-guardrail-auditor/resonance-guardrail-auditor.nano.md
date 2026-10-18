# OBEY Resonance Architecture Guardrails

## When to use
Use as a strict zero-tolerance gatekeeper before completing any turn that touches Java code, configurations, or architecture documentation.

## Primary bias to correct
Never ignore or bypass a failing architecture guardrail check.

## Decision rules
- GR-01: Zero `"default-tenant"` in `src/main/java`. Validate via `TenantGuard`.
- GR-02: Zero polling columns in `OutboxEvent` (`processed`, `processedAt`, `retryCount`).
- GR-03: Zero 2PC / XA imports (`javax.transaction.xa`).
- GR-04: Enforce Protobuf + AsyncAPI 3.0 + Apicurio 3.x + `resonance_db`.
- GR-05: Valid ADR symlinks, zero superseded files.
- GR-06: Never check `[x]` in `PLAN.md` without physical files on disk.
- GR-07: Synchronize ADR-0010 Target Infrastructure Blueprint.
- GR-08: Constructor injection only (no field `@Autowired`). `open-in-view=false`.
- GR-09: Return Java 21 `record` DTOs, never JPA `@Entity` from controllers.
- GR-10: JPA entities: No `@Data`, strictly `LAZY`, string enums, wrapper `Long version`.
- GR-11: Explicit `precision`/`scale` on `BigDecimal`. `Set` on `@ManyToMany`.
- GR-12: Paged `findAll(Pageable)`. Zero `ex.getMessage()` leakage in 500 handlers.
- GR-13: No wildcard `*` in `spring.json.trusted.packages`.
- GR-14: All gRPC `BlockingStub` calls must use `.withDeadlineAfter(...)`.

## Final checklist
- Did `./deploy/scripts/enforce-architecture-guardrails.sh` exit 0?
- Are all 14 checks marked `[PASS]`?
