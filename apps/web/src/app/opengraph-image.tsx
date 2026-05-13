import { ImageResponse } from 'next/og';

import { Logo } from '@/components/Logo';
import { FULL_WEBSITE_URL, TITLE } from '@/constants';

export const runtime = 'edge';
export const alt = `${TITLE} — Turn YouTube subscriptions into a personal newsletter`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const HEADLINE = 'Read YouTube videos';
const SUBTITLE =
  'ReadTube turns your YouTube subscriptions into a personal newsletter, helps you reclaim focus in a world engineered for distraction.';

async function loadGoogleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, {
    headers: {
      // Force a TTF response so Satori can parse it — without a UA, Google
      // Fonts returns a woff2 URL which Satori's font parser can't read.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }).then((res) => res.text());
  const match = css.match(/src: url\((https:\/\/[^)]+)\) format/);
  if (!match) {
    throw new Error(`Could not extract font URL for ${family} ${weight}`);
  }
  return fetch(match[1]).then((res) => res.arrayBuffer());
}

export default async function OpengraphImage() {
  const glyphs = `${HEADLINE}${SUBTITLE}${TITLE}${FULL_WEBSITE_URL}`;
  const [interBold, interRegular] = await Promise.all([
    loadGoogleFont('Inter', 700, glyphs),
    loadGoogleFont('Inter', 400, glyphs),
  ]);

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '80px',
        background: 'white',
        backgroundImage:
          'linear-gradient(148deg, rgba(81, 90, 218, 0.08) 12%, rgba(118, 171, 223, 0.05) 90%)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Logo
          weight="font-bold"
          style={{ fontSize: '70px', fontWeight: 700, letterSpacing: '-0.02em' }}
        />
      </div>

      <div
        style={{
          fontSize: '72px',
          fontWeight: 700,
          lineHeight: 1.1,
          color: '#334155',
        }}
      >
        {HEADLINE}
      </div>

      <div
        style={{
          fontSize: '32px',
          lineHeight: 1.3,
          color: '#343d46',
        }}
      >
        {SUBTITLE}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '24px',
          color: '#64748b',
        }}
      >
        <div>{FULL_WEBSITE_URL}</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
      ],
    }
  );
}
