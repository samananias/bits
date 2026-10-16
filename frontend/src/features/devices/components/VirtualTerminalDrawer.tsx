'use client'

import React, { useState, useRef, useEffect } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
    Monitor,
    X,
    RefreshCw,
    ExternalLink,
    Zap,
    Fingerprint,
    CheckCircle2,
    Shield,
    Loader2,
    Clock,
    Radio
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceStream, DeviceLivePunchPayload } from '@/features/devices/hooks/useDeviceStream'
import { Device } from './DeviceConfigureModal'

interface VirtualTerminalDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    device?: Device | null;
}

export function VirtualTerminalDrawer({
    isOpen,
    onClose,
    device,
}: VirtualTerminalDrawerProps) {
    const [iframeKey, setIframeKey] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [lastLivePunch, setLastLivePunch] = useState<DeviceLivePunchPayload | null>(null)
    const [punchFlash, setPunchFlash] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement | null>(null)

    // Listen to real-time live punches while the drawer is active
    useDeviceStream({
        enabled: isOpen,
        onLivePunch: (payload) => {
            setLastLivePunch(payload)
            setPunchFlash(true)
            const t = setTimeout(() => setPunchFlash(false), 3500)
            return () => clearTimeout(t)
        },
    })

    // Reset loading state on reload
    const handleReload = () => {
        setIsLoading(true)
        setIframeKey((prev) => prev + 1)
    }

    const deviceName = device?.name || 'Virtual ZKTeco Terminal'
    const deviceIp = device?.ip || '127.0.0.1'
    const devicePort = device?.port || 4370

    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
                {/* Backdrop with smooth blur */}
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                />

                {/* Centered Pop-up Modal Panel */}
                <DialogPrimitive.Content
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex h-[88vh] w-[95vw] max-w-5xl flex-col bg-card border border-border rounded-2xl shadow-2xl transition ease-in-out duration-200 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 overflow-hidden"
                    aria-describedby="virtual-terminal-desc"
                >
                    {/* Accessible Dialog Title & Description */}
                    <div className="sr-only">
                        <DialogPrimitive.Title>ZKTeco K14 Virtual Terminal</DialogPrimitive.Title>
                        <DialogPrimitive.Description id="virtual-terminal-desc">
                            Interactive ZKTeco K14 biometric terminal simulator for attendance testing and live wire verification.
                        </DialogPrimitive.Description>
                    </div>

                    {/* Top Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-secondary/20">
                        {/* Device Info & Status */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-xs">
                                <Monitor className="w-4 h-4 text-primary" />
                            </div>

                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-foreground text-sm tracking-tight truncate">
                                        {deviceName}
                                    </h3>
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 flex items-center gap-1 font-semibold"
                                    >
                                        <Radio className="w-2.5 h-2.5 animate-pulse" />
                                        ● Online (TCP :{devicePort})
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                    <span className="font-mono text-[11px] text-foreground/80">{deviceIp}:{devicePort}</span>
                                    <span>·</span>
                                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                                        <Zap className="w-3 h-3" />
                                        Sub-Second Real-Time Wire Active
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top Action Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Reload Iframe */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleReload}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Reload Terminal"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                <span className="sr-only">Reload</span>
                            </Button>

                            {/* Open in Dedicated Browser Tab */}
                            <a
                                href="http://localhost:3030"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-foreground hover:bg-secondary border border-border transition-colors"
                                title="Open Terminal in separate browser tab"
                            >
                                <span>Open in New Tab</span>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            </a>

                            {/* Close Modal */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                                title="Close Modal (Esc)"
                            >
                                <X className="w-4 h-4" />
                                <span className="sr-only">Close</span>
                            </Button>
                        </div>
                    </div>

                    {/* Live Punch Toast Notification Pill (Instant Wire Feedback) */}
                    {lastLivePunch && punchFlash && (
                        <div className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between text-xs animate-in slide-in-from-top duration-200 shadow-md">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
                                <div>
                                    <span className="font-bold">{lastLivePunch.employeeName}</span>
                                    <span className="opacity-90 ml-1.5">
                                        verified via {lastLivePunch.authMethod} on {lastLivePunch.deviceName}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono bg-black/20 px-2 py-0.5 rounded-full">
                                <Zap className="w-3 h-3 text-yellow-300" />
                                <span>{lastLivePunch.processedDurationMs}ms</span>
                            </div>
                        </div>
                    )}

                    {/* Main Iframe Body */}
                    <div className="relative flex-1 w-full bg-[#0d1017] p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center">
                        {/* Loading Spinner Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d1017] gap-3">
                                <div className="relative w-12 h-12 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                                    <Fingerprint className="w-6 h-6 text-emerald-500 animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-neutral-200">
                                        Connecting to Virtual Terminal...
                                    </p>
                                    <p className="text-xs text-neutral-400 mt-0.5">
                                        http://localhost:3030
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Interactive Hardware Simulator Iframe */}
                        <iframe
                            key={iframeKey}
                            ref={iframeRef}
                            src="http://localhost:3030"
                            title="ZKTeco K14 Virtual Biometric Terminal"
                            onLoad={() => setIsLoading(false)}
                            className="w-full h-full rounded-xl border border-neutral-800 shadow-2xl bg-[#121419]"
                            allow="autoplay; clipboard-write"
                        />
                    </div>

                    {/* Bottom Utility Bar & Guidance */}
                    <div className="px-5 py-3 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                💡 Tip:
                            </span>
                            <span>
                                Pick an employee and click <strong className="text-foreground">SCAN</strong>, or use quick test scenarios. Punches stream directly to BITS in real-time.
                            </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <a
                                href="http://localhost:3030"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 border-border text-xs"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open in New Tab
                                </Button>
                            </a>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onClose}
                                className="text-xs"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

// Named alias for backwards compatibility
export const VirtualTerminalModal = VirtualTerminalDrawer

