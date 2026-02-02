import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { FREE_TRIAL_MONTHS } from '@/constants';

export const CALL_TO_ACTION = {
  title: 'Get started today',
  description: 'This is a description for the call to action section.',
  button: `Get ${FREE_TRIAL_MONTHS} month${FREE_TRIAL_MONTHS > 1 ? 's' : ''} free`,
};

function CallToAction() {
  return (
    <section id="get-started-today" className="relative overflow-hidden bg-primary/90 py-32">
      <Container className="relative">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
            {CALL_TO_ACTION.title}
          </h2>
          <p className="mt-4 text-lg tracking-tight text-white">{CALL_TO_ACTION.description}</p>
          <Button color="white" className="mt-10">
            {CALL_TO_ACTION.button}
          </Button>
        </div>
      </Container>
    </section>
  );
}

export default CallToAction;
