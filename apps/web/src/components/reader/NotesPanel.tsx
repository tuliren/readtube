'use client';

import { NotebookPen, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NoteData {
  id: string;
  body: string;
  timestampMs: number | null;
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Request failed (${r.status})`);
    }
    return r.json() as Promise<NoteData[]>;
  });

interface Props {
  videoId: string;
}

/**
 * Notes side drawer (shadcn Sheet). Lives next to the VideoReader on the
 * per-video page. Lists existing notes and exposes a simple textarea +
 * save button for new ones. Highlights on transcript/summary/article are
 * a future pass; this component focuses on freeform notes.
 */
export default function NotesPanel({ videoId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // VideoRow's notes button navigates here with `?openNotes=1` so the
  // panel pops open as soon as the reader mounts. Strip the param via
  // router.replace immediately after honoring it so a page refresh
  // doesn't reopen the drawer the user has since closed.
  const [open, setOpen] = useState(() => searchParams.get('openNotes') === '1');
  useEffect(() => {
    if (searchParams.get('openNotes') !== '1') {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.delete('openNotes');
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
    // We only want this to run on mount when the param is present —
    // not every time searchParams changes. Empty deps is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: notes = [], mutate } = useSWR<NoteData[]>(
    open ? `/api/videos/${videoId}/notes` : null,
    fetcher
  );

  async function save() {
    const body = draft.trim();
    if (body.length === 0 || saving) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error('Failed to save note');
        return;
      }
      setDraft('');
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function remove(noteId: string) {
    const res = await fetch(`/api/videos/${videoId}/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete note');
      return;
    }
    void mutate();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <NotebookPen className="h-4 w-4" />
          Notes
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-96 flex flex-col">
        <SheetHeader>
          <SheetTitle>Notes</SheetTitle>
          <SheetDescription>Capture thoughts while watching this video.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
            placeholder="Write a note… (⌘↵ to save)"
            className="h-24 resize-none rounded border border-gray-200 p-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || draft.trim().length === 0}
            >
              {saving ? 'Saving…' : 'Save note'}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto">
          {notes.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{note.body}</p>
                  <button
                    type="button"
                    onClick={() => void remove(note.id)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(note.updatedAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
