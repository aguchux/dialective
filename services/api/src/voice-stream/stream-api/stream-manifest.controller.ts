import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { StreamKeyScope } from '@dialectiva/db';
import { StreamKeyAuthGuard, AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';
import { StreamKeyScopesGuard } from './stream-key-scopes.guard';
import { RequireScopes } from './require-scopes.decorator';
import { StreamKeySubscriptionGuard } from './stream-key-subscription.guard';
import { StreamKeyRateLimitGuard } from './stream-key-rate-limit.guard';
import { StreamManifestService } from './stream-manifest.service';
import { StreamAccessLogService } from './stream-access-log.service';

/**
 * Machine-client API (doc sections 25, 29) -- authenticated by Stream Key
 * (StreamKeyAuthGuard), not the human dashboard JWT. Base path
 * `stream/v1` per doc section 25's recommended
 * `https://api.dialectlibrary.com/stream/v1`.
 */
@Controller('stream/v1')
@UseGuards(StreamKeyAuthGuard, StreamKeyScopesGuard, StreamKeySubscriptionGuard, StreamKeyRateLimitGuard)
export class StreamManifestController {
  constructor(
    private readonly manifest: StreamManifestService,
    private readonly accessLog: StreamAccessLogService,
  ) {}

  @Get('decks')
  @RequireScopes(StreamKeyScope.DECK_LIST)
  async listDecks(@Req() req: AuthenticatedStreamKeyRequest) {
    const result = await this.manifest.listDecks(req.streamKey);
    void this.logRequest(req, 'manifest', undefined, 200, 'allowed');
    return result;
  }

  @Get('decks/:deckId')
  @RequireScopes(StreamKeyScope.DECK_READ)
  async getDeck(@Req() req: AuthenticatedStreamKeyRequest, @Param('deckId') deckId: string) {
    const result = await this.manifest.getDeck(req.streamKey, deckId);
    void this.logRequest(req, 'metadata', deckId, 200, 'allowed');
    return result;
  }

  @Get('decks/:deckId/items')
  @RequireScopes(StreamKeyScope.DECK_READ)
  async listItems(@Req() req: AuthenticatedStreamKeyRequest, @Param('deckId') deckId: string) {
    const eligible = await this.manifest.listEligibleItems(req.streamKey, deckId);
    void this.logRequest(req, 'metadata', deckId, 200, 'allowed');
    return eligible.map(({ recording }) => recording);
  }

  @Get('decks/:deckId/items/:recordingId')
  @RequireScopes(StreamKeyScope.METADATA_READ)
  async getItemMetadata(
    @Req() req: AuthenticatedStreamKeyRequest,
    @Param('deckId') deckId: string,
    @Param('recordingId') recordingId: string,
  ) {
    const result = await this.manifest.getEligibleItemMetadata(req.streamKey, deckId, recordingId);
    void this.logRequest(req, 'metadata', deckId, 200, 'allowed', recordingId);
    return result;
  }

  @Get('decks/:deckId/manifest')
  @RequireScopes(StreamKeyScope.MANIFEST_READ)
  async getManifest(
    @Req() req: AuthenticatedStreamKeyRequest,
    @Param('deckId') deckId: string,
    @Query('version') versionParam?: string,
  ) {
    const version = parsePositiveIntParam(versionParam, 'version');
    const result = await this.manifest.getManifest(req.streamKey, deckId, version);
    void this.logRequest(req, 'manifest', deckId, 200, 'allowed');
    return result;
  }

  @Get('decks/:deckId/versions')
  @RequireScopes(StreamKeyScope.MANIFEST_READ)
  async listVersions(@Req() req: AuthenticatedStreamKeyRequest, @Param('deckId') deckId: string) {
    const result = await this.manifest.listVersions(req.streamKey, deckId);
    void this.logRequest(req, 'manifest', deckId, 200, 'allowed');
    return result;
  }

  @Get('decks/:deckId/changes')
  @RequireScopes(StreamKeyScope.MANIFEST_READ)
  async getChanges(
    @Req() req: AuthenticatedStreamKeyRequest,
    @Param('deckId') deckId: string,
    @Query('after') afterParam?: string,
  ) {
    if (afterParam === undefined) {
      throw new BadRequestException('after query param is required');
    }
    const after = parsePositiveIntParam(afterParam, 'after')!;
    const result = await this.manifest.getChanges(req.streamKey, deckId, after);
    void this.logRequest(req, 'manifest', deckId, 200, 'allowed');
    return result;
  }

  @Get('usage')
  @RequireScopes(StreamKeyScope.USAGE_READ)
  async getOrgUsage(@Req() req: AuthenticatedStreamKeyRequest) {
    const result = await this.manifest.getUsageSummary(req.streamKey);
    void this.logRequest(req, 'usage', undefined, 200, 'allowed');
    return result;
  }

  @Get('decks/:deckId/usage')
  @RequireScopes(StreamKeyScope.USAGE_READ)
  async getDeckUsage(@Req() req: AuthenticatedStreamKeyRequest, @Param('deckId') deckId: string) {
    const result = await this.manifest.getUsageSummary(req.streamKey, deckId);
    void this.logRequest(req, 'usage', deckId, 200, 'allowed');
    return result;
  }

  private async logRequest(
    req: AuthenticatedStreamKeyRequest,
    requestType: 'manifest' | 'metadata' | 'usage',
    deckId: string | undefined,
    resultCode: number,
    entitlementDecision: string,
    recordingId?: string,
  ) {
    await this.accessLog.record({
      streamApiKeyId: req.streamKey.id,
      organizationId: req.streamKey.organizationId,
      deckId,
      recordingId,
      requestType,
      resultCode,
      entitlementDecision,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}

function parsePositiveIntParam(raw: string | undefined, paramName: string): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestException(`${paramName} must be a non-negative integer`);
  }
  return parsed;
}
