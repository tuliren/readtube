import { Button } from '@/components/Button';
import { Container } from '@/components/Container';

export default function CallToAction() {
  return (
    <section id="cta" aria-label="Get started" className="bg-slate-900 py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-white sm:text-4xl">
            Stop scrolling. Start reading.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            The feed is engineered to hold your attention. ReadTube is built to return it.
          </p>
          <div className="mt-10 flex justify-center">
            <Button href="/sign-up" variant="solid" color="white">
              Build your library
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
