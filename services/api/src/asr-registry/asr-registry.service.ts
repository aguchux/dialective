import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

export type AsrEngine = 'vosk' | 'whisper';

export interface AsrRegistryEntry {
  engine: AsrEngine;
  stream: string;
  checkpoint?: string;
}

/**
 * Loads models/asr-registry.yaml (copied into dist/models/ at build time --
 * see Dockerfile) and resolves a dialect_tag to which asr-jobs-<engine>
 * stream owns it. This is the routing half of the two-stream design (see
 * AGENTS.md "ASR engine routing"); vosk-worker/whisper-worker independently
 * load the same file to know which stream to consume -- api and both
 * workers must always agree, so never hardcode a dialect_tag -> engine
 * mapping anywhere outside this file.
 */
@Injectable()
export class AsrRegistryService {
  private readonly registry: Record<string, AsrRegistryEntry>;

  constructor() {
    const path = join(__dirname, '..', 'models', 'asr-registry.yaml');
    this.registry =
      (yaml.load(readFileSync(path, 'utf8')) as Record<string, AsrRegistryEntry>) ?? {};
  }

  resolve(dialectTag: string): AsrRegistryEntry | undefined {
    return this.registry[dialectTag];
  }
}
