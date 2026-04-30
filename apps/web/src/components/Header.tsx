'use client';

import { useAuth } from '@clerk/nextjs';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/Logo';
import ThemeSelector from '@/components/settings/ThemeSelector';
import { TITLE } from '@/constants';

interface Props {
  /** On non-marketing pages (e.g. the public share view) the in-page
   *  Features / FAQ anchors don't resolve, so the header swaps them
   *  for a single Home link back to the marketing root. */
  variant?: 'marketing' | 'compact';
}

export default function Header({ variant = 'marketing' }: Props = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn } = useAuth();

  const navigation =
    variant === 'compact'
      ? [{ name: 'Home', href: '/' }, ...(isSignedIn ? [{ name: 'Inbox', href: '/inbox' }] : [])]
      : [
          { name: 'Features', href: '#features' },
          // { name: 'Pricing', href: '#pricing' },
          { name: 'FAQ', href: '#faq' },
          ...(isSignedIn ? [{ name: 'Inbox', href: '/inbox' }] : []),
        ];

  const linkClass = 'font-semibold leading-6 text-slate-700 dark:text-slate-200';
  const mobileLinkClass =
    '-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 dark:text-slate-100 dark:hover:bg-slate-800';

  return (
    <header className="bg-transparent">
      <nav
        aria-label="Global"
        className="mx-auto flex max-w-7xl items-center justify-between gap-x-6 p-6 lg:px-8"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">{TITLE}</span>
            <Logo />
          </Link>
        </div>
        <div className="hidden items-center text-gray-600 hover:text-gray-900 lg:flex lg:gap-x-12 dark:text-slate-300 dark:hover:text-slate-100">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href} className={linkClass}>
              {item.name}
            </Link>
          ))}
          {!isSignedIn && (
            <Link href="/sign-in" className={linkClass}>
              Sign in
            </Link>
          )}
          <ThemeSelector />
        </div>
        <div className="flex items-center gap-3 lg:hidden">
          <ThemeSelector />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700 dark:text-slate-300"
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>
      </nav>

      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-10" />
        <DialogPanel className="fixed inset-y-0 right-0 z-10 w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:bg-background dark:sm:ring-border">
          <div className="flex items-center gap-x-6">
            <Link href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">{TITLE}</span>
              <Logo size="text-2xl" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-md p-2.5 text-gray-700 dark:text-slate-300"
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon aria-hidden="true" className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10 dark:divide-slate-700">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <Link key={item.name} href={item.href} className={mobileLinkClass}>
                    {item.name}
                  </Link>
                ))}
                {!isSignedIn && (
                  <Link href="/sign-in" className={`w-full text-left ${mobileLinkClass}`}>
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
