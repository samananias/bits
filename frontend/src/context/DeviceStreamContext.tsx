'use client'

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import {
    useDeviceStream,
    DeviceStatusPayload,
    DeviceConnectedPayload,
    DeviceSyncResultPayload,
} from '@/features/devices/hooks/useDeviceStream'

export interface DeviceStreamContextValue {
    deviceOnline: boolean | null
    devices: DeviceConnectedPayload['devices']
    lastStatusChange: DeviceStatusPayload | null
    lastSyncResult: DeviceSyncResultPayload | null
    configUpdateCount: number
}

const DeviceStreamContext = createContext<DeviceStreamContextValue | null>(null)

export function DeviceStreamProvider({ children }: { children: React.ReactNode }) {
    const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null)
    const [devices, setDevices] = useState<DeviceConnectedPayload['devices']>([])
    const [lastStatusChange, setLastStatusChange] = useState<DeviceStatusPayload | null>(null)
    const [lastSyncResult, setLastSyncResult] = useState<DeviceSyncResultPayload | null>(null)
    const [configUpdateCount, setConfigUpdateCount] = useState(0)

    const handleConnected = useCallback((payload: DeviceConnectedPayload) => {
        setDevices(payload.devices)
        setDeviceOnline(payload.devices.some(d => d.isActive))
    }, [])

    const handleStatusChange = useCallback((payload: DeviceStatusPayload) => {
        setLastStatusChange(payload)
        setDevices(prev =>
            prev.map(d => (d.id === payload.id ? { ...d, isActive: payload.isActive } : d))
        )
        setDeviceOnline(payload.isActive)
    }, [])

    const handleSyncResult = useCallback((payload: DeviceSyncResultPayload) => {
        setLastSyncResult(payload)
        setDevices(prev =>
            prev.map(d =>
                d.id === payload.id
                    ? {
                          ...d,
                          lastSyncStatus: payload.lastSyncStatus,
                          lastSyncedAt: payload.lastSyncedAt ?? d.lastSyncedAt,
                          lastSyncError: payload.lastSyncError,
                          lastPolledAt: payload.lastPolledAt ?? d.lastPolledAt,
                      }
                    : d
            )
        )
    }, [])

    const handleConfigUpdate = useCallback(() => {
        setConfigUpdateCount(c => c + 1)
    }, [])

    useDeviceStream({
        onConnected: handleConnected,
        onStatusChange: handleStatusChange,
        onSyncResult: handleSyncResult,
        onConfigUpdate: handleConfigUpdate,
    })

    const value = useMemo(
        () => ({
            deviceOnline,
            devices,
            lastStatusChange,
            lastSyncResult,
            configUpdateCount,
        }),
        [deviceOnline, devices, lastStatusChange, lastSyncResult, configUpdateCount]
    )

    return (
        <DeviceStreamContext.Provider value={value}>
            {children}
        </DeviceStreamContext.Provider>
    )
}

export function useDeviceStreamContext() {
    return useContext(DeviceStreamContext)
}
