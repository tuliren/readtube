import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

/**
 * Shell for short marketing info pages (About, Contact): one `<main>`
 * landmark, one H1, and prose-styled body copy.
 */
export default function InfoPage({ title, children }: Props) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <article className="prose text-slate-800 dark:prose-invert dark:text-slate-100">
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}

/** Link to another site, opened in a new tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
