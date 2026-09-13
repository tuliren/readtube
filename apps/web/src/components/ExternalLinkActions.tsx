'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { iconActionClassName } from '@/components/iconActionStyles';

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

  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={label ?? 'Open on YouTube'}
        className={iconActionClassName}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy URL'}
        className={iconActionClassName}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </span>
  );
}
