'use client';

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FormEvent, useState } from 'react';

import type { ChannelData } from '@/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChannelAdded: (channel: ChannelData) => void;
}

export default function AddChannelModal({ isOpen, onClose, onChannelAdded }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (res.status === 201) {
        const channel = (await res.json()) as ChannelData;
        onChannelAdded(channel);
        setUrl('');
        onClose();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) {
      setUrl('');
      setError('');
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Add YouTube channel
            </DialogTitle>
            <button
              onClick={handleClose}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="channel-url" className="block text-sm font-medium text-gray-700">
                Channel URL or ID
              </label>
              <input
                id="channel-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/channel/UCxxxxxx"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Supported formats:{' '}
                <code className="rounded bg-gray-100 px-1">youtube.com/channel/UCxxxxx</code> or a
                bare channel ID starting with <code className="rounded bg-gray-100 px-1">UC</code>
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add channel'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
