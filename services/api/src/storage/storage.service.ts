import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

const PRESIGN_EXPIRY_SECONDS = 15 * 60;

/**
 * S3-compatible client for DigitalOcean Spaces. DO Spaces speaks the S3 API,
 * so the AWS SDK v3 client works unmodified against it — just point
 * `endpoint` at the region's Spaces host (see k8s SPACES_ENDPOINT env var)
 * instead of AWS. `forcePathStyle: false` because Spaces uses virtual-hosted
 * `{bucket}.{region}.digitaloceanspaces.com` addressing, not path-style.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_REGION ?? 'nyc3',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.SPACES_ACCESS_KEY ?? '',
        secretAccessKey: process.env.SPACES_SECRET_KEY ?? '',
      },
    });
  }

  /**
   * Issues a presigned PUT URL so the trainer's client can upload the
   * submission audio bytes directly to Spaces — the audio never transits
   * through `api` itself. Caller must submit `key` back when enqueueing the
   * asr-jobs message so vosk-worker knows what to download.
   */
  async createPresignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    publicRead = false,
  ): Promise<{ url: string; key: string; expiresInSeconds: number }> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ...(publicRead && { ACL: 'public-read' }),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
    return { url, key, expiresInSeconds: PRESIGN_EXPIRY_SECONDS };
  }

  async createPresignedDownloadUrl(
    bucket: string,
    key: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
    return { url, expiresInSeconds: PRESIGN_EXPIRY_SECONDS };
  }

  /**
   * Fetches an object's bytes directly (optionally a byte range) for
   * proxying through the API response -- used by Voice Stream Phase 3's
   * audio streaming route, which must never hand out a permanent/presigned
   * storage URL (doc section 30) and needs byte-accurate usage metering +
   * concurrent-stream enforcement that a presigned redirect can't provide.
   * `range` is the raw "bytes=start-end" value already validated by the
   * caller; omitted for a full-object fetch.
   */
  async getObject(
    bucket: string,
    key: string,
    range?: string,
  ): Promise<{
    body: Readable;
    contentLength: number;
    contentRange?: string;
    acceptsRanges: boolean;
  }> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range && { Range: range }),
    });
    const result = await this.client.send(command);
    return {
      body: result.Body as Readable,
      contentLength: result.ContentLength ?? 0,
      contentRange: result.ContentRange,
      acceptsRanges: result.AcceptRanges === 'bytes',
    };
  }

  /** Convenience wrapper around getObject for callers that need the full object in memory at once (e.g. DLKYC's face-match/OCR/redaction pipeline) rather than streaming/proxying it. Never use this for large files -- buffers the entire object. */
  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const { body } = await this.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Permanently deletes a Spaces object -- used by audio-retention-job's
   * scheduled purge and by admin account deletion. Never call this for a
   * bucket/key still referenced by a row that hasn't reached a terminal
   * state (settledAt/refundedAt set); callers own that check.
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  getPublicObjectUrl(bucket: string, key: string): string {
    const endpoint = process.env.SPACES_ENDPOINT;
    if (!endpoint) {
      throw new Error('SPACES_ENDPOINT is not set');
    }

    const host = new URL(endpoint).host;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.${host}/${encodedKey}`;
  }
}
