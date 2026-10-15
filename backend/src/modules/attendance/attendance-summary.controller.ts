import { Request, Response } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { Prisma } from '@prisma/client';
import { getTodayPHT, formatToPhilippineTime } from './attendance-utils';

interface DayStat {
    day: string;
    date: string;
    present: number;
    late: number;
    absent: number;
}

interface BranchPresenceStat {
    name: string;
    total: number;
    present: number;
    percentage: number;
    color: string;
}

/**
 * Helper to get PHT YYYY-MM-DD date string
 */
function toPhtDateStr(d: Date): string {
    const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return pht.toISOString().slice(0, 10);
}

/**
 * GET /api/attendance/dashboard-stats
 * High-performance lightweight summary endpoint for Admin & Manager dashboards.
 * Replaces client-side fetching of 5,000 raw employee + attendance records with
 * targeted SQL selections and compact scalar payloads.
 */
export const getDashboardSummaryStats = async (req: Request, res: Response) => {
    try {
        const todayPht = getTodayPHT();
        const todayStr = toPhtDateStr(todayPht);

        // Build active employee filter respecting manager department scoping
        const employeeWhere: Prisma.EmployeeWhereInput = {
            employmentStatus: 'ACTIVE',
            role: 'USER',
        };

        if (req.managerDepartmentIds && req.query.scope !== 'company') {
            employeeWhere.departmentId = { in: req.managerDepartmentIds };
        }

        // 1. Total Active Employees
        const totalEmployees = await prisma.employee.count({ where: employeeWhere });

        // Calculate Monday–Sunday week boundaries for current week in PHT
        const now = new Date();
        const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const weekStartUtc = new Date(`${toPhtDateStr(monday)}T00:00:00+08:00`);
        const weekEndUtc = new Date(`${toPhtDateStr(sunday)}T23:59:59+08:00`);

        // 2. Fetch only scalar fields needed for weekly and today aggregation
        const [weekRecords, branches, activeEmployeesWithBranch] = await Promise.all([
            prisma.attendance.findMany({
                where: {
                    date: { gte: weekStartUtc, lte: weekEndUtc },
                    status: { not: 'pending' },
                    employee: employeeWhere,
                },
                select: {
                    id: true,
                    date: true,
                    status: true,
                    lateMinutes: true,
                    checkInTime: true,
                    employeeId: true,
                    employee: {
                        select: {
                            branchId: true,
                        },
                    },
                },
            }),
            prisma.branch.findMany({
                select: { id: true, name: true },
            }),
            prisma.employee.findMany({
                where: employeeWhere,
                select: { id: true, branchId: true },
            }),
        ]);

        // 3. Compute Today's Stats
        const todayRecords = weekRecords.filter(r => toPhtDateStr(r.date) === todayStr);
        let totalPresent = 0;
        let totalLate = 0;

        for (const r of todayRecords) {
            if (r.lateMinutes > 0 || r.status === 'late') {
                totalLate++;
            } else if (r.checkInTime) {
                totalPresent++;
            }
        }

        const totalAbsent = Math.max(0, totalEmployees - (totalPresent + totalLate));

        // 4. Compute Weekly Stats (Mon to Sun)
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weeklyAll: DayStat[] = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = toPhtDateStr(d);
            const dayLabel = dayNames[i];

            if (dateStr > todayStr) {
                weeklyAll.push({ day: dayLabel, date: dateStr, present: 0, late: 0, absent: 0 });
                continue;
            }

            const dayRecords = weekRecords.filter(r => toPhtDateStr(r.date) === dateStr);
            let dayLate = 0;
            let dayPresent = 0;

            for (const r of dayRecords) {
                if (r.lateMinutes > 0 || r.status === 'late') {
                    dayLate++;
                } else if (r.checkInTime) {
                    dayPresent++;
                }
            }

            const dayAbsent = Math.max(0, totalEmployees - (dayPresent + dayLate));
            weeklyAll.push({
                day: dayLabel,
                date: dateStr,
                present: dayPresent,
                late: dayLate,
                absent: dayAbsent,
            });
        }

        // Show Mon–Sat always, Sun only if punches exist
        const weekly = weeklyAll.filter(d => d.day !== 'Sun' || d.present > 0 || d.late > 0);

        // 5. Compute Branch Presence (for Admin / Multi-branch)
        const branchPresence: BranchPresenceStat[] = branches.map(b => {
            const branchEmps = activeEmployeesWithBranch.filter(e => e.branchId === b.id);
            const total = branchEmps.length;
            const branchEmpIds = new Set(branchEmps.map(e => e.id));
            const present = todayRecords.filter(r => branchEmpIds.has(r.employeeId) && r.checkInTime).length;
            const percentage = total === 0 ? 0 : Math.round((present / total) * 100);
            const color = percentage >= 80 ? 'bg-emerald-500' : percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500';

            return {
                name: b.name,
                total,
                present,
                percentage,
                color,
            };
        });

        // 6. Recent Activity Feed (Top 20 today check-ins/check-outs)
        const recentAttendance = await prisma.attendance.findMany({
            where: {
                date: { gte: new Date(`${todayStr}T00:00:00+08:00`), lte: new Date(`${todayStr}T23:59:59+08:00`) },
                status: { not: 'pending' },
                employee: employeeWhere,
            },
            take: 20,
            orderBy: [{ checkInTime: 'desc' }],
            include: {
                employee: {
                    select: {
                        firstName: true,
                        lastName: true,
                        Department: { select: { name: true } },
                        Branch: { select: { name: true } },
                    },
                },
                shift: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        const recentActivity: any[] = [];
        for (const r of recentAttendance) {
            const empName = `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim();
            const dept = r.employee?.Department?.name || '—';
            const branch = r.employee?.Branch?.name || '—';
            const ciStatus = r.status === 'absent' ? 'absent' : (r.lateMinutes > 0 ? 'late' : 'on-time');

            if (r.checkInTime) {
                recentActivity.push({
                    id: `${r.id}-in`,
                    employee: empName,
                    department: dept,
                    branch,
                    eventType: 'check-in',
                    time: formatToPhilippineTime(r.checkInTime),
                    eventTs: new Date(r.checkInTime).getTime(),
                    status: ciStatus,
                    shiftType: r.shift?.name || 'MORNING',
                });
            }

            if (r.checkOutTime) {
                recentActivity.push({
                    id: `${r.id}-out`,
                    employee: empName,
                    department: dept,
                    branch,
                    eventType: 'check-out',
                    time: formatToPhilippineTime(r.checkOutTime),
                    eventTs: new Date(r.checkOutTime).getTime(),
                    status: r.undertimeMinutes > 0 ? 'undertime' : 'on-time',
                    shiftType: r.shift?.name || 'MORNING',
                });
            }
        }
        recentActivity.sort((a, b) => b.eventTs - a.eventTs);
        const topActivity = recentActivity.slice(0, 15);

        res.json({
            success: true,
            stats: {
                totalEmployees,
                totalPresent,
                totalLate,
                totalAbsent,
                weekly,
                branchPresence,
                recentActivity: topActivity,
                todayStr,
            },
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[AttendanceSummary] Error generating dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Failed to generate dashboard stats', error: errMsg });
    }
};
