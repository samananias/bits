# Research: ZKTeco Terminal Simulator Deep-Dive

## 1. Executive Summary

The `simulator/` directory contains a software emulation of a standalone ZKTeco biometric attendance terminal (**[zkteco-simulator-app](https://github.com/samananias/zkteco-simulator-app)**). Rather than wrapping high-level API mocks, it implements the actual **ZKTeco proprietary binary wire protocol** over TCP port 4370 down to the byte structure, checksum computation, and packet framing.

Because it speaks the identical protocol as real hardware (such as the ZKTeco K14, MB20, G3, and SenseFace series), client libraries such as `node-zklib@1.3.0`—the exact library used by the BITS backend—can connect to it **without any modifications or special driver flags**.

---

## 2. Why the Simulator is Critical for BITS

```
┌─────────────────────────────────────────────────────────────┐
│                       BITS Ecosystem                        │
├─────────────────────────┬───────────────────────────────────┤
│ Without Simulator       │ With Simulator                    │
├─────────────────────────┼───────────────────────────────────┤
│ • Requires physical ZK  │ • 100% software-defined, zero     │
│   hardware on local LAN │   physical hardware required      │
│ • Hard to test in CI/CD │ • Automated integration tests run │
│   or cloud environments │   in GitHub Actions or Docker     │
│ • Manual fingerprint    │ • Instant punch triggering via    │
│   scanning needed       │   Web UI or REST API endpoint     │
│ • Device lock collisions│ • Deterministic seed data and     │
│   risk bricking devices │   isolated SQLite/Memory store    │
└─────────────────────────┴───────────────────────────────────┘
```

---

## 3. Protocol Architecture & Wire Format

The ZKTeco standalone terminal protocol runs primarily over TCP port 4370 (with legacy fallback to UDP port 4370). The BITS driver (`backend/src/shared/lib/zk-driver.ts`) enforces **TCP-only communication** to eliminate packet loss and buffer truncation.

### 3.1 Packet Framing Hierarchy

Every message exchanged across TCP consists of a **16-byte framing envelope** followed by an optional payload:

```
0                   4                   8                  12                  16
+-------------------+-------------------+-------------------+-------------------+
|  0x50 0x50 0x82 0x7D  (TCP Magic)     |   Payload Length (uint32 LE)          |
+-------------------+-------------------+-------------------+-------------------+
|  Command ID (u16) |  Checksum (u16)   |  Session ID (u16) |  Reply ID (u16)   |
+-------------------+-------------------+-------------------+-------------------+
|                   Payload Buffer (Variable Length 0..N bytes)                 |
+-------------------------------------------------------------------------------+
```

1. **TCP Outer Header (Bytes 0–7)**:
   - **Bytes 0–3**: Fixed Magic Prefix `0x50, 0x50, 0x82, 0x7D` (`PP\x82\x7d`).
   - **Bytes 4–7**: Total size of the enclosed protocol frame (Frame Header + Payload) as a 32-bit unsigned little-endian integer.
2. **Inner Frame Header (Bytes 8–15)**:
   - **Bytes 8–9 (Command / Response Code)**: e.g., `CMD_CONNECT (1000)`, `CMD_ACK_OK (2000)`, `CMD_DATA (1501)`.
   - **Bytes 10–11 (Checksum)**: 16-bit one's complement addition across the inner frame and payload.
   - **Bytes 12–13 (Session ID)**: Assigned by the terminal during initial handshake (`CMD_CONNECT`), echoed on all subsequent requests.
   - **Bytes 14–15 (Reply ID)**: Incremented per command exchange to pair requests with acknowledgements.
3. **Payload (Bytes 16+)**: Command-specific binary data or null buffer.

### 3.2 Checksum Algorithm

The simulator implements two checksum evaluation variants matching real ZKTeco firmware:
- **Classic Algorithm**: Iterates through 16-bit words (little-endian), sums into a 32-bit accumulator, and folds high words (`sum = (sum & 0xFFFF) + (sum >>> 16)`).
- **Oracle Algorithm**: Matches `node-zklib`'s byte-order implementation.
The engine parses incoming checksums leniently (configurable via `ZK_CHECKSUM_STRICT`), avoiding disconnects from subtle vendor firmware variations.

### 3.3 372-Day Time Encoding

Timestamps on ZKTeco hardware are packed into a single 32-bit unsigned integer using a custom 372-day year model:
$$\text{timeInt} = [(\text{year} - 2000) \times 372 + (\text{month} - 1) \times 31 + (\text{day} - 1)] \times 86400 + (\text{hour} \times 3600 + \text{minute} \times 60 + \text{second})$$

Both BITS `zk-driver.ts` and the simulator's `protocol/timecodec.ts` implement exact symmetric decode/encode algorithms for this format.

---

## 4. Key Protocol Operations Supported by the Simulator

| Command Name | Code | Direction | Purpose in BITS |
| :--- | :---: | :---: | :--- |
| `CMD_CONNECT` | 1000 | Client $\rightarrow$ Device | Initial session handshake; device assigns session key |
| `CMD_AUTH` | 1102 | Client $\rightarrow$ Device | Comm-key challenge (BITS uses key 0 = disabled) |
| `CMD_EXIT` | 1001 | Client $\rightarrow$ Device | Clean socket shutdown |
| `CMD_ENABLEDEVICE` | 1002 | Client $\rightarrow$ Device | Unlocks device screen after administrative operations |
| `CMD_DISABLEDEVICE` | 1003 | Client $\rightarrow$ Device | Locks screen and buzzer during bulk user/template writes |
| `CMD_GET_TIME` | 201 | Client $\rightarrow$ Device | Reads terminal RTC clock |
| `CMD_SET_TIME` | 202 | Client $\rightarrow$ Device | Synchronizes terminal clock to server UTC+8 (PHT) |
| `CMD_GET_FREE_SIZES` | 1008 | Client $\rightarrow$ Device | Queries total enrolled users, attendance logs, and log capacity |
| `CMD_GET_VERSION` | 1100 | Client $\rightarrow$ Device | Firmware version string (returns `ALT-FA700 8.0.4.1-20200213`) |
| `CMD_DATA_WRRQ` (0x09) | 1503 | Client $\rightarrow$ Device | Bulk read request for user records dataset |
| `CMD_DATA_WRRQ` (0x0D) | 1503 | Client $\rightarrow$ Device | Bulk read request for attendance logs dataset |
| `CMD_USER_WRQ` | 8 | Client $\rightarrow$ Device | Writes / updates a single user record (72-byte buffer) |
| `CMD_DELETE_USER` | 18 | Client $\rightarrow$ Device | Deletes a user by UID from terminal memory |
| `CMD_USERTEMP_RRQ` | 9 | Client $\rightarrow$ Device | Queries / reads a fingerprint template by UID and finger index (0..9) |
| `CMD_DELETE_USERTEMP`| 19 | Client $\rightarrow$ Device | Deletes a specific finger slot (0..9) for a UID |
| `CMD_PREPARE_DATA` | 1500 | Client $\rightarrow$ Device | Allocates buffer for biometric template upload |
| `CMD_DATA` | 1501 | Both | Stream biometric template or dataset chunk |
| `CMD_CHECKSUM_BUFFER`| 119 | Client $\rightarrow$ Device | Validates uploaded template integrity |
| `CMD_TMP_WRITE` | 87 | Client $\rightarrow$ Device | Commits template to user UID and finger slot |
| `CMD_FREE_DATA` | 1502 | Client $\rightarrow$ Device | Releases upload memory buffer |
| `CMD_REFRESHDATA` | 1013 | Client $\rightarrow$ Device | Re-indexes active user / biometric table in RAM |
| `CMD_CLEAR_ATTLOG` | 15 | Client $\rightarrow$ Device | Clears stored attendance records |
| `CMD_REG_EVENT` | 500 | Client $\rightarrow$ Device | Registers for real-time `EF_ATTLOG` push stream |

---

## 5. Dataset Record Layouts

### 5.1 User Record Structure (72 Bytes Fixed)
Real devices transmit and store user profiles in a compact 72-byte binary format:

| Offset | Length | Field Name | Description / Notes |
| :---: | :---: | :--- | :--- |
| **0** | 2 B | `uid` (uint16 LE) | Internal device slot index (1..65535) |
| **2** | 1 B | `role` (uint8) | 0 = Normal User, 14 = Device Super Admin |
| **3** | 8 B | `password` (ASCII) | Optional numeric keypad PIN |
| **11** | 24 B | `name` (ASCII) | Display name on device screen |
| **35** | 4 B | `cardno` (uint32 LE) | RFID Card Number (used by BITS Card module) |
| **39** | 9 B | *Group / Timezones* | Access control flags |
| **48** | 9 B | `userId` (ASCII) | Badge / Employee Number string shown on screen |
| **57** | 15 B | *Reserved* | Null padding |

### 5.2 Attendance Record Structure (40 Bytes Fixed)
When `getAttendances()` is called, the simulator responds with 40-byte records:

| Offset | Length | Field Name | Description |
| :---: | :---: | :--- | :--- |
| **0** | 2 B | `userSn` (uint16 LE) | Device internal UID slot |
| **2** | 24 B | `deviceUserId` (ASCII) | Visible Employee ID / Badge number |
| **26** | 1 B | `verifyType` (uint8) | 1 = Fingerprint, 2 = Card, 3 = Password |
| **27** | 4 B | `time` (uint32 LE) | Packed 372-day timestamp |
| **31** | 1 B | `state` (uint8) | 0 = Check-in, 1 = Check-out, 4 = Overtime In, 5 = Overtime Out |
| **32** | 8 B | *WorkCode / Reserved* | Reserved padding |

---

## 6. Simulator Subsystem Architecture

```
                  ┌───────────────────────────────────────────────┐
                  │                 Server Entry                  │
                  │              (src/server.ts)                  │
                  └──────────────┬────────────────┬───────────────┘
                                 │                │
          ┌──────────────────────▼──────┐   ┌─────▼─────────────────────────┐
          │     ProtocolEngine (TCP)    │   │      HttpServer (REST/WS)     │
          │         port :4370          │   │           port :3000          │
          └──────────────┬──────────────┘   └─────┬─────────────────────────┘
                         │                        │
                         │    ┌──────────────┐    │
                         ├───►│   EventBus   │◄───┤
                         │    └──────────────┘    │
                         │                        │
                  ┌──────▼────────────────────────▼───────┐
                  │             Store Layer               │
                  │   (MemoryStore / SqliteStore)         │
                  └───────────────────────────────────────┘
```

1. **`src/core/engine.ts` (Protocol Engine)**:
   - Manages incoming TCP socket connections from `node-zklib`.
   - Maintains session state, reply sequences, and event dispatch queues.
   - Enforces the strict direct-burst reply behavior required by `node-zklib`'s `readWithBuffer`.

2. **`src/core/http.ts` (HTTP & Web UI Server)**:
   - Serves the device-face web UI (`src/web/index.html`, `scan.html`, `enroll.html`).
   - Provides REST APIs:
     - `POST /api/punch`: Generates an attendance event for any `userId`.
     - `GET /api/device/state`: Returns live device info, user count, and attendance log count.
     - `GET /api/users` & `GET /api/attendance`: Direct JSON inspection of internal state.
     - `POST /api/reset`: Restores the device to the initial seed configuration.
   - WebSocket (`/ws`): Emits live punch notifications, LCD screen updates, and device status changes.

3. **`src/store/` (Storage Layer)**:
   - Configurable between transient in-memory storage (`store: 'memory'`) and persistent SQLite (`store: 'sqlite'`).
   - Default seed profile (`standard`) pre-populates 5 employees:
     - 1001: Ana Dela Cruz (Super Admin)
     - 1002: Ben Reyes
     - 1003: Cora Santos
     - 1004: Dan Bautista
     - 1005: Ella Ocampo
     - A full week of check-in / check-out punches.
     - Synthetic fingerprint templates for slots 0 and 1.

4. **Biometric Core & Sidecar (Phases 6–8)**:
   - Extends the simulator to support camera-based optical fingerprint capture and Java-based template extraction (`sidecar/MatcherSidecar.java`).
   - Keeps the underlying ZKTeco wire protocol surface untouched, ensuring backwards compatibility with BITS.
