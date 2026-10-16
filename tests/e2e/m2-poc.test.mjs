/**
 * Milestone 2: Automated End-to-End Proof of Concept (E1 to E12)
 *
 * Verifies the entire pipeline:
 * Virtual Terminal (TCP 24370 / HTTP 23030) <-> BITS Driver & Services <-> Throwaway PostgreSQL (db_bits_test_m2) <-> Express API.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// ── 1. Configure environment for throwaway test DB & simulator ────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Read backend/.env for DB credentials
const envFile = fs.readFileSync(path.join(ROOT, 'backend/.env'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) {
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const BASE_DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:root@127.0.0.1:5432/db_bits';
const TEST_DB_URL = BASE_DB_URL.replace(/\/db_bits(\?.*)?$/, '/db_bits_test_m2$1');

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.ENABLE_DEVICE_SIMULATOR = 'true';
process.env.SIMULATOR_HTTP_PORT = '23030';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'c4cdb97cff122569176b20257287bb0dcd0cdac15af2b2f0d52d32bdb41f38fd60f355a8aa9d5b5a4bd3d654967def3a8a3497e0343c626e8628428bb3acb233';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '14d578d1606595afe8f1dbbf43d6eb0b1c230465fea7251efc8fe71621aae03b364aa659c0ecf50d42aadaf362c33ae87eb1472d752a061f16afc2a3838dcdf9';

// ── 2. Imports from compiled packages ─────────────────────────────────────────
const { loadConfig } = await import('../../simulator/dist/config.js');
const { startSimulator } = await import('../../simulator/dist/server.js');
const _prisma = await import('../../backend/dist/shared/lib/prisma.js');
const prisma = _prisma.prisma || _prisma.default?.prisma;

const appModule = await import('../../backend/dist/app.js');
const app = appModule.default?.default || appModule.default;

const _zkUser = await import('../../backend/dist/modules/devices/zk/zk-user.service.js');
const addUserToDevice = _zkUser.addUserToDevice || _zkUser.default?.addUserToDevice;
const deleteUserFromDevice = _zkUser.deleteUserFromDevice || _zkUser.default?.deleteUserFromDevice;

const _queue = await import('../../backend/dist/modules/devices/deviceSyncQueue.service.js');
const processDeviceSyncQueue = _queue.processDeviceSyncQueue || _queue.default?.processDeviceSyncQueue;

const _fp = await import('../../backend/dist/modules/devices/zk/zk-fingerprint.service.js');
const enrollEmployeeFingerprint = _fp.enrollEmployeeFingerprint || _fp.default?.enrollEmployeeFingerprint;

const _sync = await import('../../backend/dist/modules/devices/zk/zk-sync.service.js');
const syncSingleDevice = _sync.syncSingleDevice || _sync.default?.syncSingleDevice;

async function syncDeviceSafe(device) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const res = await syncSingleDevice(device);
    if (!res.skipped) return res;
    await new Promise((r) => setTimeout(r, 200));
  }
  return syncSingleDevice(device);
}

const _proc = await import('../../backend/dist/modules/attendance/attendance-processor.js');
const processAttendanceLogs = _proc.processAttendanceLogs || _proc.default?.processAttendanceLogs;
const recalculateAndPersistAttendanceMetrics = _proc.recalculateAndPersistAttendanceMetrics || _proc.default?.recalculateAndPersistAttendanceMetrics;

const _tok = await import('../../backend/dist/shared/utils/token.utils.js');
const generateAccessToken = _tok.generateAccessToken || _tok.default?.generateAccessToken;

// ── 3. Test Constants ─────────────────────────────────────────────────────────
const SIM_TCP_PORT = 24370;
const SIM_HTTP_PORT = 23030;

let sim = null;
let expressServer = null;
let apiBase = '';
let adminToken = '';
let testDevice = null;
let testEmployee = null;
let adminEmployee = null;
let dayShift = null;
let nightShift = null;

test.before(async () => {
  // Start simulator on dedicated test ports with empty initial seed and fast enroll delay
  sim = await startSimulator(
    loadConfig([
      '--zk-tcp-port', String(SIM_TCP_PORT),
      '--zk-http-port', String(SIM_HTTP_PORT),
      '--zk-log-level', 'error',
      '--zk-seed', 'empty',
      '--zk-enroll-delay-ms', '300',
    ]),
  );

  // Start Express API server on an ephemeral port
  await new Promise((resolve) => {
    expressServer = app.listen(0, '127.0.0.1', () => {
      const addr = expressServer.address();
      apiBase = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Clean throwaway database tables
  await prisma.auditLog.deleteMany({});
  await prisma.attendanceAdjustment.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.attendanceLog.deleteMany({});
  await prisma.employeeFingerprintEnrollment.deleteMany({});
  await prisma.employeeCardEnrollment.deleteMany({});
  await prisma.employeeDeviceEnrollment.deleteMany({});
  await prisma.deviceBiometricExclusion.deleteMany({});
  await prisma.deviceSyncTask.deleteMany({});
  await prisma.overtimeRequest.deleteMany({});
  await prisma.employeeShift.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.device.deleteMany({});
  await prisma.sectionDepartment.deleteMany({});
  await prisma.section.deleteMany({});
  await prisma.managerDepartment.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.holidayBranch.deleteMany({});
  await prisma.companyBranch.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.company.deleteMany({});

  // Seed base entities
  const company = await prisma.company.create({ data: { name: 'Acme Test Corp' } });
  const branch = await prisma.branch.create({ data: { name: 'Main Branch', updatedAt: new Date() } });
  const department = await prisma.department.create({ data: { name: 'Engineering', updatedAt: new Date() } });

  // Standard day shift: 08:00 to 17:00 PHT (break 12:00-13:00)
  dayShift = await prisma.shift.create({
    data: {
      shiftCode: 'DAY01',
      name: 'Regular Day Shift',
      startTime: '08:00',
      endTime: '17:00',
      graceMinutes: 15,
      breakMinutes: 60,
      isNightShift: false,
      workDays: JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
      breaks: JSON.stringify([{ startTime: '12:00', endTime: '13:00' }]),
    },
  });

  // Overnight shift: 22:00 to 06:00 PHT next day
  nightShift = await prisma.shift.create({
    data: {
      shiftCode: 'NIGHT01',
      name: 'Overnight Shift',
      startTime: '22:00',
      endTime: '06:00',
      graceMinutes: 15,
      breakMinutes: 60,
      isNightShift: true,
      workDays: JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
      breaks: JSON.stringify([]),
    },
  });

  // Admin employee for API tokens
  adminEmployee = await prisma.employee.create({
    data: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin.test@example.com',
      employeeNumber: 'ADM-001',
      role: 'ADMIN',
      updatedAt: new Date(),
    },
  });

  adminToken = generateAccessToken({
    employeeId: adminEmployee.id,
    role: 'ADMIN',
    firstName: adminEmployee.firstName,
    lastName: adminEmployee.lastName,
    name: `${adminEmployee.firstName} ${adminEmployee.lastName}`,
  });

  // Test employee (zkId: 2, protected UID 1 is never assigned to employees)
  testEmployee = await prisma.employee.create({
    data: {
      zkId: 2,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan.delacruz@example.com',
      employeeNumber: 'EMP-001',
      role: 'USER',
      cardNumber: 123456,
      departmentId: department.id,
      branchId: branch.id,
      companyId: company.id,
      employmentStatus: 'ACTIVE',
      updatedAt: new Date(),
    },
  });

  // Assign day shift
  await prisma.employeeShift.create({
    data: {
      employeeId: testEmployee.id,
      shiftId: dayShift.id,
      isPrimary: true,
      sortOrder: 0,
    },
  });

  // Create virtual terminal Device in database pointing to simulator
  testDevice = await prisma.device.create({
    data: {
      name: 'BITS-VIRTUAL-K14',
      ip: '127.0.0.1',
      port: SIM_TCP_PORT,
      isActive: true,
      syncEnabled: true,
      updatedAt: new Date(),
    },
  });
});

test.after(async () => {
  if (expressServer) {
    await new Promise((resolve) => expressServer.close(() => resolve()));
  }
  if (sim) {
    await sim.stop();
  }
  await prisma.$disconnect();
  setTimeout(() => process.exit(0), 500).unref();
});

// ── E1: Connection test via POST /api/devices/:id/test ────────────────────────
test('E1: Connection test via POST /api/devices/:id/test reflects virtual profile', async () => {
  const res = await fetch(`${apiBase}/api/devices/${testDevice.id}/test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
  });

  assert.equal(res.status, 200, `test connection failed with status ${res.status}`);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.info.serialNumber, 'VIRT-K14-2026', 'Serial number must match virtual terminal profile');

  // Device status in DB must now be active
  const dbDev = await prisma.device.findUnique({ where: { id: testDevice.id } });
  assert.equal(dbDev.isActive, true);
});

// ── E2: Register employee on device via BITS (addUserToDevice / queue) ────────
test('E2: Register employee on the device via BITS sync queue lands in simulator store', async () => {
  const syncResult = await addUserToDevice(
    testEmployee.zkId,
    `${testEmployee.firstName} ${testEmployee.lastName}`,
    'USER',
    testEmployee.cardNumber,
  );
  assert.equal(syncResult.success, true);

  // Process sync queue for device
  await processDeviceSyncQueue(testDevice.id);

  // Verify employee exists in simulator store
  const simUser = await sim.store.getUser(testEmployee.zkId);
  assert.ok(simUser, 'User must exist on simulator store');
  assert.equal(simUser.uid, 2);
  assert.equal(simUser.userId, '2');
  assert.equal(simUser.name, 'Juan Dela Cruz');
  assert.equal(simUser.card, 123456);
  assert.equal(simUser.role, 0);
});

// ── E3: Synthetic fingerprint enrollment through BITS ────────────────────────
test('E3: Synthetic fingerprint enrollment through BITS completes without timeout', async () => {
  const enrollRes = await enrollEmployeeFingerprint(testEmployee.id, 0, testDevice.id);
  assert.equal(enrollRes.success, true);

  // Poll simulator store for synthetic template (delayMs is 300ms)
  let tpl = null;
  const deadline = Date.now() + 3000;
  while (!tpl && Date.now() < deadline) {
    tpl = await sim.store.getTemplate(testEmployee.zkId, 0);
    if (!tpl) await new Promise((r) => setTimeout(r, 100));
  }

  // Check DB enrollment record
  const enrollDb = await prisma.employeeFingerprintEnrollment.findUnique({
    where: {
      employeeId_deviceId_fingerIndex: {
        employeeId: testEmployee.id,
        deviceId: testDevice.id,
        fingerIndex: 0,
      },
    },
  });
  assert.ok(enrollDb, 'EmployeeFingerprintEnrollment must be saved in DB');
  assert.equal(enrollDb.fingerIndex, 0);

  // Check template in simulator store
  assert.ok(tpl, 'Template must be saved in simulator store');
  assert.equal(tpl.template.toString('ascii', 0, 4), 'SS21', 'Template carries synthetic marker SS21');
  assert.equal(tpl.flag, 1);
});

// ── E4: Punch via simulator, then BITS sync (check-in) ─────────────────────────
test('E4: Punch via simulator, then BITS sync records AttendanceLog and Attendance (check-in)', async () => {
  // 08:00 PHT on Oct 16, 2026 is 00:00 UTC
  const checkInUtc = '2026-10-16T00:00:00.000Z';

  const punchRes = await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: String(testEmployee.zkId),
      verifyType: 1, // Fingerprint
      state: 0,      // Check-in
      timestamp: checkInUtc,
    }),
  });
  assert.equal(punchRes.status, 200);

  // Run BITS sync
  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 1, 'Sync must ingest exactly 1 new log');

  // Process raw logs into Attendance
  const procRes = await processAttendanceLogs();
  assert.ok(procRes.processed >= 1);

  // Assert AttendanceLog in DB
  const logs = await prisma.attendanceLog.findMany({ where: { employeeId: testEmployee.id } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].timestamp.toISOString(), checkInUtc);
  assert.equal(logs[0].authMethod, 'FINGERPRINT');

  // Assert Attendance row in DB
  const atts = await prisma.attendance.findMany({ where: { employeeId: testEmployee.id } });
  assert.equal(atts.length, 1);
  assert.equal(atts[0].checkInTime.toISOString(), checkInUtc);
  assert.equal(atts[0].checkOutTime, null);
  assert.equal(atts[0].status, 'present');
});

// ── E5: Idempotency / Watermark hold ──────────────────────────────────────────
test('E5: Re-running sync creates no duplicate rows (watermark hold)', async () => {
  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 0, 'Subsequent sync must find 0 new logs');

  await processAttendanceLogs();

  const logs = await prisma.attendanceLog.findMany({ where: { employeeId: testEmployee.id } });
  assert.equal(logs.length, 1);

  const atts = await prisma.attendance.findMany({ where: { employeeId: testEmployee.id } });
  assert.equal(atts.length, 1);
});

// ── E6: Second punch beyond minimum check-out gap (check-out) ─────────────────
test('E6: Second punch beyond minimum check-out gap pairs as checkOutTime with metrics', async () => {
  // 17:05 PHT on Oct 16, 2026 is 09:05 UTC (9h 5m after check-in, well past 120m gap)
  const checkOutUtc = '2026-10-16T09:05:00.000Z';

  const punchRes = await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: String(testEmployee.zkId),
      verifyType: 1,
      state: 1, // Check-out
      timestamp: checkOutUtc,
    }),
  });
  assert.equal(punchRes.status, 200);

  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 1);

  await processAttendanceLogs();

  const att = await prisma.attendance.findFirst({ where: { employeeId: testEmployee.id } });
  assert.ok(att);
  assert.equal(att.checkInTime.toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(att.checkOutTime?.toISOString(), checkOutUtc);
  assert.ok(att.totalHours > 7.5, `Total hours must be computed (got ${att.totalHours})`);
});

// ── E7: Second punch within check-out gap ignored as duplicate tap ────────────
test('E7: Repeated punch within minimum check-out gap does not corrupt checkOutTime', async () => {
  // Oct 17 check-in at 08:00 PHT (00:00 UTC) - strictly after Oct 16 watermark
  const oct17InUtc = '2026-10-17T00:00:00.000Z';
  const inRes = await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: String(testEmployee.zkId),
      verifyType: 1,
      state: 0,
      timestamp: oct17InUtc,
    }),
  });
  assert.equal(inRes.status, 200);

  // Rapid tap at 08:05 PHT (00:05 UTC) — only 5 minutes later, within 120m gap
  const rapidTapUtc = '2026-10-17T00:05:00.000Z';
  const tapRes = await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: String(testEmployee.zkId),
      verifyType: 1,
      state: 1,
      timestamp: rapidTapUtc,
    }),
  });
  assert.equal(tapRes.status, 200);

  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 2, 'Sync must ingest both Oct 17 logs');
  await processAttendanceLogs();

  const att = await prisma.attendance.findFirst({
    where: {
      employeeId: testEmployee.id,
      date: new Date('2026-10-17T00:00:00.000+08:00'),
    },
  });
  assert.ok(att, 'Oct 17 attendance must exist');
  assert.equal(att.checkInTime.toISOString(), oct17InUtc);
  assert.equal(att.checkOutTime, null, 'Repeated punch within 120m checkout gap must leave checkOutTime null');

  // Verify AuditLog record exists for the ignored punch
  const auditEntry = await prisma.auditLog.findFirst({
    where: {
      performedBy: testEmployee.id,
      details: { contains: 'Within minimum checkout gap' },
    },
  });
  assert.ok(auditEntry, 'Audit log must record ignored rapid tap');
});

// ── E8: Unknown device user punches ──────────────────────────────────────────
test('E8: Unknown device user punch is skipped by BITS sync without crashing', async () => {
  // Add a user directly to simulator with no corresponding DB Employee
  await sim.store.upsertUser({
    uid: 999,
    userId: '999',
    name: 'Ghost User',
    role: 0,
    password: '',
    card: 999999,
  });

  const punchRes = await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: '999',
      verifyType: 2, // Card
      state: 0,
      timestamp: '2026-10-17T00:30:00.000Z',
    }),
  });
  assert.equal(punchRes.status, 200);

  // Sync should skip the unknown user without throwing
  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 0, 'Unknown zkId must not create AttendanceLog');

  // Watermark still advances safely
  const dev = await prisma.device.findUnique({ where: { id: testDevice.id } });
  assert.ok(dev.lastSyncedAt);
});

// ── E9: Night shift overnight handling ────────────────────────────────────────
test('E9: Night shift punches (22:00 PHT to 06:00 PHT next morning) span correctly', async () => {
  // Create a dedicated night shift employee (zkId: 3)
  const nightWorker = await prisma.employee.create({
    data: {
      zkId: 3,
      firstName: 'Maria',
      lastName: 'Santos',
      email: 'maria.santos@example.com',
      employeeNumber: 'EMP-002',
      role: 'USER',
      cardNumber: 654321,
      employmentStatus: 'ACTIVE',
      updatedAt: new Date(),
    },
  });

  await prisma.employeeShift.create({
    data: {
      employeeId: nightWorker.id,
      shiftId: nightShift.id,
      isPrimary: true,
      sortOrder: 0,
    },
  });

  await sim.store.upsertUser({
    uid: 3,
    userId: '3',
    name: 'Maria Santos',
    role: 0,
    password: '',
    card: 654321,
  });

  // Punch In at 22:00 PHT Oct 17 = 14:00 UTC Oct 17
  const nightInUtc = '2026-10-17T14:00:00.000Z';
  await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '3', verifyType: 2, state: 0, timestamp: nightInUtc }),
  });

  // Punch Out at 06:00 PHT Oct 18 = 22:00 UTC Oct 17
  const nightOutUtc = '2026-10-17T22:00:00.000Z';
  await fetch(`http://127.0.0.1:${SIM_HTTP_PORT}/api/punch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '3', verifyType: 2, state: 1, timestamp: nightOutUtc }),
  });

  const syncRes = await syncDeviceSafe(testDevice);
  assert.equal(syncRes.newLogs, 2, 'Sync must ingest both night shift punches');
  await processAttendanceLogs();

  const att = await prisma.attendance.findFirst({ where: { employeeId: nightWorker.id } });
  assert.ok(att, 'Night shift attendance record must exist');
  assert.equal(att.checkInTime.toISOString(), nightInUtc);
  assert.equal(att.checkOutTime?.toISOString(), nightOutUtc);
  assert.equal(att.shiftId, nightShift.id, 'Must be attributed to the night shift');
});

// ── E10: Overtime calculation with approved OvertimeRequest ───────────────────
test('E10: Overtime is computed with approved OvertimeRequest, and zero without', async () => {
  // Check employee 1's attendance from E6: check-in was 08:00 PHT, check-out 17:05 PHT (5 min past shift end 17:00)
  const attBefore = await prisma.attendance.findFirst({
    where: {
      employeeId: testEmployee.id,
      date: new Date('2026-10-16T00:00:00.000+08:00'),
    },
  });
  assert.ok(attBefore, 'Oct 16 attendance must exist from E6');
  assert.equal(attBefore.overtimeMinutes, 0, 'Without approved OvertimeRequest, overtimeMinutes must be 0');

  // Create an approved overtime request for Oct 16 from 17:00 to 18:00
  const shiftDate = new Date(attBefore.date);
  await prisma.overtimeRequest.create({
    data: {
      employeeId: testEmployee.id,
      date: shiftDate,
      startTime: '17:00',
      endTime: '18:00',
      reason: 'Urgent release testing',
      status: 'APPROVED',
      source: 'REQUESTED',
      reviewedById: adminEmployee.id,
      reviewedAt: new Date(),
    },
  });

  // Re-calculate metrics with the approved overtime request
  await recalculateAndPersistAttendanceMetrics(testEmployee.id, shiftDate);

  const attAfter = await prisma.attendance.findFirst({
    where: {
      employeeId: testEmployee.id,
      date: new Date('2026-10-16T00:00:00.000+08:00'),
    },
  });
  assert.ok(attAfter.overtimeMinutes > 0, `With approved overtime request, overtimeMinutes should be > 0 (got ${attAfter.overtimeMinutes})`);
});

// ── E11: Delete user on BITS removes user and templates from simulator ────────
test('E11: deleteUserFromDevice removes user and templates from simulator store', async () => {
  // Pre-condition: user 2 and template (2, 0) exist on simulator
  assert.ok(await sim.store.getUser(testEmployee.zkId));
  assert.ok(await sim.store.getTemplate(testEmployee.zkId, 0));

  // Delete via BITS
  const delResult = await deleteUserFromDevice(testEmployee.zkId);
  assert.equal(delResult.success, true);

  // Flush sync queue
  await processDeviceSyncQueue(testDevice.id);

  // Verify removed from simulator store
  const userAfter = await sim.store.getUser(testEmployee.zkId);
  assert.equal(userAfter, undefined, 'User must be deleted from simulator');

  const templateAfter = await sim.store.getTemplate(testEmployee.zkId, 0);
  assert.equal(templateAfter, undefined, 'Template must be deleted from simulator');
});

// ── E12: Dashboard / API visibility ──────────────────────────────────────────
test('E12: Attendance records are visible via GET /api/attendance API for authorized role', async () => {
  const res = await fetch(`${apiBase}/api/attendance?startDate=2026-10-15&endDate=2026-10-18`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  assert.equal(res.status, 200, `API request failed with status ${res.status}`);
  const body = await res.json();
  assert.equal(body.success, true);
  const list = body.data || body.attendance;
  assert.ok(Array.isArray(list), 'attendance records must be an array');
  assert.ok(list.length >= 1, `Expected at least 1 record, got ${list.length}`);

  const record = list.find((r) => r.employeeId === testEmployee.id && r.checkOutTime);
  assert.ok(record, 'Test employee attendance with checkOutTime must be in the API result');
  assert.equal(record.status, 'present');
  assert.ok(record.checkInTime);
  assert.ok(record.checkOutTime);
});
