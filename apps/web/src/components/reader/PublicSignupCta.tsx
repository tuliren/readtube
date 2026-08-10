import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Signup nudge at the end of public share pages, rendered between the
 * reader content and the AI disclaimer. A public viewer who scrolled
 * this far just read a whole video instead of watching it — that's the
 * moment to pitch making it their default. Never rendered in the
 * authenticated reader; those viewers already have an account.
 */
export default function PublicSignupCta() {
  return (
    <section
      aria-label="Create an account"
      className="mt-10 rounded-lg border border-border bg-muted/50 px-6 py-8 text-center"
    >
      <h2 className="text-lg font-semibold text-foreground">Read videos like this one, anytime</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        ReadTube turns your YouTube subscriptions into a personal newsletter of summaries and
        articles you can read, search, and annotate instead of watching.
      </p>
      <Button asChild className="mt-5">
        <Link href="/sign-up">Create a free account</Link>
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          Learn more about ReadTube
        </Link>
      </p>
    </section>
  );
}
