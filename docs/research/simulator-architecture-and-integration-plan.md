# Research & Implementation Plan: ZKTeco Simulator (App vs. Web & Integration)

## 1. Executive Summary

This document presents a comprehensive evaluation of the `simulator/` codebase in the BITS project, examines how real-world ZKTeco biometric terminals integrate into attendance architectures, analyzes whether the simulator should be delivered as an **App (Desktop/Native)** or a **Web Application**, and outlines a phased **Implementation Plan** to integrate the simulator seamlessly into the BITS platform.

---

## 2. Deep-Dive: The `simulator/` Folder

The `simulator/` directory is an independent Git submodule ([`zkteco-simulator-app`](https://github.com/samananias/zkteco-simulator-app)) providing a software-defined emulation of a physical standalone ZKTeco biometric attendance terminal (such as K14, MB20, and SenseFace series).

### 2.1 Wire Protocol Fidelity
Unlike high-level API mocks, the simulator speaks the authentic **ZKTeco binary protocol over TCP port 4370**:
- **16-byte Packet Framing**:
  - Bytes 0–3: Fixed magic prefix `0x50, 0x50, 0x82, 0x7D` (`PP\x82\x7d`).
  - Bytes 4–7: Total length of the inner frame header + payload (32-bit LE).
  - Bytes 8–9: Command opcode (e.g., `CMD_CONNECT 1000`, `CMD_DATA_WRRQ 1503`, `CMD_USER_WRQ 8`).
  - Bytes 10–11: 16-bit one's complement checksum across frame and payload.
  - Bytes 12–13: Session ID assigned during handshake.
  - Bytes 14–15: Reply sequence ID.
- **Record Structures**:
  - 72-byte fixed user records (UID, role, password, name, cardno, userId).
  - 40-byte fixed attendance logs (userSn, deviceUserId, verifyType, packed timestamp, state).
  - 372-day year timestamp encoding:
    $$\text{timeInt} = [(\text{year} - 2000) \times 372 + (\text{month} - 1) \times 31 + (\text{day} - 1)] \times 86400 + (\text{hour} \times 3600 + \text{minute} \times 60 + \text{second})$$
- **Zero Backend Changes**:
  The BITS backend (`backend/src/shared/lib/zk-driver.ts`) uses `node-zklib@1.3.0`. The simulator passes the backend's exact call patterns with zero modifications.

### 2.2 Key Components
```
simulator/
├── src/
│   ├── protocol/          # Frame codec, checksum calculation, 72B/40B record layout codecs
│   ├── store/             # Memory and SQLite store implementations with standard seed profile
│   ├── core/
│   │   ├── engine.ts      # TCP socket listener on port 4370 handling ZKTeco commands
│   │   ├── http.ts        # HTTP REST + WebSocket server on port 3000/3030
│   │   ├── device.ts      # Hardware state machine (RTC clock, enabled status, LCD buffer)
│   │   └── events.ts      # In-process domain event bus
│   ├── web/               # Device-face Web UI (LCD clock, keypad, scan, enroll, bio admin)
│   └── biometric/         # Biometric service, consent ledger, template encryption (Phases 6–8)
├── sidecar/
│   └── MatcherSidecar.java# Java SourceAFIS 3.18 sidecar for ISO 19794-2 template matching
└── test/
    ├── unit/              # Golden-byte checksum & protocol unit tests
    └── integration/       # Real node-zklib oracle integration test suite (25/25 passing)
```

---

## 3. Real-World ZKTeco Biometric Integration Patterns

In production deployments, ZKTeco biometric terminals integrate with host attendance software via two distinct communication patterns:

| Dimension | Standalone Protocol (Port 4370 TCP/UDP) | ADMS Cloud Push Protocol (HTTP/HTTPS) |
| :--- | :--- | :--- |
| **Communication Direction** | **Server $\rightarrow$ Device** (Backend acts as Client, Device acts as Server) | **Device $\rightarrow$ Server** (Device initiates HTTP requests to Server) |
| **Transport Port** | Port `4370` (TCP default, UDP legacy fallback) | Port `80` / `443` or custom HTTP web port (e.g., `8069`) |
| **Network Requirement** | Local Area Network (LAN) or VPN tunnel; requires static device IP | Outbound internet access only; device pushes through standard NAT/firewall |
| **Data Synchronization** | **Pull & Push**: Backend queries device for logs (`CMD_DATA_WRRQ`), writes users (`CMD_USER_WRQ`), or listens for `EF_ATTLOG` | **Push**: Terminal sends HTTP POST payloads (`iclock/cdata`) with transaction records upon punch |
| **Hardware Control** | Full direct control over buzzer, LCD text, device time, and lock release | Restricted to commands returned in HTTP response headers |
| **BITS Platform Usage** | **Currently implemented in BITS via `zk-driver.ts`** | Suitable for multi-branch internet scenarios |

---

## 4. Evaluation: App vs. Web Architecture

Should the simulator be developed as a **Desktop Application** (e.g., Electron / Tauri) or a **Web Application** (Browser-based / Embedded)?

### 4.1 Comparative Matrix

| Evaluation Criteria | Native Desktop App (Electron / Tauri) | Web Application (Recommended) |
| :--- | :--- | :--- |
| **Ease of Access & Deployment** | Requires manual installation, OS-specific packaging (`.exe`, `.dmg`), and binary distributions. | **Zero install**. Accessible instantly from any browser on desktop, tablet, or smartphone. |
| **Kiosk & Physical Terminal Replica** | Can run full-screen on desktop OS only. | Can run full-screen in **Kiosk Mode** on any iPad, Android tablet, or monitor mounted at entrance gates. |
| **Optical / Webcam Biometric Capture** | Requires camera integration and native OS permissions. | Uses standard W3C `navigator.mediaDevices.getUserMedia()` API directly in browser. |
| **Embedding in BITS Admin Portal** | Cannot be rendered inside the BITS Next.js web application. | Can be embedded as an **interactive drawer, modal, or iframe** directly under `/admin/devices`. |
| **Container & CI/CD Suitability** | Difficult to execute headless inside Docker or GitHub Actions pipelines. | Runs seamlessly as a headless Node.js container service in `docker-compose.yml`. |
| **Hardware USB Scanner Support** | Can bind native C++ drivers for USB fingerprint readers (e.g., ZK4500/ZK9500). | Restricted to WebUSB or optical webcam scan; needs companion service for raw USB dongles. |

### 4.2 Architecture Decision: Hybrid Web Architecture
**We recommend a Web-Based Hybrid Architecture**:
1. **Headless Protocol Daemon (`simulator/src/index.ts`)**:
   - Runs in the background (via Node.js or Docker) listening on TCP `:4370` to serve the BITS backend seamlessly.
2. **Device-Face Web UI (`simulator/src/web/`)**:
   - Accessible on `http://localhost:3030` as a standalone full-screen terminal emulator with responsive controls for tablets, laptops, and mobile devices.
3. **Embedded BITS Admin Controls (`frontend/src/app/(admin)/devices/`)**:
   - Integrated into the BITS Admin portal so developers and HR staff can trigger 1-click simulated punches directly from employee lists or device cards without leaving the platform.

---

## 5. End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BITS Full-Stack Platform                        │
│                                                                        │
│   ┌───────────────────────────┐         ┌──────────────────────────┐   │
│   │   BITS Frontend (Next.js) │         │   BITS Backend (Express) │   │
│   │   - Admin Devices Page    │◄───────►│   - zk-driver.ts         │   │
│   │   - 1-Click Simulate Punch│         │   - zk-sync.service.ts   │   │
│   │   - Live LCD Device Mirror│         │   - SyncScheduler (30s)  │   │
│   └─────────────┬─────────────┘         └─────────────┬────────────┘   │
└─────────────────┼─────────────────────────────────────┼────────────────┘
                  │ HTTP / WebSocket                    │ TCP :4370
                  ▼                                     ▼ (Binary Protocol)
┌────────────────────────────────────────────────────────────────────────┐
│                        ZKTeco Simulator App                            │
│                                                                        │
│   ┌───────────────────────────┐         ┌──────────────────────────┐   │
│   │     HttpServer (:3030)    │         │  ProtocolEngine (:4370)  │   │
│   │  - REST API (/api/punch)  │         │  - CMD_CONNECT / AUTH    │   │
│   │  - WebSocket (/ws)        │         │  - CMD_DATA_WRRQ (Logs)  │   │
│   │  - Device-Face Web Kiosk  │         │  - CMD_USER_WRQ (Users)  │   │
│   └─────────────┬─────────────┘         └─────────────┬────────────┘   │
│                 │                                     │                │
│                 └──────────────────┬──────────────────┘                │
│                                    ▼                                   │
│                     ┌─────────────────────────────┐                    │
│                     │ Store (Memory / SQLite)     │                    │
│                     │ - Seed Users (1001..1005)   │                    │
│                     │ - Attendance Logs           │                    │
│                     └──────────────┬──────────────┘                    │
│                                    ▼                                   │
│                     ┌─────────────────────────────┐                    │
│                     │ MatcherSidecar (Port 28090) │                    │
│                     │ - SourceAFIS 3.18 Matching  │                    │
│                     └─────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Plan: Enhancing & Integrating the Simulator

### Phase 1: Environment Orchestration & Seed Alignment
- [ ] **Docker Compose Integration**:
  - Add `simulator` service to [`docker-compose.yml`](file:///c:/antigravity-proj/samananias-org/bits/docker-compose.yml) binding ports `4370:4370` (binary protocol) and `3030:3000` (device-face web UI).
  - Connect `simulator` to `bits_network` so BITS backend connects to host `simulator:4370`.
- [ ] **Database Pre-Seeding**:
  - Update `backend/prisma/seed.ts` to automatically create a default "Virtual ZKTeco Terminal" at `127.0.0.1:4370` (or `simulator:4370` in Docker).
  - Ensure seeded employees in BITS database have `zkId`s matching the simulator's standard seed profile (`1001`–`1005`).
- [ ] **Workspace Root Scripts**:
  - Add `npm run dev:simulator` and `npm run test:simulator` to root `package.json` for one-command developer workflow.

### Phase 2: In-App Simulator Controls in BITS Admin Portal
- [ ] **Simulate Punch Action Modal**:
  - In [`frontend/src/features/devices/components/DeviceCard.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/features/devices/components/DeviceCard.tsx), add a **"Simulate Scan"** button on virtual devices.
  - Modal allows selecting an employee, choosing scan type (Check-In, Check-Out, Overtime In, Overtime Out), and triggering a punch.
  - Backend route proxies or triggers the punch on the simulator via `POST http://<sim_host>:3030/api/punch`.
- [ ] **Virtual Device Face Launcher**:
  - Add an action to open the simulated terminal face (`http://localhost:3030`) in a dedicated browser tab or slide-out drawer for presentations and interactive kiosk demos.

### Phase 3: Real-Time Attendance Event Streaming (`EF_ATTLOG`)
- [ ] **Persistent Event Listener in `zk-driver.ts`**:
  - Real ZKTeco devices support `CMD_REG_EVENT (500)` with `EF_ATTLOG (1)`.
  - Implement real-time packet listener so punches register in the BITS database instantly rather than waiting for the 30-second polling cycle.
- [ ] **Frontend Live Feed Verification**:
  - Verify that simulated punches immediately propagate through WebSocket to the BITS Admin Dashboard.

### Phase 4: Biometric Optical Capture & Sidecar Alignment (Optional / Advanced)
- [ ] Verify optical camera fingerprint capture workflow using [`simulator/src/web/scan.html`](file:///c:/antigravity-proj/samananias-org/bits/simulator/src/web/scan.html).
- [ ] Test template extraction and matching with the Java SourceAFIS matcher sidecar (`MatcherSidecar.java`).
