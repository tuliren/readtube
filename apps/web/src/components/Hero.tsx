import { Button } from '@/components/Button';
import PreviewDropdown, { type PreviewItem } from '@/components/PreviewDropdown';
import ProductHuntButton from '@/components/ProductHuntButton';
import RotatingWord from '@/components/RotatingWord';
import { DESCRIPTION } from '@/constants';

const PREVIEW_VIDEOS: readonly PreviewItem[] = [
  { title: 'Jensen Huang Interview with Lex Fridman', id: 'vif8NQcjVf0' },
  { title: 'Elon Musk Interview with Dwarkesh Patel', id: 'BYXbuik3dgA' },
  { title: 'Rules for Deep Work by Cal Newport', id: 'nPzFhkTe2Uw' },
  { title: 'Intro to Neural Networks by Andrej Karpathy', id: 'VMj-3S1tku0' },
  { title: 'Explanation of Special Relativity by Mahesh Shenoy', id: 'TJmgKdc7H34' },
];

export default function Hero() {
  return (
    <section
      id="hero"
      aria-label="Hero"
      className="flex min-h-[60vh] flex-col justify-start px-6 pb-16 pt-[14vh] text-center sm:px-8"
    >
      <h1 className="mx-auto max-w-4xl font-display text-5xl font-medium leading-tight tracking-tight text-slate-700 sm:text-7xl sm:leading-tight dark:text-slate-100">
        {/* Below `sidebar:` the slogan reads as three rows: verb /
            "your video" / "subscriptions". At `sidebar:` and up it
            collapses back to the original two-row marketing layout
            ("{verb} your" / "video subscriptions"). */}
        <RotatingWord /> <br className="sidebar:hidden" />
        your <br className="hidden sidebar:inline" />
        <span className="text-[0.97em]">
          video <br className="sidebar:hidden" />
          subscriptions
        </span>
      </h1>
      <p className="mx-auto mt-10 max-w-2xl text-xl tracking-tight text-slate-500 dark:text-slate-400">
        {DESCRIPTION}
      </p>

      <div className="mt-14 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <Button href="/sign-up" variant="solid" color="slate">
          Get Started
        </Button>
        <PreviewDropdown items={PREVIEW_VIDEOS} />
        <ProductHuntButton height={40} />
      </div>
    </section>
  );
}
