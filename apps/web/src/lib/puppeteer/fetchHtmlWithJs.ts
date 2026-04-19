import type { HTTPRequest, ResourceType } from 'puppeteer-core';

import { getPuppeteer } from './getPuppeteer';
import { JS_HTTP_HEADERS, USER_AGENT } from './headers';

// networkidle0 waits for all connections to close so that XHR chains in
// client-rendered pages (e.g. Bilibili space) complete before we capture.
const JS_NAVIGATION_STRATEGY = 'networkidle0';
const JS_NAVIGATION_TIMEOUT_MS = 60_000;

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

export interface FetchHtmlOptions {
  /**
   * CSS selector to wait for after navigation. Use this when the target
   * content is rendered by JS after `networkidle0` — the generic
   * "body.innerText > 200 chars" heuristic happily accepts an empty
   * shell page (Bilibili's space chrome alone crosses 200 chars
   * before the upload grid hydrates).
   *
   * When omitted, falls back to the body-text heuristic.
   */
  waitForSelector?: string;
}

/**
 * Renders `url` in headless Chromium and returns the final DOM as HTML.
 * Intended for client-rendered pages where plain HTTP won't surface the
 * content (e.g. Bilibili space pages). Blocks images/fonts/CSS/media to
 * speed up load and reduce bandwidth. Runs on Vercel via @sparticuz/chromium.
 */
export async function fetchHtmlWithJs(
  url: string,
  options: FetchHtmlOptions = {}
): Promise<FetchHtmlResult> {
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

    // Guard against networkidle0 settling before the JS-rendered
    // content we actually care about painted. Prefer a caller-supplied
    // selector (the target content's hallmark, e.g. a /video/BV anchor
    // on Bilibili) because the generic body-text heuristic accepts a
    // shell page whose menus/footer already exceed 200 chars.
    //
    // On selector timeout, reload the page once — in practice
    // Bilibili's SPA sometimes skips the upload-list XHR entirely on
    // first render (observed both locally and on Vercel) but reliably
    // succeeds on a clean reload in the same browser context.
    if (options.waitForSelector != null) {
      const ok = await waitForSelectorWithReload(page, options.waitForSelector);
      void ok;
    } else {
      const readinessStartTime = Date.now();
      try {
        await page.waitForFunction(() => (document.body?.innerText?.trim().length ?? 0) > 200, {
          timeout: JS_NAVIGATION_TIMEOUT_MS,
        });
        console.info(`[puppeteer] body-text readiness met in ${Date.now() - readinessStartTime}ms`);
      } catch {
        console.warn(
          `[puppeteer] body-text readiness check timed out after ${Date.now() - readinessStartTime}ms for ${url} — proceeding with current state`
        );
      }
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

// Keep each selector-wait attempt shorter than the navigation timeout
// so we have time for a reload retry before the caller's budget runs
// out (Bilibili's upload grid either renders immediately — typical
// observed latency is <100ms once hydration starts — or not at all).
const SELECTOR_WAIT_TIMEOUT_MS = 15_000;

async function waitForSelectorWithReload(page: PuppeteerPage, selector: string): Promise<boolean> {
  const firstStart = Date.now();
  try {
    await page.waitForSelector(selector, { timeout: SELECTOR_WAIT_TIMEOUT_MS });
    console.info(`[puppeteer] waitForSelector "${selector}" met in ${Date.now() - firstStart}ms`);
    return true;
  } catch {
    console.warn(
      `[puppeteer] waitForSelector "${selector}" timed out after ${Date.now() - firstStart}ms — reloading and retrying once`
    );
  }

  const reloadStart = Date.now();
  try {
    await page.reload({ waitUntil: JS_NAVIGATION_STRATEGY, timeout: JS_NAVIGATION_TIMEOUT_MS });
    console.info(`[puppeteer] page.reload settled in ${Date.now() - reloadStart}ms`);
  } catch (error) {
    console.warn(
      `[puppeteer] page.reload errored after ${Date.now() - reloadStart}ms: ${
        error instanceof Error ? error.message : String(error)
      } — proceeding with post-reload selector wait anyway`
    );
  }

  const secondStart = Date.now();
  try {
    await page.waitForSelector(selector, { timeout: SELECTOR_WAIT_TIMEOUT_MS });
    console.info(
      `[puppeteer] waitForSelector "${selector}" met after reload in ${Date.now() - secondStart}ms`
    );
    return true;
  } catch {
    console.warn(
      `[puppeteer] waitForSelector "${selector}" still failing after reload — proceeding with whatever rendered`
    );
    return false;
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
  waitForSelector: (selector: string, opts: { timeout: number }) => Promise<unknown>;
  reload: (opts: { waitUntil: typeof JS_NAVIGATION_STRATEGY; timeout: number }) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
  content: () => Promise<string>;
  url: () => string;
}

interface PuppeteerResponse {
  ok: () => boolean;
  status: () => number;
  statusText: () => string;
}
