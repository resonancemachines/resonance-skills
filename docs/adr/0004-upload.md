# ADR 0004: Direct-to-Store Resumable Uploads

## Status
Accepted

## Context
Architecting for extreme network instability requires treating every byte transfer as an inherently hostile operation. At the scale of global consumer platforms, connections drop, mobile networks partition, and VPNs reset mid-byte.

To guarantee resumability for massive files without forcing the user to restart from zero, we must explicitly separate the **Control Plane** (Session & Chunk State) from the **Data Plane** (Blob Storage).

Here is the blueprint for a highly resilient, state-tracked resumable upload architecture.

### 1. Executive Summary: High-Level Architectural Decision Matrix

| Dimension | Architectural Decision | Justification |
| --- | --- | --- |
| **Operational Overhead** | **PostgreSQL State + MinIO Multipart** | We use MinIO for the heavy lifting of byte storage (Data Plane) and PostgreSQL for ACID-compliant tracking of chunk statuses (Control Plane). This prevents the need to repeatedly query MinIO's `ListParts` API during reconnects. |
| **Scalability Boundaries** | **Idempotent Chunking** | Clients can aggressively retry uploading Chunk 42. MinIO’s S3 API inherently overwrites parts with the same part number. The backend safely executes `ON CONFLICT DO NOTHING` when updating the PostgreSQL chunk array. |
| **Multi-Tenancy Isolation** | **Composite Keys & Row-Level Security** | The `upload_sessions` table uses a composite key of `(tenant_id, session_id)`. RLS policies ensure a compromised client cannot enumerate or resume another tenant's upload session. |
| **Developer Velocity** | **Explicit Resume Handshakes** | By exposing a dedicated `GET /resume` endpoint that returns the exact array of missing chunks, frontend engineers can implement simple, declarative loop logic for chunk processing. |

---

### 2. The Stack Breakdown

* **Edge / Client:** The browser utilizes the HTML5 `File.slice()` API to split the file into deterministic, fixed-size chunks (e.g., 5MB). It calculates a SHA-256 hash for each chunk and a master hash for the file.
* **Control Plane (Compute):** Java 21 / Spring Boot. Exposes the session lifecycle APIs (`Init`, `GetState`, `Complete`).
* **State Tracking (PostgreSQL):** Stores the `UploadSession` entity. Instead of a massive array, we utilize a PostgreSQL `integer[]` or a `JSONB` set to track the acknowledged chunk indices (e.g., `[1, 2, 3, 5]`).
* **Data Plane (MinIO):** Receives the raw chunk bytes directly via Presigned URLs.
* **Event Orchestration (Redpanda):** Upon final assembly, the Spring Boot service writes an `UploadCompletedEvent` via the Outbox Pattern to trigger the asynchronous vectorization and GraphRAG processing pipelines.

---

### 3. Resilience & Multi-Tenancy Strategy

**The "Hostile Network" Recovery Workflow:**

1. **Network Drop:** The user's internet disconnects while uploading chunk 5 of 640.
2. **Reconnection & Discovery:** The client's exponential backoff triggers a reconnect. The client issues a `GET /api/v1/uploads/{sessionId}/resume`.
3. **State Reconciliation:** The Spring Boot backend queries PostgreSQL. It identifies that chunks 1, 2, 3, and 4 are complete. Chunk 5 is missing.
4. **Targeted Resumption:** The client requests a new Presigned URL *only* for chunk 5 and resumes the upload loop.

**Checksum Verification (Integrity at Rest):**
A network drop can corrupt inflight packets. When the client uploads a chunk to MinIO via the presigned URL, it must include the `Content-MD5` or `x-amz-checksum-sha256` header. MinIO computes the hash on the fly. If the hash doesn't match the received bytes, MinIO drops the chunk, returns a 400 error, and the client natively retries that specific chunk.

---
