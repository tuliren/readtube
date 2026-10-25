import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import UsageOverview from '@/components/usage/UsageOverview';
import { getGenerationUsage, getLifetimeUsage } from '@/lib/usage/quota';

export const metadata = {
  title: 'Usage — Read Tube',
};

export default async function UsagePage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const [usage, lifetime] = await Promise.all([
    getGenerationUsage(prisma, userId, new Date()),
    getLifetimeUsage(prisma, userId),
  ]);

  return <UsageOverview usage={usage} lifetime={lifetime} />;
}
