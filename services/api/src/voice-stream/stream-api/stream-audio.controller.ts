import { BadRequestException, Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { StreamKeyScope, WebhookEventType } from '@dialectiva/db';
import { StorageService } from '../../storage/storage.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';
import { StreamKeyScopesGuard } from './stream-key-scopes.guard';
import { RequireScopes } from './require-scopes.decorator';
import { StreamKeySubscriptionGuard } from './stream-key-subscription.guard';
import { StreamKeyRateLimitGuard } from './stream-key-rate-limit.guard';
import { ConcurrentStreamGuard } from './concurrent-stream.guard';
import { QuotaGuard } from './quota.guard';
import { DedicatedCapacityGuard } from './dedicated-capacity.guard';
import { StreamManifestService } from './stream-manifest.service';
import { StreamAccessLogService } from './stream-access-log.service';
import { contentTypeForAudioKey } from './audio-content-type.util';
import { WebhookEventService } from '../webhooks/webhook-event.service';
import { EitherStreamCredentialGuard } from '../oauth/either-stream-credential.guard';

/**
 * Doc section 35's full authorization order for an audio stream request,
 * minus mTLS (not applicable to a plain HTTPS REST API) and deck-version
 * checks (versioning is Phase 4): guards handle steps 1-10, the handler
 * body performs steps 11-15 (resolve deck, verify membership, verify
 * eligibility) before proxying bytes (steps 17-19) and metering/logging
 * (steps 20-21). Audio is proxied through `api` -- never a presigned
 * redirect -- per doc section 30 ("Never return permanent storage URLs")
 * and so ConcurrentStreamGuard/usage metering can actually observe the
 * stream.
 */
@Controller('stream/v1')
@UseGuards(
  EitherStreamCredentialGuard,
  StreamKeyScopesGuard,
  StreamKeySubscriptionGuard,
  DedicatedCapacityGuard, // Phase 4 -- runs before per-org ceilings so a fleet-saturation rejection never reaches QuotaGuard's DB read
  QuotaGuard,
  ConcurrentStreamGuard,
  StreamKeyRateLimitGuard,
)
export class StreamAudioController {
  constructor(
    private readonly manifest: StreamManifestService,
    private readonly storage: StorageService,
    private readonly accessLog: StreamAccessLogService,
    private readonly concurrentStream: ConcurrentStreamGuard,
    private readonly dedicatedCapacity: DedicatedCapacityGuard,
    private readonly webhookEvents: WebhookEventService,
  ) {}

  @Get('decks/:deckId/items/:recordingId/audio')
  @RequireScopes(StreamKeyScope.AUDIO_STREAM)
  async streamAudio(
    @Req() req: AuthenticatedStreamKeyRequest,
    @Res() res: Response,
    @Param('deckId') deckId: string,
    @Param('recordingId') recordingId: string,
  ): Promise<void> {
    let bytesStreamed = 0;
    let resultCode = 200;
    let entitlementDecision = 'allowed';
    const isReservedCapacityOrg = req.streamKey.isReservedCapacityOrg ?? false;
    void this.dedicatedCapacity.trackStart(isReservedCapacityOrg);

    try {
      const recording = await this.manifest.getEligibleItemMetadata(
        req.streamKey,
        deckId,
        recordingId,
      );
      if (!recording.audioBucket || !recording.audioKey) {
        entitlementDecision = 'denied:no_audio';
        resultCode = 404;
        res.status(404).json({ message: 'Recording not found or not available for Voice Stream' });
        return;
      }

      const range = parseRangeHeader(req.headers.range);
      const object = await this.storage.getObject(
        recording.audioBucket,
        recording.audioKey,
        range?.header,
      );

      const contentType = contentTypeForAudioKey(recording.audioKey);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(object.contentLength));
      if (object.contentRange) {
        resultCode = 206;
        res.status(206);
        res.setHeader('Content-Range', object.contentRange);
      } else {
        res.status(200);
      }

      object.body.on('data', (chunk: Buffer) => {
        bytesStreamed += chunk.length;
      });
      object.body.on('error', () => {
        entitlementDecision = 'error:stream_failed';
      });

      await new Promise<void>((resolve, reject) => {
        object.body.pipe(res);
        object.body.on('end', resolve);
        object.body.on('error', reject);
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        resultCode = err.getStatus();
        entitlementDecision = 'denied:invalid_range';
        res.status(resultCode).json({ message: err.message });
      } else if (!res.headersSent) {
        entitlementDecision = 'denied:not_found_or_ineligible';
        resultCode = 404;
        res.status(404).json({ message: 'Recording not found or not available for Voice Stream' });
      } else {
        entitlementDecision = 'error:stream_failed';
      }
    } finally {
      this.concurrentStream.release(req.streamKey.id);
      void this.dedicatedCapacity.trackEnd(isReservedCapacityOrg);
      void this.accessLog.record({
        streamApiKeyId: req.streamKey.id,
        credentialType: req.streamKey.credentialType,
        organizationId: req.streamKey.organizationId,
        deckId,
        recordingId,
        requestType: 'audio',
        requestedRange: req.headers.range,
        bytesStreamed: BigInt(bytesStreamed),
        resultCode,
        entitlementDecision,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      void this.webhookEvents.emit(
        req.streamKey.organizationId,
        entitlementDecision === 'allowed'
          ? WebhookEventType.AUDIO_STREAM_COMPLETED
          : WebhookEventType.AUDIO_STREAM_DENIED,
        {
          organization_id: req.streamKey.organizationId,
          deck_id: deckId,
          recording_id: recordingId,
          result_code: resultCode,
          bytes_streamed: bytesStreamed,
        },
      );
    }
  }
}

/** Parses a single-range "bytes=start-end" Range header into the raw value to hand to S3's GetObjectCommand. Multi-range requests aren't supported (rare for audio clients; S3 doesn't support them either) -- treated as no range rather than an error. */
function parseRangeHeader(raw: string | undefined): { header: string } | undefined {
  if (!raw) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new BadRequestException('Malformed Range header');
  }
  return { header: raw.trim() };
}
