'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api/client'

export interface AuthEmployee {
  id: number
  firstName: string
  middleName?: string | null
  lastName: string
  suffix?: string | null
  email: string
  role: 'USER' | 'ADMIN' | 'HR' | 'MANAGER'
  needsPasswordChange: boolean
  isGuest?: boolean
  guestViewRole?: 'USER' | 'ADMIN' | 'HR' | 'MANAGER'
  profilePicture?: string | null
  position?: string | null
  employeeNumber?: string | null
  departmentId?: number | null
  branchId?: number | null
}

export const authKeys = {
  me: ['auth', 'me'] as const,
}

export async function fetchCurrentUser(): Promise<AuthEmployee> {
  const data = await apiFetch<{ employee: AuthEmployee }>('/api/auth/me')
  return data.employee ?? (data as unknown as AuthEmployee)
}

/**
 * Unified hook for retrieving the authenticated user's profile.
 * Cached via TanStack Query (1-min staleTime, 10-min gcTime).
 * Deduplicates in-flight calls and eliminates duplicate /api/auth/me requests across layouts, topbars, and guards.
 */
export function useCurrentUser() {
  return useQuery<AuthEmployee>({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000,
    retry: (failureCount, error) => {
      // Don't retry if session is expired
      if (error && (error as any).name === 'SessionExpiredError') return false
      return failureCount < 1
    },
  })
}

export function formatEmployeeFullName(emp?: AuthEmployee | null, fallback = ''): string {
  if (!emp) return fallback
  const middle = emp.middleName ? ` ${emp.middleName[0]}.` : ''
  const suffix = emp.suffix ? ` ${emp.suffix}` : ''
  return `${emp.firstName}${middle} ${emp.lastName}${suffix}`.trim()
}
