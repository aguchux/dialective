// Fetches a short-lived LiveKit room-join token from the Dialect Library
// API (services/api's ChatDialectController) -- apps/web never mints
// tokens itself or holds LIVEKIT_API_SECRET, per the project's "all API
// logic lives in services/api" direction.

export interface LiveKitTokenResponse {
  token: string;
  url: string;
  identity: string;
  room: string;
}

export async function getLiveKitToken(apiBaseUrl: string, room = 'chatdialect-demo'): Promise<LiveKitTokenResponse> {
  const response = await fetch(`${apiBaseUrl}/chatdialect/livekit/token?room=${encodeURIComponent(room)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch LiveKit token: ${response.status}`);
  }
  return response.json();
}
