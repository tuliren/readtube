'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { clsx } from 'clsx';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { Container } from '@/components/Container';

export const PRIMARY_FEATURE = {
  title: 'A multi-module Turbo mono-repo',
  description:
    'Include linting, formatting, testing, and more. This is a description for the main feature.',
};

interface FeatureType {
  title: string;
  description: string;
  image: {
    src: string;
    width: number;
    height: number;
  };
}

export const PRIMARY_FEATURES: FeatureType[] = [
  {
    title: 'Main feature #1',
    description:
      'This is the description of the main feature #1. It is a very long description that will wrap to the next line.',
    image: {
      src: 'https://images.unsplash.com/photo-1581094289810-adf5d25690e3',
      width: 800,
      height: 600,
    },
  },
  {
    title: 'Main feature #2',
    description:
      'This is the description of the main feature #2. It is a very long description that will wrap to the next line.',
    image: {
      src: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
      width: 800,
      height: 600,
    },
  },
  {
    title: 'Main feature #3',
    description:
      'This is the description of the main feature #3. It is a very long description that will wrap to the next line.',
    image: {
      src: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3',
      width: 800,
      height: 600,
    },
  },
  {
    title: 'Main feature #4',
    description:
      'This is the description of the main feature #4. It is a very long description that will wrap to the next line.',
    image: {
      src: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
      width: 800,
      height: 600,
    },
  },
];

function PrimaryFeatures() {
  let [tabOrientation, setTabOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  useEffect(() => {
    let lgMediaQuery = window.matchMedia('(min-width: 1024px)');

    function onMediaQueryChange({ matches }: { matches: boolean }) {
      setTabOrientation(matches ? 'vertical' : 'horizontal');
    }

    onMediaQueryChange(lgMediaQuery);
    lgMediaQuery.addEventListener('change', onMediaQueryChange);

    return () => {
      lgMediaQuery.removeEventListener('change', onMediaQueryChange);
    };
  }, []);

  return (
    <section
      id="features"
      aria-label="Features for running your books"
      className="relative overflow-hidden bg-primary/90 pt-20 pb-28 sm:py-32"
    >
      <Container className="relative">
        <div className="max-w-2xl md:mx-auto md:text-center xl:max-w-none">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
            {PRIMARY_FEATURE.title}
          </h2>
          <p className="mt-6 text-lg tracking-tight text-blue-100">{PRIMARY_FEATURE.description}</p>
        </div>
        <TabGroup
          className="mt-16 grid grid-cols-1 items-center gap-y-2 pt-10 sm:gap-y-6 md:mt-20 lg:grid-cols-12 lg:pt-0"
          vertical={tabOrientation === 'vertical'}
        >
          {({ selectedIndex }) => (
            <>
              <div className="-mx-4 flex overflow-x-auto pb-4 sm:mx-0 sm:overflow-visible sm:pb-0 lg:col-span-5">
                <TabList className="relative z-10 flex gap-x-4 px-4 whitespace-nowrap sm:mx-auto sm:px-0 lg:mx-0 lg:block lg:gap-x-0 lg:gap-y-1 lg:whitespace-normal">
                  {PRIMARY_FEATURES.map((feature, featureIndex) => (
                    <div
                      key={feature.title}
                      className={clsx(
                        'group relative rounded-full px-4 py-1 lg:rounded-l-xl lg:rounded-r-none lg:p-6',
                        selectedIndex === featureIndex
                          ? 'bg-white lg:bg-white/10 lg:ring-1 lg:ring-white/10 lg:ring-inset'
                          : 'hover:bg-white/10 lg:hover:bg-white/5'
                      )}
                    >
                      <h3>
                        <Tab
                          className={clsx(
                            'font-display text-lg data-selected:not-data-focus:outline-hidden',
                            selectedIndex === featureIndex
                              ? 'text-primary lg:text-white'
                              : 'text-blue-100 hover:text-white lg:text-white'
                          )}
                        >
                          <span className="absolute inset-0 rounded-full lg:rounded-l-xl lg:rounded-r-none" />
                          {feature.title}
                        </Tab>
                      </h3>
                      <p
                        className={clsx(
                          'mt-2 hidden text-sm lg:block',
                          selectedIndex === featureIndex
                            ? 'text-white'
                            : 'text-blue-100 group-hover:text-white'
                        )}
                      >
                        {feature.description}
                      </p>
                    </div>
                  ))}
                </TabList>
              </div>
              <TabPanels className="lg:col-span-7">
                {PRIMARY_FEATURES.map((feature) => (
                  <TabPanel key={feature.title} unmount={false}>
                    <div className="relative sm:px-6 lg:hidden">
                      <div className="absolute -inset-x-4 top-[-6.5rem] bottom-[-4.25rem] bg-white/10 ring-1 ring-white/10 ring-inset sm:inset-x-0 sm:rounded-t-xl" />
                      <p className="relative mx-auto max-w-2xl text-base text-white sm:text-center">
                        {feature.description}
                      </p>
                    </div>
                    <div className="mt-10 w-[45rem] overflow-hidden rounded-xl bg-slate-50 shadow-xl shadow-blue-900/20 sm:w-auto lg:mt-0 lg:w-[67.8125rem]">
                      <Image
                        className="w-full"
                        src={feature.image}
                        alt=""
                        sizes="(min-width: 1024px) 67.8125rem, (min-width: 640px) 100vw, 45rem"
                      />
                    </div>
                  </TabPanel>
                ))}
              </TabPanels>
            </>
          )}
        </TabGroup>
      </Container>
    </section>
  );
}

export default PrimaryFeatures;
