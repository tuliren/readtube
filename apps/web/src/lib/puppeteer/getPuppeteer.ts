import path from 'path';

// Typed loosely because the local/Vercel branches resolve to different
// packages (puppeteer vs puppeteer-core). Both expose the subset of
// launch()/Browser API we use here.
export interface PuppeteerLauncher {
  launch: (opts: Record<string, unknown>) => Promise<unknown>;
}

export interface PuppeteerHandle {
  puppeteer: PuppeteerLauncher;
  launchOptions: Record<string, unknown>;
}

/**
 * Returns a Puppeteer launcher configured for the current environment:
 * on Vercel, uses puppeteer-core + @sparticuz/chromium (Lambda-compatible
 * Chromium binary); locally, uses the full puppeteer package which bundles
 * its own Chromium. Mirrors the setup from sibling repo timeplot.
 */
export async function getPuppeteer(): Promise<PuppeteerHandle> {
  const isVercel = process.env.VERCEL_ENV != null;
  console.info(
    `[puppeteer] getPuppeteer env: isVercel=${isVercel} VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} cwd=${process.cwd()}`
  );

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    const executablePath = await chromium.executablePath(
      path.join(process.cwd(), '../../node_modules/@sparticuz/chromium/bin')
    );
    console.info(
      `[puppeteer] resolved Chromium executablePath=${executablePath} argsCount=${chromium.args.length}`
    );
    return {
      puppeteer: puppeteer as unknown as PuppeteerLauncher,
      launchOptions: {
        headless: true,
        args: chromium.args,
        executablePath,
      },
    };
  }

  const puppeteer = await import('puppeteer');
  console.info('[puppeteer] using local puppeteer package (dev)');
  return {
    puppeteer: puppeteer as unknown as PuppeteerLauncher,
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    },
  };
}
