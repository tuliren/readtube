import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import { Banner, Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { ReactNode } from 'react';

export const metadata = {
  // Define your metadata here
  // For more information on metadata API, see: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
};

const banner = (
  <Banner storageKey="banner-key-20250326">Announcement: human reaches 1% speed of light ⚡</Banner>
);

const navbar = (
  <Navbar
    logo={
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <img src="/icon.png" alt="Logo" width={20} height={20} />
        <span style={{ fontWeight: 700, color: '#0b5394' }}>Nextra Template</span>
      </span>
    }
  />
);
const footer = (
  <Footer
    style={{
      padding: '1.5rem',
      fontSize: '0.875rem',
    }}
  >
    Copyright © {new Date().getFullYear()} Starfish Software LLC. All rights reserved.
  </Footer>
);

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      // Not required, but good for SEO
      lang="en"
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head
      // ... Your additional head options
      >
        <link rel="shortcut icon" href="/icon.png" />
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          editLink={null}
          feedback={{
            content: null,
          }}
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
