# Goals: Future Features & Simulator Integration Roadmap

This document outlines the strategic engineering roadmap and proposed future features for integrating the ZKTeco simulator into the BITS biometric platform.

---

## 1. Roadmap Overview

```
Phase 1: Zero-Hardware Dev Setup (Immediate)
   ├─► Docker Compose service integration
   ├─► Pre-seeded Virtual Device in database
   └─► Root npm scripts for seamless development
         │
         ▼
Phase 2: Real-time Event Streaming (Near-term)
   ├─► TCP event listener with EF_ATTLOG
   ├─► Instant check-in/out without 30s poll delay
   └─► Live WebSocket UI broadcast to dashboards
         │
         ▼
Phase 3: Multi-Terminal Simulation (Medium-term)
   ├─► Multi-device topologies (Entrance vs Exit)
   ├─► Biometric exclusion rule verification
   └─► DeviceSyncTask offline queue & dead-letter testing
         │
         ▼
Phase 4: In-App Simulator Controls (Developer UI)
   ├─► Embedded Simulator controls inside Admin Portal
   └─► 1-Click "Simulate Scan" in Employee Profile
         │
         ▼
Phase 5: Automated E2E CI/CD Testing Pipeline
   └─► Headless integration test suite for GitHub Actions
```

---

## 2. Phase 1: Zero-Hardware Local Dev & QA (Immediate)

### Goal: Any developer can clone the repo and test biometric attendance immediately without physical hardware.

1. **Docker Compose Service Addition**:
   - Add the `simulator` service to `docker-compose.yml` and `docker-compose.prod.yml`.
   - Expose the device protocol on `4370` and the web UI on `3030`.
2. **Pre-Seeded Virtual Device**:
   - Update `backend/prisma/seed.ts` to automatically register the "Virtual ZKTeco Terminal" at `127.0.0.1:4370` (or Docker hostname `simulator:4370`).
3. **Aligned Test Employees**:
   - Ensure seeded employees in BITS (e.g., `zkId: 1001` through `1005`) match the simulator's built-in standard seed profile, allowing immediate punch testing out of the box.
4. **Convenience Root Scripts**:
   - Add `npm run dev:simulator` and `npm run test:simulator` to the root workspace `package.json`.

---

## 3. Phase 2: Real-time Event Streaming (`EF_ATTLOG`)

### Goal: Transition from 30-second polling to instant sub-second attendance logging.

1. **Background**:
   - Real ZKTeco devices and the simulator support `CMD_REG_EVENT (500)` with `EVENTS.EF_ATTLOG (1)`.
   - When a user punches, the device proactively emits an event packet over the existing TCP socket.
2. **Implementation**:
   - Update `backend/src/shared/lib/zk-driver.ts` to support persistent event listeners via `zk.getRealTimeLogs()`.
   - Maintain a persistent daemon connection to active devices.
   - When an `EF_ATTLOG` packet arrives, immediately create the `AttendanceLog` and emit an event over `deviceEmitter`.
3. **Benefits**:
   - Instant employee feedback on the portal dashboard.
   - Drastically reduces periodic polling traffic on the network.
   - Fall back to the 30-second poll only if the connection drops.

---

## 4. Phase 3: Multi-Terminal Topologies & Network Resilience Testing

### Goal: Validate complex real-world branch setups and edge cases.

1. **Multi-Terminal Simulation**:
   - Run multiple simulator instances:
     - `Terminal 1` (Port 4370): **Main Entrance Turnstile** (`checkInDeviceId`).
     - `Terminal 2` (Port 4371): **Exit Gate Turnstile** (`checkOutDeviceId`).
     - `Terminal 3` (Port 4372): **Branch Makati Terminal**.
2. **Biometric Exclusion Rules**:
   - Verify that when an employee has a `DeviceBiometricExclusion` record on Terminal 2, they cannot check out through Terminal 2.
3. **Network Failure & Offline Resilience**:
   - Test `DeviceSyncTask` retry queue: intentionally pause the simulator, perform user edits in BITS, verify tasks enter `PENDING` $\rightarrow$ `FAILED`, unpause the simulator, and test `drainDeviceQueues()` / `retryDeviceDeadLetters()`.

---

## 5. Phase 4: In-App Simulator Controls in Admin UI

### Goal: Empower QA and HR administrators to trigger simulated scans directly from the BITS web application.

1. **Virtual Punch Modal in Admin Portal**:
   - Under `/admin/devices`, add a **Simulate Punch** action for any virtual device.
   - Select an employee from a searchable dropdown, choose punch type (Check In, Check Out, Overtime In, Overtime Out), and click "Trigger Scan".
   - The backend calls `http://simulator:3000/api/punch` internally.
2. **Device Face Embed**:
   - Add a tab to open the simulated terminal face directly within an administrative drawer/modal for presentations and demos.

---

## 6. Phase 5: Automated E2E CI/CD Test Pipeline

### Goal: 100% automated regression testing on every pull request without human intervention.

1. **Automated Suite Flow**:
   ```
   1. Spin up ephemeral PostgreSQL & ZKTeco Simulator in GitHub Actions
   2. Run Prisma migrations and seed matching test employees & shifts
   3. Trigger Morning Check-In punch at 07:55 AM via simulator REST API
   4. Trigger BITS sync cycle
   5. Assert Attendance record created with:
      - status: "present"
      - lateMinutes: 0
      - checkInDeviceId: matching device ID
   6. Trigger Afternoon Check-Out punch at 17:05 PM
   7. Assert Attendance record finalized with:
      - totalHours: 8.0+
      - undertimeMinutes: 0
   8. Tear down containers cleanly
   ```
2. **Coverage**:
   - Shift rules (Regular, Grace Period, Night Shift crossover).
   - Anomaly detection (Missing check-out, early departure).
   - Overtime automatic calculations.
