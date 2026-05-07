import { ImageResponse } from 'next/og';
import { ReactElement } from 'react';

import { MAIN_COLOR, MINOR_COLOR, TITLE } from '@/constants';

import {
  CTA_HEADLINE,
  CTA_SUBHEADLINE,
  FEATURES,
  FEATURES_HEADLINE,
  FEATURES_SUBHEADLINE,
  HERO_HEADLINE,
  HERO_SUBTITLE,
  PH_LINKS,
} from './copy';
import { loadInter } from './fonts';

const GALLERY_SIZE = { width: 1270, height: 760 };
const THUMBNAIL_SIZE = { width: 240, height: 240 };

const PURPLE = MAIN_COLOR;
const SKY = MINOR_COLOR;
const SLATE_900 = '#0f172a';
const SLATE_700 = '#334155';
const SLATE_500 = '#64748b';
const INDIGO_100 = '#e0e7ff';
const SOFT_BG =
  'linear-gradient(148deg, rgba(81, 90, 218, 0.08) 12%, rgba(118, 171, 223, 0.05) 90%)';

function GradientTitle({ size = 84 }: { size?: number }) {
  return (
    <div
      style={{
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        backgroundImage: `linear-gradient(to right, ${PURPLE}, ${SKY})`,
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {TITLE}
    </div>
  );
}

function HeroLayout(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '90px 100px',
        background: 'white',
        backgroundImage: SOFT_BG,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <GradientTitle size={70} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div
          style={{
            fontSize: '110px',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: SLATE_900,
          }}
        >
          {HERO_HEADLINE}
        </div>
        <div
          style={{
            fontSize: '34px',
            lineHeight: 1.35,
            color: SLATE_500,
            maxWidth: '1000px',
          }}
        >
          {HERO_SUBTITLE}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '24px',
          color: SLATE_500,
        }}
      >
        <div>{PH_LINKS.website}</div>
        <div style={{ display: 'flex', gap: '14px' }}>
          <div
            style={{
              padding: '12px 28px',
              borderRadius: '999px',
              background: PURPLE,
              color: 'white',
              fontWeight: 700,
            }}
          >
            Get Started
          </div>
          <div
            style={{
              padding: '12px 28px',
              borderRadius: '999px',
              border: `2px solid ${PURPLE}`,
              color: PURPLE,
              fontWeight: 700,
            }}
          >
            Source available
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureMock({ featureKey }: { featureKey: string }): ReactElement {
  const card = (children: ReactElement) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'white',
        borderRadius: '24px',
        boxShadow: '0 30px 60px -20px rgba(15, 23, 42, 0.18)',
        padding: '32px',
        gap: '16px',
      }}
    >
      {children}
    </div>
  );

  if (featureKey === 'inbox') {
    const filters = [
      { name: 'Inbox', count: '12', active: true },
      { name: 'Unread', count: '4', active: false },
      { name: 'Starred', count: '4', active: false },
      { name: 'Saved for later', count: '7', active: false },
      { name: 'Archive', count: '', active: false },
    ];
    const channels = [
      { name: 'Lex Fridman', count: '3' },
      { name: 'Dwarkesh Patel', count: '2' },
      { name: 'Cal Newport', count: '1' },
      { name: 'Andrej Karpathy', count: '1' },
    ];
    const videos = [
      {
        ch: 'Lex Fridman',
        title: 'Jensen Huang on the next decade of compute',
        meta: '2h ago',
        unread: true,
      },
      {
        ch: 'Dwarkesh Patel',
        title: 'Elon Musk on why first principles win',
        meta: 'Yesterday',
        unread: true,
      },
      {
        ch: 'Cal Newport',
        title: 'Rules for deep work in a noisy world',
        meta: '2d ago · ★',
        unread: false,
      },
      {
        ch: 'Andrej Karpathy',
        title: 'Intro to neural networks, from scratch',
        meta: '3d ago',
        unread: false,
      },
      {
        ch: 'Mahesh Shenoy',
        title: 'Special relativity, intuitively',
        meta: '1w ago',
        unread: false,
      },
    ];
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
          background: 'white',
          borderRadius: '24px',
          boxShadow: '0 30px 60px -20px rgba(15, 23, 42, 0.18)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '190px',
            padding: '20px 12px',
            gap: '2px',
            background: '#f8fafc',
            borderRight: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '11px',
              color: SLATE_500,
              letterSpacing: '0.08em',
              padding: '4px 10px 8px 10px',
            }}
          >
            FOLDERS
          </div>
          {filters.map((f) => (
            <div
              key={f.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 10px',
                borderRadius: '8px',
                background: f.active ? 'rgba(81, 90, 218, 0.10)' : 'transparent',
                fontSize: '13px',
                fontWeight: f.active ? 700 : 400,
                color: f.active ? PURPLE : SLATE_700,
              }}
            >
              <div style={{ display: 'flex' }}>{f.name}</div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '12px',
                  color: f.active ? PURPLE : SLATE_500,
                }}
              >
                {f.count}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', height: '12px' }} />
          <div
            style={{
              display: 'flex',
              fontSize: '11px',
              color: SLATE_500,
              letterSpacing: '0.08em',
              padding: '4px 10px 8px 10px',
            }}
          >
            CHANNELS
          </div>
          {channels.map((c) => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                fontSize: '13px',
                color: SLATE_700,
              }}
            >
              <div style={{ display: 'flex' }}>{c.name}</div>
              <div style={{ display: 'flex', fontSize: '12px', color: SLATE_500 }}>{c.count}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '20px 22px',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e2e8f0',
              paddingBottom: '10px',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', fontSize: '17px', fontWeight: 700, color: SLATE_900 }}>
              Inbox
            </div>
            <div style={{ display: 'flex', fontSize: '12px', color: SLATE_500 }}>
              4 unread of 12
            </div>
          </div>
          {videos.map((v) => (
            <div
              key={v.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                padding: '9px 12px',
                borderRadius: '10px',
                background: v.unread ? 'rgba(81, 90, 218, 0.07)' : 'transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', fontSize: '11px', color: SLATE_500 }}>{v.ch}</div>
                <div style={{ display: 'flex', fontSize: '11px', color: SLATE_500 }}>{v.meta}</div>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '14px',
                  color: SLATE_900,
                  fontWeight: v.unread ? 700 : 400,
                }}
              >
                {v.title}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (featureKey === 'article') {
    return card(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '11px', color: SLATE_500, letterSpacing: '0.08em' }}>HEADLINE</div>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: SLATE_900,
            lineHeight: 1.2,
          }}
        >
          The case for deep work in an era of infinite distraction
        </div>
        <div style={{ fontSize: '11px', color: SLATE_500, letterSpacing: '0.08em' }}>ARTICLE</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: SLATE_900, lineHeight: 1.3 }}>
          Why undistracted hours matter
        </div>
        <div style={{ fontSize: '13px', color: SLATE_700, lineHeight: 1.55 }}>
          The capacity to concentrate without interruption is the rarest, and most valuable,
          cognitive resource of the next decade. Everything that compounds — research, writing,
          craft, judgment — is built out of long, unbroken hours that the modern feed is engineered
          to dissolve.
        </div>
        <div
          style={{
            display: 'flex',
            padding: '9px 12px',
            borderLeft: `3px solid ${PURPLE}`,
            background: 'rgba(81, 90, 218, 0.07)',
            fontSize: '13px',
            fontStyle: 'italic',
            color: SLATE_900,
            lineHeight: 1.5,
          }}
        >
          Distraction is the natural state. Concentration is the practiced one.
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: SLATE_900, lineHeight: 1.3 }}>
          Rituals that protect attention
        </div>
        <div style={{ fontSize: '13px', color: SLATE_700, lineHeight: 1.55 }}>
          Block time on the calendar before anything else can claim it. Build environments where
          focused work is the default, not the exception, and treat the first ninety minutes of the
          day as a non-negotiable appointment with the hardest problem on your list.
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: SLATE_900, lineHeight: 1.3 }}>
          What this looks like in practice
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
            color: SLATE_700,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex' }}>
            • A single morning block, phone in another room, one open document.
          </div>
          <div style={{ display: 'flex' }}>
            • A weekly review where every saved video is either read, archived, or let go.
          </div>
          <div style={{ display: 'flex' }}>
            • A short evening walk to consolidate what the day actually produced.
          </div>
        </div>
      </div>
    );
  }

  if (featureKey === 'translation') {
    const langs = ['English', '中文', 'Español', 'Français', '日本語', 'Deutsch'];
    const activeIndex = langs.indexOf('日本語');
    return card(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: SLATE_900 }}>
          Read in your language
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {langs.map((l, i) => (
            <div
              key={l}
              style={{
                padding: '10px 18px',
                borderRadius: '999px',
                background: i === activeIndex ? PURPLE : '#f1f5f9',
                color: i === activeIndex ? 'white' : SLATE_700,
                fontSize: '18px',
                fontWeight: i === activeIndex ? 700 : 400,
              }}
            >
              {l}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '18px',
            color: SLATE_700,
            lineHeight: 1.5,
            padding: '20px',
            borderRadius: '14px',
            background: '#f8fafc',
          }}
        >
          <div style={{ color: SLATE_500, fontSize: '14px', letterSpacing: '0.08em' }}>
            ARTICLE · 日本語
          </div>
          <div>集中力は鍛えられる能力です。</div>
          <div>毎朝、邪魔されない時間を確保し、最も難しい仕事から始めましょう。</div>
        </div>
      </div>
    );
  }

  if (featureKey === 'search') {
    return card(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '16px 20px',
            borderRadius: '14px',
            border: '2px solid #e2e8f0',
            fontSize: '20px',
            color: SLATE_900,
          }}
        >
          <div style={{ color: SLATE_500 }}>⌕</div>
          <div>how to focus when everything competes for attention</div>
        </div>
        {[
          {
            ch: 'Cal Newport',
            t: 'Why deep work is the superpower of the 21st century',
          },
          {
            ch: 'Andrew Huberman',
            t: 'Tools to reset attention after dopamine spikes',
          },
          {
            ch: 'Lex Fridman',
            t: 'On building a quiet workshop in a loud world',
          },
        ].map((r) => (
          <div
            key={r.t}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#f8fafc',
            }}
          >
            <div style={{ fontSize: '14px', color: SLATE_500, letterSpacing: '0.05em' }}>
              {r.ch.toUpperCase()}
            </div>
            <div style={{ fontSize: '18px', color: SLATE_900, fontWeight: 700 }}>{r.t}</div>
          </div>
        ))}
      </div>
    );
  }

  if (featureKey === 'notes') {
    return card(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: SLATE_900 }}>
          On building attention as a skill
        </div>
        <div style={{ fontSize: '15px', color: SLATE_700, lineHeight: 1.55 }}>
          The capacity to focus is not a fixed trait. It is a habit you build the way you build any
          other muscle — slowly, deliberately, over months rather than days.
        </div>
        <div
          style={{
            display: 'flex',
            padding: '6px 10px',
            borderRadius: '6px',
            background: 'rgba(118, 171, 223, 0.35)',
            fontSize: '15px',
            color: SLATE_900,
            alignSelf: 'flex-start',
          }}
        >
          Highlighted: with consistent, slightly uncomfortable practice
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '14px 16px',
            borderRadius: '12px',
            borderLeft: `4px solid ${PURPLE}`,
            background: 'rgba(81, 90, 218, 0.06)',
          }}
        >
          <div style={{ fontSize: '14px', color: SLATE_500 }}>Note · 12:34 — pinned to article</div>
          <div style={{ fontSize: '16px', color: SLATE_900 }}>
            Apply this to my morning block. Try one week, no phone before noon.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '14px 16px',
            borderRadius: '12px',
            borderLeft: `4px solid ${SKY}`,
            background: 'rgba(118, 171, 223, 0.10)',
          }}
        >
          <div style={{ fontSize: '14px', color: SLATE_500 }}>Note · 27:08</div>
          <div style={{ fontSize: '16px', color: SLATE_900 }}>
            Compounding effect — see also Karpathy on building taste.
          </div>
        </div>
      </div>
    );
  }

  return <div style={{ display: 'flex' }} />;
}

function FeatureLayout({ featureKey }: { featureKey: string }): ReactElement {
  const feature = FEATURES.find((f) => f.key === featureKey);
  if (feature == null) {
    throw new Error(`Unknown feature: ${featureKey}`);
  }
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: 'white',
        backgroundImage: SOFT_BG,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '50%',
          height: '100%',
          padding: '70px 60px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <GradientTitle size={42} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: '52px',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: SLATE_900,
            }}
          >
            {feature.title}
          </div>
          <div style={{ fontSize: '22px', lineHeight: 1.45, color: SLATE_700 }}>
            {feature.description}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: '20px', color: SLATE_500 }}>
          {PH_LINKS.website}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          width: '50%',
          height: '100%',
          padding: '70px 60px 70px 0',
        }}
      >
        <FeatureMock featureKey={featureKey} />
      </div>
    </div>
  );
}

function CtaLayout(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '90px 100px',
        background: PURPLE,
        backgroundImage: `linear-gradient(135deg, ${PURPLE} 0%, #4338ca 100%)`,
        fontFamily: 'Inter, sans-serif',
        color: 'white',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: '42px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'white',
        }}
      >
        {TITLE}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div
          style={{
            fontSize: '110px',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: 'white',
          }}
        >
          {CTA_HEADLINE}
        </div>
        <div style={{ fontSize: '32px', lineHeight: 1.4, color: INDIGO_100, maxWidth: '900px' }}>
          {CTA_SUBHEADLINE}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '22px',
          color: INDIGO_100,
        }}
      >
        <div>{PH_LINKS.website}</div>
        <div
          style={{
            padding: '14px 32px',
            borderRadius: '999px',
            background: 'white',
            color: PURPLE,
            fontWeight: 700,
          }}
        >
          Build your library
        </div>
      </div>
    </div>
  );
}

function FeaturesOverviewLayout(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '80px 80px',
        background: PURPLE,
        backgroundImage: `linear-gradient(160deg, ${PURPLE} 0%, #3730a3 100%)`,
        fontFamily: 'Inter, sans-serif',
        color: 'white',
        gap: '32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            fontSize: '60px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'white',
            lineHeight: 1.1,
          }}
        >
          {FEATURES_HEADLINE}
        </div>
        <div style={{ fontSize: '24px', color: INDIGO_100, lineHeight: 1.4, maxWidth: '900px' }}>
          {FEATURES_SUBHEADLINE}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {FEATURES.map((f) => (
          <div
            key={f.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '350px',
              height: '200px',
              padding: '24px',
              borderRadius: '16px',
              background: 'rgba(255, 255, 255, 0.08)',
              gap: '10px',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'white',
                lineHeight: 1.25,
              }}
            >
              {f.title}
            </div>
            <div style={{ fontSize: '14px', color: INDIGO_100, lineHeight: 1.5 }}>
              {f.overviewDescription ?? f.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbnailLayout(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: 'white',
        backgroundImage: `linear-gradient(135deg, ${PURPLE} 0%, ${SKY} 100%)`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: '38px',
          fontWeight: 700,
          color: 'white',
          letterSpacing: '-0.02em',
        }}
      >
        {TITLE}
      </div>
    </div>
  );
}

interface ImageDef {
  size: { width: number; height: number };
  render: () => ReactElement;
  glyphs: () => string;
  contentType: string;
}

const LATIN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?\'"-—–·…★⌕()[]/&%@#+';
const ACCENTED_LATIN = 'áéíóúñçÑÁÉÍÓÚüößÜÖÄäâêîôûàèìòùÀÈÌÒÙ';

const ALL_TEXT = `${LATIN_ALPHABET}${ACCENTED_LATIN}${TITLE}${HERO_HEADLINE}${HERO_SUBTITLE}${CTA_HEADLINE}${CTA_SUBHEADLINE}${FEATURES_HEADLINE}${FEATURES_SUBHEADLINE}${FEATURES.map((f) => `${f.title}${f.description}`).join('')}${PH_LINKS.website}`;

export const IMAGES: Record<string, ImageDef> = {
  hero: {
    size: GALLERY_SIZE,
    render: HeroLayout,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'features-overview': {
    size: GALLERY_SIZE,
    render: FeaturesOverviewLayout,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'feature-inbox': {
    size: GALLERY_SIZE,
    render: () => <FeatureLayout featureKey="inbox" />,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'feature-article': {
    size: GALLERY_SIZE,
    render: () => <FeatureLayout featureKey="article" />,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'feature-translation': {
    size: GALLERY_SIZE,
    render: () => <FeatureLayout featureKey="translation" />,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'feature-search': {
    size: GALLERY_SIZE,
    render: () => <FeatureLayout featureKey="search" />,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  'feature-notes': {
    size: GALLERY_SIZE,
    render: () => <FeatureLayout featureKey="notes" />,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  cta: {
    size: GALLERY_SIZE,
    render: CtaLayout,
    glyphs: () => ALL_TEXT,
    contentType: 'image/png',
  },
  thumbnail: {
    size: THUMBNAIL_SIZE,
    render: ThumbnailLayout,
    glyphs: () => TITLE,
    contentType: 'image/png',
  },
};

export type ImageName = keyof typeof IMAGES;

export const IMAGE_NAMES = Object.keys(IMAGES) as ImageName[];

export interface GalleryEntry {
  name: ImageName;
  label: string;
  size: { width: number; height: number };
  caption: string;
}

export const GALLERY: readonly GalleryEntry[] = [
  {
    name: 'hero',
    label: 'Hero cover',
    size: GALLERY_SIZE,
    caption: 'Cover slide. Use as the first gallery image on Product Hunt.',
  },
  {
    name: 'features-overview',
    label: 'Features overview',
    size: GALLERY_SIZE,
    caption: 'All five features summarized in one card.',
  },
  {
    name: 'feature-inbox',
    label: 'Inbox feature',
    size: GALLERY_SIZE,
    caption: FEATURES[0].title,
  },
  {
    name: 'feature-article',
    label: 'Article feature',
    size: GALLERY_SIZE,
    caption: FEATURES[1].title,
  },
  {
    name: 'feature-translation',
    label: 'Translation feature',
    size: GALLERY_SIZE,
    caption: FEATURES[2].title,
  },
  {
    name: 'feature-search',
    label: 'Search feature',
    size: GALLERY_SIZE,
    caption: FEATURES[3].title,
  },
  {
    name: 'feature-notes',
    label: 'Notes feature',
    size: GALLERY_SIZE,
    caption: FEATURES[4].title,
  },
  {
    name: 'cta',
    label: 'Closing CTA',
    size: GALLERY_SIZE,
    caption: 'Closing slide. Use as the last gallery image.',
  },
  {
    name: 'thumbnail',
    label: 'Thumbnail / icon',
    size: THUMBNAIL_SIZE,
    caption: 'Square 240×240 thumbnail used for the Product Hunt listing icon.',
  },
];

const RENDER_SCALE = 2;

export async function renderImage(name: ImageName): Promise<ImageResponse> {
  const def = IMAGES[name];
  const fonts = await loadInter(def.glyphs());
  const scaled = (
    <div
      style={{
        display: 'flex',
        width: `${def.size.width * RENDER_SCALE}px`,
        height: `${def.size.height * RENDER_SCALE}px`,
        transform: `scale(${RENDER_SCALE})`,
        transformOrigin: 'top left',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: `${def.size.width}px`,
          height: `${def.size.height}px`,
        }}
      >
        {def.render()}
      </div>
    </div>
  );
  return new ImageResponse(scaled, {
    width: def.size.width * RENDER_SCALE,
    height: def.size.height * RENDER_SCALE,
    fonts,
  });
}
