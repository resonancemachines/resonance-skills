# Resonance Platform — Executable Architecture & Change-Management Guardrails (`GUARDRAILS.md`)

> **Status:** Active & Enforced (Fail-Closed)  
> **Last Updated:** 2026-10-18  
> **Governing ADRs:** [ADR-0009](docs/adr/ADR-0009-executable-architecture-and-change-management-guardrails.md), [ADR-0010](docs/adr/ADR-0010-target-infrastructure-topology-and-governance.md) & [ADR-0011](docs/adr/ADR-0011-domain-aggregate-governance-with-openmetadata.md)  
> **Harness Engineering Framework:** [`docs/HARNESS_ENGINEERING.md`](docs/HARNESS_ENGINEERING.md)  
> **Verification Script:** [`deploy/scripts/enforce-architecture-guardrails.sh`](deploy/scripts/enforce-architecture-guardrails.sh) (`.git/hooks/pre-commit`)  
> **Maven Test Suite:** [`ArchitectureGuardrailTest.java`](resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/ArchitectureGuardrailTest.java) & [`TenantGuardTest.java`](resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/TenantGuardTest.java)

---

## 1. 목적 및 배경 (Why Executable Guardrails?)

수동적인 마크다운 문서(`ARCHITECTURE.md`, `CONTRACTS.md`, `ADR-*`, `PLAN.md`)만으로는 시간이 지남에 따라 발생하는 **문서 간 모순(Documentation Drift)**과 **런타임 코드의 불변식 위반(Fail-Open Regression)**을 막을 수 없습니다.

본 문서는 Resonance 플랫폼에서 실제로 발생했던 5가지 변경관리 실패 사례를 근본적으로 차단하기 위해 구축된 **3계층 실행형(Executable) Guardrail 시스템**과 **상시·분기별 변경관리(Change Management) 프로토콜**을 정의합니다.

### 기존에 발견 및 교정된 5대 드리프트 사례 (Remediated Failure Modes)
| 번호 | 위반 유형 | 기존 결함 상태 (Before) | 교정 및 강제 상태 (After) |
| :--- | :--- | :--- | :--- |
| **1** | **Multi-Tenancy Fail-Open (Invariant 4 위반)** | 7개 서비스의 `OutboxEvent`, `TokenVaultEntry`, Controller 등에서 `tenantId` 누락 시 `"default-tenant"` 또는 `"tenant-default"`로 자동 폴백됨 | 전 모듈 `src/main/java`에서 `"default-tenant"` / `"tenant-default"` **0건**. [`TenantGuard`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/tenant/TenantGuard.java)로 즉시 `IllegalArgumentException` / `400 Bad Request` 차단 |
| **2** | **상위 명세 간 직렬화 모순 (Spec Drift)** | `ARCHITECTURE.md`는 `Apache Avro (.avsc)` + `Redpanda Schema Registry`, `CONTRACTS.md`는 `.proto`, `ADR-0008`은 `AsyncAPI 3.0 + Apicurio Registry 3.x`로 서로 충돌 | [`ARCHITECTURE.md`](ARCHITECTURE.md) 및 [`CONTRACTS.md`](.agents/.contracts/CONTRACTS.md) 모두 **Protobuf (`proto3`) + AsyncAPI 3.0 + Apicurio Registry 3.x (`:8086`)**로 단일화 |
| **3** | **인프라 설정 불일치 (Config Drift)** | `docker-compose.yml`은 `POSTGRES_DB: resonance_db`를 생성하나, [`register-connectors.sh`](deploy/debezium/register-connectors.sh)는 `"database.dbname": "resonance"`를 바라봄 | `"database.dbname": "resonance_db"` 및 `"value.converter": "io.debezium.converters.BinaryDataConverter"`로 일치화 및 자동 검사 |
| **4** | **중복·폐기 문서 방치 (Obsolete Artifacts)** | `ADR-0007` 및 `2026-10-04-research.md` 작성 후에도 구버전 중복 문서인 `ADR-0006`과 `2026-10-03-research.md`가 그대로 방치됨 | 구식 중복 문서 및 심볼릭 링크 즉시 삭제, `docs/adr/` 내 끊어진 심볼릭 링크 및 폐기 대상 파일 존재 시 빌드 실패 |
| **5** | **증거 없는 계획 완료 표기 (Premature `[x]`)** | [`resonance-upload/PLAN.md`](resonance-office/front-office/resonance-upload/PLAN.md) 등에서 실제 구현/파일 없이 `[x]`로 체크됨 | 물리적 파일(`asyncapi.yaml`, `db/migration`)과 테스트 증거 없이 `[x]`로 표기할 경우 빌드 및 커밋 즉시 차단 |

---

## 2. 3계층 실행형 방어 아키텍처 (3-Tier Defense-in-Depth)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: RUNTIME FAIL-CLOSED GUARDRAILS (resonance-starter-core)                  │
│  • TenantGuard.requireTenantId() / resolveOrFailClosed()                         │
│  • OutboxEnvelope (CloudEvents 1.0 + non-empty byte[] + mandatory tenantId)      │
│  • TenantContext & TenantContextFilter (HTTP 400 on placeholder X-Tenant-Id)     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ Verified on every JVM execution
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: BUILD-TIME JUNIT 5 GUARDRAIL SUITE (mvn test)                            │
│  • ArchitectureGuardrailTest (5 Repository-Wide AST/File/Spec Invariant Checks)  │
│  • TenantGuardTest (Fail-Closed Unit Verification)                               │
│  • Per-Service OutboxEventTest / ControllerTest / ServiceTest                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ Enforced before every commit & CI merge
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: CLI & GIT PRE-COMMIT GATEKEEPER (.git/hooks/pre-commit)                  │
│  • deploy/scripts/enforce-architecture-guardrails.sh (9-Stage Audit in < 1s)     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 14대 자동 검증 규칙 명세 (Enforced Guardrail Rules)

[`ArchitectureGuardrailTest.java`](resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/ArchitectureGuardrailTest.java)와 [`deploy/scripts/enforce-architecture-guardrails.sh`](deploy/scripts/enforce-architecture-guardrails.sh)는 다음 14가지 규칙을 매 테스트 및 커밋마다 강제합니다.

| 규칙 ID | 보호 대상 불변식 | 검사 대상 | 실패 조건 (Fail-Closed Trigger) |
| :--- | :--- | :--- | :--- |
| **GR-01** | **Invariant 4: Multi-Tenant Isolation** | `resonance-dependency`, `resonance-office`, `resonance-unified-context` 하위 모든 `src/main/java/**/*.java` | 프로덕션 Java 소스 코드 내에 `"default-tenant"`, `"tenant-default"`, `"default_tenant"` 문자열 리터럴이 단 1건이라도 존재할 경우 즉시 실패 |
| **GR-02** | **ADR-0001: Pure Debezium WAL CDC Outbox** | 모든 `src/main/java/**/OutboxEvent*.java` 엔티티 | `@Scheduled` 폴링 안티패턴 컬럼(`processed`, `processedAt`, `retryCount`, `lastError`)이 선언된 경우 즉시 실패 |
| **GR-03** | **Invariant 1: No Two-Phase Commit (2PC)** | 모든 `src/main/java/**/*.java` | `javax.transaction.xa`, `jakarta.transaction.xa`, `XADataSource`, `XAResource` 등 분산 2PC/XA API가 사용된 경우 즉시 실패 |
| **GR-04** | **Spec & Config Triad Synchronization** | `ARCHITECTURE.md`, `CONTRACTS.md`, `docker-compose.yml`, `deploy/debezium/register-connectors.sh` | `ARCHITECTURE.md`에 `.avsc`(Avro)가 남아 있거나, `Apicurio Registry` / `AsyncAPI 3.0`이 누락되거나, Debezium `database.dbname`이 `resonance_db`와 불일치할 경우 즉시 실패 |
| **GR-05** | **ADR & Research Hygiene** | `docs/adr/`, `docs/research/`, `GUARDRAILS.md` | `docs/adr/` 내에 끊어진 심볼릭 링크가 존재하거나, 폐기된 중복 문서(`ADR-0006`, `2026-10-03-research.md`)가 재생성되거나, `GUARDRAILS.md` / `ADR-0009`가 누락된 경우 즉시 실패 |
| **GR-06** | **Evidence-Gated `PLAN.md` & `task.md`** | 전체 25개 모듈의 `PLAN.md` 및 `task.md` | 25개 모듈 중 `PLAN.md`/`task.md` 쌍이 누락되거나, 디스크에 `src/main/asyncapi/asyncapi.yaml` 또는 `src/main/resources/db/migration`이 없는데 해당 태스크를 `[x]`로 체크한 경우 즉시 실패 |
| **GR-07** | **Target Infrastructure Topology & Governance (ADR-0010)** | `ARCHITECTURE.md`, `docs/adr/ADR-0010-*.md`, `GUARDRAILS.md` | `ADR-0010` 또는 해당 심볼릭 링크가 누락되거나, `ARCHITECTURE.md`에서 타깃 인프라 명세(Kubernetes, Istio, Envoy WasmPlugin/ext_authz 분리, Keycloak PKCE/DCR, Helm 3, GitHub Actions + ArgoCD, Vault ESO/CSI, Artifactory, 4대 관측성)가 누락될 경우 즉시 실패 |
| **GR-08** | **Spring Architecture & Injection Hygiene** | 모든 `src/main/java/**/*.java` 및 JPA 모듈 `application*.{properties,yaml}` | `src/main/java` 내 필드 주입(`@Autowired private ...`)이 발견되거나, JPA 모듈에서 `spring.jpa.open-in-view=false`가 누락/`true`인 경우 즉시 실패 |
| **GR-09** | **REST DTO Boundary Hygiene** | 모든 `@RestController` 클래스 파일 | `@RestController` 엔드포인트 메소드가 `@Entity` 어노테이션이 선언된 JPA 엔티티 클래스(`ResponseEntity<@Entity>`, `List<@Entity>`)를 직접 반환할 경우 즉시 실패 (Java 21 Record DTO 강제) |
| **GR-10** | **JPA Entity Integrity & Anti-Pattern Ban** | 모든 `@Entity` 클래스 파일 | `@Entity` 클래스에 Lombok `@Data` / `@EqualsAndHashCode`가 사용되었거나, `fetch = FetchType.EAGER`, `@Enumerated(EnumType.ORDINAL)`, 또는 원시 타입 `long version`이 선언된 경우 즉시 실패 |
| **GR-11** | **Persistence Precision & Association Safety** | 모든 `@Entity` 클래스 파일 | `BigDecimal` 필드에 `precision`/`scale` 누락, 또는 `@ManyToMany` 연관관계에 `List<...>`(bag 변이 안티패턴)가 사용된 경우 즉시 실패 (`Set<...>` 강제) |
| **GR-12** | **REST Error Disclosure & Unbounded Query Ban** | 모든 `@RestController` 및 `@RestControllerAdvice` | `@RestControllerAdvice`의 500 에러 처리기에서 `ex.getMessage()`를 직접 반환하거나, `@RestController`에서 페이징 없는 무제한 `findAll()`을 직접 호출할 경우 즉시 실패 |
| **GR-13** | **Kafka Deserialization Security** | 모든 `application*.{properties,yaml,yml}` | `spring.json.trusted.packages`에 와일드카드 `*`가 사용된 경우 즉시 실패 (원격 코드 실행/역직렬화 공격 차단, 화이트리스트 패키지 명시 필수) |
| **GR-14** | **gRPC Client-Side Deadline Enforcement** | 모든 `src/main/java/**/*.java` 내 `BlockingStub` 사용 클래스 | `BlockingStub`를 선언하고도 클라이언트측 `.withDeadlineAfter(...)` 호출이 누락된 경우 즉시 실패 (Release It! / DDIA Ch 8 장애 전이 및 스레드 고갈 방지) |

---

## 4. 모듈별 Fail-Closed 코드 교정 원장 (Remediation Ledger)

| 계층 | 모듈 | 수정된 프로덕션 파일 | 수정 및 추가된 검증 테스트 |
| :--- | :--- | :--- | :--- |
| **Core** | `resonance-starter-core` | [`TenantGuard.java`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/tenant/TenantGuard.java), [`OutboxEnvelope.java`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/outbox/OutboxEnvelope.java), [`TenantContext.java`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/tenant/TenantContext.java), [`TenantContextFilter.java`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/tenant/TenantContextFilter.java), [`ResonanceCoreAutoConfiguration.java`](resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/core/config/ResonanceCoreAutoConfiguration.java) (500 에러 메시지 마스킹) | [`ArchitectureGuardrailTest.java`](resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/ArchitectureGuardrailTest.java) (GR-10~GR-14 검증 추가), [`TenantGuardTest.java`](resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/TenantGuardTest.java) |
| **Front-Office** | `resonance-ticket` | [`IncidentController.java`](resonance-office/front-office/resonance-ticket/src/main/java/com/resonancemachines/resonanceticket/controller/IncidentController.java), [`IncidentTicketResponse.java`](resonance-office/front-office/resonance-ticket/src/main/java/com/resonancemachines/resonanceticket/dto/IncidentTicketResponse.java), `application.properties` (OSIV false) | [`IncidentControllerTest.java`](resonance-office/front-office/resonance-ticket/src/test/java/com/resonancemachines/resonanceticket/controller/IncidentControllerTest.java) |
| **Front-Office** | `resonance-action` | [`OutboxEvent.java`](resonance-office/front-office/resonance-action/src/main/java/com/resonancemachines/resonanceaction/entity/OutboxEvent.java), [`ActionController.java`](resonance-office/front-office/resonance-action/src/main/java/com/resonancemachines/resonanceaction/controller/ActionController.java) (`OutboxEventResponse`, `IntentReceiptResponse`), [`VfsCommandController.java`](resonance-office/front-office/resonance-action/src/main/java/com/resonancemachines/resonanceaction/controller/VfsCommandController.java) (`VfsNodeResponse`), [`ActionConsumer.java`](resonance-office/front-office/resonance-action/src/main/java/com/resonancemachines/resonanceaction/service/ActionConsumer.java), `application.properties` (OSIV false) | [`OutboxEventTest.java`](resonance-office/front-office/resonance-action/src/test/java/com/resonancemachines/resonanceaction/entity/OutboxEventTest.java), [`ActionControllerTest.java`](resonance-office/front-office/resonance-action/src/test/java/com/resonancemachines/resonanceaction/controller/ActionControllerTest.java), [`ActionConsumerTest.java`](resonance-office/front-office/resonance-action/src/test/java/com/resonancemachines/resonanceaction/service/ActionConsumerTest.java) |
| **Front-Office** | `resonance-delivery` | [`CryptoGrpcClient.java`](resonance-office/front-office/resonance-delivery/src/main/java/com/resonancemachines/resonancedelivery/service/CryptoGrpcClient.java), [`EntitlementGrpcClient.java`](resonance-office/front-office/resonance-delivery/src/main/java/com/resonancemachines/resonancedelivery/service/EntitlementGrpcClient.java), [`OrgGrpcClient.java`](resonance-office/front-office/resonance-delivery/src/main/java/com/resonancemachines/resonancedelivery/service/OrgGrpcClient.java), [`PolicyGrpcClient.java`](resonance-office/front-office/resonance-delivery/src/main/java/com/resonancemachines/resonancedelivery/service/PolicyGrpcClient.java) (GR-14 Deadline 3000ms 적용) | [`DeliveryControllerTest.java`](resonance-office/front-office/resonance-delivery/src/test/java/com/resonancemachines/resonancedelivery/controller/DeliveryControllerTest.java), [`ProductDeliveryConsumerTest.java`](resonance-office/front-office/resonance-delivery/src/test/java/com/resonancemachines/resonancedelivery/service/ProductDeliveryConsumerTest.java) |
| **Front-Office** | `resonance-support` | [`OutboxEvent.java`](resonance-office/front-office/resonance-support/src/main/java/com/resonancemachines/resonancesupport/entity/OutboxEvent.java), [`SupportController.java`](resonance-office/front-office/resonance-support/src/main/java/com/resonancemachines/resonancesupport/controller/SupportController.java) (`OutboxEventResponse`, `DlqQuarantineResponse`), [`ApprovalGrpcClient.java`](resonance-office/front-office/resonance-support/src/main/java/com/resonancemachines/resonancesupport/service/ApprovalGrpcClient.java), [`WorkflowGrpcClient.java`](resonance-office/front-office/resonance-support/src/main/java/com/resonancemachines/resonancesupport/service/WorkflowGrpcClient.java) (GR-14 Deadline 3000ms 적용), `application.properties` (OSIV false) | [`SupportControllerTest.java`](resonance-office/front-office/resonance-support/src/test/java/com/resonancemachines/resonancesupport/controller/SupportControllerTest.java), [`ApprovalGrpcClientTest.java`](resonance-office/front-office/resonance-support/src/test/java/com/resonancemachines/resonancesupport/service/ApprovalGrpcClientTest.java), [`WorkflowGrpcClientTest.java`](resonance-office/front-office/resonance-support/src/test/java/com/resonancemachines/resonancesupport/service/WorkflowGrpcClientTest.java) |
| **Front-Office** | `resonance-download` | [`DownloadController.java`](resonance-office/front-office/resonance-download/src/main/java/com/resonancemachines/resonancedownload/controller/DownloadController.java), [`EntitlementGrpcClient.java`](resonance-office/front-office/resonance-download/src/main/java/com/resonancemachines/resonancedownload/service/EntitlementGrpcClient.java) (GR-14 Deadline 3000ms 적용) | [`DownloadControllerTest.java`](resonance-office/front-office/resonance-download/src/test/java/com/resonancemachines/resonancedownload/controller/DownloadControllerTest.java) |
| **Front-Office** | `resonance-research` | [`QueryFacade.java`](resonance-office/front-office/resonance-research/src/main/java/com/resonancemachines/resonanceresearch/controller/QueryFacade.java) (GR-14 Deadline 3000ms 적용) | [`QueryFacadeTest.java`](resonance-office/front-office/resonance-research/src/test/java/com/resonancemachines/resonanceresearch/controller/QueryFacadeTest.java) |
| **Back-Office** | `resonance-org` | [`OrganizationController.java`](resonance-office/back-office/resonance-org/src/main/java/com/resonancemachines/resonanceorg/controller/OrganizationController.java) (`OrganizationResponse`, `WorkspaceResponse`, `WorkspaceUserResponse`, `WorkspaceResourceResponse`), `application.properties` (OSIV false) | [`OrganizationControllerTest.java`](resonance-office/back-office/resonance-org/src/test/java/com/resonancemachines/resonanceorg/controller/OrganizationControllerTest.java) |
| **Back-Office** | `resonance-report` | [`GlobalExceptionHandler.java`](resonance-office/back-office/resonance-report/src/main/java/com/resonancemachines/resonancereport/controller/GlobalExceptionHandler.java) (500 에러 메시지 마스킹) | - |
| **Middle-Office** | `resonance-approval` | [`OutboxEvent.java`](resonance-office/middle-office/resonance-approval/src/main/java/com/resonancemachines/resonanceapproval/entity/OutboxEvent.java), [`ApprovalServiceImpl.java`](resonance-office/middle-office/resonance-approval/src/main/java/com/resonancemachines/resonanceapproval/service/ApprovalServiceImpl.java) | [`ApprovalServiceTest.java`](resonance-office/middle-office/resonance-approval/src/test/java/com/resonancemachines/resonanceapproval/service/ApprovalServiceTest.java) |
| **Middle-Office** | `resonance-control` | [`OutboxEvent.java`](resonance-office/middle-office/resonance-control/src/main/java/com/resonancemachines/resonancecontrol/entity/OutboxEvent.java), [`ControlPlaneConfigService.java`](resonance-office/middle-office/resonance-control/src/main/java/com/resonancemachines/resonancecontrol/service/ControlPlaneConfigService.java), `application.properties` (OSIV false) | [`ControlPlaneConfigServiceTest.java`](resonance-office/middle-office/resonance-control/src/test/java/com/resonancemachines/resonancecontrol/service/ControlPlaneConfigServiceTest.java) |
| **Middle-Office** | `resonance-crypto` | [`TokenVaultEntry.java`](resonance-office/middle-office/resonance-crypto/src/main/java/com/resonancemachines/resonancecrypto/entity/TokenVaultEntry.java) | [`TokenizationServiceTest.java`](resonance-office/middle-office/resonance-crypto/src/test/java/com/resonancemachines/resonancecrypto/service/TokenizationServiceTest.java), [`CellLevelMaskingIntegrationTest.java`](resonance-office/middle-office/resonance-crypto/src/test/java/com/resonancemachines/resonancecrypto/service/CellLevelMaskingIntegrationTest.java) |
| **Middle-Office** | `resonance-meta` | [`WorkflowGrpcClient.java`](resonance-office/middle-office/resonance-meta/src/main/java/com/resonancemachines/resonancemeta/client/WorkflowGrpcClient.java) (GR-14 Deadline 3000ms 적용) | [`MetaServiceTest.java`](resonance-office/middle-office/resonance-meta/src/test/java/com/resonancemachines/resonancemeta/service/MetaServiceTest.java) |
| **Middle-Office** | `resonance-workflow` | [`SagaInstance.java`](resonance-office/middle-office/resonance-workflow/src/main/java/com/resonancemachines/resonanceworkflow/entity/SagaInstance.java) (`FetchType.EAGER` $\rightarrow$ `FetchType.LAZY` 교정) | [`WorkflowServiceTest.java`](resonance-office/middle-office/resonance-workflow/src/test/java/com/resonancemachines/resonanceworkflow/service/WorkflowServiceTest.java) |
| **Platform Brain** | `resonance-unified-context` | [`SubgraphSchemaEntity.java`](resonance-unified-context/src/main/java/com/resonancemachines/context/statemachine/SubgraphSchemaEntity.java) (`@Data` $\rightarrow$ `@Getter/@Setter` 교정), [`OntologyExportService.java`](resonance-unified-context/src/main/java/com/resonancemachines/context/graph/OntologyExportService.java), [`OntologyController.java`](resonance-unified-context/src/main/java/com/resonancemachines/context/graph/OntologyController.java), `application.yaml` (OSIV false) | [`OntologyExportServiceTest.java`](resonance-unified-context/src/test/java/com/resonancemachines/context/graph/OntologyExportServiceTest.java), [`SubgraphSchemaStateMachineTest.java`](resonance-unified-context/src/test/java/com/resonancemachines/context/statemachine/SubgraphSchemaStateMachineTest.java) |

---

## 5. 분기별 및 상시 변경관리 프로토콜 (Change-Management Operating Procedure)

1. **문서 추가/변경 시 (ADR & Research Lifecycle):**
   - 새로운 ADR(`ADR-000X-...`)을 채택할 때 기존 ADR을 대체(Supersede)한다면, 같은 PR/커밋에서 구버전 ADR을 삭제하거나 `Status: Superseded by ADR-000X`로 명시하고 `ARCHITECTURE.md`와 `.agents/.contracts/CONTRACTS.md`의 표를 동시에 갱신합니다.
   - `docs/adr/`에는 항상 `ADR-000X-<slug>.md` 본문 파일과 `000X-<slug>.md` 심볼릭 링크 쌍을 유지하며, 끊어진 링크는 `GR-05`에 의해 즉시 차단됩니다.
2. **작업 계획(`PLAN.md` / `task.md`) 갱신 시:**
   - 각 마이크로서비스의 `PLAN.md`와 `task.md`는 **코드와 단위 테스트가 실제로 통과한 직후에만** `[ ]` $\rightarrow$ `[x]`로 전환합니다.
   - 분기별 아키텍처 개편 시 더 이상 유효하지 않은 구식 Phase/Task는 주석으로 방치하지 않고 즉시 제거하거나 최신 ADR 기준으로 재작성합니다.
3. **신규 엔티티/컨트롤러/컨슈머 작성 시:**
   - 모든 외부/내부 진입점과 `OutboxEvent` 생성자는 반드시 `TenantGuard.requireTenantId(tenantId)` 또는 `TenantGuard.resolveOrFailClosed(tenantId)`를 통과해야 합니다.
   - 모든 REST 컨트롤러 엔드포인트는 JPA `@Entity`를 직접 반환할 수 없으며 Java Record 기반 DTO(`*Response`, `*Request`)를 사용해야 합니다 (GR-09).
   - 모든 빈 의존성 주입은 생성자 주입(Lombok `@RequiredArgsConstructor` 포함)만을 사용하며, 필드 레벨 `@Autowired`는 일절 금지됩니다 (GR-08).
   - 모든 JPA 마이크로서비스는 `spring.jpa.open-in-view=false`를 명시적으로 선언해야 합니다 (GR-08).

---

## 6. 즉시 확인 및 검증 방법 (How to Verify Anytime)

언제든 아래 두 명령어로 저장소 전체의 Guardrail 준수 상태를 **1~3초 이내에** 확인할 수 있습니다.

### 6.1 CLI & Git Pre-Commit Guardrail 실행 (~1초)
```bash
./deploy/scripts/enforce-architecture-guardrails.sh
```
**기대 출력:**
```text
==============================================================================
 Resonance Platform — Architectural & Change-Management Guardrail Audit
==============================================================================
[1/9] Auditing production Java sources for fail-open tenant placeholders...
  [PASS] Zero fail-open tenant placeholders in src/main/java across all 26 modules.
[2/9] Auditing OutboxEvent entities for banned polling columns (ADR-0001)...
  [PASS] All OutboxEvent entities strictly comply with Debezium WAL CDC (zero polling fields).
[3/9] Auditing production Java sources for forbidden 2PC / XA APIs...
  [PASS] Zero 2PC / XA transaction usages in production code.
[4/9] Auditing ARCHITECTURE.md, CONTRACTS.md, docker-compose.yml, and Debezium config...
  [PASS] ARCHITECTURE.md Event Mesh contract is synchronized (Protobuf proto3 + AsyncAPI 3.0).
  [PASS] ARCHITECTURE.md and CONTRACTS.md both enforce Apicurio Registry 3.x.
  [PASS] Debezium connector database.dbname matches docker-compose.yml (resonance_db).
[5/9] Auditing docs/adr/ and GUARDRAILS.md for broken symlinks or superseded duplicates...
  [PASS] All ADR documents, symlinks, and GUARDRAILS.md are valid and deduplicated.
[6/9] Auditing 25 module PLAN.md & task.md pairs for unverified [x] claims...
  [PASS] Verified all 25 module PLAN.md & task.md pairs with zero unverified [x] artifact claims.
[7/9] Auditing Target Enterprise Infrastructure specification & ADR-0010...
  [PASS] Target Enterprise Infrastructure Blueprint (ADR-0010) is fully synchronized across ARCHITECTURE.md and GUARDRAILS.md.
[8/9] Auditing production Java sources for field @Autowired and open-in-view=false (GR-08)...
  [PASS] Zero field-level @Autowired in src/main/java across all modules.
  [PASS] All JPA microservices strictly enforce spring.jpa.open-in-view=false.
[9/9] Auditing @RestController methods for raw JPA @Entity exposure (GR-09)...
  [PASS] Zero raw JPA @Entity leaks across all @RestController endpoints (strict DTO boundary).
==============================================================================
 AUDIT PASSED: All 9 architectural & change-management guardrails succeeded.
```

### 6.2 Maven JUnit 5 Guardrail 테스트 실행 (~2초)
```bash
mvn -f resonance-dependency/resonance-starter-core/pom.xml test
```
* `com.resonancemachines.starter.core.guardrail.ArchitectureGuardrailTest` (7 tests)
* `com.resonancemachines.starter.core.guardrail.TenantGuardTest` (3 tests)

---

## 7. SDLC 전 주기 강제 적용 아키텍처 (5-Stage Deterministic SDLC Enforcement)

AI 에이전트나 개발자가 문서를 읽지 않거나 잊어버리더라도 Guardrail이 절대 우회되지 않도록, **확률적 프롬프트 지시(Soft Gate)**와 **결정론적 실행 차단(Hard Gate)**을 분리하여 SDLC 5단계 전체에 강제력을 부여했습니다.

### 7.1 Antigravity의 `Skill` vs `Rule` vs `Hook` 작동 원리 비교

| 메커니즘 | 항상 자동 적용되는가? | 작동 방식 및 한계 | Resonance Platform 내 역할 |
| :--- | :---: | :--- | :--- |
| **Skill** (`.agent/skills/*/SKILL.md`) | **아니오 (On-Demand)** | **점진적 공개(Progressive Disclosure)** 방식입니다. 에이전트 컨텍스트에는 스킬의 `name`과 `description`만 로드되며, 에이전트가 스스로 필요하다고 판단해 `view_file`로 읽어야만 본문이 적용됩니다. 에이전트가 건너뛰면 강제력이 `0`입니다. | 복잡한 워크플로우 가이드 보조용 (강제 수단으로 사용 금지) |
| **Rule** ([`AGENTS.md`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/AGENTS.md), [`GEMINI.md`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/GEMINI.md), `trigger: always_on`) | **예 (컨텍스트 자동 주입)** | 워크스페이스 루트의 `AGENTS.md`/`GEMINI.md`는 매 세션 시작 시 시스템 프롬프트에 **자동 주입(Always-On)** 됩니다. 단, (1) 파일당 24KB / 전체 20,000 토큰 예산 제한이 있고, (2) 본질적으로 **LLM 프롬프트(Soft Gate)**이므로 대화가 길어지면 에이전트가 망각하거나 무시할 확률이 존재합니다. | **Stage 1 사전 예방**: 에이전트가 처음부터 올바른 아키텍처 규칙을 인지하도록 유도 |
| **Lifecycle Hook** ([`.agents/hooks.json`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/.agents/hooks.json)) | **예 (100% 결정론적 실행)** | LLM 외부의 OS 프로세스 레벨에서 실행되는 **Hard Gate**입니다. `Stop` 훅은 에이전트가 턴을 종료(`model_stop`)하려 할 때 셸 스크립트를 강제 실행하며, 검증 실패 시 `{"decision": "continue", "reason": "..."}`를 반환하여 **에이전트의 작업 완료 자체를 물리적으로 거부**합니다. | **Stage 3 에이전트 턴 종료 차단**: Guardrail 미통과 시 에이전트가 응답을 마칠 수 없음 |

### 7.2 5단계 SDLC 강제 파이프라인 (Defense-in-Depth Matrix)

| SDLC 단계 | 강제 계층 (Gate) | 구현 파일 | 차단 조건 및 동작 |
| :--- | :--- | :--- | :--- |
| **Stage 1: AI 에이전트 세션 시작 (Prompt Init)** | Always-On Root Rule (Soft Gate) | [`AGENTS.md`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/AGENTS.md), [`GEMINI.md`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/GEMINI.md) | 모든 AI 세션에 4대 아키텍처 불변식과 분기별 문서/계약 동기화 의무를 2KB 이하의 고밀도 규칙으로 자동 주입 |
| **Stage 2: 코드 작성 및 런타임 (Compile & Runtime)** | Java Fail-Closed Guard (Hard Gate) | [`TenantGuard.java`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/tenant/TenantGuard.java), [`OutboxEnvelope.java`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/resonance-dependency/resonance-starter-core/src/main/java/com/resonancemachines/starter/core/outbox/OutboxEnvelope.java) | `null`/공백/예약어(`default-tenant` 등) 유입 시 즉시 `IllegalStateException`을 발생시켜 잘못된 데이터의 생성 및 영속화 원천 차단 |
| **Stage 3: AI 에이전트 응답 완료 시점 (Agent Turn End)** | Antigravity `Stop` Hook (Hard Gate) | [`.agents/hooks.json`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/.agents/hooks.json), [`deploy/scripts/agy-stop-guardrail-hook.sh`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/deploy/scripts/agy-stop-guardrail-hook.sh) | 에이전트가 코드나 문서를 수정하고 완료 보고를 하려는 순간 자동으로 `enforce-architecture-guardrails.sh` 실행. 위반 시 **턴 종료를 차단(`decision: "continue"`)**하고 즉시 수정을 강제 |
| **Stage 4: 로컬 Git 커밋 시점 (Local Commit)** | Git `pre-commit` Hook (Hard Gate) | [`deploy/git-hooks/pre-commit`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/deploy/git-hooks/pre-commit), `.git/hooks/pre-commit` (`core.hooksPath` 연동) | `git commit` 실행 시 6대 정적/문서 감사 스크립트 자동 실행. 단 1건이라도 위반 시 커밋 즉시 거부 (`exit 1`) |
| **Stage 5: 원격 PR 및 빌드 파이프라인 (CI/CD)** | GitHub Actions Stage 1 + Maven Test (Hard Gate) | [`.github/workflows/ci.yml`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/.github/workflows/ci.yml), [`ArchitectureGuardrailTest.java`](file:///Users/jiyunkang/Projects/vibe/resonance-platform/resonance-dependency/resonance-starter-core/src/test/java/com/resonancemachines/starter/core/guardrail/ArchitectureGuardrailTest.java) | 누군가 `--no-verify`로 로컬 커밋을 우회하더라도, CI 파이프라인의 첫 관문(`Stage 1: Dependency & Contract Governance`)에서 `enforce-architecture-guardrails.sh`와 `ArchitectureGuardrailTest`가 실행되어 PR 병합 차단 |

