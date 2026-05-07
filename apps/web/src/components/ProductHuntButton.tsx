const NATIVE_WIDTH = 250;
const NATIVE_HEIGHT = 54;

interface ProductHuntButtonProps {
  theme?: 'light' | 'dark' | 'neutral';
  height?: number;
}

const ProductHuntButton = ({ theme = 'light', height = NATIVE_HEIGHT }: ProductHuntButtonProps) => {
  const width = Math.round((height * NATIVE_WIDTH) / NATIVE_HEIGHT);
  return (
    <a
      href="https://www.producthunt.com/products/readtube-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-readtube-2"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="ReadTube on Product Hunt"
      className="inline-flex items-center"
    >
      <img
        alt="ReadTube - Turn YouTube subscriptions into a personal newsletter | Product Hunt"
        width={width}
        height={height}
        src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1140604&theme=${theme}`}
      />
    </a>
  );
};

export default ProductHuntButton;
