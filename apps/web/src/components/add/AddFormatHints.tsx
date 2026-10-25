import type { AddKind } from '@/lib/add/detectAddTarget';

import { ADD_KINDS, ADD_KIND_ORDER } from './addKinds';

interface Props {
  /** Limit the hints to one kind; omit to list every kind. */
  kind?: AddKind | null;
}

/** Accepted link shapes, grouped by kind, for the Add dialog. */
export default function AddFormatHints({ kind = null }: Props) {
  const kinds = kind != null ? [kind] : ADD_KIND_ORDER;
  return (
    <ul className="space-y-2 text-sm text-muted-foreground">
      {kinds.map((k) => {
        const info = ADD_KINDS[k];
        const Icon = info.icon;
        return (
          <li key={k} className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex flex-wrap gap-1.5">
              {kind == null && <span className="font-medium text-foreground">{info.title}</span>}
              {info.formats.map((format) => (
                <code key={format} className="rounded bg-muted px-1">
                  {format}
                </code>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
