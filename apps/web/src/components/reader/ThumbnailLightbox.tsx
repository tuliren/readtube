'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Enlarged video thumbnail over a dark backdrop. Positioned
 * `absolute inset-0`, so it covers the nearest `relative` ancestor
 * (the reader pane) rather than the whole viewport, and the sidebar
 * stays visible. A click anywhere or Escape closes it.
 */
export default function ThumbnailLightbox({ src, alt, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Capture phase + stopPropagation so Escape closes the
        // lightbox without also reaching the global shortcuts.
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="absolute inset-0 z-30 flex cursor-zoom-out items-center justify-center bg-black/80 p-6 animate-in fade-in-0"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close enlarged thumbnail"
        className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>
      {/* `w-full` scales the (often 480px) source up to the pane;
          `max-h-full` + `object-contain` keep it inside on short panes. */}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className="max-h-full w-full max-w-4xl rounded-lg object-contain shadow-2xl animate-in zoom-in-95"
      />
    </div>
  );
}
