import AskInboxChat from '@/components/reader/AskInboxChat';

/**
 * Ask-my-inbox chat surface. Auth + channel loading are handled by
 * the `(dashboard)` layout; this page just renders the chat UI into
 * the shared main content area.
 */
export default function AskInboxPage() {
  return <AskInboxChat />;
}
