'use client';

import { Radio, RadioGroup } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';

import { Container } from '@/components/Container';
import { cn } from '@/lib/utils';

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly', priceSuffix: '/ month' },
  { value: 'annually', label: 'Annually', priceSuffix: '/ year' },
] as const;

type Frequency = (typeof FREQUENCIES)[number];

type Tier = {
  name: string;
  id: string;
  href: string;
  price: { monthly: number; annually: number };
  free?: boolean;
  description: string;
  features: string[];
  mostPopular?: boolean;
  available: boolean;
};

const PRICING_TIERS: Tier[] = [
  {
    name: 'Reader',
    id: 'tier-free',
    href: '/sign-up',
    price: { monthly: 0, annually: 0 },
    free: true,
    description: 'Self-host on your own infrastructure with full access.',
    features: [
      'Source available on ELv2 license',
      'All Curator and Scholar features',
      'Bring your own API keys',
    ],
    available: true,
  },
  {
    name: 'Curator',
    id: 'tier-reader',
    href: '/sign-up',
    price: { monthly: 10, annually: 84 },
    description:
      'For people who follow a steady set of channels and want to read instead of watch.',
    features: [
      '500 videos per month',
      'Long videos rewritten as articles',
      'Semantic search across every channel',
      'Unlimited highlights and timestamped notes',
      'Personal RSS-style inbox',
      'Export notes and transcripts',
    ],
    mostPopular: true,
    available: true,
  },
  {
    name: 'Scholar',
    id: 'tier-scholar',
    href: '/sign-up',
    price: { monthly: 20, annually: 200 },
    description: 'For researchers and lifelong learners building a deep personal archive.',
    features: [
      'Unlimited videos per month',
      'Long videos rewritten as articles',
      'Semantic search across every channel',
      'Unlimited highlights and timestamped notes',
      'Priority transcript and summary generation',
      'Advanced annotation and tagging',
      'API access for personal workflows',
    ],
    available: true,
  },
];

export default function Pricing() {
  const [frequency, setFrequency] = useState<Frequency>(FREQUENCIES[0]);

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="bg-slate-50 py-24 sm:py-32 dark:bg-slate-900"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-slate-700 sm:text-5xl dark:text-slate-100">
            Pricing that scales with
            <br /> your reading
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            ReadTube is source available and free to self-host.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <fieldset aria-label="Payment frequency">
            <RadioGroup
              value={frequency}
              onChange={setFrequency}
              className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs/5 font-semibold ring-1 ring-inset ring-slate-200 dark:ring-slate-700"
            >
              {FREQUENCIES.map((option) => (
                <Radio
                  key={option.value}
                  value={option}
                  className="cursor-pointer rounded-full px-3 py-1 text-slate-500 data-[checked]:bg-slate-800 data-[checked]:text-white dark:text-slate-400 dark:data-[checked]:bg-slate-100 dark:data-[checked]:text-slate-900"
                >
                  {option.label}
                </Radio>
              ))}
            </RadioGroup>
          </fieldset>
        </div>

        <div className="isolate mx-auto mt-12 grid max-w-md grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:grid-rows-[auto_auto_auto_auto_1fr] lg:gap-y-0">
          {PRICING_TIERS.map((tier, index) => (
            <div
              key={tier.id}
              className={cn(
                tier.mostPopular
                  ? 'ring-2 ring-[#515ada] dark:ring-indigo-400'
                  : 'ring-1 ring-slate-200 dark:ring-slate-700',
                'rounded-2xl bg-white p-8 xl:p-10 dark:bg-slate-800/40',
                'flex flex-col lg:row-span-5 lg:grid lg:grid-rows-subgrid'
              )}
            >
              <div className="flex items-center justify-between gap-x-4">
                <h3
                  id={tier.id}
                  className={cn(
                    tier.mostPopular
                      ? 'text-[#515ada] dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-100',
                    'font-display text-lg font-semibold leading-8'
                  )}
                >
                  {tier.name}
                </h3>
                {tier.mostPopular && (
                  <p className="rounded-full bg-[#515ada]/10 px-2.5 py-1 text-xs font-semibold leading-5 text-[#515ada] dark:bg-indigo-400/10 dark:text-indigo-300">
                    Most popular
                  </p>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">
                {tier.description}
              </p>
              <p className="mt-6 flex items-baseline gap-x-1">
                {tier.free ? (
                  <span className="font-display text-4xl font-bold tracking-tight text-slate-700 dark:text-slate-100">
                    Free
                  </span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-bold tracking-tight text-slate-700 dark:text-slate-100">
                      ${tier.price[frequency.value]}
                    </span>
                    <span className="text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                      {frequency.priceSuffix}
                    </span>
                  </>
                )}
              </p>
              <a
                href={tier.available ? tier.href : undefined}
                aria-describedby={tier.id}
                className={cn(
                  tier.mostPopular
                    ? 'bg-[#515ada] text-white shadow-sm hover:bg-[#515ada]/90'
                    : 'text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100 dark:text-slate-100 dark:ring-slate-600 dark:hover:bg-slate-700/50',
                  'mt-6 block rounded-full px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#515ada]'
                )}
              >
                {tier.available ? 'Get started' : 'Coming soon'}
              </a>
              <ul
                role="list"
                className="mt-8 space-y-3 text-sm leading-6 text-slate-600 xl:mt-10 dark:text-slate-300"
              >
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={cn(
                      'flex items-start gap-x-3',
                      index > 0 && PRICING_TIERS[index - 1].features.includes(feature)
                        ? 'text-slate-400 dark:text-slate-500'
                        : undefined
                    )}
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="h-5 w-5 flex-none text-[#515ada] dark:text-indigo-400"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
