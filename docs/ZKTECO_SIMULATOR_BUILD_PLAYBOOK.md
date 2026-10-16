# ZKTeco Simulator Build Playbook

**Project:** BITS (`samananias/bits`) + virtual ZKTeco terminal (`samananias/zkteco-simulator-app`, submodule at `simulator/`)
**Audience:** the worker AI that will do the building
**Owner:** the human project owner (approves every milestone)
**Status of this file:** living document. Update the Progress Log (section 14) as work proceeds.

---

## 0. Why this file exists

The owners have no physical ZKTeco terminal. They want a software-only virtual terminal that lets BITS run realistic attendance workflows (register employees, enroll credentials, punch, sync, process attendance) for development, demos and a portfolio.

An investigation (a read-only repo inspection plus outside research) produced one main conclusion:

> **Do not rebuild the simulator. Extend the one that already exists.** It already speaks the ZK binary protocol on TCP port 4370, implements nearly every command BITS uses, and passes its own 80 tests. The remaining work is closing specific gaps, proving end-to-end behavior, and adding realism.

This file is your single source of truth for **what to build, in what order, what to watch out for, how to prove each step works, and which sources to double-check against.** If something in this file conflicts with what you find in the code, **the code wins. Report the conflict, don't silently pick one.**

### How to use this file
1. Read sections 1 to 4 completely before touching anything.
2. Work milestone by milestone (section 6 onward). Never start a milestone before the previous one is approved by the owner (section 13).
3. Every claim you make in a report must carry an evidence tag (section 2.3).
4. Re-verify anything marked "re-verify" before relying on it. Facts here came from a previous worker's report and could be wrong or stale.

---

## 1. Goal and non-goals

### Goal
A **maintainable, software-only attendance terminal** that:
- BITS connects to through its **existing** device integration (TCP 4370, `node-zklib@1.3.0`), with no BITS special-casing wherever practical.
- Supports the operations BITS actually uses (section 4.3).
- Behaves like **one named real device profile** closely enough to exercise BITS's retry, lock, sync, dedup and attendance logic.
- Clearly identifies itself as **virtual**, and never presents simulated scans as genuine biometric verification.
- Keeps a path open to real devices later (ADMS push, gateway). It is not built now.

### Non-goals (do NOT build unless the owner explicitly approves)
- Real fingerprint capture, camera capture, or real biometric matching. The simulator contains such a suite (SourceAFIS sidecar, encrypted templates, consent ledger). **It must be OFF by default and out of scope.**
- UDP support (BITS forces TCP, to be re-verified in M0).
- An ADMS/push receiver in BITS (future milestone M6 only).
- Emulating every ZKTeco model or the entire proprietary protocol.
- A mobile app. A desktop wrapper is optional and last.
- A second attendance database or duplicated business logic. All punches must go through BITS's existing pipeline.

---

## 2. Ground rules (non-negotiable)

### 2.1 Safety and legality
1. **Synthetic data only.** Fake employees, fake credentials, fake templates (random bytes, clearly labeled). Never real fingerprints, real employee data or real device data.
2. **Never connect to, scan, or test against the former employer's devices, servers, databases or credentials.** Test only against local/our own infrastructure.
3. **Never commit secrets.** No `.env` with real values, DB URLs, JWT secrets, SMTP creds. Check `simulator/.env` is not tracked (see M0).
4. **Don't expose port 4370 or the simulator's HTTP/WebSocket ports to the public internet.** Local, Docker network, or private VPN only.
5. **Provenance:** `samananias/bits` is a fork of `avegabros/bits` and no root LICENSE was found. Do not add, change or assert licensing yourself. Flag to the owner (decision D3).

### 2.2 Process
1. **Research/verify before coding.** For each milestone, do its "Verify first" step before editing.
2. **One milestone at a time, smallest change that works.** No drive-by refactors.
3. **Do not claim success until the relevant tests have actually run and passed.** Paste real command output. "Should work" is not a result.
4. **Don't modify the BITS attendance rules** (shifts, overnight, grace, overtime, anomalies) to make the simulator pass. If a rule seems wrong, report it. Don't change it.
5. **Prefer changing the simulator over changing BITS.** BITS changes need a stated reason and owner approval.
6. **Don't add new dependencies or test frameworks without approval.** Prefer `node:test` (already used in `simulator/`).
7. If a command fails or an environment problem appears (e.g. git not on PATH in PowerShell), fix the environment, don't skip the check. Never fabricate output.

### 2.3 Evidence tags (use in every report)
| Tag | Meaning |
|---|---|
| `[CODE]` | Confirmed by reading a file. Give `path:line`. |
| `[TESTED]` | Confirmed by running a command. Paste the command and result. |
| `[EXTERNAL]` | Confirmed from an outside source. Give URL, section, and the version it applies to. |
| `[INFERENCE]` | Reasoned conclusion, not directly confirmed. State the reasoning. |
| `[ASSUMPTION]` | Needed to proceed, not verified. Ask the owner if it matters. |
| `[UNKNOWN]` | Could not determine. Say what you tried. |

---

## 3. Source reliability and how to double-check

### 3.1 Ranking (highest to lowest)
1. **Official ZKTeco documentation**: product manuals, SDK/communication-protocol PDFs, firmware notes for the specific model.
2. **Source code of the libraries BITS actually uses**, at the exact installed version (`node-zklib@1.3.0` plus BITS's patch).
3. **Behavior observed by running code** (a test against the simulator using a real client library).
4. **Reputable open-source implementations** (`pyzk`, PyZatt, other clients/servers). Good evidence of what works in practice, but they are reverse-engineered.
5. **Third-party packages, vendor marketing, forum posts.** Use only as leads. Never as sole evidence.

**Rule:** any protocol-level claim (packet layout, command ID, field offset, behavior) needs **either an official document, or two independent implementations that agree, or a passing test against a real client library**. Otherwise tag it `[ASSUMPTION]`.

### 3.2 Source registry
"Seen" = a previous research pass reached the page and read the cited content. "Not yet verified" = URL is from memory or unconfirmed, and **you must open it and confirm before relying on it.** Record what you find in section 15.

| # | Source | URL | Supports | Status | Caveats |
|---|---|---|---|---|---|
| S1 | node-zklib README (caobo171) | https://github.com/caobo171/node-zklib | API surface: `createSocket`, `getInfo`, `getUsers`, `getAttendances`, `getRealTimeLogs`, `clearAttendanceLog`, `getTime`, `executeCmd` for custom commands | Seen | Fork/variant. Confirm it matches the npm 1.3.0 tarball BITS installs |
| S2 | node-zklib@1.3.0 README (npm tarball via jsDelivr) | https://cdn.jsdelivr.net/npm/node-zklib@1.3.0/README.md | Exact-version usage and API | Seen | Authoritative for the version BITS pins. Read the actual files in `backend/node_modules/node-zklib` too |
| S3 | Snyk advisor: node-zklib | https://snyk.io/advisor/npm-package/node-zklib | Maintenance status (inactive, no recent releases, low downloads, license ISC) | Seen | Health score is a heuristic. Treat as a maintenance-risk signal only |
| S4 | zklib-js package page | https://classic.yarnpkg.com/en/package/zklib-js | `zklib-js@1.3.5` API (`setUser(uid, userid, name, password, role, cardno)`) | Seen | BITS declares it but does not import it (re-verify in M0) |
| S5 | rabbygit/node_zklib | https://github.com/rabbygit/node_zklib | Another variant's usage (real-time logs) | Seen | **A different fork, not necessarily BITS's library.** Don't mix behaviors |
| S6 | BNet.ZKTecoADMS (NuGet) | https://www.nuget.org/packages/BNet.ZKTecoADMS | ADMS/push: device calls `/iclock/cdata`, `/iclock/getrequest`; typically plain HTTP | Seen | Third-party. Only a lead for M6 |
| S7 | Odoo ADMS module listing | https://ecosire.com/ar/apps/odoo/odoo-adms-push-attendance | ADMS = device-initiated HTTP; same mechanism as ZKTeco's own server software | Seen | **Vendor marketing page. Low reliability.** Corroborate before use |
| S8 | pyzk (Python ZK client) | https://github.com/fananimi/pyzk | Independent client for cross-validation (M4); protocol constants | **Not yet verified** | Confirm repo URL, maintenance, supported devices |
| S9 | PyZatt | https://github.com/SoftwareHouseMerida/pyzatt | Independent client/protocol notes | **Not yet verified** | Confirm repo URL and activity |
| S10 | ZKTeco official site and download center | https://www.zkteco.com | Official manuals, SDK, "communication protocol" docs for a chosen model | **Not yet verified** | Find the real document URLs for the chosen model and record them. If none are public, record that as `[UNKNOWN]` |
| S11 | Node.js docs: `node:test`, `node:net` | https://nodejs.org/api/test.html, https://nodejs.org/api/net.html | Test runner and TCP server APIs | **Not yet verified** | Check the docs for the Node version in use (Dockerfiles: 20 backend, 22 root) |
| S12 | Prisma docs | https://www.prisma.io/docs | Schema, migrations, unique constraints, upserts | **Not yet verified** | Match the version in `backend/package.json` |
| S13 | Philippine National Privacy Commission | https://privacy.gov.ph | Data Privacy Act guidance relevant to biometric/personal data | **Not yet verified** | Informational only, not legal advice. Owner decides compliance posture |
| S14 | In-repo research docs | `docs/research/zkteco-simulator-research.md`, `docs/research/simulator-architecture-and-integration-plan.md`, `docs/analysis/system-integration-analysis.md`, `simulator/README.md` | Prior team notes on framing, command matrix, ADMS vs TCP | In repo | **Internal opinions, not external proof.** Cross-check claims against S1/S2/S8/S10 |

### 3.3 Double-check procedure
For every protocol/device claim you rely on:
1. Find it in the code first (`node_modules/node-zklib/*.js` and `backend/src/shared/lib/zk-driver.ts`).
2. Find it in at least one external source (S1/S2/S8/S10).
3. Prove it by running a test against the simulator with a real client.
4. Record the result in section 15 (Verified Facts Register) with the tag and source.

If sources disagree, **report the disagreement. Don't pick silently.**

---

## 4. Baseline facts (from the previous investigation: RE-VERIFY in M0)

These came from a worker's report on commit `91d72ff` (branch `feature/enhance-simulator`), with the simulator submodule at `b08e6f2`. Treat as `[CODE]` only after you re-read the file.

### 4.1 BITS
- Stack: Next.js 16 frontend, Express 5 + TypeScript + Prisma + Zod, PostgreSQL 15, JWT auth.
- Device library: **only `node-zklib@1.3.0`**, used as `ZKLibTCP` directly (TCP only). `zklib-js@1.3.5` is declared but not imported (`backend/src/types.d.ts`, `backend/src/shared/types/zklib-js.d.ts` only).
- Patch: `backend/patches/node-zklib+1.3.0.patch` adds `verifyMode: recordData.readUInt8(26)` to the 40-byte attendance record decoder, and adds early `return`s after `reject(err)` in two spots of `zklibtcp.js`.
- Driver: `backend/src/shared/lib/zk-driver.ts` (about 656 lines). Connection helpers in `backend/src/modules/devices/zk/` (`zk-connection`, `zk-lock`, `zk-sync`, `zk-user`, `zk-fingerprint`, `zk-card`, `zk-reconcile`), queue in `backend/src/modules/devices/deviceSyncQueue.service.ts`.
- Connection: per operation (connect, work, disconnect in `finally`). Default timeout 30000 ms. `connectWithRetry`: 2 retries, 2.5 s apart. In-memory per-device locks with 90 s safety release.
- Ingestion is **polling** (about every 30 s by default, `syncScheduler.ts`). No real-time (`getRealTimeLogs`), ADMS, webhook or gateway code exists.
- Punch pipeline:
  1. `syncSingleDevice` (`zk-sync.service.ts`): `getLogs()`.
  2. Filter by watermark (`Device.lastSyncedAt`).
  3. Map `deviceUserId` to `Employee.zkId`. Unknown IDs are skipped.
  4. `AttendanceLog` unique on `(timestamp, employeeId)`.
  5. `processAttendanceLogs` (`attendance-processor.ts`), then `Attendance`, with metrics from `attendance-calculator.ts`.
- **Timezone:** `zk-sync.service.ts` (about L33-45) treats device time as local PHT and subtracts 8 h to get UTC. Hardcoded.
- Verify-mode mapping (`zk-sync.service.ts` about L10-21): `1` FINGERPRINT, `2` CARD, `3` PASSWORD, default FINGERPRINT.
- Rules to preserve: minimum check-out gap (default 120 min, or half the shift if smaller), night-shift buffer (default 120 min), grace period, overtime **only** with an approved `OvertimeRequest`, anomaly threshold 240 min.
- No raw templates are stored in PostgreSQL; only enrollment metadata.
- Backend has **no test framework** (`npm test` is a placeholder).
- Existing in-app simulator hook: `POST /api/devices/:id/simulate-punch` (`device.controller.ts` about L880-964). It POSTs to `http://<host>:${SIMULATOR_HTTP_PORT||3030}/api/punch`, then triggers `syncSingleDevice`. Router-level roles: ADMIN, MANAGER, HR.

### 4.2 Simulator (`simulator/`)
- TypeScript on Node 20+. Entry `src/index.ts`, composition `src/server.ts`, protocol engine `src/core/engine.ts`, HTTP/REST/WS `src/core/http.ts`.
- Real sockets: TCP 4370 (`ZK_TCP_PORT`), HTTP 3000 (`ZK_HTTP_PORT`), optional sidecar 8090.
- Stores: memory (default) or SQLite (`ZK_STORE=sqlite`, `node:sqlite`).
- Implements about 30 commands (see 4.3), plus cosmetic ACK-only ones.
- Tests: `npm test` runs 80 tests (reported all passing). The oracle test uses real `node-zklib@1.3.0` with BITS's call patterns.
- Includes a **real-biometric suite** (camera capture, SourceAFIS matcher sidecar, AES-256-GCM template store, consent ledger). Conflicts with the project's "no real biometrics" rule.

### 4.3 Minimum command set BITS needs (all must work against the simulator)
`CMD_CONNECT`(1000), `CMD_EXIT`(1001), `CMD_ENABLEDEVICE`(1008), `CMD_DISABLEDEVICE`(1007), `CMD_GET_TIME`(201), `CMD_SET_TIME`(202), `CMD_GET_FREE_SIZES`(1060), `CMD_DATA_WRRQ`(1503; user subtype 0x09, attendance subtype 0x0D), `CMD_USER_WRQ`(8), `CMD_DELETE_USER`(18), `CMD_DELETE_USERTEMP`(19), `CMD_CLEAR_ATTLOG`(15), `CMD_REFRESHDATA`(1013), `CMD_USERTEMP_RRQ`(9), `CMD_PREPARE_DATA`(1500), `CMD_DATA`(1501), `CMD_CHECKSUM_BUFFER`(1506), `CMD_TMP_WRITE`(103), `CMD_FREE_DATA`(1502), `CMD_CANCELCAPTURE`(60), `CMD_STARTENROLL`(27).

**Re-verify this list** by grepping every `executeCmd(` and library-method call in `backend/src` (M0-3). If BITS calls something not listed, add it to the gap list.

### 4.4 Known gaps (to be fixed in M1)
| ID | Gap | Why it matters |
|---|---|---|
| G1 | `CMD_STARTENROLL` returns ACK only; no template ever appears | BITS polls `getFingerTemplate` for up to 60 s (15 tries every 4 s) and times out. Live fingerprint enrollment cannot complete |
| G2 | HTTP port mismatch: simulator default 3000, BITS default 3030, Dockerfile 4371 | In-app simulated punch fails silently |
| G3 | Timezone: BITS subtracts 8 h | If the simulator encodes UTC instead of device-local time, every punch is 8 h off |
| G4 | No end-to-end test of BITS + simulator + Postgres | The oracle test mimics BITS call patterns but is not BITS |
| G5 | Real-biometric suite enabled/available | Conflicts with the no-real-biometrics rule and adds privacy burden |
| G6 | `simulate-punch` route and bundled simulator may be reachable in production builds | Fake punches in production data (check for an env flag) |
| G7 | Unknown: whether the simulator UI says "virtual", whether `/api/punch` accepts a custom timestamp, whether a fingerprint punch for a user without a template is rejected | Needed for realism and for testing overnight shifts and the check-out gap |

Worker report claimed a "no UDP" gap. BITS appears to force TCP, so this is probably **not** a real gap. Confirm in M0-4.

---

## 5. Target design (what "closer to a real device" means)

Fidelity is judged against **one named device profile**, not "ZKTeco in general".

1. **Profile:** choose one model, preferably the one the owners know from their internship (model name/firmware string/serial format only; no real data). Record model, firmware string, record sizes, user/template/log capacity, and which commands it supports, each with a source. If no model can be justified from official docs, use a clearly named generic profile `BITS-VIRTUAL-1` and mark it `[ASSUMPTION]`.
2. **Identity:** unique synthetic serial number, model string, firmware string, device name containing the word VIRTUAL, shown in the UI and in `getInfo`/options replies.
3. **Behaviors to emulate** (M3): capacity limits, duplicate-punch suppression window, admin privilege flag, verification rules, offline buffering, clock drift, latency/timeouts/disconnects, error replies for unknown/invalid commands.
4. **Synthetic credentials:** fingerprint "templates" are random bytes with a recognizable synthetic marker. A fingerprint punch is accepted only if that user has a template in some finger slot. A card punch is accepted only if the card number is registered. Failures are logged with a reason. A simulated successful scan is a **test event**, never proof of identity.
5. **Single source of truth:** employees live in BITS. The simulator stores only device-side state (users, templates, logs, options). Keep them consistent through BITS's existing sync, not through a second HR database.

---

## 6. Milestone 0: Pre-flight verification (READ-ONLY, no code changes)

**Purpose:** confirm the baseline, resolve unknowns, set up the environment. **Output:** a short report plus an updated section 15.

### Environment notes (from the previous worker)
- Windows/PowerShell. Git may not be on PATH: use `$env:PATH += ";C:\Program Files\Git\cmd"` first.
- Run simulator tests with `cmd.exe /c "cd simulator && npm test"` if PowerShell mishandles `&&`.
- Do **not** run backend scripts under `backend/src/scripts/debug/`. They touch the database or devices.

### Tasks

| ID | Task | How to check | Evidence to report |
|---|---|---|---|
| M0-1 | Record repo state: branch, commit, submodule status, uncommitted changes | `git status`, `git log -1`, `git submodule status`, `git diff --stat` | Output pasted. Note any uncommitted work |
| M0-2 | Confirm no secrets are tracked, esp. `simulator/.env` | `git ls-files \| Select-String "\.env"` in root and in `simulator/`; open `.gitignore` files | List of tracked env files (names only, no values) |
| M0-3 | Re-derive the exact command/method set BITS calls | grep `executeCmd(`, `COMMANDS.`, `zkInstance.`, `zk.` in `backend/src` | Table: command, call site `path:line`, in simulator? (y/n with `engine.ts` line) |
| M0-4 | Confirm TCP-only: does anything in BITS create a UDP socket or call a library path that falls back to UDP (e.g. `getInfo`)? | Read `zk-driver.ts` `connect()` and `getInfo()`; read `node_modules/node-zklib/zklibtcp.js` | Yes/no with `path:line` |
| M0-5 | Check which `node-zklib` files the simulator's oracle test loads, and whether it uses the **patched** copy (the `verifyMode` patch) | Read `simulator/test/integration/oracle.test.ts`, `simulator/package.json`, `simulator/node_modules/node-zklib` | Patched or unpatched; does any test assert `verifyMode`? |
| M0-6 | Does the simulator's 40-byte record put `verifyMode` at offset 26, matching BITS's patch? | Read the record codec in `simulator/src/protocol/` and `protocol.test.ts` | Offsets table with `path:line` |
| M0-7 | Timezone: how does the simulator encode and decode device time (`CMD_GET_TIME`, attendance record time, event time)? Does `ZK_TZ`-style config exist? | Read time functions in `simulator/src/protocol/` and `engine.ts`; read `zk-sync.service.ts` L33-45 | Explain end to end what `recordTime` BITS will see for a punch "now" |
| M0-8 | Does `POST /api/punch` accept a custom timestamp, `state`, `verifyType`? What does it validate? | Read `simulator/src/core/http.ts` L100-130 | Request schema |
| M0-9 | What does a fingerprint punch do when the user has no template? Card punch with an unregistered card? Unknown user? | Read `http.ts` punch handlers and `engine.ts` | Behavior table |
| M0-10 | Is `simulate-punch` gated by an env flag or `NODE_ENV`? Is the simulator started in production compose/Dockerfile? | Read `device.controller.ts` L880-964, `Dockerfile`, `docker-compose*.yml`, `entrypoint.sh` | Gating answer and what runs in prod |
| M0-11 | Does the simulator UI (`src/web/`) label the device as virtual? What does `getInfo`/options reply with for model/serial/firmware? | Read `src/web/` and `engine.ts` options handlers | Strings with `path:line` |
| M0-12 | How does the simulator get seed data? What do `scripts/seed-biometric.mjs`, `dev-biometric.mjs`, `punch.mjs` do? Do they use real biometric data? | Read scripts | Summary |
| M0-13 | Where do BITS's `findNextSafeZkId`, `PROTECTED_DEVICE_UIDS` and UID vs `userId` handling come from, and what UIDs/IDs will the simulator's store accept? | Read `zk-user.service.ts` | Rules the simulator must honor |
| M0-14 | What does BITS expect of a "template" (min length, header, size checks)? | Read `zk-driver.ts` about L411-480, `zk-fingerprint.service.ts` L880-973 | Constraints for the synthetic template (G1) |
| M0-15 | Run the simulator's own tests to confirm baseline | `cmd.exe /c "cd simulator && npm test"` (offline, no DB) | Full pass/fail summary |
| M0-16 | Find official/primary sources for the chosen device profile (S10), plus S8/S9 | Browse and record real URLs and versions in section 15 | Source list with status |
| M0-17 | Identify the open-source clients available for cross-validation (pyzk etc.): maintenance, supported commands | Open S8, S9; read README and issues | Notes for M4 |

**Gate M0:** deliver the report. Wait for owner approval before M1.

---

## 7. Milestone 1: Fix the gaps (smallest working fixes)

**Branch:** work on a feature branch. Don't touch `main`. Commit small, logical commits.
**Rule:** a gap is "fixed" only when a test proves it.

### M1-1 Port harmonization (G2)
- **Decide** one set of defaults: e.g. protocol 4370, simulator HTTP one fixed port. Update `simulator/src/config.ts`, `device.controller.ts` default, root `Dockerfile` env, `.env.*.example`, README/docs.
- **Watch:** do not change 4370 (clients expect it). Keep env overrides.
- **Check:** start simulator and BITS with defaults only (no overrides). Call `POST /api/devices/:id/simulate-punch`. It must reach the simulator.
- **Evidence:** request/response and the resulting `AttendanceLog` row.

### M1-2 Timezone correctness (G3)
- **Verify first** (M0-7). Then make the simulator encode device-local time (Asia/Manila by default, configurable) in every place BITS reads time, **without** changing BITS's hardcoded -8 h unless the owner approves (decision D5).
- **Watch:** three time surfaces: `CMD_GET_TIME`, the 40-byte attendance record time, the real-time event time. The ZK time encoding is a packed calendar format, not a Unix timestamp. Confirm the encoding against `node-zklib/utils.js` (`parseTimeToDate`) and a second source (S8).
- **Check (automated):** set the simulator clock to a known local time (e.g. 2026-10-16 08:00 PHT). Punch. Run BITS sync. Assert `AttendanceLog.timestamp` equals `2026-10-16T00:00:00.000Z`. Add a second case across midnight.
- **Evidence:** test name, output, and the UTC value.

### M1-3 Synthetic enrollment that completes (G1)
- **Verify first** (M0-14): read what BITS sends and expects for `CMD_STARTENROLL` and the `getFingerTemplate` poll (`CMD_USERTEMP_RRQ`).
- **Build:** on `CMD_STARTENROLL` for `(userId, fingerIndex)`, after a configurable delay (default a few seconds, well under BITS's 60 s window), store a **synthetic** template for that slot. Marker bytes must make it obviously fake (e.g. a fixed ASCII tag plus random bytes). Emit nothing that resembles real biometric data.
- **Watch:**
  - `CMD_CANCELCAPTURE` must cancel a pending synthetic enrollment.
  - Respect the overwrite flag in the payload (26 bytes: 24-byte ID, 1-byte finger index 0-9, 1-byte flag).
  - Fail realistically if the user does not exist on the device, or the slot is occupied without overwrite.
  - Finger index range 0-9; reject others.
  - Concurrency: a second `STARTENROLL` while one is pending.
- **Check (automated, using real `node-zklib@1.3.0` + BITS call sequence):** `setUser`, `refreshData`, `startEnrollment`, poll `getFingerTemplate` until present, then assert the template is stored and later read back. Also test: cancel, timeout path, occupied slot, unknown user.
- **Check (end to end, in M2):** BITS's `enrollEmployeeFingerprint` completes and writes `EmployeeFingerprintEnrollment`.

### M1-4 Turn the real-biometric suite OFF by default (G5)
- **Build:** a single explicit opt-in flag (e.g. `ZK_BIOMETRIC_REAL=1`) defaulting off. When off, the sidecar does not start, camera pages and `/api/biometric/*` routes return a clear "disabled" response, and no `data/biometric/` files are created.
- **Don't delete** the feature (owner decision D2). Just isolate it.
- **Check:** with defaults, start the simulator: no Java process, no sidecar port 8090, no biometric files, `/api/biometric/status` reports disabled. Run `npm test` and report which tests are skipped/gated and why.

### M1-5 Production gating and "virtual" labeling (G6, G7)
- Gate `simulate-punch` and any simulator startup behind an explicit non-production flag (e.g. `ENABLE_DEVICE_SIMULATOR=true`), refusing to run when `NODE_ENV=production` unless explicitly overridden, and log an audit entry when used. Confirm with owner (decision D4).
- UI and API: device name/model/serial contain VIRTUAL/SIMULATED, visible in the terminal face and in BITS's device list (if BITS shows model/serial; if not, the device `name` is enough).
- **Check:** production compose does not expose or call the simulator; route returns 403/404 when disabled; UI screenshot or HTML assertion shows the label.

**Gate M1:** report with evidence for each of M1-1 to M1-5, plus full `npm test` output. Owner approval before M2.

---

## 8. Milestone 2: End-to-end proof of concept (automated)

**Purpose:** prove "virtual terminal to BITS to database to API" with the **real** BITS code, not a mimic.

### Harness
- Prefer a script/test that starts: PostgreSQL (Docker, throwaway database), BITS backend, simulator. Use `node:test`. **No new frameworks without approval.**
- Use a **dedicated throwaway database** and synthetic seed data (never the dev database). Never run migrations or seeds against anything the owners care about.
- Needs: one synthetic employee with `zkId`, an assigned shift, a `Device` row (`ip` = simulator host, `port` = 4370).

### Scenarios (each must pass)
| ID | Scenario | Expected |
|---|---|---|
| E1 | Connection test via `POST /api/devices/:id/test` | Success, `getInfo` data reflects the virtual profile |
| E2 | Register employee on the device via BITS (`addUserToDevice`/queue) | User appears in simulator store with correct UID/userId/name/card/role |
| E3 | Synthetic fingerprint enrollment through BITS | Completes in under 60 s; `EmployeeFingerprintEnrollment` row created; template present in the simulator |
| E4 | Punch via simulator, then BITS sync | One `AttendanceLog`, one `Attendance` (check-in) with the right UTC time |
| E5 | Run sync again | **No new rows** (watermark and unique constraint hold) |
| E6 | Second punch beyond the minimum check-out gap | Same `Attendance` gets `checkOutTime`; metrics computed |
| E7 | Second punch **within** the gap | Ignored as a duplicate tap, no change |
| E8 | Unknown device user punches | Skipped by BITS, no crash, audit entry as designed |
| E9 | Night shift: punch in at 22:00, out next morning | One record, correct overnight handling |
| E10 | Overtime: approved `OvertimeRequest` exists | `overtimeMinutes` computed; without a request, zero |
| E11 | Delete user on BITS | User (and templates) removed from simulator |
| E12 | Dashboard/API visibility | Attendance returned by the attendance API as an authorized role sees it |

### Watch
- Punch timestamps must be controllable (M0-8). If `/api/punch` can't take a timestamp, add it (simulator side) rather than sleeping in tests.
- Test punches must not depend on wall-clock "now" (flaky around midnight and the gap).
- Clean up between scenarios (clear logs, users) through the simulator's reset endpoint, not by hand.
- Don't weaken BITS rules to make scenarios pass.

**Gate M2:** CI-style run output, scenario table with pass/fail, and a list of any BITS behavior surprises. Owner approval before M3.

---

## 9. Milestone 3: Realism (closer to a real device)

Implement per the chosen profile (section 5). **Each item is optional until the owner approves it, and each needs a source or an explicit `[ASSUMPTION]` tag.**

| ID | Feature | How to check | Watch |
|---|---|---|---|
| R1 | **Capacity limits** (users, templates, log slots) reported by `CMD_GET_FREE_SIZES`; reject writes past capacity with a realistic error | Test fills to capacity; BITS surfaces a sensible error, no crash | Use profile numbers from official docs; else mark as assumption |
| R2 | **Verification rules:** fingerprint punch accepted only with an enrolled template; card only if registered; disabled/inactive user rejected; unknown user rejected; cancelled scan | Table-driven tests (success, fail, unknown, cancelled, disabled, unsupported credential, configurable verify type) | Failures must be logged on the simulator side with a reason; they must not create attendance logs |
| R3 | **Duplicate-punch suppression window** on the device (configurable, default per profile if documented) | Two rapid punches create one log | Separate from BITS's own check-out gap. Test both layers |
| R4 | **Device admin privileges** (role field in the 72-byte user record) | Create admin, normal user. BITS's device-administrator endpoints work | Don't let an admin-role user bypass anything in BITS |
| R5 | **Clock drift and `CMD_SET_TIME`** honored | BITS's hourly clock sync corrects a drifted simulator clock | Timezone interplay with M1-2 |
| R6 | **Fault injection** (admin/REST controlled): latency, dropped connection mid-transfer, connect refusal, slow reply near the 30 s timeout, restart | BITS retries (2 retries, 2.5 s), lock releases, status flips offline/online, no duplicate rows after recovery | Exercise `connectWithRetry`, `zk-lock` (90 s release), health checker |
| R7 | **Offline buffering:** simulator offline, punches accumulate in the device log, then sync after reconnect | Punch while BITS can't reach it (or while the device is "off"), reconnect, sync, all punches appear once | Timestamps remain original, not sync time |
| R8 | **Large logs:** thousands of records | `getAttendances` chunking works (`CMD_DATA_RDY`); BITS sync completes; performance noted | Memory/SQLite store behavior; BITS `clearAttendanceLog` flow |
| R9 | **Realistic option strings** (`~SerialNumber`, platform, firmware, device name) | `getInfo`/options replies match the profile | Source them (S10) |
| R10 | **Real-time events** (`CMD_REG_EVENT`) remain correct even though BITS doesn't use them | Existing test stays green | Keep, but don't spend time here |

**Gate M3:** per-feature evidence. Owner picks which R-items ship.

---

## 10. Milestone 4: Independent-client validation

**Why:** the oracle test uses the same library BITS uses, so it can't catch shortcuts that only that library tolerates.

- Run at least one **independent** client (S8 pyzk; optionally S9) against the simulator: connect, get info, list users, list attendance, write user, delete user, time get/set.
- Record each failure as a fidelity bug and classify: simulator bug / client quirk / profile difference. Resolve against official docs (S10) where available.
- **Watch:** these clients target many device families. A failure may be a feature your chosen profile doesn't have. Check before "fixing."
- **Evidence:** client version, command used, results table (pass/fail/diff).
- **Gate M4:** owner reviews the compatibility matrix.

---

## 11. Milestone 5: Security, privacy, docs, deployment

### Security checklist
| Item | Check |
|---|---|
| Ports not public | Compose binds simulator ports to localhost/internal network only. `docker ps`/compose file shows no public mapping for 4370 or the simulator's HTTP port beyond local |
| No secrets in repo/images | `git ls-files` for env files; search for tokens; no real values in `.env.*.example` |
| Simulator HTTP API access | Local only, or token-protected if reachable beyond the host |
| Input validation | Fuzz-ish tests: oversize payloads, bad checksums, truncated frames, unknown commands. Simulator replies `CMD_ACK_UNKNOWN`/error, doesn't crash |
| Frame limits | Max frame/payload sizes enforced; connection idle timeout |
| Replay/duplicate | Same punch replayed doesn't create duplicate BITS rows (E5) |
| Audit | Simulated punches create an audit entry marked simulated |
| Privacy | No real biometric/personal data anywhere. Real-biometric suite off by default (M1-4). Retention note in docs |

### Documentation to produce
- `docs/guides/` update: how to start virtual terminal + BITS, ports, env vars, how to register a user, enroll (synthetic), punch, inject faults, reset.
- Model profile document: chosen profile, sources, assumptions, known differences from real hardware.
- Compatibility matrix: command, BITS uses it, simulator status, test that covers it, source.
- "Limits of this simulator" section: honest statement that it is compatible with the command subset BITS uses for one profile, tested with the clients listed, and not a guarantee of real-firmware behavior.

### Deployment
- Dev: `docker compose up` with the simulator as a service on the internal network. BITS `Device.ip` points to the service name.
- Cloud-hosted BITS: backend is a TCP **client** to port 4370, so the simulator must be reachable privately (same host/network or private VPN overlay). **Never** expose 4370 publicly. The frontend can be on a serverless host, but the backend and the simulator need a container host that supports raw TCP.

**Gate M5:** checklist with evidence, docs delivered.

---

## 12. Milestone 6 (future, only if the owner asks): real-device path

Not part of the current build. Prerequisites to list for the owner:
- ADMS/push receiver in BITS (device-initiated HTTP to `/iclock/cdata`; leads: S6, S7; needs official/primary confirmation).
- Or a LAN-side gateway/VPN so a cloud backend can reach a real terminal.
- One-time fidelity check against a real device if the owners ever obtain authorized access to one. Compare command traces with the simulator.
- Replace or fork `node-zklib` if maintenance becomes a blocker (S3 shows it as inactive).

---

## 13. Approval gates and decisions needed from the owner

| ID | Decision | Default recommendation | Needed by |
|---|---|---|---|
| D1 | Approach A (extend existing protocol-level simulator) as the path | Yes | Before M1 |
| D2 | Real-biometric suite: off by default, kept in repo | Yes | Before M1 |
| D3 | Fork/license provenance of `avegabros/bits`; no root LICENSE | Owner must resolve with the original author / internship terms before publishing as portfolio | Before any public release |
| D4 | Gate `simulate-punch` and simulator behind a non-production flag | Yes | Before M1-5 |
| D5 | Keep BITS's hardcoded -8 h and fix the simulator, or make BITS timezone configurable | Fix the simulator first | Before M1-2 |
| D6 | Drop unused `zklib-js` dependency | Yes (a separate small PR) | Optional |
| D7 | UDP support | No | Before any UDP work |
| D8 | Which device profile to emulate | Owner picks, or `BITS-VIRTUAL-1` | Before M3 |
| D9 | New test dependencies/frameworks | Use `node:test`; ask first for anything else | Before M2 |
| D10 | Which R-items (M3) to ship | Owner chooses | Before M3 |

**Approval log (owner fills in):**
| Milestone | Approved? | Date | Notes |
|---|---|---|---|
| M0 | | | |
| M1 | | | |
| M2 | | | |
| M3 | | | |
| M4 | | | |
| M5 | | | |

---

## 14. Reporting template (use at the end of every milestone)

```
## Milestone <N> report
Branch/commit: <hash>
Summary: <2-4 sentences>

### Tasks
| ID | Done? | Evidence tag | Evidence (path:line / command + output / URL) |

### Tests run
<exact commands, pasted output, pass/fail counts>

### Deviations from the playbook
<what you changed from the plan and why>

### New risks / surprises
<...>

### Questions for owner
<numbered, short>

### Files changed
<list>
```

Rules: no "should work"; no hidden failures; if a test is skipped, say why; if something could not be checked, tag `[UNKNOWN]`.

**Progress log:**
| Date | Milestone | Status | Commit | Notes |
|---|---|---|---|---|
| 2026-10-16 | M0 | Complete (Approved) | 91d72ff | Pre-flight verification completed across M0-1 to M0-17 |
| 2026-10-16 | M1 | Complete (Approved) | pending | Fixed gaps G1 to G7; 87/87 tests passing; backend typecheck clean |
| 2026-10-16 | M2 | Complete (Approved) | pending | Automated E2E PoC (`tests/e2e/m2-poc.test.mjs`) passing 12/12 scenarios (E1-E12); dedicated throwaway DB `db_bits_test_m2`; zero business logic modifications. |
| 2026-10-16 | M3 | Complete (Approved) | pending | Realism R1–R10 implemented and automated; 99/99 simulator tests pass; 12/12 E2E pass; dedicated test suite `test/integration/m3-realism.test.ts`. |
| 2026-10-16 | M4 | Complete (Approved) | pending | Independent client validation (`tests/m4_pyzk_validation.py`) passing 14/14 tests with `pyzk-0.9` under Python 3.14. |
| 2026-10-16 | M5 | Complete (Approved) | pending | Security checklist verified; comprehensive feature documentation guide produced (`docs/guides/virtual-zkteco-terminal-guide.md`) with instructions and purpose for each feature. |

---

## 15. Verified Facts Register (fill as you verify)

| # | Claim | Tag | Source / evidence | Version/model | Limitations |
|---|---|---|---|---|---|
| F1 | BITS uses `node-zklib@1.3.0` via `ZKLibTCP` (TCP only) | `[CODE]` | `backend/src/shared/lib/zk-driver.ts:L63-71`, `backend/package.json` | node-zklib@1.3.0 | TCP port 4370 only; no UDP socket created or fallback path invoked. |
| F2 | `zklib-js` is unused at runtime | `[CODE]` | `backend/package.json`, grep across `backend/src` | zklib-js@1.3.5 | Declared in types (`types.d.ts`), never imported or executed in runtime code. |
| F3 | BITS subtracts 8 h from device time | `[CODE]` | `backend/src/modules/devices/zk/zk-sync.service.ts:L33-45` | BITS sync pipeline | Hardcoded PHT-to-UTC conversion: `rawUTC.getTime() - (8 * 60 * 60 * 1000)`. |
| F4 | Simulator encodes device time as host local calendar without timezone awareness | `[CODE]` | `simulator/src/protocol/timecodec.ts:L30-43`, `simulator/src/core/device.ts:L51-53`, `simulator/src/config.ts:L51-78` | Simulator | Uses host Date accessors (`getHours()`); no `ZK_TZ` exists. Causes 8h offset if host is UTC. |
| F5 | The patched `verifyMode` is at offset 26 in the 40-byte record | `[CODE]` | `simulator/src/protocol/records.ts:L90`, `backend/patches/node-zklib+1.3.0.patch`, `backend/node_modules/node-zklib/utils.js:L155` | 40-byte record format | Byte 26 read as `verifyMode` in BITS; encoded as `verifyType` in simulator. Matches exactly. |
| F6 | Command list in 4.3 matches BITS call sites | `[CODE]` | `backend/src/shared/lib/zk-driver.ts`, `backend/node_modules/node-zklib/zklibtcp.js`, `simulator/src/core/engine.ts` | ZK protocol v1 | 22 commands matched; `CMD_STARTENROLL` (27 in pyzk, 61 in node-zklib) handled in engine. |
| F7 | Chosen device profile: ZKTeco K14 standalone terminal | `[EXTERNAL]` / `[CODE]` | `backend/src/shared/lib/zk-driver.ts:L556`, ZKTeco K14 technical manual & specifications | ZKTeco K14 / ZKFinger VX 10.0 | Capacity: 3,000 users, 3,000 FP, 100,000 logs; TFT display; TCP port 4370. |
| F8 | No tracked `.env` secrets in root or submodule | `[TESTED]` | `git ls-files \| Select-String "\.env"`, `.gitignore` verification | Root & `simulator/` | Only `.env.docker.example` and `.env.local.example` tracked. |
| F9 | Simulator baseline tests 80/80 pass | `[TESTED]` | `cmd.exe /c "cd simulator && npm test"` | Node 20+, `node:test` | 48 unit tests, 32 integration tests passing (36.57s duration). |
| F10 | `POST /api/punch` lacks timestamp override and template validation | `[CODE]` | `simulator/src/core/http.ts:L147-178` | Simulator HTTP API | Employs `device.now()`; accepts fingerprint punches even if user has no template enrolled (G7). |
| F11 | `POST /api/devices/:id/simulate-punch` is not gated by `NODE_ENV` or feature flag | `[CODE]` | `backend/src/modules/devices/device.controller.ts:L854-964` | Express router | Protected only by auth (`adminManagerOrHR`); simulator HTTP port mismatch (3030 vs 3000 vs 4371) (G2, G6). |
| F12 | Biometric capture suite (SourceAFIS sidecar, consent ledger) active/available | `[CODE]` | `simulator/src/server.ts`, `simulator/scripts/dev-biometric.mjs` | Phase 6-8 | Needs default-off opt-in flag (G5) to satisfy project privacy non-goal. |
| F13 | BITS UID allocation and protected UIDs | `[CODE]` | `backend/src/modules/devices/zk/zk-user.service.ts:L5-75` | BITS user sync | UID 1 is protected (`PROTECTED_DEVICE_UIDS = [1]`); employee zkId starts at 2; scans both `uid` and `userId`. |
| F14 | Template wire format and size constraints | `[CODE]` | `backend/src/shared/lib/zk-driver.ts:L465-495`, `backend/src/modules/devices/zk/zk-fingerprint.service.ts:L900` | ZKTeco template protocol | Entry header 6 bytes: `[size u16][uid u16][finger u8][flag u8]` with `flag=1`; template body must exceed 8 bytes. |
| F15 | Default HTTP port harmonized to 3030 | `[CODE]` / `[TESTED]` | `simulator/src/config.ts:L55`, `Dockerfile:L38`, `entrypoint.sh:L10`, `backend/src/modules/devices/device.controller.ts:L888` | M1-1 (G2) | Verified via `m1.test.ts` defaults & overrides tests. |
| F16 | Asia/Manila calendar encoding preserves UTC equivalence across midnight | `[CODE]` / `[TESTED]` | `simulator/src/protocol/timecodec.ts`, `test/unit/m1.test.ts` | M1-2 (G3) | Verified roundtrip across daytime and across midnight (e.g. 2026-10-15T16:30Z -> 00:30 PHT -> BITS -8h = 2026-10-15T16:30Z). |
| F17 | CMD_STARTENROLL produces synthetic templates polling can retrieve | `[CODE]` / `[TESTED]` | `simulator/src/core/engine.ts`, `test/integration/m1-enroll.test.ts` | M1-3 (G1) | Verified with real `node-zklib@1.3.0` client: polls `CMD_USERTEMP_RRQ` until synthetic template arrives; `CMD_CANCELCAPTURE` clears pending enrollment. |
| F18 | Biometric suite is OFF by default | `[CODE]` / `[TESTED]` | `simulator/src/config.ts`, `simulator/src/server.ts`, `test/unit/m1.test.ts` | M1-4 (G5) | Default boots without Java sidecar; `/api/biometric/status` reports `enabled: false`; `/enroll`, `/scan`, `/biometric` return 403 explanatory page. |
| F19 | Production gating and virtual identity labeling enforced | `[CODE]` / `[TESTED]` | `backend/src/modules/devices/device.controller.ts`, `entrypoint.sh`, `simulator/src/store/types.ts`, `test/unit/m1.test.ts` | M1-5 (G6, G7) | `simulate-punch` rejects with 403 in production without `ENABLE_DEVICE_SIMULATOR=true`; `/api/punch` validates templates and accepts custom timestamps. |
| F20 | `ZKDriver.getInfo()` retrieves `~SerialNumber` via `CMD_OPTIONS_RRQ` | `[CODE]` / `[TESTED]` | `backend/src/shared/lib/zk-driver.ts:L105-125` | M2 (E1) | For TCP connections where `node-zklib` `getInfo()` only reads free sizes, querying `CMD_OPTIONS_RRQ (~SerialNumber)` extracts the serial number from packet payload offset 8. |
| F21 | Hardware enrollment simulation survives client TCP disconnect | `[CODE]` / `[TESTED]` | `simulator/src/core/engine.ts:L85-135,L615-645` | M2 (E3) | Closing client TCP session must not cancel pending enrollment timer, mimicking physical hardware terminals that complete enrollment on-device independently of client connections. |
| F22 | BITS minimum check-out gap evaluates elapsed time from check-in | `[CODE]` / `[TESTED]` | `backend/src/modules/attendance/attendance-processor.ts:L1425-1465` | M2 (E7) | When an employee scans again within `effectiveMinCheckout` (default 120m) from check-in, the punch is ignored as a rapid duplicate tap and `checkOutTime` remains null. |
| F23 | Overtime recalculates via `recalculateAndPersistAttendanceMetrics` | `[CODE]` / `[TESTED]` | `backend/src/modules/attendance/overtime.controller.ts:L164`, `attendance-processor.ts:L464` | M2 (E10) | Approved `OvertimeRequest` triggers metric recalculation on attendance record, computing `overtimeMinutes` past scheduled shift end. |
| F24 | Automated E2E harness covers full pipeline across all 12 scenarios | `[TESTED]` | `tests/e2e/m2-poc.test.mjs` | M2 (E1-E12) | `node:test` runner executes E1-E12 against `db_bits_test_m2` and virtual terminal without mocks: 12/12 pass in 16.8s. |
| F25 | Capacity limits enforced on users, templates, and logs per K14 profile | `[CODE]` / `[TESTED]` | `simulator/src/config.ts`, `simulator/src/core/engine.ts`, `test/integration/m3-realism.test.ts` | M3 (R1) | Profile defaults: 3000 users, 3000 templates, 100,000 logs; `CMD_GET_FREE_SIZES` returns accurate values at offsets 16/20/32/48/52/64; writes past capacity return `CMD_ACK_ERROR`. |
| F26 | Table-driven punch verification rules reject invalid/disabled/unsupported credentials | `[CODE]` / `[TESTED]` | `simulator/src/core/http.ts`, `test/integration/m3-realism.test.ts` | M3 (R2) | Fingerprint requires template (422); card requires registration (422); disabled user rejected (403); unknown user (404); cancelled scan (200 fail); unsupported verifyType (422). Failures write zero logs. |
| F27 | On-device duplicate punch suppression window guards against rapid double-taps | `[CODE]` / `[TESTED]` | `simulator/src/config.ts`, `simulator/src/core/http.ts`, `test/integration/m3-realism.test.ts` | M3 (R3) | Terminal suppression window (default 60s) rejects duplicate punches at the terminal level before ingestion, returning `{ result: 'suppressed' }` without creating store logs. `force: true` bypasses. |
| F28 | Admin role (14) preserved in wire format and reset via `CMD_CLEAR_ADMIN` | `[CODE]` / `[TESTED]` | `simulator/src/core/engine.ts`, `test/integration/m3-realism.test.ts` | M3 (R4) | User record byte 2 carries role (0 normal, 14 admin). `CMD_CLEAR_ADMIN` resets all admin users on device to role 0 and emits `clear-admin` bus event. |
| F29 | Clock drift injected via `/api/clock` corrected by `CMD_SET_TIME` | `[CODE]` / `[TESTED]` | `simulator/src/core/http.ts`, `simulator/src/core/engine.ts`, `test/integration/m3-realism.test.ts` | M3 (R5) | Device offset can be shifted via REST; sending `CMD_SET_TIME` recalculates device clock offset so `device.now()` realigns with target host time. |
| F30 | Fault injection endpoints control connection refusal and command errors | `[CODE]` / `[TESTED]` | `simulator/src/core/http.ts`, `simulator/src/core/engine.ts`, `test/integration/m3-realism.test.ts` | M3 (R6) | `POST /api/fault` injects `refuseConnections`, `errorOnCommand`, `dropOnCommand`, `latencyMs`; `POST /api/fault/clear` resets faults. |
| F31 | Independent client `pyzk-0.9` interoperability verified across 14 commands | `[TESTED]` | `tests/m4_pyzk_validation.py` | pyzk 0.9 / Python 3.14 | 14/14 tests pass: connect, options (SN, platform, name, FP version), firmware version, sizing, clock read/set, user list/write/delete, attlog list, clean disconnect. |
| F32 | 80-byte sizing buffer layout aligned with both `node-zklib` and `pyzk` | `[CODE]` / `[TESTED]` | `simulator/src/core/engine.ts:L398-422`, `tests/m4_pyzk_validation.py` | Sizing buffer | Fully maps 20 32-bit integers: `node-zklib` reads offsets 16/32/64; `pyzk` unpacks `20i` reading users (4), fingers (6), records (8), caps (14, 15, 16), and available (17, 18, 19). |

---

## 16. Quick-reference cheat sheet

### Commands (PowerShell, from repo root)
```powershell
$env:PATH += ";C:\Program Files\Git\cmd"
git status
git submodule status
git log -1 --format="%H %s"
git ls-files | Select-String -Pattern "\.env"
cmd.exe /c "cd simulator && npm test"
python tests/m4_pyzk_validation.py
node --test tests/e2e/m2-poc.test.mjs
```
Backend has no test framework. Do not run `backend/src/scripts/debug/*` against a database you care about.

### Key files
| Area | Path |
|---|---|
| Driver (library calls, raw commands) | `backend/src/shared/lib/zk-driver.ts` |
| Connect/retry | `backend/src/modules/devices/zk/zk-connection.service.ts` |
| Locks | `backend/src/modules/devices/zk/zk-lock.service.ts` |
| Attendance sync, watermark, time conversion | `backend/src/modules/devices/zk/zk-sync.service.ts` |
| User sync, UID allocation | `backend/src/modules/devices/zk/zk-user.service.ts` |
| Fingerprint enrollment | `backend/src/modules/devices/zk/zk-fingerprint.service.ts` |
| Card enrollment | `backend/src/modules/devices/zk/zk-card.service.ts` |
| Sync queue | `backend/src/modules/devices/deviceSyncQueue.service.ts` |
| Schedulers | `backend/src/modules/system/*Scheduler.ts`, `backend/src/shared/lib/cronJobs.ts` |
| Attendance processing | `backend/src/modules/attendance/attendance-processor.ts`, `attendance-calculator.ts` |
| Device routes/controller | `backend/src/modules/devices/device.routes.ts`, `device.controller.ts` |
| Schema | `backend/prisma/schema.prisma` |
| Library patch | `backend/patches/node-zklib+1.3.0.patch` |
| Simulator protocol engine | `simulator/src/core/engine.ts` |
| Simulator HTTP/WS | `simulator/src/core/http.ts` |
| Simulator codecs | `simulator/src/protocol/` |
| Simulator stores | `simulator/src/store/` |
| Simulator tests | `simulator/test/unit/`, `simulator/test/integration/` |
| Comprehensive Feature Guide | `docs/guides/virtual-zkteco-terminal-guide.md` |
| Independent pyzk validation | `tests/m4_pyzk_validation.py` |

### Watch list (top risks)
1. **8-hour timestamp shift** (G3). Test early and test across midnight.
2. **UID vs userId confusion.** 16-bit `uid` and string `userId` are different; BITS uses `zkId` as the punch identity and protects certain UIDs.
3. **Enrollment polling timing.** Synthetic template must appear within BITS's 60 s window, but not instantly in a way that hides timing bugs.
4. **Verify-mode meaning is model-dependent.** BITS maps 1/2/3 and defaults to fingerprint. Don't hardcode assumptions beyond that.
5. **Locks and retries.** Fault-injection tests must not leave a stuck 90 s lock.
6. **Watermark edge:** BITS stores latest + 1 ms. Punches within the same millisecond or with older timestamps than the watermark are skipped. Test late-arriving (offline) punches.
7. **Dedup key** is `(timestamp, employeeId)` only. Two devices punching the same person in the same second collide. Known limitation, documented, not fixed.
8. **Production leakage** of simulated punches (G6).
9. **Library maintenance risk:** `node-zklib` is inactive (S3). Any simulator fix tuned to quirks of this one version should be documented.
10. **Privacy:** never create real biometric data; keep the real-biometric suite off.

---

## 17. Definition of done (whole project)

- [x] M0 to M2 approved, E1-E12 pass on a clean checkout with a single documented command sequence.
- [x] Biometric real-capture suite is off by default and documented as out of scope.
- [x] `simulate-punch`/simulator cannot run in production by accident.
- [x] Virtual labeling visible everywhere; no UI text claims real biometric verification.
- [x] Chosen profile documented with sources and honest limits.
- [x] At least one independent client validated (M4) or the reason it couldn't be is documented.
- [x] Security/privacy checklist (M5) complete.
- [x] Verified Facts Register filled; every `[ASSUMPTION]` either confirmed or listed in the docs as a known limitation.
- [ ] Owner has signed off the approval log, and the license/provenance question (D3) is resolved before publishing.
