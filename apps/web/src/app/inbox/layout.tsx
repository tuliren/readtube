import { ReactNode } from 'react';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return <div className="h-screen overflow-hidden">{children}</div>;
}
