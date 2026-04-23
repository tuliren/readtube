import { clsx } from 'clsx';

import { Button } from '@/components/Button';
import { Container } from '@/components/Container';

type Theme = 'light' | 'dark';

const themeStyles: Record<
  Theme,
  { section: string; heading: string; body: string; buttonColor: 'slate' | 'white' }
> = {
  light: {
    section: 'bg-white dark:bg-background',
    heading: 'text-slate-700 dark:text-slate-100',
    body: 'text-slate-500 dark:text-slate-400',
    buttonColor: 'slate',
  },
  dark: {
    section: 'bg-slate-900',
    heading: 'text-white',
    body: 'text-slate-300',
    buttonColor: 'white',
  },
};

export default function CallToAction({ theme = 'dark' }: { theme?: Theme }) {
  const styles = themeStyles[theme];
  return (
    <section id="cta" aria-label="Get started" className={clsx(styles.section, 'py-24 sm:py-32')}>
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className={clsx(
              'font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl',
              styles.heading
            )}
          >
            Stop scrolling. Start reading.
          </h2>
          <p className={clsx('mt-5 text-lg leading-relaxed', styles.body)}>
            The feed is engineered to hold your attention. ReadTube is built to return it.
          </p>
          <div className="mt-10 flex justify-center">
            <Button href="/sign-up" variant="solid" color={styles.buttonColor}>
              Build your library
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
