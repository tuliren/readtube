import { Minus, Plus } from 'lucide-react';
import type { Components } from 'react-markdown';

import { Container } from '@/components/Container';
import CustomMarkdown from '@/components/CustomMarkdown';
import { FAQS, FAQ_HEADING } from '@/lib/marketing/content';

// The homepage styles each markdown element itself (no `prose`) so
// the answers keep their hand-tuned look.
const ANSWER_COMPONENTS: Components = {
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  strong: ({ children }) => (
    <span className="font-medium text-slate-700 dark:text-slate-200">{children}</span>
  ),
};

export default function Faq() {
  return (
    <section
      id="faq"
      aria-label="Frequently asked questions"
      className="bg-slate-50 py-24 sm:py-32 dark:bg-slate-950"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-slate-700 sm:text-5xl dark:text-slate-100">
            {FAQ_HEADING}
          </h2>
        </div>

        <ul className="mx-auto mt-16 max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-background">
          {FAQS.map((faq) => (
            <li key={faq.question}>
              <details className="group px-6 py-5 open:pb-6 sm:px-8">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left font-display text-lg font-medium text-slate-700 marker:hidden [&::-webkit-details-marker]:hidden dark:text-slate-100">
                  <span>{faq.question}</span>
                  <span
                    aria-hidden
                    className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full text-slate-500 transition group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200"
                  >
                    <Plus className="h-4 w-4 group-open:hidden" />
                    <Minus className="hidden h-4 w-4 group-open:block" />
                  </span>
                </summary>
                <CustomMarkdown
                  markdown={faq.answer}
                  className="flex flex-col gap-2.5 mt-4 text-base leading-relaxed text-slate-500 dark:text-slate-400"
                  components={ANSWER_COMPONENTS}
                />
              </details>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
