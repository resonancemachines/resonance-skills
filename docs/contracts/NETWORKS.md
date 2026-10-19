# Network Architecture & Traffic Policies

This document establishes the networking policies, ingress/egress rules, and latency budget constraints for the Resonance microservices mesh. These configurations govern local development (`docker-compose`) and translate to Kubernetes `NetworkPolicy` objects in production.

---

## 1. Zero-Trust Ingress & Egress Rules

| Tier | Port Block | Allowed Ingress | Allowed Egress | Internet Egress |
| :--- | :--- | :--- | :--- | :--- |
| **API Gateway** | `443` / `8080` | External Clients (HTTPS) | Front-Office (`8000-8099`), MinIO (`9000`) | Disabled |
| **Front-Office** | `8000-8099` | `api-gateway` ONLY | Middle-Office (`8100-8199`), Redpanda (`19092`), Postgres (`5432`), MinIO (`9000`) | **STRICTLY BLOCKED** |
| **Middle-Office**| `8100-8199` | Front-Office (`8000-8099`), Redpanda | Back-Office (`8200-8299`), Unified-Context (`9001`), Redpanda (`19092`), Postgres (`5432`) | **STRICTLY BLOCKED** |
| **Back-Office** | `8200-8299` | Middle-Office (`8100-8199`), Redpanda | Redpanda (`19092`), Postgres (`5432`), Local Volume Mounts | **STRICTLY BLOCKED** *(Except `resonance-webhook`)* |
| **Outbound Webhook**| `8206` | Back-Office Internal Mesh | External Partner Webhook Endpoints (`0.0.0.0/0`) | **PERMITTED (Egress Whitelisted)** |
| **Unified Context**| `9000-9099` | Front-Office & Middle-Office gRPC, Redpanda | Neo4j Bolt (`7687`), Postgres (`5432`), Redpanda (`19092`), MinIO (`9000`) | **STRICTLY BLOCKED** |

---

## 2. Direct-to-Store Upload Routing (MinIO Bypass)

To satisfy **Section 1.1** of the system requirements:
*   **Bypassing JVM Memory:** Large multi-part file uploads MUST NOT stream through Spring Boot application memory.
*   **Routing Flow:**
    1. Client requests presigned upload URL from `resonance-upload` via API Gateway.
    2. `resonance-upload` negotiates chunk metadata with MinIO and returns a presigned URL directly pointing to MinIO (`:9000`).
    3. Client uploads binary chunks directly to MinIO.
    4. Upon completion, MinIO notification or client confirmation triggers `DocumentUploadedEvent` into Redpanda.

---

## 3. Network Latency Budgets & SLA Constraints

To fulfill the mandatory **4.0-second SLA** for GraphRAG query cycles:

```
[Client] ---> (50ms) ---> [API Gateway]
                            │ (10ms gRPC)
                            ▼
                    [resonance-research]
                            │ (15ms gRPC)
                            ▼
                 [resonance-unified-context]
                 ├── Neo4j Subgraph Traversal:  ≤ 1200ms
                 ├── PostgreSQL Vector Scoring: ≤ 800ms
                 ├── Hybrid Reciprocal Rank:    ≤ 150ms
                 └── LLM Context Synthesis:     ≤ 1700ms
                 ──────────────────────────────────────
                 Total Query Latency Budget:    ≤ 3925ms (< 4.0s SLA)
```

---

## 4. Resilience4j Circuit Breaking & Timeout Rules

*   **gRPC Client Timeouts:** 
    *   Interactive queries: `2500ms` hard timeout.
    *   Batch queries / extraction: `30000ms` with asynchronous polling.
*   **Circuit Breaker Outlier Detection:**
    *   Failure rate threshold: `50%` over a sliding window of `20` calls.
    *   Slow call duration threshold: `3000ms`.
    *   Wait duration in open state: `10000ms` before half-open state transition.
*   **Dead-Letter Routing:** Payloads failing due to open circuit breakers are automatically diverted to the tenant-specific DLQ topic in Redpanda.
