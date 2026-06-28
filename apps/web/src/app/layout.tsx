import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next';
import { clsx } from 'clsx';
import 'katex/dist/katex.min.css';
import { type Metadata } from 'next';
import { Inter, Lexend } from 'next/font/google';
import { ReactNode } from 'react';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { DESCRIPTION, FULL_WEBSITE_URL, MAIN_COLOR, TITLE } from '@/constants';
import '@/styles/globals.css';
import '@/styles/tailwind.css';

export const metadata: Metadata = {
  metadataBase: new URL(FULL_WEBSITE_URL),
  title: {
    template: `%s | ${TITLE}`,
    default: TITLE,
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: [
    'YouTube to newsletter',
    'YouTube subscriptions',
    'video to article',
    'video transcript',
    'video summary',
    'reading list',
    'deep work',
    'focus',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: FULL_WEBSITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: [
    { rel: 'apple-touch-icon', sizes: '180x180', url: '/apple-touch-icon.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', url: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', url: '/favicon-16x16.png' },
    { rel: 'manifest', url: '/site.webmanifest' },
  ],
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const lexend = Lexend({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lexend',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={clsx(
        'h-full scroll-smooth bg-transparent antialiased',
        inter.variable,
        lexend.variable
      )}
    >
      <body className="flex h-full flex-col">
        <ThemeProvider>
          <ClerkProvider
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/inbox"
            signUpFallbackRedirectUrl="/inbox"
            appearance={{
              // Clerk Core 3 renamed `appearance.layout` to `appearance.options`.
              // Building locally hides this: `@clerk/ui` (which augments the
              // appearance type via ClerkAppearanceRegistry) isn't resolved
              // here, so `appearance` collapses to `any`. A clean install
              // (e.g. Vercel) resolves it and the strict `Appearance<Theme>`
              // rejects the old `layout` key.
              options: {
                privacyPageUrl: '/privacy',
                termsPageUrl: '/terms',
              },
              variables: {
                colorPrimary: MAIN_COLOR,
              },
            }}
          >
            {children}
          </ClerkProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
