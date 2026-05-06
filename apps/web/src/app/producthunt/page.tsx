import { Metadata } from 'next';

import CopyButton from '@/components/CopyButton';
import { TITLE } from '@/constants';

import { PH_DESCRIPTION, PH_FIRST_COMMENT, PH_LINKS, PH_TAGLINE, PH_TOPICS } from './_lib/copy';
import { GALLERY } from './_lib/images';

export const metadata: Metadata = {
  title: 'Product Hunt launch package',
  robots: { index: false, follow: false },
};

interface CopyBlockProps {
  label: string;
  value: string;
  hint?: string;
  multiline?: boolean;
}

function CopyBlock({ label, value, hint, multiline = false }: CopyBlockProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-lg font-medium text-slate-700 dark:text-slate-100">
            {label}
          </h3>
          <span className="text-xs uppercase tracking-wider text-slate-400">
            {value.length} chars
          </span>
        </div>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
      {hint != null ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
      <div
        className={
          'mt-4 rounded-lg bg-slate-50 p-4 text-slate-700 dark:bg-slate-950 dark:text-slate-200 ' +
          (multiline ? 'whitespace-pre-wrap font-mono text-sm leading-relaxed' : 'text-base')
        }
      >
        {value}
      </div>
    </div>
  );
}

export default function ProductHuntPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <header className="mb-12">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
            Internal · launch prep
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-slate-700 sm:text-5xl dark:text-slate-100">
            {TITLE} on Product Hunt
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            All the copy and gallery images you need to fill the Product Hunt submission form. Every
            word here is lifted directly from the marketing site — nothing fabricated. Click the
            copy button on any block, or right-click an image to save it.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="mb-4 font-display text-2xl font-medium tracking-tight text-slate-700 dark:text-slate-100">
            Listing copy
          </h2>
          <div className="flex flex-col gap-4">
            <CopyBlock label="Product name" value={TITLE} />
            <CopyBlock
              label="Tagline"
              value={PH_TAGLINE}
              hint="Product Hunt limits taglines to 60 characters."
            />
            <CopyBlock
              label="Description"
              value={PH_DESCRIPTION}
              hint="Product Hunt limits descriptions to ~260 characters."
              multiline
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-lg font-medium text-slate-700 dark:text-slate-100">
                Topics
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Pick three to four. These match the audience the FAQ describes (curious readers,
                deep-work fans, learners).
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {PH_TOPICS.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-lg font-medium text-slate-700 dark:text-slate-100">
                Links
              </h3>
              <ul className="mt-4 flex flex-col gap-2 text-base">
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">Website</span>
                  <span className="flex items-center gap-2">
                    <code className="text-slate-700 dark:text-slate-200">{PH_LINKS.website}</code>
                    <CopyButton value={PH_LINKS.website} label="Copy website link" />
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-slate-500">GitHub</span>
                  <span className="flex items-center gap-2">
                    <code className="text-slate-700 dark:text-slate-200">{PH_LINKS.github}</code>
                    <CopyButton value={PH_LINKS.github} label="Copy GitHub link" />
                  </span>
                </li>
              </ul>
            </div>
            <CopyBlock
              label="First comment (maker intro)"
              value={PH_FIRST_COMMENT}
              hint="Posted by the maker as the first comment on the launch thread."
              multiline
            />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-2 font-display text-2xl font-medium tracking-tight text-slate-700 dark:text-slate-100">
            Gallery images
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Product Hunt accepts up to 11 gallery images. Recommended size: 1270×760 (5:3). The
            thumbnail at the bottom is 240×240. All images are rendered live by the server using the
            same React/Satori pipeline as the OG image — right-click and{' '}
            <span className="italic">Save image as…</span> to download a PNG.
          </p>
          <div className="flex flex-col gap-8">
            {GALLERY.map((item) => (
              <figure
                key={item.name}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-medium text-slate-700 dark:text-slate-100">
                      {item.label}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {item.size.width}×{item.size.height} · {item.caption}
                    </p>
                  </div>
                  <a
                    href={`/producthunt/images/${item.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Open full size
                  </a>
                </figcaption>
                <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                  <img
                    src={`/producthunt/images/${item.name}`}
                    alt={item.label}
                    width={item.size.width}
                    height={item.size.height}
                    className="block h-auto w-full"
                  />
                </div>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
