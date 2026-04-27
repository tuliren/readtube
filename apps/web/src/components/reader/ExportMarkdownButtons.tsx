'use client';

import { Check, Copy, Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  /** Returns the markdown payload at click time so the caller doesn't
   *  have to recompose on every render while content is streaming. */
  getContent: () => string;
  /** Filename stem (no extension). Slugified before `.md` is appended. */
  filename: string;
  /** Disables both buttons — used while content is empty or still streaming. */
  disabled?: boolean;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : 'export';
}

export default function ExportMarkdownButtons({ getContent, filename, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const content = getContent();
    if (content.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      return;
    }
    setCopied(true);
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }, [getContent]);

  const handleDownload = useCallback(() => {
    const content = getContent();
    if (content.length === 0) {
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(filename)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getContent, filename]);

  const buttonClass =
    'inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled}
              aria-label={copied ? 'Copied' : 'Copy markdown'}
              className={buttonClass}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {copied ? 'Copied' : 'Copy markdown to clipboard'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleDownload}
              disabled={disabled}
              aria-label="Export markdown"
              className={buttonClass}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Export as markdown file
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
