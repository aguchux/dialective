// Typed accessor for apps/web's one server-side config need: where to reach
// the Dialect Library NestJS API (services/api) that mints LiveKit tokens
// (see services/api/src/chatdialect/chatdialect.controller.ts). apps/web
// itself never holds LIVEKIT_API_SECRET or any provider secret -- per the
// user's direction, all API/backend logic lives in services/api, not in a
// second NestJS app or Next.js API routes under chatdialect/.

export function getDialectLibraryApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIALECT_LIBRARY_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_DIALECT_LIBRARY_API_URL must be set');
  }
  return url;
}
