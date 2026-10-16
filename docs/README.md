# BITS Documentation Hub

Welcome to the internal engineering documentation directory for the **BITS (Biometric Attendance Management System)** project.

This directory contains research, architectural analysis, implementation guides, and future roadmap specifications.

> **Note**: This `docs/` directory is listed in `.gitignore` to allow extensive internal developer documentation, local environment guides, and drafts without polluting version control commits.

---

## Directory Overview

```
docs/
├── README.md                                      # Documentation index and directory map
├── research/
│   ├── zkteco-simulator-research.md               # Full protocol and simulator engine analysis
│   └── simulator-architecture-and-integration-plan.md # App vs Web evaluation & phased integration plan
├── analysis/
│   └── system-integration-analysis.md             # Integration analysis with BITS backend & frontend
├── guides/
│   ├── implementation-and-integration-guide.md    # Step-by-step setup, configuration & testing guide
│   ├── virtual-zkteco-terminal-guide.md           # User & operator manual for Virtual ZKTeco Terminal
│   └── simulator-cloud-deployment-guide.md        # Cloud deployment guide for Vercel, Neon, Railway & VPS
└── goals/
    └── future-features-and-roadmap.md             # Short, medium, and long-term goals & future features
```

---

## Documents Summary

### 1. [Research: ZKTeco Simulator Deep-Dive](file:///c:/antigravity-proj/samananias-org/bits/docs/research/zkteco-simulator-research.md)
- Explains the ZKTeco standalone terminal binary wire protocol over TCP port 4370.
- Decodes packet structures (8-byte TCP prefix, 8-byte frame header, payload format, checksum variants).
- Explores dataset encoding (72-byte user record, 40-byte attendance log, 32-byte event record, fingerprint template storage).
- Reviews simulator architecture: protocol engine, store layer (memory & sqlite), HTTP/WebSocket layer, and device-face web UI.

### 2. [Research & Plan: Simulator Architecture & Integration Plan](file:///c:/antigravity-proj/samananias-org/bits/docs/research/simulator-architecture-and-integration-plan.md)
- Trade-off evaluation between Native Desktop App (Electron/Tauri) vs. Web Application.
- Recommends a Hybrid Web Architecture (headless TCP protocol engine + responsive web terminal kiosk + BITS Admin embedded controls).
- End-to-end data flow and multi-phase implementation roadmap.

### 3. [Analysis: System Integration Analysis](file:///c:/antigravity-proj/samananias-org/bits/docs/analysis/system-integration-analysis.md)
- Compares BITS `ZKDriver` (`backend/src/shared/lib/zk-driver.ts`) with simulator wire protocol capabilities.
- Details the attendance sync cycle (`SyncScheduler` -> `syncZkData` -> `prisma.attendanceLog` -> `processAttendanceLogs`).
- Evaluates biometric enrollment and fingerprint template push/pull sequences (`CMD_PREPARE_DATA` -> `CMD_DATA` -> `CMD_TMP_WRITE`).
- Analyzes port conflict risks (e.g. Frontend :3000 vs Simulator default :3000) and networking topology in Docker vs Localhost.

### 4. [Guides: Implementation & Integration Guide](file:///c:/antigravity-proj/samananias-org/bits/docs/guides/implementation-and-integration-guide.md)
- Quickstart guide for running the simulator standalone or inside Docker Compose.
- Configuration reference for simulator environment variables (`ZK_TCP_PORT`, `ZK_HTTP_PORT`, `ZK_STORE`, `ZK_SEED`).
- Instructions for registering the simulator in BITS as a virtual device.
- Testing workflows: connection test, syncing users to the device, triggering punches, and validating attendance records in the BITS Admin portal.

### 5. [Goals: Future Features & Roadmap](file:///c:/antigravity-proj/samananias-org/bits/docs/goals/future-features-and-roadmap.md)
- Milestone roadmap:
  - **Phase 1: Zero-Hardware Local Dev & QA (Immediate)** — Docker service, seed synchronization, end-to-end punch verification.
  - **Phase 2: Realtime Push Sync (Near-term)** — Replacing 30-second polling with instant `EF_ATTLOG` socket streaming.
  - **Phase 3: Multi-Terminal Simulation (Medium-term)** — Simulating separate Entrance and Exit turnstiles/devices.
  - **Phase 4: Admin UI Simulator Control Panel (Feature)** — Direct trigger buttons from BITS Admin UI to simulate scans.
  - **Phase 5: Automated E2E CI/CD Testing Pipeline** — Running headless integration tests against simulated hardware.
