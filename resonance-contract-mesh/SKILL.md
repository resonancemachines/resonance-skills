---
name: resonance-contract-mesh
description: >
  Specialized Contract-First Event Mesh, Schema Registry & Domain Catalog governance skill for the Resonance Platform (https://github.com/resonancemachines).
  Activate this skill when defining or modifying AsyncAPI 3.0 channel specifications, Protocol Buffers (`proto3`) event schemas,
  Apicurio Registry 3.x (:8086) artifacts, Transactional Outbox CDC configurations, Domain Aggregate Root Catalogs,
  or multi-tenant partition key routing policies (DomainPartitionKey, salting, skew mitigation).
  Enforces ADR-0001, ADR-0008, ADR-0010, and ADR-0011.
license: Apache-2.0
---

# Resonance Contract Mesh Skill (`resonance-contract-mesh`)

Use this skill when designing, publishing, consuming, or governing asynchronous event streams, schema contracts, Transactional Outbox tables, and partition topologies across the Resonance mesh.

Before making event or schema design decisions, read and apply [resonance-contract-mesh.mini.md](resonance-contract-mesh.mini.md).
Use [resonance-contract-mesh.md](resonance-contract-mesh.md) for full reference code templates and in-depth explanations, and [resonance-contract-mesh.nano.md](resonance-contract-mesh.nano.md) when working under strict context budget constraints.
