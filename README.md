# Resonance Platform Agent Skills Suite

[![skills.sh](https://skills.sh/b/resonancemachines/resonance-skills)](https://skills.sh/resonancemachines/resonance-skills)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

<div align="center">
  <h1 align="center">Resonance Platform Agent Skills Suite</h1>
  <p align="center">
    <strong>Production-grade Agent Skills & Architectural Invariants</strong> for <strong>Antigravity</strong>, <strong>Claude Code</strong>, <strong>Cursor</strong>, and <strong>Codex</strong>.
  </p>
  <p align="center">
    Built for Enterprise Microservices Architecture (MSA), Event-Driven Meshes, Apicurio Registry 3.x, and Twelve-Factor Cloud-Native Reliability across <a href="https://github.com/resonancemachines">Resonance Machines</a>.
  </p>

  <p align="center">
    <a href="#about">About</a>
    ·
    <a href="#installation-as-skills">Installation</a>
    ·
    <a href="#skills-matrix">Skills Matrix</a>
    ·
    <a href="#architectural-invariants">Architectural Invariants</a>
    ·
    <a href="#license">License</a>
  </p>
</div>

---

## About

`resonance-skills` provides universal, battle-tested AI coding agent skills and architecture guardrails distilled from production experience on the **Resonance Platform**.

Each skill is authored in three tool-agnostic Markdown versions to balance context window usage:
- **`mini`**: Recommended version for everyday development, features, and refactoring.
- **`nano`**: Ultra-compact rule set designed for strict context limits and always-on system prompts.
- **`full` (`.md`)**: Canonical reference documentation, code templates, and in-depth architectural rationale.

---

## Installation as Skills

Prerequisite: Node.js (with `npm`/`npx`). You do not need to install anything globally.

### Option A: Using the open `skills` CLI (Recommended)

Install all Resonance Platform skills into your current project:
```bash
npx skills add resonancemachines/resonance-skills --all
```

List available skills without installing:
```bash
npx skills add resonancemachines/resonance-skills --list
```

Install a single selected skill:
```bash
npx skills add resonancemachines/resonance-skills --skill resonance-developer
# or
npx skills add resonancemachines/resonance-skills --skill resonance-contract-mesh
```

Install globally (available across all projects on your machine):
```bash
npx skills add resonancemachines/resonance-skills -g --all
```

---

### Option B: Standalone Zero-Dependency Installer

Run the included runner directly without third-party dependencies:
```bash
# Project-local installation (.agent/skills/)
npx github:resonancemachines/resonance-skills

# Machine-global installation (~/.gemini/config/skills/)
npx github:resonancemachines/resonance-skills -g
```

---

## Skills Matrix

| Skill | Entrypoint | Full Reference | Mini (Daily Tasks) | Nano (Tight Context) | Focus Area |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`resonance-developer`** | [`SKILL.md`](resonance-developer/SKILL.md) | [`full`](resonance-developer/resonance-developer.md) | [`mini`](resonance-developer/resonance-developer.mini.md) | [`nano`](resonance-developer/resonance-developer.nano.md) | 9 Architectural Invariants, 12-Factor MSA, Spec-Config-Code Triad, JPA Safety, 14 Guardrails |
| **`resonance-contract-mesh`** | [`SKILL.md`](resonance-contract-mesh/SKILL.md) | [`full`](resonance-contract-mesh/resonance-contract-mesh.md) | [`mini`](resonance-contract-mesh/resonance-contract-mesh.mini.md) | [`nano`](resonance-contract-mesh/resonance-contract-mesh.nano.md) | AsyncAPI 3.0, Protobuf (`proto3`), Apicurio Registry 3.x, OpenMetadata Catalog, DDIA Ch. 6 Salting |

---

## Architectural Invariants (Overview)

The skills bundled in this suite enforce the 9 non-negotiable architectural invariants of the Resonance Platform:

1. **No Two-Phase Commit (`GR-03`):** Choreographed Sagas with compensating transactions & Transactional Outbox CDC (`ADR-0001`).
2. **Fail-Closed Multi-Tenant Isolation (`GR-01`):** Zero `"default-tenant"` placeholders in production code; mandatory `TenantGuard.requireTenantId(...)`.
3. **Zero Plaintext PII in Mesh:** Sensory-edge tokenization via `resonance-crypto`.
4. **Database-Per-Service:** Zero cross-service SQL joins; inter-service communication strictly via gRPC (`proto3`) or Redpanda topics.
5. **Deterministic Classpaths:** Strict BOM-managed dependencies (`resonance-bom`); zero explicit `<version>` tags.
6. **Spring Architecture & DTO Isolation (`GR-08`, `GR-09`):** Constructor injection only; `open-in-view=false`; zero raw `@Entity` in REST endpoints (use Java 21 `record` DTOs).
7. **JPA Entity Integrity (`GR-10`, `GR-11`):** No `@Data` on `@Entity`, strictly `LAZY`, wrapper `Long version`, explicit `precision`/`scale` on `BigDecimal`.
8. **REST Information Security & Deserialization (`GR-12`, `GR-13`):** No unpaged `findAll()`, zero `ex.getMessage()` leakage in 500 handlers, zero wildcard `*` in Kafka trusted packages.
9. **gRPC Client Timeout Budgeting (`GR-14`):** Client-side `.withDeadlineAfter(...)` on all `BlockingStub` calls.

---

## Compatibility

| Environment | Supported Location | Discovery Mode |
| :--- | :--- | :--- |
| **Google Antigravity** | `.agent/skills/` or `~/.gemini/config/skills/` | Automatic via `SKILL.md` |
| **Claude Code** | `.claude/skills/` or `.agent/skills/` | Auto-detected |
| **Cursor** | `.cursor/rules/` | Load via `mini` or `nano` |
| **Codex / OpenCode** | `AGENTS.md` or `.agent/skills/` | Standard Markdown entrypoint |

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).  
Copyright 2026 [Resonance Machines](https://github.com/resonancemachines).
