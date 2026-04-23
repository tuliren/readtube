'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { TARGET_LANGUAGES } from '@/lib/language/names';

interface Props {
  initialValue: string | null;
}

const ORIGINAL_VALUE = '__original__';

/**
 * Single-field form for the user's default reader language. Saves on
 * change (no submit button) — the choice is a one-line preference, so
 * making the user click Save would be friction without value.
 */
export default function PreferredLanguageForm({ initialValue }: Props) {
  const [value, setValue] = useState<string | null>(initialValue);
  const [saving, setSaving] = useState(false);
  // Track the last successfully persisted value so an error rollback
  // returns to "what's actually in the DB" rather than the stale SSR
  // prop. Without this, picking en→fr→de where the third save fails
  // would roll back to en (the SSR value) instead of fr (the last
  // good save).
  const lastSavedRef = useRef<string | null>(initialValue);

  async function handleChange(next: string | null) {
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      lastSavedRef.current = next;
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      setValue(lastSavedRef.current);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">
        Default reader language
      </label>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        Pre-selects the language picker on every video reader. Pick &ldquo;Original&rdquo; to always
        see the source-language version of summaries and articles.
      </p>
      <select
        disabled={saving}
        value={value ?? ORIGINAL_VALUE}
        onChange={(e) => {
          const next = e.target.value;
          handleChange(next === ORIGINAL_VALUE ? null : next);
        }}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:border-ring focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value={ORIGINAL_VALUE}>Original (source language)</option>
        {TARGET_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.englishName})
          </option>
        ))}
      </select>
    </div>
  );
}
