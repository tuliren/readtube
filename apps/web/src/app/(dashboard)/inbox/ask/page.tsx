import AskInboxChat from '@/components/reader/AskInboxChat';

/**
 * Ask-my-inbox chat surface. Auth is enforced centrally by
 * `proxy.ts` — any route not in its public allowlist goes through
 * `auth.protect()` before reaching the page.
 */
export default function AskInboxPage() {
  return <AskInboxChat />;
}
