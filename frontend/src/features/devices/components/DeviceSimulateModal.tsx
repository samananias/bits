import React, { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
    Sparkles, 
    Fingerprint, 
    CreditCard, 
    KeyRound, 
    ExternalLink, 
    Check, 
    Loader2, 
    Search, 
    LogIn, 
    LogOut, 
    Clock, 
    AlertCircle, 
    X 
} from 'lucide-react'
import { Device } from './DeviceConfigureModal'

export interface MinimalEmployee {
    id: number
    firstName: string
    lastName: string
    employeeNumber: string | null
    zkId: number | null
}

interface DeviceSimulateModalProps {
    device: Device | null
    employees: MinimalEmployee[]
    isOpen: boolean
    onClose: () => void
    onSuccess: (message: string) => void
}

export function DeviceSimulateModal({
    device,
    employees,
    isOpen,
    onClose,
    onSuccess,
}: DeviceSimulateModalProps) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
    const [state, setState] = useState<number>(0) // 0: Check-In, 1: Check-Out, 4: OT In, 5: OT Out
    const [verifyType, setVerifyType] = useState<number>(1) // 1: Fingerprint, 2: Card, 3: PIN
    const [autoSync, setAutoSync] = useState<boolean>(true)
    const [search, setSearch] = useState<string>('')
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)

    // Filter employees with assigned zkId first, or matching search
    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase()
            const empNum = (emp.employeeNumber || '').toLowerCase()
            const zk = String(emp.zkId || '')
            const q = search.toLowerCase()
            return fullName.includes(q) || empNum.includes(q) || zk.includes(q)
        })
    }, [employees, search])

    const selectedEmployee = useMemo(() => {
        return employees.find(e => String(e.id) === selectedEmployeeId)
    }, [employees, selectedEmployeeId])

    if (!isOpen || !device) return null

    const handleSimulate = async () => {
        if (!selectedEmployeeId) {
            setError('Please select an employee.')
            return
        }

        if (!selectedEmployee?.zkId) {
            setError('The selected employee does not have an assigned Biometric ID (zkId).')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const res = await fetch(`/api/devices/${device.id}/simulate-punch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employeeId: parseInt(selectedEmployeeId),
                    state,
                    verifyType,
                    autoSync,
                }),
            })

            const data = await res.json()

            if (!res.ok || !data.success) {
                setError(data.message || 'Failed to trigger simulated punch.')
                return
            }

            onSuccess(data.message || 'Punch simulated successfully!')
            onClose()
        } catch (err: any) {
            setError(err.message || 'Network error while contacting simulator.')
        } finally {
            setLoading(false)
        }
    }

    const PUNCH_TYPES = [
        { id: 0, label: 'Check-In', desc: 'Standard shift check-in', icon: LogIn, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
        { id: 1, label: 'Check-Out', desc: 'Standard shift check-out', icon: LogOut, color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
        { id: 4, label: 'Overtime In', desc: 'Pre-approved OT entry', icon: Clock, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
        { id: 5, label: 'Overtime Out', desc: 'Overtime exit', icon: Clock, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
    ]

    const VERIFY_TYPES = [
        { id: 1, label: 'Fingerprint', icon: Fingerprint },
        { id: 2, label: 'RFID Card', icon: CreditCard },
        { id: 3, label: 'Keypad PIN', icon: KeyRound },
    ]

    return (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-100 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-purple-500/10 via-primary/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-inner">
                            <Sparkles className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-foreground">Simulate Biometric Scan</h3>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                                    Virtual Device
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Emulate a scan on <strong className="text-foreground">{device.name}</strong> ({device.ip}:{device.port})
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    {/* Simulator Web UI Quick link Banner */}
                    <div className="bg-secondary/30 border border-border/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <p className="text-muted-foreground truncate">
                                Live Device LCD Face available at <span className="font-mono text-foreground font-semibold">http://localhost:3030</span>
                            </p>
                        </div>
                        <a
                            href="http://localhost:3030"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                        >
                            Open UI <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="leading-relaxed">{error}</div>
                        </div>
                    )}

                    {/* Step 1: Employee Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                                1. Select Employee
                            </label>
                            {selectedEmployee?.zkId && (
                                <span className="text-[11px] text-muted-foreground">
                                    Device zkId: <strong className="text-foreground font-mono">{selectedEmployee.zkId}</strong>
                                </span>
                            )}
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by name, employee number, or zkId..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        {/* Employee Select Box */}
                        <div className="border border-border rounded-xl max-h-36 overflow-y-auto divide-y divide-border/40 bg-card">
                            {filteredEmployees.length === 0 ? (
                                <p className="text-center py-4 text-xs text-muted-foreground">No matching employees found.</p>
                            ) : (
                                filteredEmployees.map((emp) => {
                                    const isSelected = selectedEmployeeId === String(emp.id)
                                    const hasZk = emp.zkId !== null
                                    return (
                                        <button
                                            key={emp.id}
                                            type="button"
                                            onClick={() => {
                                                if (hasZk) {
                                                    setSelectedEmployeeId(String(emp.id))
                                                    setError(null)
                                                }
                                            }}
                                            disabled={!hasZk}
                                            className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                                                isSelected
                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                    : hasZk
                                                    ? 'hover:bg-secondary/50 text-foreground'
                                                    : 'opacity-40 cursor-not-allowed bg-secondary/10'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                                                <span className="truncate">{emp.firstName} {emp.lastName}</span>
                                                {emp.employeeNumber && (
                                                    <span className="text-[10px] text-muted-foreground">({emp.employeeNumber})</span>
                                                )}
                                            </div>
                                            <div>
                                                {hasZk ? (
                                                    <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 border-primary/20">
                                                        zkId: {emp.zkId}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">No zkId</span>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Step 2: Punch Type Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                            2. Punch Action
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {PUNCH_TYPES.map((pt) => {
                                const Icon = pt.icon
                                const active = state === pt.id
                                return (
                                    <button
                                        key={pt.id}
                                        type="button"
                                        onClick={() => setState(pt.id)}
                                        className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                                            active
                                                ? `bg-primary/10 border-primary ring-1 ring-primary/40`
                                                : 'border-border/70 hover:border-border hover:bg-secondary/40'
                                        }`}
                                    >
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${pt.color}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-xs font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                                                {pt.label}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                                                {pt.desc}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Step 3: Verification Method */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                            3. Biometric Method
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {VERIFY_TYPES.map((vt) => {
                                const Icon = vt.icon
                                const active = verifyType === vt.id
                                return (
                                    <button
                                        key={vt.id}
                                        type="button"
                                        onClick={() => setVerifyType(vt.id)}
                                        className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                                            active
                                                ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400 font-bold'
                                                : 'border-border hover:bg-secondary/40 text-muted-foreground'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                        <span>{vt.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Auto Sync Toggle */}
                    <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoSync}
                            onChange={(e) => setAutoSync(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                        />
                        <span className="text-xs text-foreground">
                            Immediately pull and calculate attendance in BITS (skip 30s cron wait)
                        </span>
                    </label>
                </div>

                {/* Footer Buttons */}
                <div className="px-6 py-4 border-t border-border bg-secondary/10 flex gap-3">
                    <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 border-border text-xs">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSimulate}
                        disabled={loading || !selectedEmployeeId}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white gap-2 text-xs font-semibold shadow-md"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Processing Punch...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-3.5 h-3.5" />
                                Trigger Simulated Scan
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
