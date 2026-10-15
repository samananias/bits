'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface DeviceStatusPayload {
    id: number
    name: string
    ip: string
    isActive: boolean
}

export interface DeviceConnectedPayload {
    devices: {
        id: number
        name: string
        ip: string
        isActive: boolean
        syncEnabled: boolean
        lastPolledAt?: string | null
        lastSyncedAt?: string | null
        lastSyncStatus?: string | null
        lastSyncError?: string | null
        lastReconciledAt?: string | null
    }[]
}

export interface DeviceSyncResultPayload {
    id: number
    lastSyncStatus: string
    lastSyncedAt: string | null
    lastSyncError: string | null
    lastPolledAt?: string
}

interface UseDeviceStreamOptions {
    /**
     * Called each time a device changes status (online ↔ offline).
     * Receives only the changed device — not the full list.
     * Must be stable (useCallback) to avoid reconnecting on every render.
     */
    onStatusChange?: (payload: DeviceStatusPayload) => void
    /**
     * Called when the SSE connection is established.
     * Receives the full current device list with status so the UI can
     * initialize accurately without a separate GET /api/devices call.
     */
    onConnected?: (payload: DeviceConnectedPayload) => void
    /**
     * Called when the backend emits a config-update event (e.g. sync
     * interval changed). Components can use this to re-fetch status.
     */
    onConfigUpdate?: () => void
    /**
     * Called when an individual device finishes a sync cycle (success or failure).
     */
    onSyncResult?: (payload: DeviceSyncResultPayload) => void
    /**
     * Set to false to disable the stream. Defaults to true.
     */
    enabled?: boolean
}

/**
 * Subscribes to the /api/devices/stream SSE endpoint and dispatches
 * events to the provided callbacks.
 *
 * Follows the exact same pattern as useAttendanceStream — EventSource,
 * named events, visibility-based pause, and cleanup in useEffect return.
 */
export function useDeviceStream({
    onStatusChange,
    onConnected,
    onConfigUpdate,
    onSyncResult,
    enabled = true,
}: UseDeviceStreamOptions): void {
    const esRef = useRef<EventSource | null>(null)

    // ── Stable callback refs ────────────────────────────────────────────
    // Store callbacks in refs so connect never recreates and causes reconnects
    // when parent components re-render with new inline handler closures.
    const onStatusChangeRef = useRef(onStatusChange)
    const onConnectedRef = useRef(onConnected)
    const onConfigUpdateRef = useRef(onConfigUpdate)
    const onSyncResultRef = useRef(onSyncResult)

    useEffect(() => {
        onStatusChangeRef.current = onStatusChange
        onConnectedRef.current = onConnected
        onConfigUpdateRef.current = onConfigUpdate
        onSyncResultRef.current = onSyncResult
    }, [onStatusChange, onConnected, onConfigUpdate, onSyncResult])

    const connect = useCallback(() => {
        if (esRef.current) {
            esRef.current.close()
            esRef.current = null
        }

        const es = new EventSource('/api/devices/stream')
        esRef.current = es

        es.addEventListener('connected', (event: MessageEvent) => {
            try {
                const payload: DeviceConnectedPayload = JSON.parse(event.data)
                console.log('[SSE] Device stream connected')
                onConnectedRef.current?.(payload)
            } catch (err) {
                console.error('[SSE] Failed to parse device connected event:', err)
            }
        })

        es.addEventListener('device-status', (event: MessageEvent) => {
            try {
                const payload: DeviceStatusPayload = JSON.parse(event.data)
                onStatusChangeRef.current?.(payload)
            } catch (err) {
                console.error('[SSE] Failed to parse device-status event:', err)
            }
        })

        es.addEventListener('config-update', () => {
            onConfigUpdateRef.current?.()
        })

        es.addEventListener('device-sync-result', (event: MessageEvent) => {
            try {
                const payload: DeviceSyncResultPayload = JSON.parse(event.data)
                onSyncResultRef.current?.(payload)
            } catch (err) {
                console.error('[SSE] Failed to parse device-sync-result event:', err)
            }
        })

        es.onerror = () => {
            // Browser EventSource auto-retries — just log for visibility.
            console.warn('[SSE] Device stream error — browser will retry')
        }
    }, [])

    useEffect(() => {
        if (!enabled) {
            esRef.current?.close()
            esRef.current = null
            return
        }

        connect()

        const handleVisibilityChange = () => {
            if (document.hidden) {
                esRef.current?.close()
                esRef.current = null
            } else {
                connect()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            esRef.current?.close()
            esRef.current = null
        }
    }, [enabled, connect])
}
