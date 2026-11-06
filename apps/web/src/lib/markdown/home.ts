import { DESCRIPTION, FULL_WEBSITE_URL, GITHUB_REPO_URL, TITLE } from '@/constants';
import {
  FAQS,
  FAQ_HEADING,
  FEATURES,
  FEATURES_HEADING,
  FEATURES_INTRO,
  PRICING_HEADING,
  PRICING_INTRO,
  PRICING_TIERS,
  type PricingTier,
} from '@/lib/marketing/content';

/** Path of the homepage's markdown rendition. */
export const HOME_MARKDOWN_PATH = '/index.md';

export function formatTierPrice(tier: PricingTier): string {
  if (tier.free === true) {
    return 'Free';
  }
  const { monthly, annually } = tier.price;
  if (monthly == null || annually == null) {
    return 'Undetermined';
  }
  return `$${monthly} / month or $${annually} / year`;
}

function absoluteUrl(href: string): string {
  return href.startsWith('/') ? `${FULL_WEBSITE_URL}${href}` : href;
}

/**
 * Markdown rendition of the homepage for agents (`/index.md`, and `/`
 * with `Accept: text/markdown`). Built from the same data module the
 * React sections render, so the two can't drift. Pure: no I/O.
 */
export function buildHomeMarkdown(): string {
  const lines: string[] = [`# ${TITLE}`, '', `> ${DESCRIPTION}`, ''];

  lines.push(`## ${FEATURES_HEADING}`, '', FEATURES_INTRO, '');
  for (const feature of FEATURES) {
    lines.push(`### ${feature.title}`, '', feature.description, '');
  }

  lines.push(`## ${PRICING_HEADING}`, '', PRICING_INTRO, '');
  for (const tier of PRICING_TIERS) {
    const availability = tier.available ? '' : ' (coming soon)';
    lines.push(`### ${tier.name}: ${formatTierPrice(tier)}${availability}`, '');
    lines.push(tier.description, '');
    lines.push(...tier.features.map((feature) => `- ${feature}`), '');
    if (tier.available) {
      lines.push(`Get started: ${absoluteUrl(tier.href)}`, '');
    }
  }

  lines.push(`## ${FAQ_HEADING}`, '');
  for (const faq of FAQS) {
    lines.push(`### ${faq.question}`, '', faq.answer, '');
  }

  lines.push(
    '## Links',
    '',
    `- [Sign up](${FULL_WEBSITE_URL}/sign-up): create a ReadTube account`,
    `- [Source code](${GITHUB_REPO_URL}): self-host ReadTube`,
    `- [Terms of Service](${FULL_WEBSITE_URL}/terms)`,
    `- [Privacy Policy](${FULL_WEBSITE_URL}/privacy)`,
    `- [llms.txt](${FULL_WEBSITE_URL}/llms.txt): index of agent-readable pages`,
    `- [Sitemap](${FULL_WEBSITE_URL}/sitemap.xml)`,
    ''
  );

  return lines.join('\n');
}
