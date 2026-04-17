import { Button } from '@/components/Button';
import { Container } from '@/components/Container';

export default function CallToAction() {
  return (
    <section id="cta" aria-label="Get started" className="bg-white py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-slate-700 sm:text-4xl">
            Stop scrolling. Start thinking.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-500">
            The feed is engineered to hold your attention. ReadTube is built to return it.
          </p>
          <div className="mt-10 flex justify-center">
            <Button href="/sign-up" variant="solid" color="slate">
              Start your library
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
