import { DESCRIPTION, FULL_WEBSITE_URL, GITHUB_REPO_URL } from '@/constants';
import { buildHomeMarkdown, formatTierPrice } from '@/lib/markdown/home';
import { FAQS, FEATURES, PRICING_TIERS, type PricingTier } from '@/lib/marketing/content';

describe('buildHomeMarkdown', () => {
  const markdown = buildHomeMarkdown();

  it('starts with the title and description', () => {
    expect(markdown.startsWith(`# ReadTube\n\n> ${DESCRIPTION}\n`)).toBe(true);
  });

  it.each([
    ...FEATURES.map((feature) => ['feature', feature.title] as const),
    ...PRICING_TIERS.map((tier) => ['pricing tier', tier.name] as const),
    ...FAQS.map((faq) => ['FAQ question', faq.question] as const),
  ])('includes the %s "%s" as a heading', (_kind, heading) => {
    expect(markdown).toMatch(new RegExp(`^### ${escapeRegExp(heading)}`, 'm'));
  });

  it.each(FAQS.map((faq) => [faq.question, faq.answer]))('includes the answer to "%s"', (_q, a) => {
    expect(markdown).toContain(a);
  });

  it.each([
    `${FULL_WEBSITE_URL}/sign-up`,
    GITHUB_REPO_URL,
    `${FULL_WEBSITE_URL}/terms`,
    `${FULL_WEBSITE_URL}/privacy`,
    `${FULL_WEBSITE_URL}/llms.txt`,
  ])('links to %s', (url) => {
    expect(markdown).toContain(`](${url})`);
  });
});

describe('formatTierPrice', () => {
  const tier = (overrides: Partial<PricingTier>): PricingTier => ({
    name: 'Tier',
    id: 'tier',
    href: '/',
    price: { monthly: 10, annually: 60 },
    description: '',
    features: [],
    available: true,
    ...overrides,
  });

  it.each([
    ['a free tier', tier({ free: true }), 'Free'],
    ['a priced tier', tier({}), '$10 / month or $60 / year'],
    ['a tier without a price', tier({ price: { monthly: null, annually: null } }), 'Undetermined'],
  ])('formats %s', (_case, input, expected) => {
    expect(formatTierPrice(input)).toBe(expected);
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
