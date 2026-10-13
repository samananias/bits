"use client";

import React, { useState } from "react"
import { useAuth } from '@/hooks/useAuth'
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout'
import { useTokenRefresh } from '@/hooks/useTokenRefresh'
import { SessionExpiredModal } from './shared/SessionExpiredModal'
import { SessionExpiringWarning } from './shared/SessionExpiringWarning'
import Sidebar from './manager-sidebar'
import TopBar from './manager-topbar'
import { GuestBanner } from './shared/GuestBanner'
import { GlobalLoading } from '@/components/ui/GlobalLoading'

export function ManagerLayout({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated, employee } = useAuth('MANAGER')
    useInactivityTimeout()
    useTokenRefresh()
    const [isMobileOpen, setIsMobileOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)

    // Show loading state while checking auth
    if (isLoading || !isAuthenticated) {
        return (
            <>
                <SessionExpiredModal />
                <GlobalLoading message="Authenticating..." />
            </>
        )
    }

    const isGuest = Boolean(employee?.isGuest)

    return (
        <div className="h-screen bg-slate-50 overflow-hidden relative">
            <SessionExpiredModal />
            <SessionExpiringWarning />
            <GuestBanner employee={employee} />
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-brand focus:font-bold"
            >
                Skip to main content
            </a>

            <header className={`fixed ${isGuest ? 'top-[40px]' : 'top-0'} left-0 right-0 z-40 h-16 transition-all`}>
                <TopBar setIsMobileOpen={setIsMobileOpen} isGuest={isGuest} />
            </header>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <Sidebar
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isGuest={isGuest}
            />

            <div className={`${isGuest ? 'h-[calc(100vh-6.5rem)] mt-[104px]' : 'h-[calc(100vh-4rem)] mt-16'} transition-all duration-300 ${isCollapsed ? 'lg:ml-24' : 'lg:ml-68'}`}>
                <main id="main-content" className="h-full overflow-y-auto scrollbar-light p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
