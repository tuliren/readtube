import { clsx } from 'clsx';
import { ComponentPropsWithoutRef } from 'react';

import { MAIN_COLOR, MINOR_COLOR, TITLE } from '@/constants';

interface LogoProps extends ComponentPropsWithoutRef<'div'> {
  size?: string;
  weight?: string;
}

export function Logo({ size = 'text-5xl', weight = 'font-medium', style, ...props }: LogoProps) {
  return (
    <div
      className={clsx(`font-display tracking-tight text-slate-700`, size, weight)}
      {...props}
      style={{
        background: `linear-gradient(to right, ${MAIN_COLOR}, ${MINOR_COLOR})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        color: 'transparent',
        ...style,
      }}
    >
      {TITLE}
    </div>
  );
}
