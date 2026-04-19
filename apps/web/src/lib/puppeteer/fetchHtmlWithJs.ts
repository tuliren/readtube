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
  console.info(`[puppeteer] fetchHtmlWithJs start url=${url}`);

  const handleStartTime = Date.now();
  const { puppeteer, launchOptions } = await getPuppeteer();
  console.info(`[puppeteer] getPuppeteer resolved in ${Date.now() - handleStartTime}ms`);

  const launchStartTime = Date.now();
  let browser: { newPage: () => Promise<PuppeteerPage>; close: () => Promise<void> };
  try {
    browser = (await puppeteer.launch(launchOptions)) as typeof browser;
  } catch (error) {
    console.error(
      `[puppeteer] browser.launch failed after ${Date.now() - launchStartTime}ms: ${
        error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error)
      }`
    );
    throw error;
  }
  console.info(`[puppeteer] browser launched in ${Date.now() - launchStartTime}ms`);

  // Request accounting so we can see at a glance on Vercel whether the
  // main document actually fetched and how much traffic was mocked.
  const requestCounts = { total: 0, mocked: 0, aborted: 0, continued: 0 };

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
      requestCounts.total++;
      const resourceType: ResourceType = request.resourceType();
      const frame = request.frame();
      const isCreatingIframe = frame != null && frame.parentFrame() !== null;
      const isSubframeDocument = resourceType === 'document' && frame !== page.mainFrame();

      if (isCreatingIframe || isSubframeDocument) {
        requestCounts.aborted++;
        request.abort();
      } else if (MOCKED_RESOURCE_TYPES.includes(resourceType)) {
        requestCounts.mocked++;
        request.respond({ status: 200, body: '' });
      } else {
        requestCounts.continued++;
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
        console.error(
          `[puppeteer] page.goto threw non-timeout error: ${
            error instanceof Error
              ? `${error.name}: ${error.message}\n${error.stack}`
              : String(error)
          }`
        );
        throw error;
      }
      navigationTimedOut = true;
      console.warn(
        `[puppeteer] ${JS_NAVIGATION_STRATEGY} timed out after ${JS_NAVIGATION_TIMEOUT_MS}ms for ${url} — proceeding with current content`
      );
    }
    console.info(
      `[puppeteer] page.goto settled in ${Date.now() - fetchStartTime}ms navigationTimedOut=${navigationTimedOut}`
    );

    if (!navigationTimedOut) {
      if (response != null && response.ok()) {
        console.info(`[puppeteer] HTTP ${response.status()} for ${url} finalUrl=${page.url()}`);
      } else {
        const status = response?.status();
        const statusText = response?.statusText() ?? 'Unknown error';
        console.error(
          `[puppeteer] fetch failed for ${url}: HTTP ${status} ${statusText} (responseNull=${response == null})`
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
    const readinessStartTime = Date.now();
    let readinessMet = false;
    try {
      await page.waitForFunction(() => (document.body?.innerText?.trim().length ?? 0) > 200, {
        timeout: JS_NAVIGATION_TIMEOUT_MS,
      });
      readinessMet = true;
    } catch {
      console.warn(
        `[puppeteer] content readiness check timed out after ${Date.now() - readinessStartTime}ms for ${url} — proceeding with current state`
      );
    }
    if (readinessMet) {
      console.info(`[puppeteer] content readiness met in ${Date.now() - readinessStartTime}ms`);
    }

    const html = await page.content();
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.trim() ?? '')
      .catch(() => '');

    // Log request accounting + body signals so we can distinguish
    // "empty shell (bot wall / consent gate)" from "real content but
    // scraper regex missed" when something fails on Vercel.
    console.info(
      `[puppeteer] fetchHtmlWithJs done: htmlLen=${html.length} bodyTextLen=${bodyText.length} requests=${JSON.stringify(
        requestCounts
      )} totalMs=${Date.now() - handleStartTime}`
    );
    console.info(
      `[puppeteer] HTML head preview (first 300 chars): ${html.slice(0, 300).replace(/\s+/g, ' ')}`
    );

    return { html, finalUrl: page.url() };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.message.includes('timeout') || error.message.includes('Timeout'));
    console.error(
      `[puppeteer] ${isTimeout ? 'timed out' : 'failed'} fetching ${url} after ${
        Date.now() - handleStartTime
      }ms requests=${JSON.stringify(requestCounts)}: ${
        error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error)
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
  evaluate: <T>(fn: () => T) => Promise<T>;
  content: () => Promise<string>;
  url: () => string;
}

interface PuppeteerResponse {
  ok: () => boolean;
  status: () => number;
  statusText: () => string;
}
