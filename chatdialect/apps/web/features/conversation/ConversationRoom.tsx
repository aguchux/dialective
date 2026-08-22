'use client';

import { useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import { getLiveKitToken, type LiveKitTokenResponse } from '../livekit/getLiveKitToken';

// Phase 1 vertical slice (docs/CHATDIALECT_MVP_PLAN.md §20): a working
// voice conversation with transcripts, no avatar. Agent state/transcripts
// come from @livekit/components-react's useVoiceAssistant/useTranscriptions
// hooks rather than hand-rolled room event listeners -- these already
// track the livekit-agents worker's published state and text streams.

interface ConversationRoomProps {
  apiBaseUrl: string;
}

export function ConversationRoom({ apiBaseUrl }: ConversationRoomProps) {
  const [session, setSession] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleStart = async () => {
    setConnecting(true);
    setError(null);
    try {
      // A fresh room per conversation, not the fixed "chatdialect-demo"
      // default -- LiveKit's automatic agent dispatch fires once per room
      // creation, so reusing one persistent room name means only the very
      // first-ever join can trigger dispatch; every later visitor joins a
      // room the agent was never assigned to (confirmed live: 5 straight
      // joins to the same roomID, none dispatched, worker sat idle).
      const room = `chatdialect-${crypto.randomUUID()}`;
      const token = await getLiveKitToken(apiBaseUrl, room);
      setSession(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start conversation');
    } finally {
      setConnecting(false);
    }
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={handleStart}
          disabled={connecting}
          className="rounded-full bg-neutral-900 px-6 py-3 text-white disabled:opacity-50"
        >
          {connecting ? 'Connecting…' : 'Start conversation'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={session.url}
      token={session.token}
      audio
      connect
      onDisconnected={() => setSession(null)}
      onError={(e) => setError(e.message)}
      className="flex w-full max-w-xl flex-col gap-4"
    >
      <RoomAudioRenderer />
      <ConversationTranscript />
    </LiveKitRoom>
  );
}

function ConversationTranscript() {
  const { state } = useVoiceAssistant();
  const transcriptions = useTranscriptions();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-neutral-500">Agent state: {state}</p>
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
        {transcriptions.length === 0 && (
          <p className="text-sm text-neutral-400">Listening for speech…</p>
        )}
        {transcriptions.map((segment) => (
          <p
            key={`${segment.participantInfo.identity}-${segment.streamInfo.id}`}
            className="text-sm"
          >
            <span className="font-medium">{segment.participantInfo.identity}:</span> {segment.text}
          </p>
        ))}
      </div>
    </div>
  );
}
