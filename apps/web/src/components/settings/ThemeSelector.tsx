'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ThemeChoice = 'system' | 'light' | 'dark';

const CHOICES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

interface Props {
  variant?: 'segmented' | 'compact' | 'dropdown';
  className?: string;
}

export default function ThemeSelector({ variant = 'segmented', className }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes reads localStorage on the client only; rendering its
  // values during SSR produces a hydration mismatch. Gate on mounted
  // and show a neutral placeholder until the client takes over.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === 'dropdown') {
    const current: ThemeChoice = mounted
      ? ((theme as ThemeChoice | undefined) ?? 'system')
      : 'system';
    const TriggerIcon =
      current === 'system' ? Monitor : mounted && resolvedTheme === 'dark' ? Moon : Sun;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none',
            className
          )}
          aria-label="Theme"
          title="Theme"
        >
          <TriggerIcon className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={8}>
          {CHOICES.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              className={cn('gap-2', current === value && 'font-medium text-foreground')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'compact') {
    const current: ThemeChoice = mounted
      ? ((theme as ThemeChoice | undefined) ?? 'system')
      : 'system';
    const displayIcon =
      current === 'system' ? Monitor : mounted && resolvedTheme === 'dark' ? Moon : Sun;
    const Icon = displayIcon;
    const nextTheme: ThemeChoice =
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className={cn(
          'shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground',
          className
        )}
        aria-label={`Theme: ${current}. Click to switch to ${nextTheme}.`}
        title={`Theme: ${current}`}
      >
        <Icon className="h-5 w-5" />
      </button>
    );
  }

  const current: ThemeChoice | null = mounted
    ? ((theme as ThemeChoice | undefined) ?? 'system')
    : null;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5',
        className
      )}
    >
      {CHOICES.map(({ value, label, Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground',
              active && 'bg-background text-foreground shadow-sm'
            )}
            title={label}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
