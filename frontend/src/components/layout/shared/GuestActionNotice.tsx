'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'

const DEFAULT_MESSAGE = 'Guest Mode is read-only. Creating, editing, and deleting records is disabled.'
const AUTO_DISMISS_MS = 5000

/**
 * Shows a short notice when a write request is rejected with
 * `error: 'guest_read_only'`. The global fetch interceptor in
 * `lib/api/client.ts` dispatches the `guest-action-blocked` event.
 *
 * Positioned just below the 64px topbar so it never overlaps navigation.
 */
export function GuestActionNotice() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleBlocked = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      setMessage(detail?.message || DEFAULT_MESSAGE)
      // Restart the timer so a newer notice is never cut short by an older one
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setMessage(null), AUTO_DISMISS_MS)
    }

    window.addEventListener('guest-action-blocked', handleBlocked)
    return () => {
      window.removeEventListener('guest-action-blocked', handleBlocked)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[70] w-[calc(100vw-2rem)] max-w-md pointer-events-none"
    >
      {message && (
        <div className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-white border border-red-200 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-red-500 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-xs font-semibold text-red-700 leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss notice"
            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
