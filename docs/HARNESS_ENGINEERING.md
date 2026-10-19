# Resonance Platform — Harness Engineering Framework & Roadmap (`docs/HARNESS_ENGINEERING.md`)

> **문서 상태:** Active & Enforced  
> **최초 제정일:** 2026-10-18  
> **문서 분류:** Engineering Scaffolding, Verification Framework, Agentic Governance  
> **관련 문서:** [ARCHITECTURE.md](architecture/ARCHITECTURE.md), [GUARDRAILS.md](guardrails/GUARDRAILS.md), [ADR-0009](adr/ADR-0009-executable-architecture-and-change-management-guardrails.md), [ADR-0010](adr/ADR-0010-target-infrastructure-topology-and-governance.md)

---

## 1. 개요 및 엔지니어링 철학 (Philosophy & Purpose)

### 1.1 하네스 엔지니어링(Harness Engineering)이란?
단순히 "코드가 단위 테스트를 통과하는가?"를 확인하는 수동적인 수준을 넘어, **복잡한 분산 마이크로서비스와 자율 AI 코딩 에이전트가 통제된 경계 조건(Bounded Context) 내에서 결정론적(Deterministic)이고 안전하게 작동하도록 둘러싸는 외부 비계(Scaffolding), 불변식 제약기, 자동화 검증 환경 및 자가 치유(Self-Healing) 기계장치**를 체계적으로 설계하고 운용하는 엔지니어링 공학입니다.

### 1.2 5대 핵심 원칙 (Core Principles)
1. **Fail-Closed by Default (실패 시 차단):** 불확실하거나 설정이 누락된 경우 안전한 기본값으로 폴백하지 않고 즉시 작업을 차단한다 (예: `TenantGuard`).
2. **Sub-Second Guardrail Feedback (< 1s 검증 피드백):** 핵심 아키텍처 불변식 감사는 1초 이내에 완료되어 로컬 Git 커밋 및 에이전트 턴마다 즉각 피드백을 제공한다.
3. **Zero-Hallucination & Evidence-Gating (증거 기반 완료):** 테스트 통과 로그, 물리적 파일 생성 영수증(Receipt) 없이는 태스크 완료(`[x]`)를 선언할 수 없다.
4. **Environment Determinism (환경 결정론):** 단일 노드(Compose), KinD 스테이징 클러스터, 프로덕션 클라우드가 완전히 동일한 프로토콜(Protobuf, AsyncAPI, mTLS)로 구동된다.
5. **Continuous Drift Healing (상시 드리프트 복구):** 명세(Spec), 설정(Config), 소스 코드(Code)의 3원 일치성을 상시 감시하고 위반 시 빌드를 차단한다.

---

## 2. 현재 적용된 6대 하네스 시스템 (Current Harness Inventory)

현재 Resonance Platform 저장소에는 6개 계층에 걸쳐 총 20개 이상의 하네스 도구와 검증기가 구축되어 운영 중입니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RESONANCE HARNESS ENGINEERING ARCHITECTURE                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Safety & Guardrail Harness                                                          │
│    • enforce-architecture-guardrails.sh (9대 아키텍처 불변식 1초 검증 게이트)          │
│    • agy-stop-guardrail-hook.sh (AI 에이전트 턴 종료 시 무조건 가드레일 통과 강제)    │
│    • TenantGuard & OutboxEnvelope (런타임 Fail-Closed 멀티테넌시 방어 하네스)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Test & Live Mesh Scenario Harness                                                   │
│    • e2e-live-mesh-suite.py (14개 라이브 E2E 시나리오: Istio, S3, Saga, mTLS STRICT 등)│
│    • ArchitectureGuardrailTest.java (빌드 타임 AST 및 파일시스템 스캔 하네스)         │
│    • resonance-test (BDD Cucumber 및 통합 테스트 피처 8종)                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Infrastructure Orchestration & Diagnostic Harness                                   │
│    • docker-compose.yml (13개 핵심 분산 백킹 인프라의 단일 재현 하네스)                │
│    • check-infra-health.sh (13개 서비스의 실시간 헬스 프로빙 하네스)                  │
│    • start-all.sh & port-forward-daemon.sh (데이터 시딩 + 회복력 있는 k8s 프록시)     │
│    • sync-staging.sh (코드 변경 ➔ KinD 파드 롤아웃 단일 커맨드 동기화 하네스)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Contract & Schema Governance Harness                                                │
│    • Apicurio Registry 3.x (:8086) (Protobuf/AsyncAPI BACKWARD_TRANSITIVE 스키마 강제) │
│    • ADR-0008 & ADR-0010 (명세-설정-코드 3원 일치성 강제)                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Distributed Observability Harness                                                   │
│    • Prometheus, Grafana, Jaeger, Kiali, Loki, OTel Collector (4대 텔레메트리 통합)    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. Agentic AI Scaffolding Harness                                                      │
│    • .agent/skills/ (Context Health Monitor, Empirical Validation, GSD 체계)           │
│    • Amplicode Spring Skills & Rules (프롬프트/컨텍스트 주입 하네스)                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Safety & Guardrail Harness (안전 및 불변식 하네스)
* **`deploy/scripts/enforce-architecture-guardrails.sh`:**
  * Git Pre-commit 및 로컬 CLI 환경에서 9대 불변식을 1초 이내에 전수 검사.
  * `GR-01`: 프로덕션 Java 소스 내 `"default-tenant"` 등 취약한 폴백 리터럴 0건 강제.
  * `GR-02`: Outbox 엔티티의 폴링 컬럼(`processed`, `retryCount` 등) 금지.
  * `GR-03`: 분산 2PC (`javax.transaction.xa`, `XADataSource`) 사용 금지.
  * `GR-04`: Protobuf + AsyncAPI 3.0 + Apicurio Registry 3.x 명세-설정 일치성.
  * `GR-05`: ADR 심볼릭 링크 유효성 및 중복 폐기 문서 제거.
  * `GR-06`: 증거 기반 `PLAN.md` 완료 체크 (`asyncapi.yaml`, `db/migration` 존재 확인).
  * `GR-07`: 타깃 인프라 청사진([ADR-0010](adr/ADR-0010-target-infrastructure-topology-and-governance.md)) 동기화.
  * `GR-08`: Spring 컴포넌트 생성자 주입 강제 (필드 레벨 `@Autowired` 전면 금지) 및 모든 JPA 모듈 `spring.jpa.open-in-view=false` 강제.
  * `GR-09`: `@RestController` 계층에서 JPA `@Entity` 직접 노출 원천 차단 (Java 21 Record DTO 격리 강제).
* **`deploy/scripts/agy-stop-guardrail-hook.sh`:**
  * AI 에이전트가 세션을 종료하거나 작업을 마칠 때 가드레일 통과 여부를 검증하고 실패 시 완료를 원천 거부.
* **`TenantGuard.java` & `OutboxEnvelope.java`:**
  * 런타임에 테넌트 누락 시 즉시 `400 Bad Request` / `IllegalArgumentException`을 발생시켜 데이터 누수를 방지.

### 2.2 Test & Live Mesh Scenario Harness (실환경 시나리오 하네스)
* **`deploy/scripts/e2e-live-mesh-suite.py`:**
  * 실제 구동 중인 KinD 클러스터와 Istio 서비스 메시를 대상으로 14개 종합 E2E 시나리오를 자동 검증:
    1. Istio Ingress Gateway 라우팅 및 호스트 검증
    2. S3 Presigned URL 발급 및 MinIO 파일 업로드 완결성
    3. Redpanda 이벤트 수신 및 비동기 벡터화 파이프라인
    4. GraphRAG 하이브리드 검색 레이턴시 SLA (< 4000ms)
    5. 테넌트 간 데이터 완벽 격리 (Alpha vs Beta vs Gamma 무단 교차 조회 차단)
    6. 스키마 거버넌스 및 ETag 304 캐시 무효화
    7. Webhook HMAC-SHA256 서명 검증 및 위변조 탐지
    8. 고부하 동시성 처리 및 스트레스 테스트
    9. Camunda 사가 워크플로 트리거 및 메시지 상관관계
    10. GraphQL API 인그레스 질의 실행
    11. 멀티 테넌트 서브그래프 프로젝션 검증
    12. 서비스 메시 관측성 및 Actuator 헬스 감사
    13. Istio mTLS STRICT 상호 TLS 강제 및 비메시 트래픽 거부
    14. Envoy 로컬 Rate Limiting (초당 50건 초과 시 429 차단)
* **`ArchitectureGuardrailTest.java`:**
  * JUnit 5 기반으로 빌드 시 소스 코드 AST 및 파일 시스템 구조를 파싱하여 규칙 위반 차단.
* **`resonance-test`:**
  * BDD Cucumber 피처 8종(RLS 격리, 그래프 탐색 보안, Outbox CDC 멱등성, 사가 보상 트랜잭션 등)을 구동하는 테스트 하네스.

### 2.3 Infrastructure Orchestration & Diagnostic Harness (인프라 재현 하네스)
* **`docker-compose.yml`:**
  * Redpanda(19092), Postgres 16(5433), Neo4j(7474/7687), MinIO(9000/9001), Debezium(8083), Apicurio 3.x(8086), OTel Collector(4317/4318), Jaeger(16686), Prometheus(9090), Grafana(3001), Loki(3100)를 포함한 13개 백킹 서비스를 단일 설정으로 완벽 재현.
* **`deploy/scripts/check-infra-health.sh`:**
  * 13개 서비스의 HTTP 헬스체크 및 TCP 소켓 상태를 순차 진단하여 1초 이내에 인프라 정상 여부를 출력.
* **`deploy/scripts/start-all.sh` & `port-forward-daemon.sh`:**
  * KinD 클러스터 내 7개 핵심 서비스와 Istio Ingress, Kiali UI의 포트포워딩을 백그라운드에서 상시 유지 및 자동 복구.
* **`deploy/scripts/sync-staging.sh`:**
  * 특정 마이크로서비스 수정 시 Maven JAR 컴파일 $\rightarrow$ 도커 빌드 $\rightarrow$ KinD 이미지 로드 $\rightarrow$ K8s 롤아웃을 원커맨드로 처리.

### 2.4 Contract & Schema Governance Harness (계약 거버넌스 하네스)
* **[ADR-0008](adr/ADR-0008-asyncapi-apicurio-event-contract-governance.md) & Apicurio Registry 3.x (`:8086`):**
  * 카프카 이벤트 발행 시 스키마가 Apicurio에 사전 등록되어 있어야 하며, 변경 시 `BACKWARD_TRANSITIVE` 호환성을 검증받아야만 배포/발행 가능.

### 2.5 Agentic AI Scaffolding Harness (AI 에이전트 개발 하네스)
* **`.agent/skills/`:**
  * `Empirical Validation`: 구현 완료 시 "동작할 것입니다"라는 추측성 답변을 거부하고 실제 테스트 실행 영수증을 요구.
  * `Context Health Monitor`: 장기 세션 진행 시 컨텍스트 윈도우 과부하를 측정하고 상태 덤프를 유도.
  * `GSD (Planner/Checker/Executor/Verifier)`: 계획 검증, 원자적 태스크 실행, 사후 검증으로 이어지는 정밀한 에이전트 파이프라인.
* **`.ai-skills/` (Amplicode):**
  * Spring Boot 3/4 개발 규칙과 코딩 표준을 컨텍스트에 자동 주입하여 AI 생성 코드의 일관성 유지.

---

## 3. 하네스 컴포넌트 매트릭스 (Harness Matrix)

| 하네스 명칭 | 실행 주기 / 트리거 | 평균 수행 시간 | 실패 시 동작 (Fail Behavior) | 핵심 검증 대상 |
| :--- | :--- | :---: | :--- | :--- |
| **`enforce-architecture-guardrails.sh`** | Git Pre-commit, CLI 상시, AI 종료 훅 | < 1s | 커밋 거절 / AI 완료 거절 | 9대 아키텍처 불변식 및 문서-코드 동기화 |
| **`check-infra-health.sh`** | 인프라 기동 직후, 배포 전/후 | < 2s | Exit Code 1 반환 | 13개 백킹 인프라 및 관측성 서비스 상태 |
| **`ArchitectureGuardrailTest.java`** | `mvn test` (CI 및 로컬 빌드) | ~0.5s | Maven 빌드 실패 | Java AST 파싱 및 물리 파일 존재 여부 |
| **`e2e-live-mesh-suite.py`** | 스테이징 배포 후, 회귀 테스트 | ~20s | 시나리오별 `[FAIL]` 출력 | Istio mTLS, S3, CDC, 사가, Rate Limit |
| **`sync-staging.sh`** | 마이크로서비스 코드 수정 시 | ~15s | 스크립트 중단 | JAR 컴파일, KinD 이미지 로드, K8s 롤아웃 |
| **Apicurio Registry SerDe** | 런타임 이벤트 직렬화/역직렬화 시 | < 5ms | 카프카 레코드 발행 차단 | Protobuf 스키마 하위 호환성 검증 |

---

## 4. 차세대 하네스 엔지니어링 권장 로드맵 (Next Recommendations)

앞으로 Resonance Platform의 엔터프라이즈 성숙도와 AI 페어 프로그래밍 자율성을 극대화하기 위해 다음 6대 하네스 확장을 권장합니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NEXT-GEN HARNESS ROADMAP (6 PILLARS)                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Pillar 1: Chaos & Fault Injection Harness (카오스 및 회복력 검증 하네스)              │
│ Pillar 2: Ephemeral Preview Environment Harness (PR별 동적 단기 네임스페이스 하네스)   │
│ Pillar 3: Schema CI Gatekeeper Harness (Git PR 시점 스키마 브레이킹 사전 차단)        │
│ Pillar 4: Automated Performance Regression Harness (지속적 성능/레이턴시 회귀 감시)  │
│ Pillar 5: Supply Chain Security & Attestation Harness (컨테이너 서명 및 SBOM 검증)    │
│ Pillar 6: Autonomous Agentic Self-Healing Harness (AI 에이전트 자가 복구 루프 고도화) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 권장 1: Chaos & Fault Injection Harness (카오스 및 회복력 검증 하네스)
* **목적:** 분산 사가 트랜잭션과 Debezium CDC 파이프라인이 파드 돌연사, 네트워크 지연, 카프카 파티션 리밸런싱 중에도 데이터 유실이나 정합성 깨짐 없이 자가 복구되는지 검증.
* **구현 방안:**
  * **Chaos Mesh**를 KinD 클러스터에 배포하거나, Istio의 `VirtualService.fault` 설정을 활성화.
  * `deploy/scripts/e2e-live-mesh-suite.py`에 **Scenario 15: Chaos Resilience & Auto-Recovery**를 신설하여, 3초 네트워크 지연 및 HTTP 503 주입 상황에서 사가 보상 트랜잭션이 완결되는지 자동 검증.

### 권장 2: Ephemeral Preview Environment Harness (PR별 동적 단기 환경 하네스)
* **목적:** 단일 KinD 클러스터를 공유할 때 생기는 포트 충돌, 브랜치 간 데이터 오염을 방지하고 개발자/에이전트별 독립된 검증 샌드박스 제공.
* **구현 방안:**
  * **vcluster** 또는 **Namespace-as-a-Service** 스크립트 구축.
  * PR 생성 시 `preview-pr-123` 네임스페이스를 동적 프로비저닝하고, Helm Umbrella Chart를 통해 마이크로서비스를 배포한 뒤 E2E 통과 시 자동 파기(Teardown).

### 권장 3: Schema CI Gatekeeper Harness (`apicurio-registry-maven-plugin:test-update`)
* **목적:** 런타임에 Apicurio Registry가 에러를 뱉기 전에, 개발자가 Git PR을 올리는 시점에 스키마 파괴적 변경(Breaking Change)을 Maven 수명주기 내에서 사전 차단.
* **선택 근거 (Why `apicurio-registry-maven-plugin` over `buf breaking`?):**
  * **Maven-Idiomatic:** 플랫폼의 모든 25개 마이크로서비스와 `resonance-stubs`가 순수 Maven 빌드 시스템을 따르므로, 별도의 외부 CLI 도구(`buf`)를 설치할 필요 없이 Maven 플러그인으로 즉시 통합 가능.
  * **Apicurio 3.x 네이티브 정합성:** 실제 클러스터/로컬에 기동 중인 Apicurio Registry 3.x(`:8086`)의 `BACKWARD_TRANSITIVE` 호환성 규칙 엔진을 그대로 활용하여 검증하므로, 툴 간 평가 기준 불일치가 발생하지 않음.
  * **이미 구성 완료된 프로파일:** `resonance-dependency/resonance-stubs/pom.xml`에 `apicurio-ci` 프로파일이 선언되어 있어, `mvn verify -Papicurio-ci -Dapicurio.registry.verify=true -Dresonance.registry.url=http://localhost:8086/apis/registry/v3` 커맨드로 CI 파이프라인에서 즉시 실행 가능.

### 권장 4: Automated Performance Regression Harness (성능 회귀 방지 하네스)
* **목적:** 신규 커밋이나 프레임워크 업그레이드로 인해 p95/p99 응답 지연이나 JVM 힙 메모리 누수가 발생하는 것을 조기에 포착.
* **구현 방안:**
  * **k6** 기반 부하 시나리오 스크립트 작성 (`deploy/benchmark/k6-load-scenario.js`).
  * Nightly CI에서 스테이징 클러스터를 대상으로 10분간 지속 부하를 가하고, GraphRAG 검색 p95가 4000ms를 초과하거나 에러율이 0.1%를 넘을 경우 자동으로 리포트를 생성하고 슬랙/이메일로 경보 발송.

### 권장 5: Supply Chain Security & Attestation Harness (공급망 보안 하네스)
* **목적:** Artifactory 및 프로덕션에 배포되는 모든 컨테이너 이미지와 Helm 차트의 무결성을 보증.
* **구현 방안:**
  * **Trivy / Grype**를 CI 빌드 하네스에 통합하여 High/Critical CVE 발견 시 빌드 실패 처리.
  * **Cosign**을 통한 OCI 이미지 서명 및 SBOM(CycloneDX / SPDX) 자동 생성·게시.

### 권장 6: Autonomous Agentic Self-Healing Loop Harness (에이전트 자가 치유 루프 하네스)

#### 6.1 배경 및 문제 정의: 왜 일반적인 LLM 수정 루프는 실패하는가?
단순히 "에러 로그를 LLM 프롬프트에 넣고 고쳐달라"고 하는 나이브(Naive)한 자가 복구는 실전 엔터프라이즈 환경에서 다음과 같은 치명적인 실패 모드를 겪습니다:
1. **무한 환각 루프 (Hallucination Ping-Pong):** 에러를 고치려다 다른 모듈의 인터페이스를 깨뜨리고, 다시 그 에러를 고치려다 원래 버그로 되돌아가는 토큰 소진 루프.
2. **컨텍스트 오염 (Context Pollution):** 수십 MB의 장황한 스택트레이스가 LLM 컨텍스트 윈도우를 뒤덮어 추론 능력과 주의 집중(Attention)이 급격히 저하됨.
3. **무제한 영향 범위 (Unbounded Blast Radius):** 비즈니스 로직 버그를 고치는 대신 테스트 코드를 주석 처리하거나, `pom.xml` 의존성을 변경하거나, 보안 가드레일을 무력화하는 부적절한 변경 감행.
4. **비결정론적 플래키 테스트 (Flaky Drift):** 테스트 환경이 불안정할 때 깨진 환경을 고치는 대신 정상 코드를 왜곡하는 결함.

#### 6.2 5단계 정밀 자가 치유 아키텍처 (The 5-Stage Self-Healing Architecture)

```
[RED: 결함 발생] ───► Stage 1: 정형 영수증 추출 (FailureReceipt.json)
                              │
                              ▼
                      Stage 2: 가설 수립 및 변이 경계 한정 (Bounded Hypothesis)
                              │
                              ▼
                      Stage 3: 심볼/AST 안전 원자적 패치 (Atomic AST Patching)
                              │
                              ▼
                      Stage 4: 다계층 게이트 재검증 (Multi-Tier Gate)
                              │
             ┌────────────────┴────────────────┐
      [FAIL (<= 3회)]                    [PASS: GREEN]
             │                                 │
             ▼                                 ▼
      롤백 & 격리 재시도                  Stage 5: 복구 영수증 및 원자적 커밋
      (Auto-Rollback)                   (Commit & Ledger Attestation)
```

1. **Stage 1: 정형 영수증 추출 (Structured Failure Receipt Extraction)**
   * 원시 stdout/stderr 로그를 프롬프트에 덤프하지 않음.
   * 가드레일 스크립트나 Maven 테스트 러너가 파싱하여 정확히 정형화된 JSON을 출력:
     ```json
     {
       "failure_id": "FAIL-20261018-01",
       "category": "INVARIANT_VIOLATION",
       "guardrail_id": "GR-01",
       "target_module": "resonance-action",
       "target_file": "src/main/java/com/resonancemachines/resonanceaction/entity/OutboxEvent.java",
       "line_range": [45, 52],
       "violation_code": "\"default-tenant\"",
       "invariant_rule": "Fail-Closed: tenantId must be validated via TenantGuard.requireTenantId",
       "reproduction_command": "./deploy/scripts/enforce-architecture-guardrails.sh",
       "reproduction_sla_ms": 650
     }
     ```
2. **Stage 2: 변이 경계 한정 및 최소 가설 수립 (Bounded Mutation & Hypothesis)**
   * **수정 허용 경계(Blast-Radius Firewall):** 에이전트의 수정 가능 파일 범위를 `target_file` 및 해당 패키지로 한정. `pom.xml`, `CONTRACTS.md`, `TenantGuard.java` 등 핵심 보안 코어는 읽기 전용(Read-Only)으로 잠금.
   * **최소 diff 가설:** "기존 로직의 시맨틱을 유지하면서 불변식 제약 조건을 만족하는 가장 작은 contiguous diff는 무엇인가?"
3. **Stage 3: 심볼 및 AST 안전 원자적 패치 (Atomic AST Patching)**
   * 전체 파일 덮어쓰기 금지. 정확한 line-range와 target block 매칭을 통한 원자적 교체(`replace_file_content`).
   * 기존의 주석, Javadoc, 어노테이션을 손상시키지 않고 보존.
4. **Stage 4: 다계층 즉시 재검증 게이트 (Multi-Tier Re-verification Gate)**
   * **Step 4A (0.5s):** 격리된 단일 재현 명령 실행 (`enforce-architecture-guardrails.sh` 또는 단일 테스트).
   * **Step 4B (2s):** 해당 모듈 테스트 (`mvn test -pl <module>`).
   * **Step 4C (1s):** 전체 9대 아키텍처 가드레일 감사.
   * **Safe Bail-Out (안전 탈출 장치):** 최대 3회 재시도 내에 Green으로 전환되지 못하면 `git checkout`으로 원상 복구(Auto-Rollback) 후 인간 엔지니어에게 알림 발송.
5. **Stage 5: 복구 영수증 및 원자적 커밋 (Commit & Ledger Attestation)**
   * Red $\rightarrow$ Green 전환 영수증 생성 및 변경 사유를 명시한 깃 커밋 발행.

---

## 5. 하네스 일상 운영 지침 (Operating Guidelines)

### 5.1 로컬 개발 루프 (Daily Dev Loop)
```bash
# 1. 인프라 상태 점검 (1초 소요)
./deploy/scripts/check-infra-health.sh

# 2. 서비스 수정 후 스테이징 즉시 반영 (15초 소요)
./deploy/scripts/sync-staging.sh resonance-action

# 3. 커밋 전 아키텍처 불변식 전수 감사 (1초 소요)
./deploy/scripts/enforce-architecture-guardrails.sh
```

### 5.2 배포 전 전체 E2E 검증 (Pre-Release Live Mesh Verification)
```bash
# KinD 클러스터 대상 14대 라이브 시나리오 전수 실행 (~20초 소요)
python3 deploy/scripts/e2e-live-mesh-suite.py
```

### 5.3 아키텍처 변경 관리 규칙
* 새로운 ADR 또는 연구 문서를 작성할 때는 기존 중복 문서를 즉시 정리하고, 반드시 심볼릭 링크(`000X-*.md`)를 동시 생성해야 합니다 (`GR-05`).
* 마이크로서비스의 `PLAN.md`에서 구현 태스크를 완료(`[x]`)로 표시할 때는 반드시 물리 파일과 단위 테스트 통과 증거가 존재해야 합니다 (`GR-06`).
* 모든 Spring 빈 컴포넌트는 생성자 주입만을 허용하며(필드 레벨 `@Autowired` 일절 금지), 모든 JPA 마이크로서비스는 `spring.jpa.open-in-view=false`를 명시적으로 선언해야 합니다 (`GR-08`).
* 모든 REST 컨트롤러 엔드포인트는 JPA `@Entity`를 직접 반환할 수 없으며, Java 21 Record 기반 DTO(`*Response`, `*Request`)만을 반환하여 영속성 계층을 철저히 격리해야 합니다 (`GR-09`).
