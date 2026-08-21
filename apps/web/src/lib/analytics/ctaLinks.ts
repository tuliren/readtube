import { INTERNAL_UTM_MEDIUM } from '@/lib/analytics/utmParams';

/**
 * Builds an href for an on-site call-to-action (e.g. the "Create a free
 * account" button on public share pages), tagging it with UTM params so
 * Vercel Web Analytics can break down which surface drove the click.
 *
 * `utm_medium` is always {@link INTERNAL_UTM_MEDIUM}, which is the signal
 * `extractUtmParams` uses to keep these on-site clicks out of the first-touch
 * signup-attribution store: an internal button is a funnel step, not the
 * external traffic source a paid signup is attributed to. The two stay
 * separate — Vercel measures on-site CTA performance; the attribution report
 * keeps measuring where visitors originally came from.
 *
 * @param source distinguishing surface, read as `utm_source` in Vercel
 *   (e.g. `public_video`, `landing_hero`).
 * @param content optional specific CTA, read as `utm_content`, to tell apart
 *   multiple CTAs on the same surface (e.g. `create_account` vs `learn_more`).
 */
export function ctaHref(
  path: string,
  { source, content }: { source: string; content?: string }
): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: INTERNAL_UTM_MEDIUM,
  });
  if (content != null) {
    params.set('utm_content', content);
  }
  return `${path}?${params.toString()}`;
}
