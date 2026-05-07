const NATIVE_WIDTH = 250;
const NATIVE_HEIGHT = 54;
const HREF =
  'https://www.producthunt.com/products/readtube-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-readtube-2';
const ALT = 'ReadTube - Turn YouTube subscriptions into a personal newsletter | Product Hunt';

const badgeSrc = (theme: 'light' | 'dark' | 'neutral') =>
  `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1140604&theme=${theme}`;

interface ProductHuntButtonProps {
  /**
   * Override the badge theme. When omitted, the badge automatically tracks the
   * site theme: `light` on light mode, `dark` on dark mode (CSS-only swap via
   * Tailwind's `dark:` variant — no client JS, no hydration flicker).
   */
  theme?: 'light' | 'dark' | 'neutral';
  height?: number;
}

const ProductHuntButton = ({ theme, height = NATIVE_HEIGHT }: ProductHuntButtonProps) => {
  const width = Math.round((height * NATIVE_WIDTH) / NATIVE_HEIGHT);

  return (
    <a
      href={HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="ReadTube on Product Hunt"
      className="inline-flex items-center"
    >
      {theme != null ? (
        <img alt={ALT} width={width} height={height} src={badgeSrc(theme)} />
      ) : (
        <>
          <img
            alt={ALT}
            width={width}
            height={height}
            src={badgeSrc('light')}
            className="block dark:hidden"
          />
          <img
            alt=""
            width={width}
            height={height}
            src={badgeSrc('dark')}
            className="hidden dark:block"
          />
        </>
      )}
    </a>
  );
};

export default ProductHuntButton;
