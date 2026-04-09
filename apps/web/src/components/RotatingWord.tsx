'use client';

import { useEffect, useRef, useState } from 'react';

import { MAIN_COLOR, MINOR_COLOR } from '@/constants';

const WORDS = [
  'Read',
  'Skim',
  'Search',
  'Summarize',
  'Contemplate',
  'Digest',
  'Revisit',
  'Organize',
];

const COLORS = [
  MAIN_COLOR,
  MINOR_COLOR,
  '#e11d48', // rose
  '#7c3aed', // violet
  '#0d9488', // teal
  '#d97706', // amber
  '#2563eb', // blue
  '#16a34a', // green
  '#c026d3', // fuchsia
  '#dc2626', // red
  '#4f46e5', // indigo
  '#db2777', // pink
  '#0891b2', // cyan
];

const HOLD_MS = 2000;
const LETTER_MS = 90;

export default function RotatingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const [displayed, setDisplayed] = useState(WORDS[0]);
  const [phase, setPhase] = useState<'hold' | 'deleting' | 'typing'>('hold');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const word = WORDS[wordIndex];
  const color = COLORS[colorIndex];
  const nextWordIndex = (wordIndex + 1) % WORDS.length;
  const nextColorIndex = (colorIndex + 1) % COLORS.length;

  useEffect(() => {
    const schedule = (fn: () => void, delay: number) => {
      timeoutRef.current = setTimeout(fn, delay);
    };

    if (phase === 'hold') {
      schedule(() => setPhase('deleting'), HOLD_MS);
    } else if (phase === 'deleting') {
      if (displayed.length === 0) {
        setWordIndex(nextWordIndex);
        setColorIndex(nextColorIndex);
        setPhase('typing');
      } else {
        schedule(() => setDisplayed((d) => d.slice(0, -1)), LETTER_MS);
      }
    } else if (phase === 'typing') {
      if (displayed.length === word.length) {
        setPhase('hold');
      } else {
        schedule(() => setDisplayed(word.slice(0, displayed.length + 1)), LETTER_MS);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [phase, displayed, wordIndex, colorIndex, nextWordIndex, nextColorIndex, word]);

  return (
    <span className="relative inline-block whitespace-nowrap">
      <span style={{ color }}>
        {displayed}
        <span
          className="ml-[0.05em] inline-block w-[0.12em] animate-[blink_1s_step-end_infinite] align-baseline"
          style={{ backgroundColor: color, height: '0.85em' }}
        />
      </span>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 0; }
        }
      `}</style>
    </span>
  );
}
