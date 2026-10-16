import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Monitor,
    Fingerprint,
    RefreshCw,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Clock,
    Server,
    ShieldCheck
} from 'lucide-react'

export function VirtualTerminalGuideBanner() {
    const [isCollapsed, setIsCollapsed] = useState(false)

    return (
        <Card className="border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-teal-500/5 p-4 sm:p-5 rounded-2xl shadow-sm overflow-hidden transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 shadow-sm">
                        <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-bold text-foreground">
                                Virtual ZKTeco Terminal Guide
                            </h2>
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold">
                                ★ DEFAULT HARDWARE
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-muted-foreground border-border font-mono">
                                TCP 127.0.0.1:4370
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            BITS connects directly via raw TCP socket to your standalone ZKTeco K14 terminal emulator.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <a
                        href="http://localhost:3030"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                    >
                        <Monitor className="w-3.5 h-3.5" />
                        Open Virtual Terminal
                        <ExternalLink className="w-3 h-3 opacity-80" />
                    </a>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                        title={isCollapsed ? 'Show Instructions' : 'Hide Instructions'}
                    >
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            {!isCollapsed && (
                <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px]">
                                1
                            </span>
                            Launch Terminal Face
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Click <strong className="text-foreground">Open Virtual Terminal</strong> or navigate to <code className="text-[11px] bg-secondary px-1 py-0.5 rounded text-primary">localhost:3030</code> in your browser.
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Emulates authentic K14 physical faceplate
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px]">
                                2
                            </span>
                            Biometric Punch or PIN
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Select an enrolled employee (e.g., Ana, Ben, Cora) from the dropdown and press <strong className="text-foreground">SCAN</strong>, or type their PIN on the keypad and press <strong className="text-foreground">OK</strong>.
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <Fingerprint className="w-3.5 h-3.5 shrink-0" />
                            60s duplicate suppression active
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono text-[11px]">
                                3
                            </span>
                            Automated TCP Sync
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            BITS automatically queries the terminal every 30 seconds via raw TCP socket. Punches reflect instantly in the <strong className="text-foreground">Biometric Attendance</strong> table.
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            Auto-sync every 30s or on demand
                        </div>
                    </div>
                </div>
            )}
        </Card>
    )
}
