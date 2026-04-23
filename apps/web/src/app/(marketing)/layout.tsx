import { ReactNode } from 'react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  // Marketing + auth pages are locked to the light palette regardless
  // of the user's theme choice — the landing design is hand-tuned for
  // white and mixing in dark-body bleedthrough looked broken.
  return (
    <div className="force-light-theme min-h-full bg-white text-foreground">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
