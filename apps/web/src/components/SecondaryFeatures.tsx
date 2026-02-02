'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import {
  ComputerDesktopIcon,
  DocumentChartBarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import Image from 'next/image';
import { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

import { Container } from '@/components/Container';
import PrimaryFeatures from '@/components/PrimaryFeatures';

const SECONDARY_FEATURES = {
  title: 'Secondary features title',
  description: 'This is a description for the secondary features.',
};

interface FeatureType {
  name: ReactNode;
  summary: string;
  description: string;
  image: {
    src: string;
    width: number;
    height: number;
  };
  icon: ReactElement;
}

const features: Array<FeatureType> = [
  {
    name: 'Feature #1',
    summary: 'Feature #1 summary.',
    description:
      'This is a long feature #1 description that wraps to the next line. It’s a really long description.',
    image: {
      src: 'https://images.unsplash.com/photo-1618044619888-009e412ff12a',
      width: 800,
      height: 600,
    },
    icon: <DocumentChartBarIcon />,
  },
  {
    name: 'Feature #2',
    summary: 'Feature #2 summary.',
    description:
      'This is a long feature #2 description that wraps to the next line. It’s a really long description.',
    image: {
      src: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c',
      width: 800,
      height: 600,
    },
    icon: <ComputerDesktopIcon />,
  },
  {
    name: 'Feature #3',
    summary: 'Feature #3 summary.',
    description:
      'This is a long feature #3 description that wraps to the next line. It’s a really long description.',
    image: {
      src: 'https://images.unsplash.com/photo-1600695268275-1a6468700bd5',
      width: 1920,
      height: 1080,
    },
    icon: <UserCircleIcon />,
  },
];

function Feature({
  feature,
  isActive,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  feature: FeatureType;
  isActive: boolean;
}) {
  return (
    <div className={clsx(className, !isActive && 'opacity-75 hover:opacity-100')} {...props}>
      <div
        className={clsx(
          'w-9 rounded-lg bg-transparent',
          isActive ? 'text-primary' : 'text-slate-600'
        )}
      >
        {feature.icon}
      </div>
      <h3
        className={clsx('mt-6 text-sm font-medium', isActive ? 'text-primary' : 'text-slate-600')}
      >
        {feature.name}
      </h3>
      <p className="mt-2 font-display text-xl text-slate-900">{feature.summary}</p>
      <p className="mt-4 text-sm text-slate-600">{feature.description}</p>
    </div>
  );
}

function FeaturesMobile() {
  return (
    <div className="-mx-4 mt-20 flex flex-col gap-y-10 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {features.map((feature) => (
        <div key={feature.summary}>
          <Feature feature={feature} className="mx-auto max-w-2xl" isActive />
          <div className="relative mt-10 pb-10">
            <div className="absolute -inset-x-4 top-8 bottom-0 bg-slate-200 sm:-inset-x-6" />
            <div className="relative mx-auto w-[52.75rem] overflow-hidden rounded-xl bg-white ring-1 shadow-lg shadow-slate-900/5 ring-slate-500/10">
              <Image className="w-full" src={feature.image} alt="" sizes="52.75rem" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FeaturesDesktop() {
  return (
    <TabGroup className="hidden lg:mt-20 lg:block">
      {({ selectedIndex }) => (
        <>
          <TabList className="grid grid-cols-3 gap-x-8">
            {features.map((feature, featureIndex) => (
              <Feature
                key={feature.summary}
                feature={{
                  ...feature,
                  name: (
                    <Tab className="data-selected:not-data-focus:outline-hidden">
                      <span className="absolute inset-0" />
                      {feature.name}
                    </Tab>
                  ),
                }}
                isActive={featureIndex === selectedIndex}
                className="relative"
              />
            ))}
          </TabList>
          <TabPanels className="relative mt-20 overflow-hidden rounded-4xl bg-slate-200 px-14 py-16 xl:px-16">
            <div className="-mx-5 flex">
              {features.map((feature, featureIndex) => (
                <TabPanel
                  static
                  key={feature.summary}
                  className={clsx(
                    'px-5 transition duration-500 ease-in-out data-selected:not-data-focus:outline-hidden',
                    featureIndex !== selectedIndex && 'opacity-60'
                  )}
                  style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
                  aria-hidden={featureIndex !== selectedIndex}
                >
                  <div className="w-[52.75rem] overflow-hidden rounded-xl bg-white ring-1 shadow-lg shadow-slate-900/5 ring-slate-500/10">
                    <Image className="w-full" src={feature.image} alt="" sizes="52.75rem" />
                  </div>
                </TabPanel>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-4xl ring-1 ring-slate-900/10 ring-inset" />
          </TabPanels>
        </>
      )}
    </TabGroup>
  );
}

function SecondaryFeatures() {
  return (
    <section
      id="secondary-features"
      aria-label={SECONDARY_FEATURES.description}
      className="pt-20 pb-14 sm:pt-32 sm:pb-20 lg:pb-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl md:text-center">
          <h2 className="font-display text-3xl tracking-tight text-slate-900 sm:text-4xl">
            {SECONDARY_FEATURES.title}
          </h2>
          <p className="mt-4 text-lg tracking-tight text-slate-500">
            {SECONDARY_FEATURES.description}
          </p>
        </div>
        <FeaturesMobile />
        <FeaturesDesktop />
      </Container>
    </section>
  );
}

export default SecondaryFeatures;
