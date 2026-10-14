'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, SessionExpiredError } from '@/lib/api/client'

// Minimal employee shape returned by /api/auth/me
export interface AuthEmployee {
  id: number
  firstName: string
  lastName: string
  email: string
  role: 'USER' | 'ADMIN' | 'HR' | 'MANAGER'
  needsPasswordChange: boolean
  isGuest?: boolean
  guestViewRole?: 'USER' | 'ADMIN' | 'HR' | 'MANAGER'
}

export interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  employee: AuthEmployee | null
  isGuest: boolean
}

type Role = 'ADMIN' | 'HR' | 'USER' | 'MANAGER';

/**
 * Auth guard hook. Verifies session by calling /api/auth/me via apiFetch,
 * which automatically handles silent token refresh (including the shared
 * refreshPromise lock that prevents race conditions on simultaneous 401s).
 *
 * Redirects to /login if the session check fails or role doesn't match.
 *
 * @param requiredRole - If provided, only allows users with this role (or one of the roles if array)
 */
export function useAuth(requiredRole?: Role | Role[]): AuthState {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    employee: null,
    isGuest: false,
  })

  useEffect(() => {
    const verify = async () => {
      try {
        // Use apiFetch so the 401 → refresh → retry logic and the shared
        // refreshPromise lock are applied here too.
        const data = await apiFetch<{ employee: AuthEmployee }>('/api/auth/me')
        const employee: AuthEmployee = data.employee ?? (data as unknown as AuthEmployee)

        if (requiredRole) {
          const effectiveRole = (employee.isGuest && employee.guestViewRole)
              ? employee.guestViewRole
              : employee.role;

          const isAllowed = Array.isArray(requiredRole) 
              ? requiredRole.includes(effectiveRole)
              : effectiveRole === requiredRole;
              
          if (!isAllowed) {
            if (employee.isGuest) {
              const activeRole = employee.guestViewRole ?? employee.role;
              let targetDashboard = '/dashboard';
              if (activeRole === 'HR') targetDashboard = '/hr/dashboard';
              if (activeRole === 'MANAGER') targetDashboard = '/manager/dashboard';
              if (activeRole === 'USER') targetDashboard = '/employee/dashboard';
              router.replace(targetDashboard);
              return;
            }
            router.replace('/login')
            return
          }
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          employee,
          isGuest: Boolean(employee.isGuest),
        })
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          // All refresh attempts failed — notify listening UI
          window.dispatchEvent(new CustomEvent('session-expired'))
          // Do NOT redirect here, let the modal handle it gracefully
        } else {
          router.replace('/login')
        }
      }
    }
    verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, Array.isArray(requiredRole) ? requiredRole.join(',') : requiredRole])

  return state
}
