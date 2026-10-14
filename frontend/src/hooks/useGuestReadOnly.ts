'use client';

import { useAuth } from './useAuth';

export const GUEST_READ_ONLY_TOOLTIP = 'Action disabled in Guest Mode (Read-Only)';

export function useGuestReadOnly() {
  const { isGuest, isLoading } = useAuth();

  return {
    isGuest: Boolean(isGuest),
    isLoading,
    tooltip: GUEST_READ_ONLY_TOOLTIP,
  };
}
