# Agent & Service Routing Topology

This document defines the strict network boundaries, port allocations, and traffic flow permissions for the Resonance microservice mesh. Adherence is mandatory for local `docker-compose` environments and translates directly into Kubernetes `NetworkPolicy` constraints in production.

## 1. Global Routing Rules

1.  **Zero-Trust Ingress:** ONLY the `api-gateway` may expose a port (HTTPS/443 or 8080 locally) to the external network.
2.  **Internal Protocol:** All synchronous inter-service communication MUST use gRPC over HTTP/2.
3.  **Asynchronous State:** All state mutations MUST be routed through Redpanda (Port `19092`).
4.  **Egress Restriction:** ONLY `resonance-webhook` is granted internet egress rights to communicate with 3rd-party systems.

## 2. Tiered Port Allocations

To prevent `address already in use` errors during local development and to enforce logical boundaries, services are assigned strict port blocks.

### 2.1 Front-Office (Sensory / Edge Layer)
**Port Block:** `8000 - 8099`
**Ingress From:** `api-gateway` ONLY.
**Egress To:** `middle-office` (gRPC), Redpanda, Local Postgres.

| Service Name | Local gRPC Port | Prometheus Metrics |
| :--- | :--- | :--- |
| `resonance-action` | 8001 | 8001/actuator/prometheus |
| `resonance-delivery` | 8002 | 8002/actuator/prometheus |
| `resonance-download` | 8003 | 8003/actuator/prometheus |
| `resonance-notification`| 8004 | 8004/actuator/prometheus |
| `resonance-research` | 8005 | 8005/actuator/prometheus |
| `resonance-support` | 8006 | 8006/actuator/prometheus |
| `resonance-ticket` | 8007 | 8007/actuator/prometheus |
| `resonance-upload` | 8008 | 8008/actuator/prometheus |

### 2.2 Middle-Office (Governance & Saga Layer)
**Port Block:** `8100 - 8199`
**Ingress From:** `front-office` (gRPC), Redpanda.
**Egress To:** `back-office` (gRPC), Redpanda, Local Postgres.

| Service Name | Local gRPC Port | Prometheus Metrics |
| :--- | :--- | :--- |
| `resonance-approval` | 8101 | 8101/actuator/prometheus |
| `resonance-control` | 8102 | 8102/actuator/prometheus |
| `resonance-crypto` | 8103 | 8103/actuator/prometheus |
| `resonance-entitlement`| 8104 | 8104/actuator/prometheus |
| `resonance-performance`| 8105 | 8105/actuator/prometheus |
| `resonance-policy` | 8106 | 8106/actuator/prometheus |
| `resonance-skills` | 8107 | 8107/actuator/prometheus |
| `resonance-workflow` | 8108 | 8108/actuator/prometheus |
| `resonance-meta` | 8109 | 8109/actuator/prometheus |

### 2.3 Back-Office (System of Record Layer)
**Port Block:** `8200 - 8299`
**Ingress From:** `middle-office` (gRPC), Redpanda.
**Egress To:** Redpanda, Local Postgres, Internet (Webhook ONLY).

| Service Name | Local gRPC Port | Prometheus Metrics |
| :--- | :--- | :--- |
| `resonance-billing` | 8201 | 8201/actuator/prometheus |
| `resonance-compute` | 8202 | 8202/actuator/prometheus |
| `resonance-event` | 8203 | 8203/actuator/prometheus |
| `resonance-org` | 8204 | 8204/actuator/prometheus |
| `resonance-report` | 8205 | 8205/actuator/prometheus |
| `resonance-webhook` | 8206 | 8206/actuator/prometheus |

### 2.4 Unified Context (Semantic Layer)
**Port Block:** `9000 - 9099`
**Ingress From:** `middle-office` (gRPC), `front-office` (gRPC), Redpanda.
**Egress To:** Neo4j, Redpanda, Local Postgres.

| Service Name | Local gRPC Port | Prometheus Metrics |
| :--- | :--- | :--- |
| `resonance-unified-context` | 9001 | 9001/actuator/prometheus |

## 3. Infrastructure Component Ports (Local)

*   **Redpanda (Kafka API / Admin API):** `19092` / `9644`
*   **Apicurio Registry 3.x (Event Schema Governance):** `8086`
*   **PostgreSQL:** `5432`
*   **Neo4j (Bolt/HTTP):** `7687` / `7474`
*   **MinIO (S3 API/Console):** `9000` / `9001`
*   **OpenTelemetry Collector:** `4317` (gRPC) / `4318` (HTTP)