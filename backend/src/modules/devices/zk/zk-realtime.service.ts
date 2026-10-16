import net from 'net';
import { prisma } from '../../../shared/lib/prisma';
import deviceEmitter from '../../../shared/events/deviceEmitter';
import { processAttendanceLogs } from '../../attendance/attendance.service';
import { audit } from '../../../shared/lib/auditLogger';

// Import node-zklib TCP framing helpers and constants
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createTCPHeader, removeTcpHeader } = require('node-zklib/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { COMMANDS } = require('node-zklib/constants');

export interface RealtimePunchEvent {
    deviceId: number;
    deviceName: string;
    deviceIp: string;
    zkUserId: number;
    employeeId: number;
    employeeName: string;
    authMethod: 'FINGERPRINT' | 'CARD' | 'PASSWORD';
    verifyType: number;
    deviceTimestamp: Date;
    utcTimestamp: Date;
    processedDurationMs: number;
}

function getAuthMethodFromVerifyType(verifyType: number): 'FINGERPRINT' | 'CARD' | 'PASSWORD' {
    switch (verifyType) {
        case 1:
            return 'FINGERPRINT';
        case 2:
            return 'CARD';
        case 3:
            return 'PASSWORD';
        default:
            return 'FINGERPRINT';
    }
}

/**
 * Single TCP Realtime Event Client for a ZKTeco terminal
 * Keeps a persistent connection open, registers for EF_ATTLOG (CMD_REG_EVENT = 500, flag = 1),
 * parses incoming sub-second event frames, and auto-reconnects on disconnection.
 */
class RealtimeDeviceClient {
    public readonly deviceId: number;
    public readonly deviceName: string;
    public readonly ip: string;
    public readonly port: number;

    private socket: net.Socket | null = null;
    private buffer: Buffer = Buffer.alloc(0);
    private sessionId: number = 0;
    private replyId: number = 0;
    private isConnected: boolean = false;
    private isDestroyed: boolean = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private onPunchCallback: (event: RealtimePunchEvent) => Promise<void>;

    constructor(
        device: { id: number; name: string; ip: string; port: number },
        onPunch: (event: RealtimePunchEvent) => Promise<void>
    ) {
        this.deviceId = device.id;
        this.deviceName = device.name;
        this.ip = device.ip;
        this.port = device.port || 4370;
        this.onPunchCallback = onPunch;
    }

    public connect(): void {
        if (this.isDestroyed || this.socket) return;

        console.log(`[ZKRealtime] Connecting persistent event stream to "${this.deviceName}" (${this.ip}:${this.port})...`);

        const socket = new net.Socket();
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.sessionId = 0;
        this.replyId = 0;
        this.isConnected = false;

        socket.setKeepAlive(true, 10000);

        socket.on('connect', () => {
            console.log(`[ZKRealtime] TCP established to "${this.deviceName}". Handshaking CMD_CONNECT...`);
            const connectBuf = createTCPHeader(COMMANDS.CMD_CONNECT, 0, 0, Buffer.alloc(0));
            socket.write(connectBuf);
        });

        socket.on('data', (data: Buffer) => {
            this.handleIncomingData(data);
        });

        socket.on('error', (err: Error) => {
            console.warn(`[ZKRealtime] Socket error on "${this.deviceName}": ${err.message}`);
        });

        socket.on('close', () => {
            console.log(`[ZKRealtime] Socket closed for "${this.deviceName}".`);
            this.cleanupSocket();
            this.scheduleReconnect();
        });

        socket.connect(this.port, this.ip);
    }

    private cleanupSocket(): void {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.isConnected = false;
    }

    private scheduleReconnect(): void {
        if (this.isDestroyed || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.isDestroyed) {
                this.connect();
            }
        }, 5000); // 5s retry backoff
    }

    public destroy(): void {
        this.isDestroyed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.cleanupSocket();
    }

    public getStatus(): { isConnected: boolean; deviceId: number; ip: string } {
        return {
            isConnected: this.isConnected,
            deviceId: this.deviceId,
            ip: this.ip,
        };
    }

    private handleIncomingData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= 8) {
            // Check for ZKTeco TCP Magic: [0x50, 0x50, 0x82, 0x7d]
            const magicMatches =
                this.buffer[0] === 0x50 &&
                this.buffer[1] === 0x50 &&
                this.buffer[2] === 0x82 &&
                this.buffer[3] === 0x7d;

            if (!magicMatches) {
                // Not starting with magic: advance 1 byte to find alignment
                this.buffer = this.buffer.subarray(1);
                continue;
            }

            const frameLen = this.buffer.readUInt16LE(4);
            const totalPacketLen = 8 + frameLen;

            if (this.buffer.length < totalPacketLen) {
                // Incomplete packet in buffer: wait for next TCP chunk
                break;
            }

            const packet = this.buffer.subarray(0, totalPacketLen);
            this.buffer = this.buffer.subarray(totalPacketLen);

            this.processPacket(packet);
        }
    }

    private processPacket(packet: Buffer): void {
        const frame = removeTcpHeader(packet);
        if (!frame || frame.length < 8) return;

        const cmd = frame.readUInt16LE(0);
        const sess = frame.readUInt16LE(4);

        if (!this.isConnected) {
            // Step 1: Handling response to CMD_CONNECT
            if (cmd === COMMANDS.CMD_ACK_OK) {
                this.sessionId = sess;
                this.replyId = 1;
                console.log(`[ZKRealtime] Connected to "${this.deviceName}" (session ${this.sessionId}). Registering EF_ATTLOG...`);

                // Step 2: Register for EF_ATTLOG (flag 0x00000001)
                const regBuf = createTCPHeader(
                    COMMANDS.CMD_REG_EVENT,
                    this.sessionId,
                    this.replyId,
                    Buffer.from([0x01, 0x00, 0x00, 0x00])
                );
                this.socket?.write(regBuf);
                this.isConnected = true;
            }
            return;
        }

        // Check if packet is CMD_REG_EVENT with EF_ATTLOG (flag 1)
        if (cmd === COMMANDS.CMD_REG_EVENT && (sess === 1 || sess === COMMANDS.EF_ATTLOG)) {
            const payload = frame.subarray(8);
            if (payload.length >= 32) {
                this.decodeAndDispatchAttendance(payload);
            }
        }
    }

    private decodeAndDispatchAttendance(payload: Buffer): void {
        const startTime = Date.now();

        // 1. User ID (ASCII bytes 0..8)
        const deviceUserId = payload
            .subarray(0, 9)
            .toString('ascii')
            .replace(/\0.*$/, '')
            .trim();

        // 2. Verify Type (u16 LE at offset 24)
        const verifyType = payload.readUInt16LE(24);

        // 3. Raw BCD / integer date components (offsets 26..31)
        const rawYear = payload.readUInt8(26);
        const rawMonth = payload.readUInt8(27);
        const rawDay = payload.readUInt8(28);
        const rawHour = payload.readUInt8(29);
        const rawMinute = payload.readUInt8(30);
        const rawSecond = payload.readUInt8(31);

        const year = 2000 + rawYear;
        const month = rawMonth; // 1-indexed
        const day = rawDay;
        const hour = rawHour;
        const minute = rawMinute;
        const second = rawSecond;

        // Construct device printed date
        const deviceTimestamp = new Date(year, month - 1, day, hour, minute, second);

        // Map strictly to UTC (-8 hours for Philippine Standard Time)
        const rawUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        const utcTimestamp = new Date(rawUTC.getTime() - 8 * 60 * 60 * 1000);

        const zkUserId = parseInt(deviceUserId, 10);
        if (isNaN(zkUserId)) {
            console.warn(`[ZKRealtime] Received invalid deviceUserId "${deviceUserId}" from "${this.deviceName}"`);
            return;
        }

        const authMethod = getAuthMethodFromVerifyType(verifyType);

        console.log(
            `[ZKRealtime] ⚡ Instant EF_ATTLOG event received from "${this.deviceName}": ` +
            `zkUserId=${zkUserId}, auth=${authMethod}, deviceTime=${deviceTimestamp.toISOString()}, ` +
            `utcTime=${utcTimestamp.toISOString()}`
        );

        // Hand off to central processor
        void this.onPunchCallback({
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            deviceIp: this.ip,
            zkUserId,
            employeeId: 0, // will be resolved in handler
            employeeName: '',
            authMethod,
            verifyType,
            deviceTimestamp,
            utcTimestamp,
            processedDurationMs: Date.now() - startTime,
        });
    }
}

/**
 * Service that manages real-time sub-second EF_ATTLOG streams
 * for all configured and active ZKTeco devices.
 */
class ZKRealtimeService {
    private clients: Map<number, RealtimeDeviceClient> = new Map();
    private isRunning: boolean = false;

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[ZKRealtime] Starting sub-second live attendance event listener service...');
        await this.syncDeviceList();
    }

    public stop(): void {
        this.isRunning = false;
        for (const client of this.clients.values()) {
            client.destroy();
        }
        this.clients.clear();
        console.log('[ZKRealtime] Stopped all realtime event listeners.');
    }

    public async syncDeviceList(): Promise<void> {
        if (!this.isRunning) return;

        try {
            const devices = await prisma.device.findMany({
                where: {
                    isActive: true,
                    syncEnabled: true,
                },
            });

            const activeIds = new Set(devices.map((d) => d.id));

            // Stop clients for removed/disabled devices
            for (const [id, client] of this.clients.entries()) {
                if (!activeIds.has(id)) {
                    console.log(`[ZKRealtime] Removing client for disabled/removed device ${id}`);
                    client.destroy();
                    this.clients.delete(id);
                }
            }

            // Start clients for new/enabled devices
            for (const device of devices) {
                if (!this.clients.has(device.id)) {
                    const client = new RealtimeDeviceClient(device, (event) => this.handleLivePunch(device, event));
                    this.clients.set(device.id, client);
                    client.connect();
                }
            }
        } catch (error) {
            console.error('[ZKRealtime] Error syncing device list for realtime listener:', error);
        }
    }

    public getStatus(): { isRunning: boolean; activeStreams: number; clients: Array<{ deviceId: number; ip: string; isConnected: boolean }> } {
        const clientStatuses = Array.from(this.clients.values()).map((c) => c.getStatus());
        return {
            isRunning: this.isRunning,
            activeStreams: clientStatuses.filter((s) => s.isConnected).length,
            clients: clientStatuses,
        };
    }

    private async handleLivePunch(
        device: { id: number; name: string; ip: string },
        event: RealtimePunchEvent
    ): Promise<void> {
        const punchStart = Date.now();

        try {
            // 1. Resolve Employee by zkId or id
            let employee = await prisma.employee.findUnique({
                where: { zkId: event.zkUserId },
                include: { Shift: true },
            });

            if (!employee) {
                // Fallback check by primary key
                employee = await prisma.employee.findUnique({
                    where: { id: event.zkUserId },
                    include: { Shift: true },
                });
            }

            if (!employee) {
                console.warn(
                    `[ZKRealtime] Ignored live punch: Employee with zkId/id ${event.zkUserId} not found in database.`
                );
                void audit({
                    action: 'SECURITY_ALERT',
                    level: 'WARN',
                    entityType: 'Attendance',
                    entityId: event.zkUserId,
                    performedBy: 0,
                    source: 'device-stream',
                    details: `Unenrolled or unknown zkUserId ${event.zkUserId} attempted punch on ${device.name}`,
                    metadata: { deviceId: device.id, zkUserId: event.zkUserId },
                });
                return;
            }

            // 1b. Validate Employment Status (Active employees only)
            if (employee.employmentStatus !== 'ACTIVE') {
                console.warn(
                    `[ZKRealtime] ⚠️ Rejected live punch: Employee "${employee.firstName} ${employee.lastName}" is not ACTIVE (${employee.employmentStatus}).`
                );
                void audit({
                    action: 'SECURITY_ALERT',
                    level: 'WARN',
                    entityType: 'Attendance',
                    entityId: employee.id,
                    performedBy: employee.id,
                    source: 'device-stream',
                    details: `Inactive/Terminated employee "${employee.firstName} ${employee.lastName}" (${employee.employmentStatus}) attempted biometric punch on ${device.name}`,
                    metadata: {
                        deviceId: device.id,
                        employeeId: employee.id,
                        status: employee.employmentStatus,
                        zkUserId: event.zkUserId,
                    },
                });
                return;
            }

            // 1c. Validate Timestamp Sanity Bounds (reject impossible future or ancient dates)
            const nowMs = Date.now();
            const punchMs = event.utcTimestamp.getTime();
            if (isNaN(punchMs) || punchMs > nowMs + 24 * 60 * 60 * 1000 || punchMs < nowMs - 365 * 24 * 60 * 60 * 1000) {
                console.warn(
                    `[ZKRealtime] ⚠️ Rejected live punch with anomalous timestamp: ${event.utcTimestamp.toISOString()}`
                );
                return;
            }

            event.employeeId = employee.id;
            event.employeeName = `${employee.firstName} ${employee.lastName}`;

            // 2. Check for duplicate exact timestamp in AttendanceLog
            const existingLog = await prisma.attendanceLog.findUnique({
                where: {
                    timestamp_employeeId: {
                        timestamp: event.utcTimestamp,
                        employeeId: employee.id,
                    },
                },
            });

            if (existingLog) {
                console.log(
                    `[ZKRealtime] Duplicate punch detected for ${event.employeeName} at ${event.utcTimestamp.toISOString()} — skipping.`
                );
            } else {
                // 3. Persist raw AttendanceLog immediately
                await prisma.attendanceLog.create({
                    data: {
                        timestamp: event.utcTimestamp,
                        employeeId: employee.id,
                        status: 0,
                        deviceId: device.id,
                        authMethod: event.authMethod,
                    },
                });
            }

            // 4. Advance device watermark and record heartbeat
            const nextWatermark = new Date(event.utcTimestamp.getTime() + 1);
            await prisma.device.update({
                where: { id: device.id },
                data: {
                    lastSyncedAt: nextWatermark,
                    lastSyncStatus: 'SUCCESS',
                    lastSyncError: null,
                    lastPolledAt: new Date(),
                },
            });

            // 5. Instantly recalculate shift attendance
            // processAttendanceLogs() evaluates grace periods, lates, check-in vs check-out,
            // updates the Attendance table, and emits attendanceEmitter.emit('new-record', ...)
            // which pushes an instant SSE event over /api/attendance/stream!
            await processAttendanceLogs();

            const totalDurationMs = Date.now() - punchStart;
            event.processedDurationMs = totalDurationMs;

            // 6. Broadcast live punch event on deviceEmitter for UI streams
            deviceEmitter.emit('attendance-live-punch', event);

            deviceEmitter.emit('device-sync-result', {
                id: device.id,
                lastSyncStatus: 'SUCCESS',
                lastSyncedAt: nextWatermark,
                lastSyncError: null,
                lastPolledAt: new Date(),
            });

            console.log(
                `[ZKRealtime] 🚀 LIVE PUNCH INGESTED in ${totalDurationMs}ms: ` +
                `${event.employeeName} (${event.authMethod}) -> DB updated & SSE dispatched.`
            );

            // 7. Audit log
            void audit({
                action: 'LIVE_PUNCH',
                level: 'INFO',
                entityType: 'Attendance',
                entityId: employee.id,
                performedBy: employee.id,
                source: 'device-stream',
                details: `Instant live punch captured via EF_ATTLOG for ${event.employeeName} from ${device.name} in ${totalDurationMs}ms`,
                metadata: {
                    deviceId: device.id,
                    deviceName: device.name,
                    zkUserId: event.zkUserId,
                    authMethod: event.authMethod,
                    timestamp: event.utcTimestamp.toISOString(),
                    durationMs: totalDurationMs,
                },
            });
        } catch (error) {
            console.error(`[ZKRealtime] Error processing live punch for zkId ${event.zkUserId}:`, error);
        }
    }
}

export const zkRealtimeService = new ZKRealtimeService();
