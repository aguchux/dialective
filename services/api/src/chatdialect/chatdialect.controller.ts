import { Controller, Get, Query } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';

/**
 * Mints short-lived LiveKit room-join tokens for ChatDialect's frontend
 * (chatdialect/apps/web, a separate Vercel-hosted Next.js app -- see
 * chatdialect/docs/CHATDIALECT_MVP_PLAN.md). Per that doc's §34 security
 * requirement, LIVEKIT_API_SECRET must never reach the browser -- this
 * route is the server-side minting boundary, same reasoning as every other
 * secret this api already keeps server-side only. Anonymous/unauthenticated
 * by design (ChatDialect MVP has no account system) -- identity is
 * generated per-request, never accepted from the client.
 */
const TOKEN_TTL_SECONDS = 10 * 60;

@Controller('chatdialect/livekit')
export class ChatDialectController {
  @Get('token')
  async getToken(@Query('room') room = 'chatdialect-demo') {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url) {
      throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set');
    }

    const identity = `guest-${randomUUID()}`;
    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: TOKEN_TTL_SECONDS });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

    return { token: await token.toJwt(), url, identity, room };
  }
}
