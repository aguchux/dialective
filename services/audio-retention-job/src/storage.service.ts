import { Injectable } from '@nestjs/common';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Duplicated from services/api/src/storage/storage.service.ts (delete-only
// subset) -- this repo's established convention is small per-service helpers
// rather than a shared cross-service package (see AGENTS.md "No shared
// Python/Node package" reasoning, mirrored here for the same DO Spaces
// client every service that touches Spaces builds independently).
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

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
