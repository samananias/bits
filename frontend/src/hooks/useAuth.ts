'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SessionExpiredError } from '@/lib/api/client'
import { useCurrentUser, type AuthEmployee } from './useCurrentUser'

export type { AuthEmployee }

export interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  employee: AuthEmployee | null
  isGuest: boolean
}

type Role = 'ADMIN' | 'HR' | 'USER' | 'MANAGER'

/**
 * Auth guard hook backed by TanStack Query.
 * Verifies session using cached useCurrentUser() query, eliminating duplicate /api/auth/me calls
 * on page navigation and across layouts.
 *
 * Redirects to /login if the session check fails or role doesn't match.
 *
 * @param requiredRole - If provided, only allows users with this role (or one of the roles if array)
 */
export function useAuth(requiredRole?: Role | Role[]): AuthState {
  const router = useRouter()
  const { data: employee, isLoading, error } = useCurrentUser()

  const roleKey = Array.isArray(requiredRole) ? requiredRole.join(',') : requiredRole

  useEffect(() => {
    if (isLoading) return

    if (error) {
      if (error instanceof SessionExpiredError || (error as any).name === 'SessionExpiredError') {
        window.dispatchEvent(new CustomEvent('session-expired'))
      } else {
        router.replace('/login')
      }
      return
    }

    if (!employee) {
      router.replace('/login')
      return
    }

    if (requiredRole) {
      const effectiveRole = (employee.isGuest && employee.guestViewRole)
        ? employee.guestViewRole
        : employee.role

      const isAllowed = Array.isArray(requiredRole)
        ? requiredRole.includes(effectiveRole)
        : effectiveRole === requiredRole

      if (!isAllowed) {
        if (employee.isGuest) {
          const activeRole = employee.guestViewRole ?? employee.role
          let targetDashboard = '/dashboard'
          if (activeRole === 'HR') targetDashboard = '/hr/dashboard'
          if (activeRole === 'MANAGER') targetDashboard = '/manager/dashboard'
          if (activeRole === 'USER') targetDashboard = '/employee/dashboard'
          router.replace(targetDashboard)
          return
        }
        router.replace('/login')
        return
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, employee, isLoading, error, roleKey])

  return {
    isLoading,
    isAuthenticated: Boolean(employee && !error),
    employee: employee ?? null,
    isGuest: Boolean(employee?.isGuest),
  }
}
