# Analysis: BITS & ZKTeco Simulator Integration

## 1. Architectural Compatibility Matrix

The table below assesses compatibility between each BITS biometric feature and the ZKTeco simulator:

| BITS Module / Method | ZKTeco Wire Operation | Simulator Support | Compatibility Status |
| :--- | :--- | :--- | :--- |
| `testDeviceConnection()` | `CMD_CONNECT`, `CMD_GET_FREE_SIZES`, `CMD_GET_TIME` | Fully implemented in `core/engine.ts` | **100% Compatible** |
| `syncZkData()` / `getLogs()` | `CMD_DATA_WRRQ (0x0D)` $\rightarrow$ 40 B dataset | Fully implemented with direct burst mode | **100% Compatible** |
| `getUsers()` | `CMD_DATA_WRRQ (0x09)` $\rightarrow$ 72 B dataset | Fully implemented with direct burst mode | **100% Compatible** |
| `setUser()` | `CMD_USER_WRQ (8)` with 72-byte payload | Unpacks 72-byte user structure into memory/SQLite | **100% Compatible** |
| `deleteUser()` | `CMD_DELETE_USER (18)` | Deletes user and associated fingerprint templates | **100% Compatible** |
| `setTime()` | `CMD_SET_TIME (202)` | Adjusts virtual device clock (UTC+8 / PHT) | **100% Compatible** |
| `clearAttendanceLogs()` | `CMD_CLEAR_ATTLOG (15)` | Empties attendance store and emits event | **100% Compatible** |
| `setFingerTemplate()` | 10-step `CMD_PREPARE_DATA` $\rightarrow$ `CMD_TMP_WRITE` | Full transaction handshake handled | **100% Compatible** |
| `getFingerTemplate()` | `CMD_USERTEMP_RRQ (9)` | Serves 6-byte entry header + template payload | **100% Compatible** |
| `clearUserFingerprints()` | `CMD_DELETE_USERTEMP (19)` across slots 0..9 | Slot-by-slot deletion handled | **100% Compatible** |
| `realtimeEvents` | `CMD_REG_EVENT (500)` $\rightarrow$ `EF_ATTLOG` (1) | Realtime event queuing and broadcast over TCP | **100% Compatible** |

---

## 2. End-to-End Data Flow Architecture

The diagram below illustrates how a punch triggered on the simulator flows through the entire BITS system into the PostgreSQL database and UI:

```
┌─────────────────────────────────┐
│     ZKTeco Simulator (App)      │
│  - Web UI (http://localhost:3030)│
│  - REST API (/api/punch)        │
└───────────────┬─────────────────┘
                │ 1. User scans finger / badge (e.g. userId: "1001")
                ▼
┌─────────────────────────────────┐
│   Simulator Protocol Engine     │
│   - Stores AttendanceRecord     │
│   - Serves TCP :4370            │
└───────────────┬─────────────────┘
                │ 2. TCP :4370 Poll every 30s (or manual "Sync Now")
                ▼
┌─────────────────────────────────────────────────────────┐
│                    BITS Backend                         │
│  [SyncScheduler]                                        │
│         │                                               │
│         ▼                                               │
│  [syncSingleDevice()]                                   │
│         │ calls zk.getLogs()                            │
│         ▼                                               │
│  [convertPHTtoUTC(log.recordTime)]                      │
│         │                                               │
│         ▼                                               │
│  [prisma.employee.findUnique({ zkId: 1001 })]           │
│         │                                               │
│         ▼                                               │
│  [prisma.attendanceLog.create({ ... })]                 │
│         │                                               │
│         ▼                                               │
│  [processAttendanceLogs()]                              │
│         │ Matches checkIn / checkOut against Shift      │
│         │ Calculates late / undertime / overtime        │
│         ▼                                               │
│  [prisma.attendance.upsert({ ... })]                    │
└───────────────┬─────────────────────────────────────────┘
                │ 3. Database Updated (PostgreSQL)
                ▼
┌─────────────────────────────────┐
│      BITS Frontend (Next.js)    │
│  - Admin Attendance Table       │
│  - Employee Portal Dashboard    │
│  - Real-time SSE Status Stream  │
└─────────────────────────────────┘
```

---

## 3. Deep Analysis of Critical Integration Points

### 3.1 Watermark & Duplicate Protection
- **BITS Mechanism**: `syncSingleDevice` fetches logs newer than `device.lastSyncedAt` (or a 48-hour fallback window).
- **Simulator Behavior**: When `addAttendance` is called on the simulator, it timestamps the record using `device.now()`.
- **Key Insight**: Because the simulator implements `CMD_SET_TIME`, running `syncAllDeviceClocks()` in BITS ensures the simulator clock is perfectly synchronized with the host server clock, preventing watermark skip errors.

### 3.2 Employee Matching by `zkId`
- In `backend/src/modules/devices/zk/zk-sync.service.ts`:
  ```typescript
  const zkUserId = parseInt(log.deviceUserId);
  const employee = await prisma.employee.findUnique({
      where: { zkId: zkUserId }
  });
  ```
- If an employee with `zkId === zkUserId` does **not** exist in PostgreSQL, the punch is logged as skipped to prevent ghost employee creation.
- **Integration Requirement**: Any simulated user created or seeded in the simulator (e.g., `1001`) must have a corresponding record in the BITS `Employee` table with `zkId = 1001`, or BITS employees must be pushed into the simulator via `npm run sync-employees`.

### 3.3 Port Allocation & Networking Configuration

| Component | Default Port | Conflict Risk | Recommended Resolution |
| :--- | :---: | :---: | :--- |
| **BITS Frontend** | `3000` (mapped `3013`) | **High** (Simulator defaults to `3000`) | Set `ZK_HTTP_PORT=3030` on Simulator |
| **BITS Backend** | `3001` (mapped `4013`) | None | Keep `PORT=3001` |
| **BITS PostgreSQL**| `5432` (mapped `5013`) | None | Keep default |
| **Simulator TCP** | `4370` | Low (standard ZKTeco port) | Keep `ZK_TCP_PORT=4370` |
| **Simulator HTTP**| `3000` | **High** | Set `ZK_HTTP_PORT=3030` |

#### Docker Networking vs Localhost
- **When running locally (bare Node.js)**:
  - Simulator binds `0.0.0.0:4370` (TCP) and `0.0.0.0:3030` (HTTP).
  - BITS backend connects to `127.0.0.1:4370`.
  - Browser accesses BITS at `http://localhost:3000` and Simulator Web Face at `http://localhost:3030`.
- **When running in Docker Compose**:
  - Simulator runs as a service named `simulator`.
  - BITS backend connects to `simulator:4370` via Docker's bridge network (`bits_network`).
  - Simulator ports can be exposed to host as `4370:4370` and `3030:3000`.

---

## 4. Biometric Template Synchronization Analysis

BITS handles fingerprint enrollment in two modes:
1. **Direct Terminal Enrollment**: BITS sends `CMD_STARTENROLL` with badge ID and finger index (0..9). The user presses their finger 3 times on the physical glass.
2. **Centralized Template Push (`sync-biometrics`)**: Templates stored in Postgres (`EmployeeFingerprintEnrollment`) are pushed across all terminals using:
   ```
   CMD_DISABLEDEVICE (1003)
     └─► CMD_PREPARE_DATA (1500)
           └─► CMD_DATA (1501)
                 └─► CMD_CHECKSUM_BUFFER (119)
                       └─► CMD_TMP_WRITE (87)
                             └─► CMD_FREE_DATA (1502)
                                   └─► CMD_REFRESHDATA (1013)
                                         └─► CMD_ENABLEDEVICE (1002)
   ```
- **Simulator Support**: The simulator's `ProtocolEngine` handles this entire handshake in `core/engine.ts`. When `CMD_TMP_WRITE` is received, it extracts the biometric payload, stores it in `Store.saveTemplate`, and responds with `CMD_ACK_OK`.
- Furthermore, BITS `hasFingerTemplate()` immediately verifies written templates using `CMD_USERTEMP_RRQ (9)`, which the simulator answers with the full 6-byte template entry header and data payload.

---

## 5. Potential Pitfalls and Safeguards

1. **Simulator HTTP Port Collision**:
   - Running `npm run dev` in `simulator` without setting `ZK_HTTP_PORT` will crash if the Next.js dev server is already running on port 3000.
   - *Safeguard*: Provide an `.env` or npm script in the simulator defaulting `ZK_HTTP_PORT` to `3030`.
2. **Missing `zkId` on Seed Employees**:
   - Default BITS seeder (`backend/prisma/seed.ts`) seeds Admin and HR accounts with `preferredZkId: null` because administrators do not punch in.
   - If test punches are made using `userId: 1001`, BITS will skip them unless an employee has `zkId: 1001`.
   - *Safeguard*: Provide a dedicated seed script or automated pairing between BITS employees and simulator users.
3. **Submodule Clones in Deployment**:
   - Because `simulator` is a git submodule, CI/CD and Docker builds must initialize submodules (`git submodule update --init --recursive`).
