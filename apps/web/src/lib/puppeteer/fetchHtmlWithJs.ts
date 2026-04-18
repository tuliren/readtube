import type { HTTPRequest, ResourceType } from 'puppeteer-core';

import { getPuppeteer } from './getPuppeteer';
import { JS_HTTP_HEADERS, USER_AGENT } from './headers';

// networkidle0 waits for all connections to close so that XHR chains in
// client-rendered pages (e.g. Bilibili space) complete before we capture.
const JS_NAVIGATION_STRATEGY = 'networkidle0';
const JS_NAVIGATION_TIMEOUT_MS = 15_000;

// Respond with empty 200s for non-essential resources instead of aborting.
// Aborting triggers network errors that can stall pages waiting on
// document.readyState === 'complete'.
const MOCKED_RESOURCE_TYPES: ResourceType[] = ['media', 'font', 'image', 'stylesheet'];

export interface FetchHtmlSuccess {
  html: string;
  finalUrl: string;
}

export interface FetchHtmlHttpError {
  httpStatus: number;
  error: string;
}

export type FetchHtmlResult = FetchHtmlSuccess | FetchHtmlHttpError | null;

/**
 * Renders `url` in headless Chromium and returns the final DOM as HTML.
 * Intended for client-rendered pages where plain HTTP won't surface the
 * content (e.g. Bilibili space pages). Blocks images/fonts/CSS/media to
 * speed up load and reduce bandwidth. Runs on Vercel via @sparticuz/chromium.
 */
export async function fetchHtmlWithJs(url: string): Promise<FetchHtmlResult> {
  console.info(`Using Puppeteer to fetch URL: ${url}`);

  const { puppeteer, launchOptions } = await getPuppeteer();
  const browser = (await puppeteer.launch(launchOptions)) as {
    newPage: () => Promise<PuppeteerPage>;
    close: () => Promise<void>;
  };

  try {
    const page = await browser.newPage();

    await page.setUserAgent(USER_AGENT);

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    await page.setExtraHTTPHeaders({ ...JS_HTTP_HEADERS });

    await page.setRequestInterception(true);
    page.on('request', (request: HTTPRequest) => {
      const resourceType: ResourceType = request.resourceType();
      const frame = request.frame();
      const isCreatingIframe = frame != null && frame.parentFrame() !== null;
      const isSubframeDocument = resourceType === 'document' && frame !== page.mainFrame();

      if (isCreatingIframe || isSubframeDocument) {
        request.abort();
      } else if (MOCKED_RESOURCE_TYPES.includes(resourceType)) {
        request.respond({ status: 200, body: '' });
      } else {
        request.continue();
      }
    });

    await page.setViewport({ width: 1920, height: 1080 });

    const fetchStartTime = Date.now();
    let response: PuppeteerResponse | null = null;
    let navigationTimedOut = false;
    try {
      response = await page.goto(url, {
        waitUntil: JS_NAVIGATION_STRATEGY,
        timeout: JS_NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.message.includes('timeout') || error.message.includes('Timeout'));
      if (!isTimeout) {
        throw error;
      }
      navigationTimedOut = true;
      console.warn(
        `${JS_NAVIGATION_STRATEGY} timed out for ${url} — proceeding with current content`
      );
    }
    console.info(`Puppeteer fetched ${url} in ${Date.now() - fetchStartTime}ms`);

    if (!navigationTimedOut) {
      if (response != null && response.ok()) {
        console.info(`Puppeteer: got HTTP ${response.status()} for ${url}`);
      } else {
        const status = response?.status();
        const statusText = response?.statusText() ?? 'Unknown error';
        console.error(
          `Puppeteer: failed to fetch ${url}: HTTP ${status} ${statusText} (response null: ${response == null})`
        );
        if (status != null) {
          return { httpStatus: status, error: `HTTP ${status}: ${statusText}` };
        }
        return null;
      }
    }

    // Guard against networkidle0 timing out before JS-rendered content
    // painted — wait until body has meaningful text so we don't capture
    // a shell page.
    try {
      await page.waitForFunction(() => (document.body?.innerText?.trim().length ?? 0) > 200, {
        timeout: JS_NAVIGATION_TIMEOUT_MS,
      });
    } catch {
      console.warn(`Content readiness check timed out for ${url} — proceeding with current state`);
    }

    const html = await page.content();
    return { html, finalUrl: page.url() };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.message.includes('timeout') || error.message.includes('Timeout'));
    console.error(
      `Puppeteer: ${isTimeout ? 'timed out' : 'failed'} fetching ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  } finally {
    await browser.close();
  }
}

// Minimal shape of the puppeteer Page/Response surface we use. Kept loose
// so the local (puppeteer) and serverless (puppeteer-core) types line up
// without pinning to one package's exports.
interface PuppeteerPage {
  setUserAgent: (ua: string) => Promise<void>;
  evaluateOnNewDocument: (fn: () => void) => Promise<void>;
  setExtraHTTPHeaders: (headers: Record<string, string>) => Promise<void>;
  setRequestInterception: (enabled: boolean) => Promise<void>;
  on: (event: 'request', handler: (req: HTTPRequest) => void) => void;
  setViewport: (viewport: { width: number; height: number }) => Promise<void>;
  goto: (
    url: string,
    opts: { waitUntil: typeof JS_NAVIGATION_STRATEGY; timeout: number }
  ) => Promise<PuppeteerResponse | null>;
  mainFrame: () => unknown;
  waitForFunction: (fn: () => boolean, opts: { timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  url: () => string;
}

interface PuppeteerResponse {
  ok: () => boolean;
  status: () => number;
  statusText: () => string;
}
