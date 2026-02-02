import { Button, useMantineTheme } from '@mantine/core';
import Image from 'next/image';

import Underline from '@/components/Underline';
import WaitingList from '@/components/WaitingList';
import { DESCRIPTION } from '@/constants';
import airbyteLogo from '@/images/logos/airbyte.svg';
import benchlingLogo from '@/images/logos/benchling.svg';
import duckyLogo from '@/images/logos/ducky.svg';
import liquidLogo from '@/images/logos/liquid.png';
import liverampLogo from '@/images/logos/liveramp.svg';
import scaleLogo from '@/images/logos/scale.svg';

const CompanyGroups = [
  { name: 'LiveRamp', logo: liverampLogo, height: 30 },
  { name: 'Scale AI', logo: scaleLogo, height: 38 },
  { name: 'Airbyte', logo: airbyteLogo, height: 54 },
  { name: 'Ducky', logo: duckyLogo, height: 40 },
  {
    name: 'Benchling',
    logo: benchlingLogo,
    height: 45,
  },
  {
    name: 'Liquid AI',
    logo: liquidLogo,
    height: 30,
  },
];

const SHOW_WAITLIST = false;

export default function Hero() {
  const theme = useMantineTheme();

  return (
    <section
      id="hero"
      aria-label="Hero"
      className="flex min-h-[80vh] flex-col justify-start px-6 pb-16 pt-[20vh] text-center sm:px-8"
    >
      <h1 className="mx-auto max-w-4xl font-display text-5xl font-medium leading-tight tracking-tight text-slate-700 sm:text-7xl sm:leading-tight">
        Create a <Underline text="monorepo" /> with one click
      </h1>
      <p className="mx-auto mt-10 max-w-2xl text-xl tracking-tight text-slate-500">{DESCRIPTION}</p>

      <div className="mt-14 flex justify-center gap-x-6">
        {SHOW_WAITLIST ? (
          <div className="mb-10">
            <WaitingList />
          </div>
        ) : (
          <Button
            component="a"
            href="#"
            variant="filled"
            size="md"
            color={theme.colors.gray[8]}
            radius="xl"
          >
            Coming soon
          </Button>
        )}
      </div>

      {!SHOW_WAITLIST && (
        <div className="mt-36 sm:mt-28 lg:mb-8 lg:mt-44">
          <p className="text-xl tracking-tight text-slate-500">Brought to you by folks from</p>
          <ul
            role="list"
            className="mt-8 grid grid-cols-2 gap-x-8 sm:flex sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-10 xl:flex xl:flex-row xl:gap-x-12 xl:gap-y-0"
          >
            {CompanyGroups.map((company) => (
              <li key={company.name} className="flex items-center justify-center">
                <Image
                  src={company.logo}
                  height={company.height * 1.2}
                  alt={company.name}
                  unoptimized
                  className="sm:transform-none scale-80 sm:scale-100"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
