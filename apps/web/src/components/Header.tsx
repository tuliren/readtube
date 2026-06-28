'use client';

import { useAuth } from '@clerk/nextjs';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { GithubLink } from '@/components/GithubLink';
import { Logo } from '@/components/Logo';
import ThemeSelector from '@/components/settings/ThemeSelector';
import { TITLE } from '@/constants';

interface Props {
  /** Override the home-page detection. Defaults to true on `/` (where
   *  the Features / FAQ in-page anchors resolve) and false everywhere
   *  else, where the nav swaps those anchors for a Home link back to
   *  `/`. Pass explicitly only for stories or tests. */
  onHomePage?: boolean;
  /** Trim the header so it doesn't dominate a content-heavy page on
   *  small screens. Halves the vertical padding and shrinks the logo
   *  below the `lg:` breakpoint; `lg:` and up keep the marketing
   *  proportions. Used by the public video reader, where the nav is
   *  pinned above an article and the default 96-ish px header would
   *  swallow a third of the mobile viewport. */
  compact?: boolean;
  /** Optional slot rendered between the logo and the theme/burger
   *  group. The slot is capped at 60% of the nav width and truncates
   *  on overflow, so callers can drop in identifiers (e.g. a
   *  thumbnail + title) without crowding the brand or the right-side
   *  controls. Visible at every breakpoint. */
  centerSlot?: ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
}

const HOME_NAVIGATION: NavigationItem[] = [
  { name: 'Features', href: '#features' },
  { name: 'Pricing', href: '#pricing' },
  { name: 'FAQ', href: '#faq' },
];

const SIGNED_IN_NAVIGATION: NavigationItem[] = [{ name: 'Inbox', href: '/inbox' }];

const NON_HOME_NAVIGATION: NavigationItem[] = [{ name: 'Home', href: '/' }];

export default function Header({ onHomePage, compact = false, centerSlot }: Props = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Selecting any item navigates (or opens a new tab) but leaves the
  // full-screen mobile panel covering the page, so the route change
  // looks like a no-op. Close the panel on every item click.
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const isHome = onHomePage ?? pathname === '/';
  // Padding and logo sizing both shrink when compact is set, with two
  // tiers: a tight mobile size below `lg:`, and an intermediate
  // wide-screen size at `lg:` and up that still trims the
  // marketing-grade nav so the public reader's article isn't pushed
  // halfway down the viewport. Default (non-compact) keeps the
  // marketing proportions everywhere.
  const navPaddingClass = compact ? 'px-4 py-2 lg:px-8 lg:py-3' : 'p-6 lg:px-8';
  const logoSize = compact ? 'text-2xl lg:text-3xl' : 'text-5xl';

  const navigation: NavigationItem[] = [
    ...(isHome ? HOME_NAVIGATION : NON_HOME_NAVIGATION),
    ...(isSignedIn ? SIGNED_IN_NAVIGATION : []),
  ];

  const linkClass = 'font-semibold leading-6 text-slate-700 dark:text-slate-200';
  const mobileLinkClass =
    '-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 dark:text-slate-100 dark:hover:bg-slate-800';

  return (
    <header className="bg-transparent">
      <nav
        aria-label="Global"
        className={`mx-auto flex max-w-7xl items-center justify-between gap-x-6 ${navPaddingClass}`}
      >
        {/* When the caller supplies a `centerSlot`, the logo wrapper
            keeps its natural width so the slot can claim the slack
            instead. Without a slot we keep `lg:flex-1` so the
            marketing nav stays right-aligned at wide viewports. */}
        <div className={`flex shrink-0 ${centerSlot != null ? '' : 'lg:flex-1'}`}>
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">{TITLE}</span>
            {compact ? (
              <>
                {/* Below `sidebar:` the public reader's nav competes
                    with the article for horizontal space, so swap the
                    wordmark for the square favicon — same brand
                    anchor, far less width. */}
                <img src="/favicon.png" alt={TITLE} className="h-8 w-8 sidebar:hidden" />
                <div className="hidden sidebar:block">
                  <Logo size={logoSize} />
                </div>
              </>
            ) : (
              <Logo size={logoSize} />
            )}
          </Link>
        </div>
        {/* Caller-supplied slot between the logo and the right-side
            actions. `flex-1 min-w-0` lets it absorb whatever the
            logo + actions don't claim, `max-w-[60%]` caps it so a
            long identifier (e.g. video title) can't crowd the brand
            or the theme / burger controls. Visible at every
            breakpoint — the public reader uses it to surface the
            current video on both narrow and wide viewports. */}
        {centerSlot != null && (
          <div className="flex min-w-0 max-w-[60%] flex-1 items-center">{centerSlot}</div>
        )}
        <div className="hidden items-center text-gray-600 hover:text-gray-900 lg:flex lg:gap-x-8 dark:text-slate-300 dark:hover:text-slate-100">
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
          <GithubLink className="text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50" />
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
              onClick={closeMobileMenu}
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
                  <Link
                    key={item.name}
                    href={item.href}
                    className={mobileLinkClass}
                    onClick={closeMobileMenu}
                  >
                    {item.name}
                  </Link>
                ))}
                {!isSignedIn && (
                  <Link
                    href="/sign-in"
                    className={`w-full text-left ${mobileLinkClass}`}
                    onClick={closeMobileMenu}
                  >
                    Sign in
                  </Link>
                )}
                <GithubLink
                  className={`flex items-center gap-2 ${mobileLinkClass}`}
                  label="GitHub"
                  onClick={closeMobileMenu}
                />
                {/*<ProductHuntButton height={35} />*/}
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
