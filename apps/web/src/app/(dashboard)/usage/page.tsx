import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import LifetimeUsage from '@/components/usage/LifetimeUsage';
import UsageMeter from '@/components/usage/UsageMeter';
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

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Usage</h1>
      <div className="space-y-6">
        <UsageMeter
          used={usage.used}
          quota={usage.quota}
          periodStart={usage.periodStart}
          periodEnd={usage.periodEnd}
        />
        <LifetimeUsage
          transcript={lifetime.transcript}
          summary={lifetime.summary}
          article={lifetime.article}
        />
      </div>
    </div>
  );
}
