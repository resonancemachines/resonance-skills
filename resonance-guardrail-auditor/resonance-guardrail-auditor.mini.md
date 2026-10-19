# Resonance Guardrail Auditor Triage Guide (`mini`)

All 14 guardrails are specified in detail in [`GUARDRAILS.md`](../docs/guardrails/GUARDRAILS.md).

## When to use
Use before concluding any implementation task, submitting a PR, or when `./deploy/scripts/enforce-architecture-guardrails.sh` reports a failure.

## Fast Audit Workflow
```bash
# 1. Run full 14-guardrail suite
./deploy/scripts/enforce-architecture-guardrails.sh

# 2. Run starter-core guardrail unit tests
mvn -f resonance-dependency/resonance-starter-core/pom.xml test
```

## Quick Triage Table

| Error Flag | Guardrail | Immediate Fix |
|:---|:---:|:---|
| Fail-open tenant | **GR-01** | Replace `"default-tenant"` with `TenantGuard.requireTenantId(...)`. |
| Outbox polling field | **GR-02** | Remove `processed`, `retryCount`, `lastError` from `OutboxEvent`. |
| XA / 2PC import | **GR-03** | Remove `javax.transaction.xa` / `XADataSource`. Use Choreographed Saga. |
| Avro / Apicurio drift | **GR-04** | Update doc/config to Protobuf `proto3`, AsyncAPI 3.0, Apicurio 3.x. |
| Broken ADR link | **GR-05** | Fix symlink `docs/adr/000X-*.md` or delete superseded docs. |
| Premature [x] | **GR-06** | Do not check `[x]` in `PLAN.md` until deliverables exist on disk. |
| Target Infra drift | **GR-07** | Sync `ARCHITECTURE.md` with Keycloak, Vault, Artifactory, Envoy Wasm. |
| Field @Autowired / OSIV | **GR-08** | Switch to constructor injection; add `spring.jpa.open-in-view=false`. |
| Entity in Controller | **GR-09** | Return Java 21 `record` DTO instead of `@Entity`. |
| Entity anti-patterns | **GR-10** | Replace `@Data` with `@Getter`/`@Setter`; `LAZY`; string Enum; wrapper `Long version`. |
| BigDecimal / ManyToMany | **GR-11** | Add `precision`/`scale` on `BigDecimal`; use `Set` for `@ManyToMany`. |
| Unpaged findAll / 500 leak | **GR-12** | Require `Pageable` in list endpoints; mask `ex.getMessage()` in 500 handler. |
| Kafka package wildcard | **GR-13** | Change `*` to `com.resonancemachines.*` in trusted packages config. |
| gRPC stub missing timeout | **GR-14** | Add `.withDeadlineAfter(3000, TimeUnit.MILLISECONDS)` before RPC call. |
