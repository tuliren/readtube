'use client';

import { Radio, RadioGroup } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';

import { FREE_TRIAL_MONTHS } from '@/constants';
import { cn } from '@/lib/utils';

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly', priceSuffix: '/ month' },
  { value: 'annually', label: 'Annually', priceSuffix: '/ year' },
];

export const PRICING_TIERS = [
  {
    name: 'Free Trial',
    id: 'tier-free',
    active: true,
    href: '/sign-up',
    price: { monthly: 0, annually: 0 },
    free: true,
    description: `${FREE_TRIAL_MONTHS}-month free trial period before subscription.`,
    features: ['All features in the Basic plan'],
    available: false,
  },
  {
    name: 'Basic',
    id: 'tier-base',
    active: true,
    href: '#',
    price: { monthly: 7, annually: 70 },
    description: 'Everything you need to get started.',
    features: ['Feature #1', 'Feature #2', 'Feature #3', 'Feature #4', 'Feature #5'],
    mostPopular: false,
    available: false,
  },
  {
    name: 'Advanced',
    id: 'tier-base',
    active: true,
    href: '#',
    price: { monthly: 20, annually: 200 },
    description: 'Provide your whole family with advanced phishing training and protection.',
    features: [
      'All features in the Basic plan',
      'Feature #6',
      'Feature #7',
      'Feature #8',
      'Feature #9',
    ],
    mostPopular: false,
    available: false,
  },
];

const ACTIVE_TIERS = PRICING_TIERS.filter((tier) => tier.active);

function Pricing() {
  const [frequency, setFrequency] = useState(FREQUENCIES[0]);

  return (
    <section id="pricing" aria-label="Pricing" className="pt-20 pb-14 sm:pt-32 sm:pb-20 lg:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-slate-900 sm:text-4xl">
            Pricing
          </h2>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-8 tracking-tight text-slate-500">
          All plans are powered by advanced AI models.
          <br />
          Pricing may change upon official launch.
        </p>

        <div className="mt-16 flex justify-center">
          <fieldset aria-label="Payment frequency">
            <RadioGroup
              value={frequency}
              onChange={setFrequency}
              className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs/5 font-semibold ring-1 ring-inset ring-gray-200"
            >
              {FREQUENCIES.map((option) => (
                <Radio
                  key={option.value}
                  value={option}
                  className="cursor-pointer rounded-full px-2.5 py-1 text-gray-500 data-[checked]:bg-primary data-[checked]:text-white"
                >
                  {option.label}
                </Radio>
              ))}
            </RadioGroup>
          </fieldset>
        </div>

        <div
          className={cn(
            'isolate mt-10 grid grid-cols-1 gap-8',
            ACTIVE_TIERS.length === 2
              ? 'mx-auto max-w-4xl lg:grid-cols-2' // Keep mx-auto for centering with 2 tiers
              : 'mx-auto max-w-md lg:mx-0 lg:max-w-none lg:grid-cols-3' // Original behavior for 3 tiers
          )}
        >
          {ACTIVE_TIERS.map((tier, index, allTiers) => (
            <div
              key={tier.id}
              className={cn(
                tier.mostPopular ? 'ring-4 ring-primary' : 'ring-2 ring-gray-300',
                'rounded-3xl p-8 xl:p-10'
              )}
            >
              <div className="flex items-center justify-between gap-x-4">
                <h3
                  id={tier.id}
                  className={cn(
                    tier.mostPopular ? 'text-primary' : 'text-gray-900',
                    'text-lg font-semibold leading-8'
                  )}
                >
                  {tier.name}
                </h3>
                {tier.mostPopular && (
                  <p className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold leading-5 text-primary">
                    Most popular
                  </p>
                )}
              </div>
              <p className="mt-4 min-h-[48px] text-sm leading-6 text-gray-700">
                {tier.description}
              </p>
              <p className="mt-6 flex items-baseline gap-x-1">
                {tier.free ? (
                  <span className="text-4xl font-bold tracking-tight text-gray-900">Free</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      ${tier.price[frequency.value as 'monthly' | 'annually']}
                    </span>{' '}
                    <span className="text-sm font-semibold leading-6 text-gray-500">
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
                    ? 'bg-primary text-white shadow-sm hover:bg-primary/80'
                    : 'text-primary ring-2 ring-inset ring-primary hover:text-primary/80 hover:ring-primary/80',
                  'mt-6 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                )}
              >
                {tier.available ? 'Sign Up' : 'Coming soon'}
              </a>
              <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-gray-700 xl:mt-10">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={cn(
                      'flex gap-x-3',
                      index > 0 && allTiers[index - 1].features.includes(feature)
                        ? 'text-gray-400'
                        : undefined
                    )}
                  >
                    <CheckIcon aria-hidden="true" className="w-4 flex-none text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
