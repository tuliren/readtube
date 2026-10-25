'use client';

import AddOnboardingPanel from '@/components/add/AddOnboardingPanel';
import { useDashboard } from '@/components/dashboard/DashboardContext';

interface Props {
  emptyMessage: string;
}

/**
 * Empty-state component for the library pages (All / Standalone).
 * Shows the message plus the unified Add button, which takes a video
 * or playlist link (or a channel) and detects which it is.
 * Non-empty rendering is handled by LibraryListView.
 */
export default function LibraryEmptyState({ emptyMessage }: Props) {
  const { openAdd } = useDashboard();
  return (
    <AddOnboardingPanel
      variant="compact"
      title="No videos yet"
      description={emptyMessage}
      onAdd={openAdd}
    />
  );
}
