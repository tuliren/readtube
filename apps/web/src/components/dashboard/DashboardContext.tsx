'use client';

import { createContext, useContext } from 'react';
import type { KeyedMutator } from 'swr';

import type { ChannelData } from '@/lib/types';

/**
 * Shared state exposed by `DashboardShell` to any authenticated page
 * rendered beneath the `(dashboard)` layout. Keeps the channels SWR
 * and the "Add channel" modal owned by the shell (so every page gets
 * the same data and the same add-channel entry point) while still
 * letting pages read channels without wiring another SWR subscription.
 */
export interface DashboardState {
  channels: ChannelData[];
  totalUnread: number;
  openAddChannel: () => void;
  mutateChannels: KeyedMutator<ChannelData[]>;
}

export const DashboardCtx = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardCtx);
  if (ctx == null) {
    throw new Error('useDashboard must be used within DashboardShell');
  }
  return ctx;
}
