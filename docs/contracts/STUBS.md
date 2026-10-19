# Test Stubs, Mocks & Boundary Emulation Standards

This document defines the testing stubs, mocks, and containerized boundary emulators required to validate microservice implementations against platform requirements without depending on production infrastructure.

---

## 1. Containerized Infrastructure Stubs (Testcontainers)

All services must support isolated integration testing using `org.testcontainers:testcontainers-bom` (`1.20.1`):

| Boundary Component | Stub Technology | Test Port / Protocol | Mocked Behavioral Pattern |
| :--- | :--- | :--- | :--- |
| **Event Broker** | `org.testcontainers:redpanda` | `19092` (Kafka API) | Idempotent consumer replay, Dead-Letter Queue (DLQ) routing, Schema Registry validation |
| **Relational Outbox**| `org.testcontainers:postgresql` | `5432` (JDBC) | Row-Level Security (RLS) enforcement, `tsvector` and `pgvector` indexing |
| **Knowledge Graph** | `org.testcontainers:neo4j` | `7687` (Bolt) | Parameterized Cypher query validation, Schema.org node/edge projection |
| **Object Store** | `org.testcontainers:minio` | `9000` (S3 API) | Resumable chunked multipart upload validation, presigned URL generation |

---

## 2. Mock Services & WireMock Emulators

### 2.1 Open Policy Agent (OPA) Policy Decision Point Mock
*   **Service Target:** `resonance-policy` (Port `8106`)
*   **Emulator:** WireMock / MockServer exposing `POST /v1/data/resonance/{policy_name}`.
*   **Test Scenarios:**
    *   `ALLOW`: Standard authorized JWT payload with valid tenant scope.
    *   `DENY`: Cross-tenant access attempt, missing required ABAC attributes, or triggered CAEP revocation.

### 2.2 External Federation Webhook Receiver Stub
*   **Service Target:** `resonance-webhook` (Port `8206`)
*   **Emulator:** Local HTTP listener capturing outbound HMAC webhooks.
*   **Verification:**
    *   Assert presence and validity of `X-Resonance-Signature` (HMAC-SHA256).
    *   Verify payload deserialization against partner schema.
    *   Simulate HTTP 500 / 503 responses to trigger exponential backoff retry and DLQ routing.

### 2.3 gRPC Service Stubs
*   **Generation:** In-process gRPC test channels using `io.grpc.inprocess:grpc-inprocess`.
*   **Boundary Enforcement:**
    *   Simulate gRPC timeout (`> 2500ms`) to verify Resilience4j circuit-breaking behavior.
    *   Verify W3C `traceparent` metadata propagation on all outbound gRPC calls.

---

## 3. SLA & Performance Benchmarking Stubs

To validate compliance with the **4.0-second GraphRAG SLA**:
*   **Synthetic Telemetry Injector:** Generates bursts of front-office telemetry events to ensure CQRS segregation prevents read degradation.
*   **Latency Probe:** Automatically records end-to-end traversal, vector scoring, and LLM context synthesis times against defined latency budgets.
