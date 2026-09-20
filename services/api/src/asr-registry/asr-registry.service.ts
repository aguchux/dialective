import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AsrRegistryService.name);
  private readonly registry: Record<string, AsrRegistryEntry>;
  /**
   * Tags already reported, so a dialect with thousands of submissions logs
   * once per process rather than once per recording.
   */
  private readonly reportedMisses = new Set<string>();

  constructor() {
    const path = join(__dirname, '..', 'models', 'asr-registry.yaml');
    this.registry =
      (yaml.load(readFileSync(path, 'utf8')) as Record<string, AsrRegistryEntry>) ?? {};
  }

  /**
   * A miss means the recording is published with no asr_stream, so no
   * worker ever sees it and it silently ends up with no transcript. That
   * silence hid 17 unmapped dialects and 82k untranscribed recordings for
   * a month, so a miss is worth a warning even though it is not an error:
   * the submission itself still succeeds, by design.
   */
  resolve(dialectTag: string): AsrRegistryEntry | undefined {
    const entry = this.registry[dialectTag];
    if (!entry && !this.reportedMisses.has(dialectTag)) {
      this.reportedMisses.add(dialectTag);
      this.logger.warn(
        `No ASR registry entry for dialect "${dialectTag}" -- its recordings will never be transcribed. Add it to models/asr-registry.yaml (and keep services/api/src/models/asr-registry.yaml identical).`,
      );
    }
    return entry;
  }

  /** Every mapped tag, for an admin/ops view of what ASR actually covers. */
  mappedDialectTags(): string[] {
    return Object.keys(this.registry);
  }
}
