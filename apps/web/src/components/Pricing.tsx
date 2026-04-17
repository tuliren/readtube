import { PricingTable } from '@clerk/nextjs';

import { Container } from '@/components/Container';

export default function Pricing() {
  return (
    <section id="pricing" aria-label="Pricing" className="bg-slate-50 py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-slate-700 sm:text-5xl">
            Pricing that scales with your reading
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-500">
            Start free. Upgrade when your library outgrows casual reading. 14-day free trial on paid
            plans.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <PricingTable
            appearance={{
              theme: 'simple',
            }}
          />
        </div>
      </Container>
    </section>
  );
}
