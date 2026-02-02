import { Container } from '@/components/Container';
import { CONTACT_EMAIL } from '@/constants';

const faqs = [
  [
    {
      question: 'Question 1',
      answer: 'This is answer to question 1.',
    },
    {
      question: 'Question 2',
      answer: 'This is answer to question 2.',
    },
    {
      question: 'Question 3',
      answer: 'This is answer to question 3.',
    },
  ],
  [
    {
      question: 'Question 4',
      answer: 'This is answer to question 4.',
    },
    {
      question: 'Question 5',
      answer: 'This is answer to question 5.',
    },
    {
      question: 'Question 6',
      answer: 'This is answer to question 6.',
    },
  ],
  [
    {
      question: 'Question 7',
      answer: 'This is answer to question 7.',
    },
    {
      question: 'Question 8',
      answer: 'This is answer to question 8.',
    },
    {
      question: 'Question 9',
      answer: 'This is answer to question 9.',
    },
  ],
];

function Faqs() {
  return (
    <section id="faqs" aria-labelledby="faq-title" className="pt-1 pb-1 sm:pb-20 lg:pb-32">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-display text-3xl tracking-tight text-slate-900 sm:text-4xl">
          Frequently asked questions
        </h2>
      </div>
      <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-8 tracking-tight text-slate-500">
        Contact our{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
          support team
        </a>{' '}
        if you cannot find what you are looking for.
      </p>
      <Container className="relative">
        <ul
          role="list"
          className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3"
        >
          {faqs.map((column, columnIndex) => (
            <li key={columnIndex}>
              <ul role="list" className="flex flex-col gap-y-8">
                {column.map((faq, faqIndex) => (
                  <li key={faqIndex}>
                    <h3 className="font-display text-lg/7 text-slate-900">{faq.question}</h3>
                    <p className="mt-4 text-sm text-slate-700">{faq.answer}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default Faqs;
