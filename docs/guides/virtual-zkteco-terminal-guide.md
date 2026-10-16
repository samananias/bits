# Virtual ZKTeco Attendance Terminal Guide

A high-fidelity software simulator of the **ZKTeco K14 standalone biometric attendance terminal** implementing the ZKTeco binary protocol over TCP (`:4370`) and an administrative control & inspection REST API (`:3030`).

---

## 1. System Overview & Purpose

### What is the Virtual ZKTeco Terminal?
The Virtual ZKTeco Terminal is a standalone software service that behaves identically to a physical ZKTeco K14 time-and-attendance clock on the network. It allows engineering, QA, and security teams to develop, test, and run the BITS attendance system without requiring physical hardware or handling real human biometric samples.

### Key Capabilities
1. **ZKTeco Protocol v1 Server**: Listens on raw TCP port `4370` and responds to standard ZKTeco client libraries (`node-zklib@1.3.0`, `pyzk-0.9`) with byte-for-byte protocol framing.
2. **Deterministic Synthetic Biometrics**: Generates safe, non-personal synthetic template data conforming to ZKFinger VX 10.0 wire specifications without cameras or biometric risks.
3. **Timezone Preservation**: Encodes and decodes terminal clocks strictly in Philippine Standard Time (`Asia/Manila`, UTC+8) to eliminate timezone offset bugs.
4. **Hardware Realism (M3)**: Implements device-side duplicate punch suppression, memory capacity limits, table-driven verification rules, device admin roles, and real-time event broadcasting (`EF_ATTLOG`).
5. **Interactive Fault Injection**: Allows automated test harnesses and operators to simulate dropped connections, latency, command failures, and network partitions via REST.
6. **Device-Face Web UI**: An interactive browser interface at `http://localhost:3030/` featuring an animated LCD screen, interactive keypad, and virtual scanner.

---

## 2. Architecture & Ports

```
┌────────────────────────────────────────────────────────┐
│                   BITS Backend                         │
│  - ZKDriver (node-zklib@1.3.0 TCP)                     │
│  - SyncScheduler / ZKSyncService                       │
└───────────────┬────────────────────────▲───────────────┘
  (TCP :4370)   │ Raw Binary Protocol    │ (HTTP :3030)
  Commands:     │ (Connect, Read, Write) │ Admin REST &
  USERTEMP,     │                        │ Simulate Punch
  GET_SIZES     ▼                        │
┌────────────────────────────────────────┴───────────────┐
│              Virtual ZKTeco Terminal                   │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │ Protocol Engine (:4370)│  │ HTTP / REST (:3030)  │  │
│  └────────────┬───────────┘  └──────────┬───────────┘  │
│               │                         │              │
│               ▼                         ▼              │
│      ┌────────────────────────────────────────┐        │
│      │ In-Memory or SQLite Store (Users, Logs)│        │
│      └────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────┘
```

### Network Ports
| Port | Protocol | Purpose | Default Host Binding |
|---|---|---|---|
| `4370` | Raw TCP | ZKTeco standalone hardware protocol | `0.0.0.0` (Container internal / localhost) |
| `3030` | HTTP / WS | Web dashboard & administrative REST API | `0.0.0.0` (Container internal / localhost) |

---

## 3. Feature Reference & Instructions

### Feature 1: Terminal Startup & Configuration
- **Purpose**: Boot the virtual device with configurable profile limits, network ports, and storage backends.
- **Environment Variables**:
  - `ZK_TCP_PORT` (default: `4370`): TCP port for the binary protocol.
  - `ZK_HTTP_PORT` (default: `3030`): HTTP port for REST and Web UI.
  - `ZK_STORE` (`memory` or `sqlite`, default: `memory`): Data persistence layer.
  - `ZK_TIME_ZONE` (default: `Asia/Manila`): Device calendar timezone.
  - `ZK_USER_CAPACITY` (default: `3000`): Maximum employee capacity.
  - `ZK_TEMPLATE_CAPACITY` (default: `3000`): Maximum fingerprint template capacity.
  - `ZK_LOG_CAPACITY` (default: `100000`): Maximum attendance log capacity.
  - `ZK_DUPLICATE_PUNCH_WINDOW` (default: `60` seconds): Terminal duplicate suppression window.
  - `ENABLE_DEVICE_SIMULATOR` (`true` / `false`): Non-production safety gate.
- **Starting Locally**:
  ```bash
  cd simulator
  npm run build
  npm start
  ```
- **Starting via Docker Compose**:
  The terminal starts automatically inside the container stack with `NODE_ENV=development` or when `ENABLE_DEVICE_SIMULATOR=true`.

---

### Feature 2: Device-Face Web Dashboard
- **Purpose**: Visual monitoring and manual interactive testing of the terminal.
- **Instructions**:
  1. Open `http://localhost:3030/` in any modern web browser.
  2. View live terminal stats: Device Name, Serial Number, Enrolled Users, Stored Punches, and live LCD Clock.
  3. Select an enrolled user from the dropdown menu.
  4. Click **SCAN** to simulate a physical employee finger tap.
  5. The LCD screen will flash `VERIFIED - THANK YOU` and record the punch.

---

### Feature 3: Synthetic Fingerprint Enrollment
- **Purpose**: Simulate enrollment ceremonies without handling real biometric data or requiring cameras.
- **How it Works**:
  1. The BITS backend sends `CMD_STARTENROLL` (command code `27` or `61`) targeting an employee's `zkId` and finger index (0–9).
  2. The terminal acknowledges with `CMD_ACK_OK` and schedules a synthetic template generation after an enrollment delay (`1500ms`).
  3. The backend polls `CMD_USERTEMP_RRQ` (command code `9`). When ready, the simulator returns the formatted 6-byte header `[size u16][uid u16][finger u8][flag=1 u8]` followed by a deterministic synthetic template.
  4. If cancelled prematurely, `CMD_CANCELCAPTURE` (command code `28`) halts the pending enrollment.
- **Triggering via BITS UI**:
  1. Navigate to **Admin** $\rightarrow$ **Employees** $\rightarrow$ **View Employee**.
  2. Click **Enroll Fingerprint** on the employee profile.
  3. The virtual terminal generates and stores the template.

---

### Feature 4: Simulated Punch & Verification Rules (R2)
- **Purpose**: Test clock-in, clock-out, overtime, and break scans under realistic credential validation rules.
- **Verification Rules Matrix**:
  | Credential / Condition | Verify Type | Result | HTTP Status | Attendance Log Created? |
  |---|---|---|---|---|
  | Enrolled Fingerprint | `1` (Fingerprint) | Success | `200 OK` | Yes |
  | Unenrolled Fingerprint | `1` (Fingerprint) | Rejected (`No template`) | `422 Unprocessable` | No |
  | Registered RFID Card | `2` (Card) | Success | `200 OK` | Yes |
  | Unregistered RFID Card | `2` (Card) | Rejected (`Card not registered`) | `422 Unprocessable` | No |
  | Disabled Employee | Any | Rejected (`User disabled`) | `403 Forbidden` | No |
  | Unknown Employee | Any | Rejected (`User not found`) | `404 Not Found` | No |
  | Cancelled Scan | Any | Rejected (`Scan cancelled`) | `200 OK (fail)` | No |
  | Unsupported Mode | `99` | Rejected (`Unsupported verify`) | `422 Unprocessable` | No |

- **Instructions (REST API)**:
  ```bash
  # Punch an enrolled user
  curl -X POST http://localhost:3030/api/punch \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "1001",
      "verifyType": 1,
      "state": 0
    }'

  # Punch with specific timestamp (for back-dated shift testing)
  curl -X POST http://localhost:3030/api/punch \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "1001",
      "verifyType": 1,
      "state": 0,
      "timestamp": "2026-10-15T08:00:00+08:00"
    }'
  ```

---

### Feature 5: On-Device Duplicate Punch Suppression (R3)
- **Purpose**: Emulate physical terminal firmware behavior where an employee accidentally taps their badge or finger twice within a few seconds.
- **Operation**:
  - The terminal maintains an in-memory window (`duplicatePunchWindowSeconds`, default `60` seconds) per employee.
  - If a second punch for the same employee occurs within the window, the terminal returns `{ result: 'suppressed' }` and **does not** create a new log row.
  - To intentionally bypass this suppression for test suites, pass `"force": true` in the request body.

---

### Feature 6: Terminal Clock Drift & NTP Correction (R5)
- **Purpose**: Simulate clock drift (terminals running fast or slow) and verify that BITS's hourly sync routine (`CMD_SET_TIME`) corrects device time.
- **Instructions**:
  ```bash
  # Read current simulator device time and offset
  curl http://localhost:3030/api/clock

  # Inject 15-minute clock drift
  curl -X POST http://localhost:3030/api/clock \
    -H "Content-Type: application/json" \
    -d '{"offsetMin": 15}'

  # Reset clock to match host system time
  curl -X POST http://localhost:3030/api/clock \
    -H "Content-Type: application/json" \
    -d '{"offsetMin": 0}'
  ```

---

### Feature 7: Interactive Fault Injection (R6)
- **Purpose**: Exercise BITS reconnection logic, retry backoffs, and lock timeouts without killing processes.
- **Available Faults**:
  1. `refuseConnections: true` — Drops incoming TCP connection attempts immediately.
  2. `latencyMs: 3000` — Delays outbound packet responses.
  3. `errorOnCommand: <command_code>` — Forces the terminal to reply with `CMD_ACK_ERROR` (e.g. `201` for write errors).
  4. `dropOnCommand: <command_code>` — Abruptly closes the TCP socket when a specific command arrives.
- **Instructions**:
  ```bash
  # Inject 2000ms latency on all commands
  curl -X POST http://localhost:3030/api/fault \
    -H "Content-Type: application/json" \
    -d '{"latencyMs": 2000}'

  # Check active fault status
  curl http://localhost:3030/api/fault

  # Clear all injected faults
  curl -X POST http://localhost:3030/api/fault/clear
  ```

---

### Feature 8: Offline Buffering & Large Log Sync (R7, R8)
- **Purpose**: Test network outage resilience where employees continue to clock in/out while BITS is offline or disconnected.
- **Operation**:
  - Punches generated on the terminal are buffered locally in the store with their original capture timestamps.
  - When BITS reconnects and triggers attendance reconciliation, the terminal transmits all buffered punches.
  - BITS ingests the punches, advances its watermark, and optional `CMD_CLEAR_ATTLOG` empties the device log dataset without data loss.

---

### Feature 9: Terminal Admin Role & Reset (R4)
- **Purpose**: Emulate ZKTeco hardware administrator privileges.
- **Operation**:
  - User records carry byte 2 as `role: 0` (normal employee) or `role: 14` (device administrator).
  - Calling `CMD_CLEAR_ADMIN` (command `20`) resets all administrator users on the device to role 0, unlocking locked terminal menus.

---

## 4. Hardware Profile: ZKTeco K14 Standalone Terminal

| Specification | K14 Hardware Specification | Virtual Simulator Profile | Notes |
|---|---|---|---|
| **Platform** | ZEM560_TFT Linux | `ZEM560_TFT` | Served in `CMD_OPTIONS_RRQ (~Platform)` |
| **Fingerprint Capacity** | 3,000 templates | 3,000 templates | Enforced on `CMD_TMP_WRITE` |
| **User Capacity** | 3,000 users | 3,000 users | Enforced on `CMD_USER_WRQ` |
| **Log Capacity** | 100,000 records | 100,000 records | Enforced on `/api/punch` |
| **Algorithm Version** | ZKFinger VX 10.0 | Version 10 | Served in `CMD_OPTIONS_RRQ (~ZKFPVersion)` |
| **Communication** | TCP/IP port 4370 | TCP port 4370 | Standard raw socket |
| **Display** | 2.8-inch TFT LCD | SVG/HTML5 interactive screen | Live time & verified banners |
| **Time Format** | 372-day year encoding | Asia/Manila (UTC+8) | Byte-for-byte calendar match |

---

## 5. Protocol Compatibility Matrix

| Command Code | ZK Command Constant | BITS Backend Usage | pyzk Usage | Simulator Implementation | Covered By Automated Tests |
|---|---|---|---|---|---|
| `1000` | `CMD_CONNECT` | Connect handshake | Connect handshake | Fully supported; assigns session ID | `m1.test.ts`, `m2-poc.test.mjs`, `m4_pyzk_validation.py` |
| `1001` | `CMD_EXIT` | Session disconnect | Session disconnect | Cleanly terminates socket | `m1.test.ts`, `m2-poc.test.mjs`, `m4_pyzk_validation.py` |
| `1002` | `CMD_ENABLEDEVICE` | Re-enable device | Device control | Fully supported | `oracle.test.ts`, `m2-poc.test.mjs` |
| `1003` | `CMD_DISABLEDEVICE` | Lock terminal during sync | Device control | Fully supported | `oracle.test.ts`, `m2-poc.test.mjs` |
| `1004` | `CMD_RESTART` | Reboot command | Reboot command | Fully supported; closes session | `oracle.test.ts` |
| `1007` | `CMD_REG_EVENT` | Real-time event listener | Live capture | Broadcasts `EF_ATTLOG` frames | `m3-realism.test.ts` |
| `1011` | `CMD_OPTIONS_RRQ` | Read device serial, platform | Read device options | Queries `~SerialNumber`, `~Platform`, etc. | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `1012` | `CMD_OPTIONS_WRQ` | Set device options | Option writing | Writes device options | `oracle.test.ts` |
| `1013` | `CMD_REFRESHDATA` | Reload device buffers | Refresh after write | Supported; returns `CMD_ACK_OK` | `m4_pyzk_validation.py` |
| `1069` | `CMD_GET_FREE_SIZES` | Read capacities & counts | Memory query | Serves 80-byte 20-integer sizing buffer | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `11` | `CMD_GET_VERSION` | Firmware version | Firmware version | Returns `BITS-VIRTUAL-K14 8.0.4.1-2026` | `oracle.test.ts`, `m4_pyzk_validation.py` |
| `201` | `CMD_GET_TIME` | Query device clock | Query device clock | Encodes 372-day time buffer | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `202` | `CMD_SET_TIME` | Hourly clock sync | Set device time | Decodes time and aligns offset | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `8` | `CMD_USER_WRQ` | Write employee to device | Create/update user | Decodes 72-byte user record | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `9` | `CMD_USERTEMP_RRQ` | Poll synthetic template | Fingerprint query | Returns template entry or empty error | `m1-enroll.test.ts`, `m2-poc.test.mjs` |
| `10` | `CMD_DELETE_USER` | Delete employee from device | Delete user | Removes user and associated templates | `m2-poc.test.mjs`, `m4_pyzk_validation.py` |
| `13` | `CMD_ATTLOG_RRQ` | Attendance log sync | Attendance listing | Returns 40-byte attendance dataset | `m2-poc.test.mjs`, `m3-realism.test.ts`, `m4_pyzk_validation.py` |
| `14` | `CMD_CLEAR_ATTLOG` | Clear attendance logs | Clear attendance | Empties stored attendance logs | `m2-poc.test.mjs`, `m3-realism.test.ts` |
| `20` | `CMD_CLEAR_ADMIN` | Revoke device administrators | Admin reset | Resets all `role > 0` users to 0 | `m3-realism.test.ts` |
| `27` / `61` | `CMD_STARTENROLL` | Start enrollment session | Enroll user | Schedules synthetic template arrival | `m1-enroll.test.ts`, `m2-poc.test.mjs` |
| `28` | `CMD_CANCELCAPTURE` | Cancel pending enrollment | Cancel capture | Cancels pending enrollment timer | `m1-enroll.test.ts` |
| `1503` | `CMD_DATA_WRRQ` | Dataset buffer download | Buffer download | Direct burst and chunked dataset transfer | `m2-poc.test.mjs`, `m4_pyzk_validation.py` |

---

## 6. Limits of This Simulator

To maintain technical honesty and avoid false assumptions in production environments:
1. **Scope Gating**: The simulator implements the command subset and wire formats utilized by `node-zklib@1.3.0` and `pyzk-0.9` for the **ZKTeco K14 (ZEM560_TFT)** profile. It does not emulate older ZK6 28-byte formats, facial recognition feature models, or proprietary ADMS/push protocols.
2. **Synthetic Biometrics Only**: The terminal generates deterministic pseudo-biometric byte buffers. It cannot be used to evaluate physical optical sensor quality, dry finger false-rejection rates, or biometric match accuracy.
3. **UDP Mode Disabled**: As documented in Architectural Decision Record ADR-007, BITS operates exclusively over raw TCP. UDP packet reception and broadcasting are intentionally not supported.
4. **Non-Production Flag**: Simulated punch APIs (`/api/devices/:id/simulate-punch`) are strictly blocked in production environments unless `ENABLE_DEVICE_SIMULATOR=true` is explicitly provided.

---

## 7. ZKTeco K14 Embedded Firmware OS Face & Multi-Portal Integration

### Interactive Device Face (Port :3030)
The web client at `http://localhost:3030/` delivers a 1:1 hardware simulation of the ZKTeco K14:
1. **Standby Screen**: Real ZKTeco wallpaper, live 250ms RTC digital clock, day indicator, and optical scanner glow effect.
2. **Attendance Punch State Controls**: Supports `F1: Check-In`, `F2: Check-Out`, `F3: Break-Out`, and `F4: Break-In` state switching via physical footer buttons or keyboard hotkeys.
3. **Standby Floating PIN Dialog**: Entering digits (`0-9`) on the standby face pops open a floating PIN entry modal (`1001_`) with `OK` to verify and `ESC` to cancel.
4. **Authentic 3×2 Main Menu OS**: Pressing the `MENU` button opens the 6-tile ZKTeco embedded menu:
   - `Tile 1: User Mgt` (Browse and verify enrolled workforce)
   - `Tile 2: Comm.` (TCP/IP network settings)
   - `Tile 3: System` (System rules and tolerances)
   - `Tile 4: Personalize` (Display, audio, wallpaper preferences)
   - `Tile 5: Data Mgt` (Live attendance record buffer inspector)
   - `Tile 6: Sys Info` (Device capacity, firmware version, and device serial)
5. **Real-time Verification Card**: Pops up on verified punch with dual-tone audio chime and instant shift math preview (`Present (On-Time)`, `Grace Applied`, `Late by X mins`, `Early Out`, `Shift End + OT`).

### Multi-Portal RBAC Integration
- **Admin Portal (`/devices`)**: Full device fleet configuration, TCP connection diagnostics, attendance reconciliation, and direct access to the Virtual Terminal face.
- **HR Portal (`/hr/devices`)**: Dedicated biometric terminal monitoring for HR personnel, with real-time SSE device telemetry via `DeviceStreamProvider` and instant access to the Virtual Terminal face.
- **Guest Mode Protection**: Guests can navigate the terminal and test punches, while all mutating administrative actions (device edits, deletion, sync toggling, workforce creation) are locked out via `guestGuard.middleware.ts`.
- **Biometric Enrollment Loop**: Full 360° synchronization loop supporting dynamic employee provisioning (`CMD_USER_WRQ`) and 3-scan synthetic fingerprint template capture (`CMD_STARTENROLL`).

---

## 8. Sub-Second Instant Live Punch Streaming (`EF_ATTLOG` Wire Event Ingestion)

### Architectural Overview
Rather than waiting for the 30-second periodic polling cycle (`SyncScheduler`), BITS establishes a persistent real-time event listener over raw TCP `:4370` using the ZKTeco `CMD_REG_EVENT (500)` wire protocol with `EF_ATTLOG (0x00000001)`.

```
[Employee Scans Finger / Enters PIN]
           │
           ▼
[ZKTeco Hardware / Virtual K14 Terminal]
           │  ⚡ Instant EF_ATTLOG Frame (48 bytes) over TCP :4370
           ▼
[BITS ZKRealtimeService (RealtimeDeviceClient)]
           │  < 1ms wire packet decoding
           ├─────────────────────────────────────────────┐
           ▼                                             ▼
[Prisma AttendanceLog Ingestion]              [deviceEmitter.emit('attendance-live-punch')]
           │                                             │
           ▼                                             ▼
[processAttendanceLogs() Shift Math]          [SSE: /api/devices/stream]
           │                                             │
           ▼                                             ▼
[attendanceEmitter.emit('new-record')]        [Admin / HR Portal Real-time UI]
           │
           ▼
[SSE: /api/attendance/stream]
           │
           ▼
[Instant UI Update (< 350ms total)]
```

### Packet Structure
- **TCP Prefix (8 bytes)**: `0x50 0x50 0x82 0x7d` + `0x28 0x00` (40 bytes frame) + `0x00 0x00`.
- **ZK Frame Header (8 bytes)**:
  - Command: `0xf4 0x01` (`500` / `CMD_REG_EVENT`)
  - Checksum: 2-byte calculated checksum
  - Session / Event Flag: `0x01 0x00` (`1` / `EF_ATTLOG`)
  - Reply ID: `0x00 0x00`
- **EF_ATTLOG Payload (32 bytes)**:
  - Offsets `0..8`: `deviceUserId` (ASCII, null-terminated)
  - Offsets `9..23`: Reserved zeros
  - Offsets `24..25`: `verifyType` (u16 LE: `1` = Fingerprint, `2` = Card, `3` = Password)
  - Offset `26`: `Year - 2000` (e.g., `26` for 2026)
  - Offset `27`: `Month` (`1..12`)
  - Offset `28`: `Day` (`1..31`)
  - Offset `29`: `Hour` (`0..23`)
  - Offset `30`: `Minute` (`0..59`)
  - Offset `31`: `Second` (`0..59`)

### Production Resilience & Safety Net
1. **Zero-Latency Ingestion**: Measured punch-to-DB latency is `< 350ms` (down from up to 30 seconds).
2. **Auto-Reconnection**: If network drops or the terminal reboots, `RealtimeDeviceClient` automatically re-establishes the connection and re-registers `EF_ATTLOG` with backoff retry.
3. **Dual Concurrency Harmony**: Background event streaming runs in its own TCP session, entirely independent of on-demand device syncing or biometric enrollment.
4. **Safety Net Polling**: `SyncScheduler` (30s) remains active in the background to catch any orphaned records in the unlikely event of network packet drops.

---

## 9. Embedded Terminal Face Drawer inside BITS

### UI/UX Architecture & Ergonomics
To provide a unified, zero-context-switching experience without impacting existing system performance or routes, BITS embeds the full interactive ZKTeco K14 terminal face inside an accessible slide-over drawer:

```
┌────────────────────────────────────────────────────────────────────────┐
│ BITS Admin / HR Portal (/devices, /hr/devices)                         │
│                                                                        │
│  [Top Toolbar]  [+ Add Device]  [⟳ Refresh]  [🖥️ Virtual Terminal ●]   │
│                                                     │                  │
│                                                     ▼ (Click triggers) │
│ ┌───────────────────────────┬────────────────────────────────────────┐ │
│ │ Device Cards Fleet        │ 🖥️ Virtual ZKTeco Terminal [● :4370] ✕ │ │
│ │                           │ 127.0.0.1:4370 · ⚡ Sub-Second Active   │ │
│ │ [Main Entrance Biometric] │────────────────────────────────────────│ │
│ │                           │ ┌──────────────┬─────────────────────┐ │ │
│ │ [Virtual ZKTeco Terminal] │ │ ZKTeco K14   │ Shift Math & Scens  │ │ │
│ │                           │ │ Standby Face │ One-Click Scenarios │ │ │
│ │ [Open Virtual Terminal]───┼►│ TFT Screen   │ 07:55 AM On-Time    │ │ │
│ │                           │ │ Keypad 0-9   │ 08:10 AM Grace      │ │ │
│ │                           │ │ [ SCAN ]     │ 08:35 AM Late In    │ │ │
│ │                           │ └──────────────┴─────────────────────┘ │ │
│ │                           │────────────────────────────────────────│ │
│ │                           │ 💡 Tip: Pick user & SCAN | Wire <350ms │ │
│ └───────────────────────────┴────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Technical & UX Highlights:
1. **Zero System Disruption**:
   - The drawer component ([`VirtualTerminalDrawer.tsx`](file:///c:/antigravity-proj/samananias-org/bits/frontend/src/features/devices/components/VirtualTerminalDrawer.tsx)) is lazy-mounted via `@radix-ui/react-dialog`.
   - When closed, zero CPU or background network requests occur.
   - When open, the iframe loads `http://localhost:3030` seamlessly with auto-focus and `Esc` key dismiss.
2. **Instant Wire Feedback Loop**:
   - Subscribed to `useDeviceStream({ onLivePunch })`.
   - When an attendance punch or scenario is triggered inside the terminal drawer, the top header bar immediately flashes a vibrant confirmation pill (`Marco Valenzuela verified via FINGERPRINT · 327ms`).
3. **Multi-Role Availability**:
   - Accessible to **Admin** on `/devices` and **HR** on `/hr/devices`.
   - Guests can interact with the terminal and test punches safely without mutating administrative settings.
4. **Dual Launcher**:
   - Quick header launcher (`Virtual Terminal` button with live pulsing emerald status).
   - Card launcher (`Open Virtual Terminal` on any simulated terminal card) with secondary pop-out icon for dual-monitor setups.

