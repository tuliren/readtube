'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

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
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy URL'}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}
