import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
    Monitor,
    Fingerprint,
    CheckCircle2,
    Clock,
    AlertTriangle,
    ExternalLink,
    X,
    Cpu,
    Info,
    Network
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface VirtualTerminalInfoModalProps {
    isOpen: boolean
    onClose: () => void
}

export function VirtualTerminalInfoModal({ isOpen, onClose }: VirtualTerminalInfoModalProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    return createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Monitor className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-foreground">
                                    Virtual ZKTeco Terminal
                                </h2>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold">
                                    K14 EMULATION
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">
                                TCP: 127.0.0.1:4370 · HTTP: :3030
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title="Close modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed">
                    
                    {/* Crucial Clarification Banner */}
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                        <div className="flex items-start gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1.5">
                                <p className="font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                                    Important Notice & Clarification
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    The <strong>Virtual ZKTeco Machine is not a replacement for a physical ZKTeco biometric machine</strong>, but a <strong>virtual representation of how it works with ZKTeco</strong>.
                                </p>
                                <p className="text-muted-foreground leading-relaxed text-[11px]">
                                    It operates on real TCP socket port <code className="font-mono bg-amber-500/10 px-1 py-0.5 rounded">4370</code> and executes the exact ZKTeco standalone communication protocol (handshake, attendance log retrieval, user sync) so you can verify attendance workflows end-to-end without needing a physical terminal plugged in.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* What is it? */}
                    <div className="space-y-1.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-primary" />
                            What is the Virtual Terminal?
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            It runs a standalone network process that opens real TCP socket port <code className="text-[11px] bg-secondary px-1 py-0.5 rounded text-foreground font-mono">4370</code> and serves an interactive device face on port <code className="text-[11px] bg-secondary px-1 py-0.5 rounded text-foreground font-mono">3030</code>. BITS talks to it using the exact same ZKTeco binary protocol commands (handshake, get attendance logs, user sync, clock sync) as physical hardware.
                        </p>
                    </div>

                    {/* How to use */}
                    <div className="space-y-2 pt-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Fingerprint className="w-3.5 h-3.5 text-primary" />
                            How to Use It:
                        </h3>

                        <div className="space-y-2">
                            <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/60">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px] font-bold shrink-0 mt-0.5">
                                    1
                                </span>
                                <div className="text-xs text-muted-foreground">
                                    <strong className="text-foreground">Open the Terminal Face:</strong> Click the <em>Open Virtual Terminal Face</em> button or navigate to <code className="text-[11px] bg-secondary px-1 py-0.5 rounded text-foreground font-mono">http://localhost:3030</code> in your browser.
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/60">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px] font-bold shrink-0 mt-0.5">
                                    2
                                </span>
                                <div className="text-xs text-muted-foreground">
                                    <strong className="text-foreground">Perform a Punch:</strong> Select an employee from the dropdown and click <strong className="text-foreground">SCAN</strong>, or type their PIN on the keypad (using digits 0–9) and press <strong className="text-foreground">OK</strong>.
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/60">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px] font-bold shrink-0 mt-0.5">
                                    3
                                </span>
                                <div className="text-xs text-muted-foreground">
                                    <strong className="text-foreground">Automatic TCP Sync:</strong> BITS queries the terminal over TCP port 4370 every 30 seconds. The punch reflects immediately on the <strong className="text-foreground">Attendance</strong> dashboard.
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-6 py-3.5 border-t border-border bg-secondary/20">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                        <Network className="w-3.5 h-3.5 text-emerald-500" />
                        Status: Active & Listening (:4370)
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClose}
                            className="text-xs"
                        >
                            Close
                        </Button>
                        <a
                            href={process.env.NEXT_PUBLIC_ZK_SIMULATOR_URL || "http://localhost:3030"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                        >
                            <Monitor className="w-3.5 h-3.5" />
                            Open Terminal
                            <ExternalLink className="w-3 h-3 opacity-80" />
                        </a>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
