'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAttendanceStream, AttendanceStreamPayload } from '@/features/attendance/hooks/useAttendanceStream';
import { processAttendanceData } from '@/features/attendance/utils/attendance-logic';

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

export interface ManagerDashboardState {
    activity: LiveRecord[];
    weeklyData: WeekDay[];
    totalEmployees: number;
    totalPresent: number;
    totalLate: number;
    totalAbsent: number;
    totalHoliday: number;
    holidayName: string | null;
    activityScrollRef: React.RefObject<HTMLDivElement | null>;
    myDepartments: { id: number; name: string }[];
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

export function useManagerDashboardData() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const activityScrollRef = useRef<HTMLDivElement>(null);

    const [activity, setActivity] = useState<LiveRecord[]>([]);
    const [weeklyData, setWeeklyData] = useState<WeekDay[]>([]);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [totalPresent, setTotalPresent] = useState(0);
    const [totalLate, setTotalLate] = useState(0);
    const [totalAbsent, setTotalAbsent] = useState(0);
    const [totalHoliday, setTotalHoliday] = useState(0);
    const [holidayName, setHolidayName] = useState<string | null>(null);
    const [myDepartments, setMyDepartments] = useState<{ id: number; name: string }[]>([]);

    const load = useCallback(async () => {
        try {
            const todayStr = phtStr(new Date());
            const weekDates = getWeekDates();
            const weekStart = phtStr(weekDates[0].date);
            const weekEnd = phtStr(weekDates[6].date);

            const [statsRes, hRes, dRes] = await Promise.all([
                fetch('/api/attendance/dashboard-stats', { credentials: 'include' }),
                fetch(`/api/holidays?year=${new Date().getFullYear()}`, { credentials: 'include' }),
                fetch('/api/me/departments', { credentials: 'include' }),
            ]);
            if (statsRes.status === 401) { router.replace('/login'); return; }

            const statsData = statsRes.ok ? await statsRes.json() : { success: false };
            const hd = hRes.ok ? await hRes.json() : { success: false };
            const dd = dRes.ok ? await dRes.json() : { success: false, departments: [] };

            if (dd.success) {
                setMyDepartments(dd.departments || []);
            }

            const holidayList: { date: string; name: string }[] = hd.success ? (hd.holidays || []) : [];
            const todayHoliday = holidayList.find(h => new Date(h.date).toISOString().split('T')[0] === todayStr);
            setHolidayName(todayHoliday?.name ?? null);

            if (statsData.success && statsData.stats) {
                const s = statsData.stats;
                setTotalEmployees(s.totalEmployees);
                setTotalPresent(s.totalPresent);
                setTotalLate(s.totalLate);
                setTotalAbsent(s.totalAbsent);
                setWeeklyData(s.weekly);
                setActivity(s.recentActivity || []);
            }
        } catch (err) {
            console.error('[ManagerDashboard] Error loading dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
        // Since we don't know if the incoming stream record belongs to the manager's department
        // directly from the payload without extra logic, we'll just trigger a refresh
        // instead of appending it optimistically to avoid showing out-of-scope employees.
        load();
    }, [load]);

    useAttendanceStream({
        onRecord: handleStreamRecord,
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

    const state: ManagerDashboardState = {
        activity,
        weeklyData,
        totalEmployees,
        totalPresent,
        totalLate,
        totalAbsent,
        totalHoliday,
        holidayName,
        activityScrollRef,
        myDepartments,
    };

    return { state, loading, refresh: load };
}
