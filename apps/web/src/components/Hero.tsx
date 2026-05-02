import { Button } from '@/components/Button';
import PreviewDropdown, { type PreviewItem } from '@/components/PreviewDropdown';
import RotatingWord from '@/components/RotatingWord';
import { DESCRIPTION } from '@/constants';

const PREVIEW_VIDEOS: readonly PreviewItem[] = [
  {
    title: 'Jensen Huang Interview with Lex Fridman',
    url: 'https://www.read.tube/p/videos/vif8NQcjVf0?language=en',
  },
  {
    title: 'Elon Musk Interview with Dwarkesh Patel',
    url: 'https://www.read.tube/p/videos/BYXbuik3dgA?language=en',
  },
  {
    title: 'Rules for Deep Work by Cal Newport',
    url: 'https://www.read.tube/p/videos/nPzFhkTe2Uw?language=en',
  },
  {
    title: 'Intro to Neural Networks by Andrej Karpathy',
    url: 'https://www.read.tube/p/videos/VMj-3S1tku0?language=en',
  },
  {
    title: 'Explanation of Special Relativity by Mahesh Shenoy',
    url: 'https://www.read.tube/p/videos/TJmgKdc7H34?language=en',
  },
];

export default function Hero() {
  return (
    <section
      id="hero"
      aria-label="Hero"
      className="flex min-h-[60vh] flex-col justify-start px-6 pb-16 pt-[14vh] text-center sm:px-8"
    >
      <h1 className="mx-auto max-w-4xl font-display text-5xl font-medium leading-tight tracking-tight text-slate-700 sm:text-7xl sm:leading-tight dark:text-slate-100">
        <RotatingWord /> your
        <br />
        <span className="text-[0.97em]">video subscriptions</span>
      </h1>
      <p className="mx-auto mt-10 max-w-2xl text-xl tracking-tight text-slate-500 dark:text-slate-400">
        {DESCRIPTION}
      </p>

      <div className="mt-14 flex justify-center gap-x-6">
        <Button href="/sign-up" variant="solid" color="slate">
          Get Started
        </Button>
        <PreviewDropdown items={PREVIEW_VIDEOS} />
      </div>
    </section>
  );
}
