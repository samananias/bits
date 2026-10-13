'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Eye, ChevronDown, Check, Loader2, LogIn } from 'lucide-react'

export type GuestRole = 'ADMIN' | 'HR' | 'MANAGER' | 'USER'

interface RoleOption {
  id: GuestRole
  label: string
  path: string
  description: string
}

const ROLES: RoleOption[] = [
  { id: 'ADMIN', label: 'Admin', path: '/dashboard', description: 'Full system' },
  { id: 'HR', label: 'HR Portal', path: '/hr/dashboard', description: 'Personnel' },
  { id: 'MANAGER', label: 'Manager', path: '/manager/dashboard', description: 'Department' },
  { id: 'USER', label: 'Employee', path: '/employee/dashboard', description: 'Self-service' },
]

interface GuestModeMenuProps {
  /** The guest's current view role (from the guest JWT's guestViewRole). */
  role: GuestRole
}

/**
 * Guest Mode account control.
 *
 * Replaces the profile dropdown in the topbar's account slot while in guest
 * mode. It is the single place that communicates guest status, lets the guest
 * switch between demo views, and exits to the sign-in page.
 *
 * Accessibility follows the WAI-ARIA APG Menu Button pattern:
 * Enter/Space/ArrowDown open, Arrow/Home/End move, Escape/Tab close and
 * return focus to the trigger.
 */
export function GuestModeMenu({ role }: GuestModeMenuProps) {
  const [open, setOpen] = useState(false)
  const [switchingTo, setSwitchingTo] = useState<GuestRole | null>(null)
  const [exiting, setExiting] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const current = ROLES.find((r) => r.id === role) ?? ROLES[0]
  const busy = switchingTo !== null || exiting

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Close on outside click (same behaviour as the existing profile dropdowns)
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, close])

  // Move focus to the active role when the menu opens
  useEffect(() => {
    if (open) {
      const idx = ROLES.findIndex((r) => r.id === role)
      itemRefs.current[idx >= 0 ? idx : 0]?.focus()
    }
  }, [open, role])

  const focusItem = (index: number) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return
    const next = (index + items.length) % items.length
    items[next].focus()
  }

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusItem(currentIndex + 1); break
      case 'ArrowUp': e.preventDefault(); focusItem(currentIndex - 1); break
      case 'Home': e.preventDefault(); focusItem(0); break
      case 'End': e.preventDefault(); focusItem(items.length - 1); break
      case 'Escape': e.preventDefault(); close(); break
      case 'Tab': close(false); break
    }
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    }
  }

  const switchRole = async (target: RoleOption) => {
    if (target.id === role || busy) {
      if (target.id === role) close()
      return
    }
    setSwitchingTo(target.id)
    try {
      const res = await fetch('/api/auth/guest-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: target.id }),
      })
      if (res.ok) {
        // Full reload so the new guest cookie and role-specific layout are applied cleanly
        window.location.href = target.path
        return
      }
      console.error('Failed to switch guest view role')
    } catch (err) {
      console.error('Error switching guest view:', err)
    }
    setSwitchingTo(null)
  }

  const exitGuest = async () => {
    if (busy) return
    setExiting(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore — navigating to /login is still the right outcome
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        id="guest-mode-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="guest-mode-menu"
        aria-label={`Guest mode, viewing as ${current.label}. Open guest options`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-full text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Guest</span>
        <span className="hidden sm:inline text-red-300" aria-hidden="true">·</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-red-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="guest-mode-menu"
          role="menu"
          aria-labelledby="guest-mode-trigger"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-[70] origin-top-right animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Status */}
          <div className="px-4 pt-2 pb-3 border-b border-gray-100" role="presentation">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 uppercase tracking-widest">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              Guest Mode · Read-Only
            </p>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              You&apos;re exploring demo views. Changes are disabled and emails &amp; phone numbers are masked.
            </p>
          </div>

          {/* Role switcher */}
          <div className="p-1" role="group" aria-label="Switch view">
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest" role="presentation">
              Switch View
            </p>
            {ROLES.map((r, i) => {
              const isActive = r.id === role
              const isLoading = switchingTo === r.id
              return (
                <button
                  key={r.id}
                  ref={(el) => { itemRefs.current[i] = el }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  tabIndex={-1}
                  onClick={() => switchRole(r)}
                  disabled={busy && !isLoading}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:bg-red-50 ${
                    isActive ? 'bg-red-50 text-red-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{r.label}</span>
                    <span className={`block text-[11px] ${isActive ? 'text-red-500' : 'text-gray-400'}`}>{r.description}</span>
                  </span>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500 shrink-0" aria-hidden="true" />
                  ) : isActive ? (
                    <Check className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Exit */}
          <div className="p-1 border-t border-gray-100 mt-1">
            <button
              ref={(el) => { itemRefs.current[ROLES.length] = el }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={exitGuest}
              disabled={busy && !exiting}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:bg-red-50"
            >
              {exiting ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1">
                <span className="block">Exit guest mode</span>
                <span className="block text-[11px] font-normal text-gray-400">Return to sign-in</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
