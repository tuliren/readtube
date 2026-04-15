import { ReactNode } from 'react';

export default function VideosLayout({ children }: { children: ReactNode }) {
  return <div className="h-screen overflow-hidden">{children}</div>;
}
