'use client';

import { createContext, useContext } from 'react';
import type { KeyedMutator } from 'swr';

import type { AddRequest } from '@/components/add/AddDialog';
import type { ChannelData } from '@/lib/types';

/**
 * Shared state exposed by `DashboardShell` to any authenticated page
 * rendered beneath the `(dashboard)` layout. Keeps the channels SWR
 * and the Add dialog owned by the shell (so every page gets the same
 * data and the same add entry point) while still
 * letting pages read channels without wiring another SWR subscription.
 */
export interface DashboardState {
  channels: ChannelData[];
  totalUnread: number;
  /** Open the shared Add dialog. With no request it opens the unified
   *  dialog, which detects channel / video / playlist from the pasted
   *  link; a request can lock the kind and pre-select a destination. */
  openAdd: (request?: AddRequest) => void;
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
