'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Eye, LogOut, ArrowRight, ShieldAlert, Sparkles, Loader2, X } from 'lucide-react';
import type { AuthEmployee } from '@/hooks/useAuth';

interface GuestBannerProps {
    employee: AuthEmployee | null;
}

type DemoRole = 'ADMIN' | 'HR' | 'MANAGER' | 'USER';

interface RoleOption {
    id: DemoRole;
    label: string;
    path: string;
    badge: string;
    description: string;
}

const ROLES: RoleOption[] = [
    { id: 'ADMIN', label: 'Admin', path: '/dashboard', badge: 'Full System', description: 'System overview, devices, shifts, accounts & audit logs' },
    { id: 'HR', label: 'HR Portal', path: '/hr/dashboard', badge: 'Personnel', description: 'Employees, branches, attendance & holidays' },
    { id: 'MANAGER', label: 'Manager', path: '/manager/dashboard', badge: 'Department', description: 'Department-scoped team attendance, shifts & overtime' },
    { id: 'USER', label: 'Employee', path: '/employee/dashboard', badge: 'Self-Service', description: 'Personal timecard, schedule, overtime & profile' },
];

export function GuestBanner({ employee }: GuestBannerProps) {
    const router = useRouter();
    const [isSwitching, setIsSwitching] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

    useEffect(() => {
        const handleBlocked = (e: any) => {
            const msg = e?.detail?.message || 'Actions modifying data are disabled in Guest Mode.';
            setBlockedNotice(msg);
            const timer = setTimeout(() => {
                setBlockedNotice(null);
            }, 5000);
            return () => clearTimeout(timer);
        };

        window.addEventListener('guest-action-blocked', handleBlocked);
        return () => window.removeEventListener('guest-action-blocked', handleBlocked);
    }, []);

    if (!employee?.isGuest) {
        return null;
    }

    const currentRole: DemoRole = (employee.guestViewRole || employee.role || 'ADMIN') as DemoRole;

    const handleRoleSwitch = async (targetRole: DemoRole, targetPath: string) => {
        if (targetRole === currentRole || isSwitching) return;

        setIsSwitching(true);
        try {
            const res = await fetch('/api/auth/guest-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: targetRole }),
            });

            if (res.ok) {
                window.location.href = targetPath;
                return;
            } else {
                console.error('Failed to switch guest view role');
            }
        } catch (err) {
            console.error('Error switching guest view:', err);
        } finally {
            setIsSwitching(false);
        }
    };

    const handleExitGuest = async () => {
        setIsExiting(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
            // Ignore error
        } finally {
            window.location.href = '/login';
        }
    };

    return (
        <aside
            aria-label="Guest Mode Notification and Controls"
            className="fixed top-0 left-0 right-0 h-[40px] bg-gradient-to-r from-[#1a0507] via-[#2a0c0e] to-[#1a0507] text-white border-b border-red-900/40 shadow-md z-50 flex items-center justify-between px-3 sm:px-6 text-xs transition-all"
        >
            <div className="w-full flex items-center justify-between gap-2">
                
                {/* Left: Mode Status Pill */}
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-200 border border-red-500/30 font-bold uppercase tracking-wider text-[10px]">
                        <Eye className="w-3.5 h-3.5 animate-pulse text-red-400" />
                        Guest Mode (Read-Only)
                    </span>
                    <span className="hidden md:inline text-red-200/70 text-[11px]">
                        Exploring live simulated views. All mutations are blocked & sensitive PII is masked.
                    </span>
                </div>

                {/* Center / Right: Interactive Role Switcher Segmented Tabs */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="text-red-200/70 font-medium text-[11px] hidden sm:inline">
                        Switch View:
                    </span>

                    <div className="inline-flex p-0.5 rounded-lg bg-black/40 border border-red-900/40 shadow-inner">
                        {ROLES.map((role) => {
                            const isActive = role.id === currentRole;
                            return (
                                <button
                                    key={role.id}
                                    type="button"
                                    onClick={() => handleRoleSwitch(role.id, role.path)}
                                    disabled={isSwitching || isActive}
                                    title={role.description}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:cursor-default ${
                                        isActive
                                            ? 'bg-red-600 text-white shadow-sm font-bold border border-red-400/30'
                                            : 'text-red-100/70 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {isSwitching && isActive ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    {role.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Exit Demo Button */}
                    <button
                        type="button"
                        onClick={handleExitGuest}
                        disabled={isExiting}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/30 hover:bg-red-900/40 hover:text-red-200 text-red-200/80 border border-red-900/30 hover:border-red-500/40 transition-all font-medium text-[11px] cursor-pointer"
                        title="Exit Guest Mode and return to Login"
                    >
                        {isExiting ? (
                            <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                        ) : (
                            <LogOut className="w-3 h-3" />
                        )}
                        <span className="hidden sm:inline">Exit</span>
                    </button>
                </div>
            </div>

            {/* Blocked Mutation Toast */}
            {blockedNotice && (
                <div className="fixed top-[48px] left-1/2 -translate-x-1/2 z-[70] bg-rose-950/95 text-rose-100 border border-rose-500/50 shadow-2xl backdrop-blur-md rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200 max-w-lg">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="flex-1">{blockedNotice}</span>
                    <button
                        type="button"
                        onClick={() => setBlockedNotice(null)}
                        className="p-1 text-rose-400 hover:text-rose-100 rounded-lg hover:bg-rose-900/50 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </aside>
    );
}
