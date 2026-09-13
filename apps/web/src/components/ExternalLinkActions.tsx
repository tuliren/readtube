'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { iconActionClassName } from '@/components/iconActionStyles';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  url: string;
  label?: string;
}

/**
 * External link icon + copy-URL button. Used next to titles that
 * reference a YouTube entity (channel, playlist) so the user can
 * jump to YouTube or grab the URL without selecting text.
 */
export default function ExternalLinkActions({ url, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts — silently fail.
    }
  }

  const openLabel = label ?? 'Open on YouTube';
  const copyLabel = copied ? 'Copied!' : 'Copy URL';

  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={openLabel}
              className={iconActionClassName}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">{openLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copyLabel}
              className={iconActionClassName}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copyLabel}</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
