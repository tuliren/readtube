import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import PreferredLanguageForm from '@/components/settings/PreferredLanguageForm';
import ThemeForm from '@/components/settings/ThemeForm';

export const metadata = {
  title: 'Settings — Read Tube',
};

export default async function SettingsPage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const user = await prisma.user.findUnique({
    where: { source_id: userId },
    select: { preferred_language: true },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Settings</h1>
      <div className="space-y-8">
        <ThemeForm />
        <PreferredLanguageForm initialValue={user?.preferred_language ?? null} />
      </div>
    </div>
  );
}
