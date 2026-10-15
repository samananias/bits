'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAttendanceStream, AttendanceStreamPayload } from '@/features/attendance/hooks/useAttendanceStream';
import { useDeviceStream, DeviceStatusPayload, DeviceConnectedPayload } from '@/features/devices/hooks/useDeviceStream';
import { processAttendanceData } from '@/features/attendance/utils/attendance-logic';

interface Branch { id: number; name: string; address?: string; }
interface Device { id: number; name: string; ip: string; port: number; location?: string; isActive: boolean; syncEnabled: boolean; }
export interface DeviceWithStatus extends Device { online: boolean | null; }

interface RawHoliday {
    id: number;
    date: string;
    name: string;
    branches?: { branchId: number }[];
}

interface RawEmployee {
    id: number;
    role: string;
    employmentStatus: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    suffix?: string;
    branchId?: number | null;
    Department?: { name: string };
    Branch?: { name: string };
    Company?: { id: number; name: string } | null;
    Shift?: { name?: string; shiftCode: string; isNightShift: boolean; startTime?: string; endTime?: string; workDays?: string };
    profilePicture?: string | null;
    hireDate?: string;
}

interface RawAttendance {
    id: number;
    employeeId: number;
    employee?: RawEmployee;
    Employee?: RawEmployee;
    date: string;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    totalHours?: number;
    lateMinutes: number;
    overtimeMinutes: number;
    undertimeMinutes: number;
    shiftType?: string;
}

export interface BranchData {
    name: string;
    percentage: number;
    color: string;
}

export interface LiveRecord {
    id: string;
    employee: string;
    department: string;
    branch: string;
    eventType: 'check-in' | 'check-out' | 'delete';
    time: string;
    eventTs: number;
    status: 'on-time' | 'late' | 'absent' | 'undertime' | 'deleted';
    shiftType: string;
}

export interface WeekDay {
    day: string;
    present: number;
    late: number;
    absent: number;
}

export interface DashboardState {
    devices: DeviceWithStatus[];
    branchPresence: BranchData[];
    activity: LiveRecord[];
    weeklyData: WeekDay[];
    totalEmployees: number;
    totalPresent: number;
    totalLate: number;
    totalAbsent: number;
    totalHoliday: number;
    holidayName: string | null;
    globalSyncEnabled: boolean;
    activityScrollRef: React.RefObject<HTMLDivElement | null>;
}

const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(): { day: string; date: Date }[] {
    const now = new Date();
    const todayIndex = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((todayIndex === 0 ? 7 : todayIndex) - 1));
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return { day: dayNames[d.getDay()], date: d };
    });
}

export function useDashboardData(role: 'admin' | 'hr') {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
    const activityScrollRef = useRef<HTMLDivElement>(null);

    const [branchPresence, setBranchPresence] = useState<BranchData[]>([]);
    const [activity, setActivity] = useState<LiveRecord[]>([]);
    const [weeklyData, setWeeklyData] = useState<WeekDay[]>([]);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [totalPresent, setTotalPresent] = useState(0);
    const [totalLate, setTotalLate] = useState(0);
    const [totalAbsent, setTotalAbsent] = useState(0);
    const [totalHoliday, setTotalHoliday] = useState(0);
    const [holidayName, setHolidayName] = useState<string | null>(null);

    const [globalSyncEnabled, setGlobalSyncEnabled] = useState(true);

    const load = useCallback(async () => {
        try {
            const todayStr = phtStr(new Date());

            const [statsRes, dRes, sRes, hRes] = await Promise.all([
                fetch('/api/attendance/dashboard-stats', { credentials: 'include' }),
                fetch('/api/devices', { credentials: 'include' }),
                fetch('/api/system/sync-status', { credentials: 'include' }),
                fetch(`/api/holidays?year=${new Date().getFullYear()}`, { credentials: 'include' }),
            ]);
            if (statsRes.status === 401) { router.replace('/login'); return; }

            const statsData = statsRes.ok ? await statsRes.json() : { success: false };
            const dd = dRes.ok ? await dRes.json() : { success: false };
            const sd = sRes.ok ? await sRes.json() : { success: false };
            const hd = hRes.ok ? await hRes.json() : { success: false };

            // Holiday lookup
            const holidayList: { date: string; name: string }[] = hd.success ? (hd.holidays || []) : [];
            const todayHoliday = holidayList.find(h => new Date(h.date).toISOString().split('T')[0] === todayStr);
            setHolidayName(todayHoliday?.name ?? null);

            // Populate aggregated KPI stats directly from optimized server summary
            if (statsData.success && statsData.stats) {
                const s = statsData.stats;
                setTotalEmployees(s.totalEmployees);
                setTotalPresent(s.totalPresent);
                setTotalLate(s.totalLate);
                setTotalAbsent(s.totalAbsent);
                setWeeklyData(s.weekly);
                setBranchPresence(s.branchPresence);
                setActivity(s.recentActivity || []);
            }

            const deviceList: Device[] = dd.success ? (dd.devices || dd.data || []) : [];
            const devicesWithStatus: DeviceWithStatus[] = deviceList.map(dev => ({
                ...dev,
                syncEnabled: dev.syncEnabled ?? true,
                online: dev.isActive
            }));
            setDevices(devicesWithStatus);

            if (sd && sd.success && sd.status) {
                setGlobalSyncEnabled(sd.status.globalSyncEnabled);
            }
        } catch (err) {
            console.error('[Dashboard] Error loading dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
        const emp = payload.record.employee;
        const empName = emp
            ? `${emp.firstName}${emp.middleName ? ` ${emp.middleName[0]}.` : ''} ${emp.lastName}${emp.suffix ? ` ${emp.suffix}` : ''}`.trim()
            : 'Unknown';
        const isLate = payload.record.lateMinutes > 0;
        const isUndertime = payload.record.undertimeMinutes > 0;

        if (payload.record.status === 'pending') return;

        let eventType: 'check-in' | 'check-out' | 'delete' = 'check-out';
        if (payload.type === 'check-in') eventType = 'check-in';
        if (payload.type === 'delete') eventType = 'delete';

        let timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
        let eventTs = Date.now();
        if (payload.type !== 'delete') {
            const timeDate = new Date(payload.type === 'check-in' ? payload.record.checkInTime : payload.record.checkOutTime!);
            timeStr = timeDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
            eventTs = timeDate.getTime();
        }

        const newEntry: LiveRecord = {
            id: `stream-${payload.record.id}-${payload.type}-${Date.now()}`,
            employee: empName,
            department: emp?.Department?.name || '—',
            branch: emp?.Branch?.name || '—',
            eventType,
            time: timeStr,
            eventTs,
            status: payload.type === 'delete' ? 'deleted' : payload.type === 'check-in' ? (isLate ? 'late' : 'on-time') : (isUndertime ? 'undertime' : 'on-time'),
            shiftType: 'MORNING',
        };

        setActivity(prev => [newEntry, ...prev].slice(0, 15));

        if (payload.type === 'check-in') {
            // On Time and Late are mutually exclusive
            if (isLate) {
                setTotalLate(prev => prev + 1);
            } else {
                setTotalPresent(prev => prev + 1);
            }
            setTotalAbsent(prev => Math.max(0, prev - 1));
        } else if (payload.type === 'delete') {
            setTotalPresent(prev => Math.max(0, prev - 1));
            if (isLate) setTotalLate(prev => Math.max(0, prev - 1));
            setTotalAbsent(prev => prev + 1);
        }
    }, []);

    useAttendanceStream({
        onRecord: handleStreamRecord,
    });

    const handleDeviceConnected = useCallback((payload: DeviceConnectedPayload) => {
        setDevices(prev => prev.map(d => {
            const fresh = payload.devices.find(sd => sd.id === d.id);
            if (!fresh) return d;
            return { ...d, online: fresh.isActive, isActive: fresh.isActive, syncEnabled: fresh.syncEnabled };
        }));
    }, []);

    const handleDeviceStatusChange = useCallback((payload: DeviceStatusPayload) => {
        setDevices(prev => prev.map(d =>
            d.id === payload.id
                ? { ...d, online: payload.isActive, isActive: payload.isActive }
                : d
        ));
    }, []);

    useDeviceStream({
        onConnected: handleDeviceConnected,
        onStatusChange: handleDeviceStatusChange,
    });

    useEffect(() => {
        if (activityScrollRef.current) {
            activityScrollRef.current.scrollTop = 0;
        }
    }, [activity]);

    useEffect(() => {
        fetch('/api/auth/me', { credentials: 'include' })
            .then(r => { if (!r.ok) router.replace('/login'); })
            .catch(() => router.replace('/login'));
        load();
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [load]);

    const state: DashboardState = {
        devices,
        branchPresence,
        activity,
        weeklyData,
        totalEmployees,
        totalPresent,
        totalLate,
        totalAbsent,
        totalHoliday,
        holidayName,
        globalSyncEnabled,
        activityScrollRef,
    };

    return { state, loading, refresh: load };
}
