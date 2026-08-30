import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface StreamAccessLogEntry {
  streamApiKeyId: string;
  organizationId: string;
  deckId?: string;
  recordingId?: string;
  requestType: 'manifest' | 'metadata' | 'audio' | 'usage';
  requestedRange?: string;
  bytesStreamed?: bigint;
  resultCode: number;
  entitlementDecision: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Doc section 37 (Audit Logs) / section 36 (Usage Metering) -- every manifest/metadata/audio/usage request writes one append-only row here, success or denial alike. */
@Injectable()
export class StreamAccessLogService {
  private readonly logger = new Logger(StreamAccessLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws -- a logging failure must not take down the request it's logging. */
  async record(entry: StreamAccessLogEntry): Promise<void> {
    try {
      await this.prisma.streamAccessLog.create({
        data: {
          streamApiKeyId: entry.streamApiKeyId,
          organizationId: entry.organizationId,
          deckId: entry.deckId,
          recordingId: entry.recordingId,
          requestType: entry.requestType,
          requestedRange: entry.requestedRange,
          bytesStreamed: entry.bytesStreamed,
          resultCode: entry.resultCode,
          entitlementDecision: entry.entitlementDecision,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write StreamAccessLog for key=${entry.streamApiKeyId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
