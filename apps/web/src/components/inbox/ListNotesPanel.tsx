'use client';

import { NotebookPen, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';

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
  videoTitle: string;
  onClose: () => void;
}

/**
 * Notes panel that appears inline to the right of the video list.
 * Lets the user view and manage notes without navigating into the
 * video reader.
 */
export default function ListNotesPanel({ videoId, videoTitle, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: notes = [], mutate } = useSWR<NoteData[]>(`/api/videos/${videoId}/notes`, fetcher);

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
    <div className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close notes panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-gray-100 px-4 py-2">
        <p className="truncate text-xs text-gray-500">{videoTitle}</p>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
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
          className="h-20 resize-none rounded border border-gray-200 p-2 text-sm focus:border-blue-500 focus:outline-none"
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

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
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
    </div>
  );
}
