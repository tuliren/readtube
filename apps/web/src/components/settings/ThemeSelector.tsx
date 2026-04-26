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
import { MAIN_COLOR } from '@/constants';
import { cn } from '@/lib/utils';

type ThemeChoice = 'system' | 'light' | 'dark';

const CHOICES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

interface Props {
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

export default function ThemeSelector({
  className,
  side = 'bottom',
  align = 'end',
  sideOffset = 8,
}: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes reads localStorage on the client only; rendering its
  // values during SSR produces a hydration mismatch. Gate on mounted
  // and show a neutral placeholder until the client takes over.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
      <DropdownMenuContent side={side} align={align} sideOffset={sideOffset}>
        {CHOICES.map(({ value, label, Icon }) => {
          const active = current === value;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              className={cn('gap-2', active && 'font-medium text-white focus:text-white')}
              style={active ? { backgroundColor: MAIN_COLOR } : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
