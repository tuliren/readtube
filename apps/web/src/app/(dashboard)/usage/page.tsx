import { prisma } from '@readtube/database';

import UsageOverview from '@/components/usage/UsageOverview';
import { requireDashboardUserId } from '@/lib/dashboardUser';
import { getGenerationUsage, getLifetimeUsage } from '@/lib/usage/quota';

export const metadata = {
  title: 'Usage — Read Tube',
};

export default async function UsagePage() {
  const userId = await requireDashboardUserId();

  const [usage, lifetime] = await Promise.all([
    getGenerationUsage(prisma, userId, new Date()),
    getLifetimeUsage(prisma, userId),
  ]);

  return <UsageOverview usage={usage} lifetime={lifetime} />;
}
