import Link from 'next/link';

import { Container } from '@/components/Container';

export const ARTICLE_LINK =
  'https://www.humanities.mcmaster.ca/~bertrand/misc.html#:~:text=Three%20passions%2C%20simple%20but%20overwhelmingly%20strong%2C%20have%20governed%20my%20life';

interface Props {
  /** Tighter top/bottom padding for non-marketing pages. The marketing
   *  layout keeps the roomy default; everywhere else the footer is just
   *  a legal/links strip and shouldn't eat viewport height. */
  compact?: boolean;
}

export default function Footer({ compact = false }: Props) {
  // Compact mode lives next to article-width content (max-w-3xl px-6)
  // and adopts the AI-disclaimer's tokens so the two horizontal rules
  // at the bottom of a public share page read as one cohesive footer
  // strip rather than two competing styles.
  if (compact) {
    return (
      <footer className="bg-transparent">
        <div className="mx-auto w-full max-w-3xl px-6 pb-4">
          <div className="flex flex-col justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:gap-0">
            <p className="break-words">
              Copyright &copy; {new Date().getFullYear()} Starfish Software LLC. All rights
              reserved.
            </p>
            <div className="flex gap-x-6">
              <Link href="/terms" className="group underline" aria-label="terms of service">
                Terms of Service
              </Link>
              <Link href="/privacy" className="group underline" aria-label="privacy policy">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }
  return (
    <footer className="bg-transparent">
      <Container>
        <div className="flex flex-col justify-between border-t border-slate-400/10 py-10 text-sm text-slate-500 sm:flex-row dark:border-slate-700 dark:text-slate-400">
          <p className="mt-6 break-words sm:mt-0">
            Copyright &copy; {new Date().getFullYear()} Starfish Software LLC. All rights reserved.
          </p>
          <div className="mt-6 flex gap-x-6 sm:mt-0">
            <Link href="/terms" className="group underline" aria-label="terms of service">
              Terms of Service
            </Link>
            <Link href="/privacy" className="group underline" aria-label="privacy policy">
              Privacy Policy
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
