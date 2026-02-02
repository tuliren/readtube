import Link from 'next/link';

import { Container } from '@/components/Container';

export const ARTICLE_LINK =
  'https://www.humanities.mcmaster.ca/~bertrand/misc.html#:~:text=Three%20passions%2C%20simple%20but%20overwhelmingly%20strong%2C%20have%20governed%20my%20life';

export default function Footer() {
  return (
    <footer className="bg-transparent">
      <Container>
        <div className="flex flex-col justify-between border-t border-slate-400/10 py-10 text-sm text-slate-500 sm:flex-row">
          <p className="mt-6 break-words sm:mt-0">
            Copyright &copy; {new Date().getFullYear()} Starfish Software LLC. All rights reserved.
          </p>
          <div className="mt-6 flex gap-x-6 sm:mt-0">
            <Link href="/terms" className="group underline" aria-label="terms of service">
              Terms of Service
            </Link>
            <Link href="/privacy" className="group underline" aria-label="privacy policy">
              Privacy Policy
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
