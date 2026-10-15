'use client'

import { useQuery } from '@tanstack/react-query'
import { departmentsApi } from '@/lib/api/departments.api'
import { branchesApi } from '@/lib/api/branches.api'
import { apiFetch } from '@/lib/api/client'
import type { Department, Branch } from '@/lib/api/client'

export const lookupKeys = {
  departments: ['lookups', 'departments'] as const,
  branches: ['lookups', 'branches'] as const,
  holidays: (year: string) => ['lookups', 'holidays', year] as const,
}

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: lookupKeys.departments,
    queryFn: async () => {
      const res = await departmentsApi.getAll()
      return res.departments || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
  })
}

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: lookupKeys.branches,
    queryFn: async () => {
      const res = await branchesApi.getAll()
      return res.branches || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
  })
}

export interface HolidayItem {
  id?: number
  name: string
  date: string
  type?: string
}

export function useHolidays(year?: string) {
  const currentYear = year || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).split('-')[0]

  return useQuery<HolidayItem[]>({
    queryKey: lookupKeys.holidays(currentYear),
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; holidays: HolidayItem[] }>(`/api/holidays?year=${currentYear}`)
      return res.holidays || []
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
  })
}

export function useTodayHoliday() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const [year] = today.split('-')
  const { data: holidays, isLoading } = useHolidays(year)

  const todayHoliday = holidays?.find(h => {
    try {
      return new Date(h.date).toISOString().split('T')[0] === today
    } catch {
      return false
    }
  })

  return {
    holidayName: todayHoliday?.name || null,
    holiday: todayHoliday || null,
    isLoading,
  }
}
