# ADR-0010: Target Enterprise Infrastructure Topology & Governance

- **Status:** Accepted
- **Date:** 2026-10-18
- **Authors:** Core Platform Architecture & Infrastructure Team
- **Deciders:** Chief Architect, Platform Engineers, Security Team
- **Governs:** Platform Infrastructure Topology, Cloud-Native Stack, Ingress Proxy (Wasm/ext_authz), Identity (Keycloak PKCE/DCR), Secrets (Vault), Packaging (Helm 3), CI/CD (GitHub Actions + ArgoCD), Observability, and Artifact Registries

---

## 1. Context & Problem Statement

As the Resonance Platform transitions from local single-node development (`docker-compose.yml`, KinD staging) to enterprise-scale multi-tenant production, a definitive, drift-resistant target infrastructure blueprint is required.

The target infrastructure must unify:
1. **Container Platform & Orchestration:** Kubernetes (v1.30+)
2. **Service Mesh:** Istio (Zero-Trust mTLS STRICT, PeerAuthentication, AuthorizationPolicy)
3. **Edge Ingress & Envoy Proxy:** Envoy Gateway transitioning from Lua filter scripts to **WebAssembly (`WasmPlugin`)** and **gRPC `ext_authz`** external authorization services
4. **Identity & Access Management (IAM):** Keycloak supporting OAuth 2.1 / OIDC, PKCE (RFC 7636), and Dynamic Client Registration (DCR, RFC 7591)
5. **Application Packaging:** Helm 3 with OCI registry distribution
6. **Continuous Integration & Delivery (CI/CD):** GitHub Actions (CI) combined with ArgoCD (GitOps CD)
7. **Enterprise Secrets Management:** HashiCorp Vault integrated via External Secrets Operator (ESO) / Vault CSI
8. **Distributed Observability Stack:** Prometheus, Grafana, Jaeger, Kiali, Grafana Loki, and OpenTelemetry Collector
9. **Binary & Contract Registries:** JFrog Artifactory (OCI Container, Helm OCI, Maven/npm mirror) complemented by Apicurio Registry 3.x (Protobuf & AsyncAPI event contracts)

Without an explicit ADR and automated guardrails, architectural drift inevitably recurs across teams, resulting in misaligned proxy configurations, insecure secrets provisioning, and broken authentication pipelines.

---

## 2. Target Infrastructure Matrix & Gap Analysis

The table below contrasts the ideal infrastructure specification, identifies architectural gaps/trade-offs, and details the production mitigation strategy.

| Layer | Target Specification | Identified Gap / Consideration | Resonance Platform Production Strategy |
| :--- | :--- | :--- | :--- |
| **Platform** | **Kubernetes** (v1.30+) | Cluster Autoscaling, Pod Disruption Budgets, NetworkPolicies | Managed Kubernetes (EKS / GKE) with Karpenter autoscaling, Cilium/Calico CNI, and strict multi-tenant NetworkPolicies. |
| **Service Mesh** | **Istio** | Ingress vs Mesh mTLS boundary, sidecar resource overhead | Istio with `STRICT` PeerAuthentication, Istio IngressGateway, and evaluation of Istio Ambient Mesh for L4 mTLS with reduced sidecar overhead. |
| **Proxy** | **Envoy (WasmPlugin + gRPC ext_authz)** | **Lua Filter Deprecation & Separation:** Lua filters execute synchronously on Envoy worker threads; heavy logic causes worker thread blocking and GC pauses | **Complete separation from Lua:** In-proxy transformations move to **WebAssembly (`WasmPlugin`)** for sandboxed, high-performance execution. Multi-tenant policy decisions, RBAC, and token checks move to a dedicated **gRPC `ext_authz`** service (e.g., OPA or policy engine). |
| **Identity** | **Keycloak PKCE + DCR** | Client secret leakage in SPAs, automated agent client onboarding, tenant mapping | Enforce **RFC 7636 PKCE** for frontend SPAs (`resonance-ui`, `resonance-machine`). Enable **RFC 7591 DCR** for dynamic AI agent / MCP server client provisioning. Keycloak realm maps `tenant_id` claim into JWT access tokens, validated fail-closed by `TenantGuard`. |
| **Packaging** | **Helm 3** | Multi-environment config sprawl across 25+ microservices | Umbrella Helm Chart (`deploy/helm/resonance-platform`) with parameterized values files (`values-staging.yaml`, `values-prod.yaml`). Packages published as OCI artifacts (`helm push`). |
| **CI/CD** | **GitHub Actions + ArgoCD** | Direct cluster access from CI runners introduces credential leakage risk and lacks drift reconciliation | **Separation of CI and CD via GitOps:** GitHub Actions handles CI (compile, test, guardrails, image/chart push). **ArgoCD** handles declarative GitOps CD within the cluster, reconciling state from git with zero external cluster credential exposure. |
| **Secrets** | **HashiCorp Vault** | Secure secrets injection into Kubernetes pods without plain text in Git | Integrate Vault via **External Secrets Operator (ESO)** with Kubernetes Auth (`auth/kubernetes`) or **Vault CSI Driver**. Vault Transit engine provides envelope encryption for `resonance-crypto`; database engine provides dynamic credentials for PostgreSQL. |
| **Observability** | **Prometheus, Grafana, Jaeger, Kiali, Loki** | Missing unified dashboarding, log aggregation, and alert dispatching | **Full 4-Pillar Observability Stack:** Prometheus (Metrics), Grafana (Dashboards on port 3001), Jaeger (Distributed Tracing on port 16686), Kiali (Istio Mesh Console on port 20001), Grafana Loki (Log Aggregation on port 3100), and OTel Collector (Unified Ingestion on ports 4317/4318). |
| **Registries** | **JFrog Artifactory + Apicurio 3.x** | Binary storage does not validate runtime Protobuf/AsyncAPI schema compatibility | **Dual Registry Strategy:** **JFrog Artifactory** stores container images, OCI Helm charts, and Maven/npm artifacts. **Apicurio Registry 3.x** (`:8086`) enforces Protobuf event schema governance with `BACKWARD_TRANSITIVE` evolution (ADR-0008). |

---

## 3. Detailed Architecture Specifications

### 3.1 Envoy Proxy: Phasing Out Lua $\rightarrow$ WebAssembly (`WasmPlugin`) & gRPC `ext_authz`
1. **Problem with Lua Filters:** Envoy Lua filters (`envoy.filters.http.lua`) run synchronously on the main Envoy event loop worker thread. Long-running Lua operations, heavy parsing, or Lua garbage collection cycles block worker threads, causing latency degradation and head-of-line blocking under high throughput.
2. **Decoupled Architecture:**
   - **In-Proxy Transformation via WebAssembly (`WasmPlugin`):** Fast, sandboxed header manipulation, correlation ID injection (`X-Request-ID`, `X-B3-TraceId`), and request sanitization are compiled to WebAssembly (Rust/C++/Go) and executed via Istio's `WasmPlugin` API using the standard Proxy-Wasm ABI.
   - **External Authorization via gRPC `ext_authz`:** Authorization logic, multi-tenant RBAC evaluation, and dynamic policy checks are delegated to an external gRPC `ext_authz` service (such as Open Policy Agent or `resonance-policy`). Envoy evaluates policies asynchronously over persistent gRPC channels without blocking worker threads.

### 3.2 Identity & Access Management: Keycloak PKCE (RFC 7636) & DCR (RFC 7591)
1. **PKCE for Public Clients:** All Single Page Applications (`resonance-ui` React, `resonance-machine` Next.js) and mobile clients must authenticate using OAuth 2.1 Authorization Code Flow with PKCE (`S256` code challenge). Client secrets are strictly prohibited on client devices.
2. **Dynamic Client Registration (DCR) for AI Agents & MCP:** Autonomous AI agentic workflows and Model Context Protocol (MCP) servers obtain dedicated OAuth client credentials on-the-fly via Keycloak's RFC 7591 DCR endpoint, bounded by initial registration tokens and scoped permissions.
3. **Multi-Tenant Claims Mapping (Invariant 4):** Keycloak token mappers inject the tenant identity claim (`tenant_id: <uuid>`) into signed access tokens. Istio `RequestAuthentication` verifies the token against Keycloak's JWKS endpoint (`jwksUri`), and backend services enforce fail-closed verification via `TenantGuard.requireTenantId(tenantId)`.

### 3.3 CI/CD & GitOps Separation: GitHub Actions + ArgoCD
1. **GitHub Actions (Continuous Integration):**
   - Compiles Java modules via Maven (`mvn package`).
   - Executes JUnit 5 tests and automated architectural guardrails (`./deploy/scripts/enforce-architecture-guardrails.sh`).
   - Performs container image vulnerability scans (Trivy) and static analysis (SonarQube).
   - Builds OCI container images and Helm 3 charts, publishing them to JFrog Artifactory.
2. **ArgoCD (Declarative Continuous Delivery):**
   - Operates in-cluster, eliminating the need to expose Kubernetes cluster credentials to external GitHub runners.
   - Reconciles desired state from the Git repository with the cluster state, automatically detecting and repairing configuration drift.

### 3.4 Enterprise Secrets Management: HashiCorp Vault
1. **Kubernetes Integration:**
   - **External Secrets Operator (ESO):** Reconciles secrets from Vault into Kubernetes native `Secret` objects using `ClusterSecretStore` and Kubernetes ServiceAccount authentication (`auth/kubernetes`).
   - **Vault CSI Driver:** Mounts sensitive credentials directly into ephemeral in-memory volumes for high-security pods.
2. **Dynamic Credentials & Transit Encryption:**
   - Vault Database Secrets Engine generates short-lived, rotating credentials for PostgreSQL.
   - Vault Transit Secrets Engine performs envelope encryption for sensitive tokens stored in `resonance-crypto` without storing encryption keys in the database.

### 3.5 Distributed Observability: 4 Pillars of Telemetry
1. **Metrics:** Prometheus (`:9090`) scrapes JVM Actuator `/actuator/prometheus` across all microservices, Loki, and OTel Collector.
2. **Dashboards:** Grafana (`:3001`) with pre-provisioned data sources and operational dashboards (platform overview, SLA performance, business flows, and Apicurio Registry schema governance).
3. **Distributed Tracing:** Jaeger UI (`:16686`) receiving OTLP spans from OpenTelemetry Collector (`:4317` gRPC / `:4318` HTTP).
4. **Service Mesh Console:** Kiali (`:20001/kiali`) deployed in `istio-system`, visualizing real-time Istio mesh topologies, traffic flow rates, and mTLS security states.
5. **Log Aggregation:** Grafana Loki (`:3100`) collecting structured logs with trace-to-log correlation via `traceId`.

### 3.6 Registries: JFrog Artifactory + Apicurio Registry 3.x
1. **JFrog Artifactory:** Centralized enterprise repository for:
   - Docker/OCI container images.
   - Helm 3 OCI charts (`helm push`).
   - Maven & npm dependency caches, enforcing deterministic classpaths (Invariant 5).
2. **Apicurio Registry 3.x (`:8086`):** Dedicated event contract registry enforcing Protobuf (`proto3`) and AsyncAPI 3.0 schema evolution rules (`BACKWARD_TRANSITIVE`) across the Redpanda Event Mesh (ADR-0008).

---

## 4. Component Architecture & Integration Topology

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                     USER / SPA / AGENTS                     │
                                    │      (resonance-ui :5173  |  resonance-machine :3000)       │
                                    └──────────────────────────────┬──────────────────────────────┘
                                                                   │ OAuth 2.1 PKCE (RFC 7636)
                                                                   │ DCR (RFC 7591)
                                                                   ▼
┌──────────────────────────────┐                            ┌─────────────────────────────────────┐
│       JFROG ARTIFACTORY      │                            │          KEYCLOAK IAM               │
│ • Docker/OCI Container Images│                            │ • Dynamic Client Registration (DCR) │
│ • Helm 3 OCI Charts          │                            │ • Multi-Tenant Realm & Claims       │
│ • Maven/npm Dependency Mirror│                            │ • OIDC Discovery & JWKS (:8080)     │
└──────────────┬───────────────┘                            └──────────────────┬──────────────────┘
               │                                                               │ JWT Bearer Token
               │ Pull Images & Charts                                          │ (with tenant_id)
               ▼                                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   KUBERNETES CLUSTER TOPOLOGY                                   │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                            ISTIO INGRESS GATEWAY (Envoy Proxy)                            │  │
│  │  • TLS Termination (:443)                                                                 │  │
│  │  • WebAssembly Plugin (WasmPlugin for Request Normalization & Sanitization)               │  │
│  │  • gRPC ext_authz (External Authorization & Policy Decision Service)                      │  │
│  │  • Istio RequestAuthentication (Validates Keycloak JWT via JWKS)                          │  │
│  │  • Istio AuthorizationPolicy (Validates tenant_id != null and RBAC roles)                 │  │
│  └─────────────────────────────────────────────┬─────────────────────────────────────────────┘  │
│                                                │ mTLS STRICT (Istio Sidecar Mesh)               │
│                                                ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           MICROSERVICE PODS (Front/Mid/Back Office)                       │  │
│  │  • Envoy Sidecar Proxy (Auto-injected)                                                    │  │
│  │  • Spring Boot 3 App (TenantGuard.requireTenantId(), Actuator Prometheus :800X/810X)       │  │
│  │  • HashiCorp Vault Secrets via External Secrets Operator (ESO) / Vault CSI Volume        │  │
│  └──────────────────┬──────────────────────────┬──────────────────────────┬──────────────────┘  │
│                     │                          │                          │                     │
│                     │ OTLP Traces/Metrics      │ WAL CDC Log Mining       │ Schema Validation   │
│                     ▼                          ▼                          ▼                     │
│  ┌───────────────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────────┐  │
│  │     DISTRIBUTED OBSERVABILITY │ │   STORAGE & EVENT MESH│ │   CONTRACT GOVERNANCE         │  │
│  │ • Prometheus (:9090)          │ │ • Redpanda (:19092)   │ │ • Apicurio Registry 3.x       │  │
│  │ • Grafana Dashboard (:3001)   │ │ • PostgreSQL (:5433)  │ │   (:8086, BACKWARD_TRANSITIVE)│  │
│  │ • Jaeger Tracing (:16686)     │ │ • Neo4j Graph (:7474) │ └───────────────────────────────┘  │
│  │ • Kiali Mesh Console (:20001) │ │ • MinIO S3 (:9000)    │                                    │
│  │ • Loki Log Engine (:3100)     │ │ • Debezium Connect    │                                    │
│  │ • OTel Collector (:4317/:4318)│ │   (:8083)             │                                    │
│  └───────────────────────────────┘ └───────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ Declarative GitOps Sync
┌───────────────────────────────┴──────────────────────────────┐
│                      CI/CD & GITOPS PIPELINE                 │
│  • GitHub Actions: Test, Guardrails Audit, OCI Package Build │
│  • ArgoCD: Automated Pull-Based GitOps Reconciliation        │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Architectural Invariants Alignment

This infrastructure design strictly satisfies all 5 core platform invariants:
1. **No Two-Phase Commit:** Event Choreography over Redpanda using Debezium CDC and Apicurio Registry contracts; no distributed transaction managers in Kubernetes.
2. **Zero Plaintext PII in Mesh:** PII tokenized at sensory edge via `resonance-crypto`, leveraging Vault Transit encryption keys.
3. **Database-Per-Service:** Each microservice possesses dedicated schema namespaces in PostgreSQL/Neo4j, with network policies blocking cross-pod database access.
4. **Fail-Closed Multi-Tenant Isolation:** Keycloak encodes authenticated `tenant_id` into signed JWTs. Istio `RequestAuthentication` verifies token validity; Spring `TenantGuard` rejects any call lacking an authenticated `tenant_id` with HTTP 400/403.
5. **Deterministic Classpaths:** Microservices consume dependencies pinned exclusively by `resonance-bom` and mirrored through Artifactory Maven repository.

---

## 6. Continuous Verification & Guardrail Rule (GR-07)

To ensure this infrastructure blueprint never drifts:
1. `deploy/scripts/enforce-architecture-guardrails.sh` validates the presence and consistency of this ADR, `ARCHITECTURE.md`, `GUARDRAILS.md`, and deployment manifests.
2. `deploy/scripts/check-infra-health.sh` probes every core infrastructure and observability service (Prometheus, Grafana, Jaeger, Kiali, Apicurio, Redpanda, PostgreSQL, Neo4j, MinIO, OTel Collector).
