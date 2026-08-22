import { getDialectLibraryApiUrl } from '@chatdialect/config';
import { ConversationRoom } from '../../features/conversation/ConversationRoom';

// Phase 1 vertical slice (docs/CHATDIALECT_MVP_PLAN.md §20): a working
// voice conversation in /demo with transcripts, no avatar dependency.
// Avatar rendering is Phase 2 -- see ConversationRoom.tsx for why agent
// state/transcripts come from @livekit/components-react's hooks rather
// than hand-rolled room event listeners.
export default function DemoPage() {
  const apiBaseUrl = getDialectLibraryApiUrl();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">ChatDialect demo</h1>
      <ConversationRoom apiBaseUrl={apiBaseUrl} />
    </main>
  );
}
