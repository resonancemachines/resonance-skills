---
name: resonance-guardrail-auditor
description: >
  Specialized Architecture Guardrail Auditor & Continuous Governance skill for the Resonance Platform (https://github.com/resonancemachines).
  Activate this skill when auditing, diagnosing, verifying, or remediating the 14 executable architecture guardrails
  (GUARDRAILS.md & ADR-0009), inspecting multi-tenant fail-closed safety, Debezium WAL CDC outbox compliance,
  JPA entity integrity, REST DTO boundaries, gRPC deadline budgets, or SDLC hard gates.
license: Apache-2.0
---

# Resonance Guardrail Auditor Skill (`resonance-guardrail-auditor`)

Use this skill to audit, diagnose, and remediate the **14 Executable Architecture Guardrails** across all microservices and modules in the Resonance Platform.

Before running checks or implementing fixes, read [resonance-guardrail-auditor.mini.md](resonance-guardrail-auditor.mini.md) for fast triage and command references.
Use [resonance-guardrail-auditor.md](resonance-guardrail-auditor.md) for full failure recovery playbooks, deep root-cause analysis, and SDLC gate specifications.
Use [resonance-guardrail-auditor.nano.md](resonance-guardrail-auditor.nano.md) when auditing under tight context window limits.
