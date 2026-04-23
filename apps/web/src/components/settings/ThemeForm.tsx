'use client';

import ThemeSelector from './ThemeSelector';

/**
 * Settings-page wrapper around ThemeSelector. Kept as its own client
 * component so the settings page itself can stay a server component,
 * matching the structural pattern of PreferredLanguageForm.
 */
export default function ThemeForm() {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">Theme</label>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        &ldquo;System&rdquo; follows your operating system or browser setting. Light and Dark
        override it.
      </p>
      <ThemeSelector variant="segmented" />
    </div>
  );
}
