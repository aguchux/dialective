import { Injectable, Logger } from '@nestjs/common';
import { DomainPromptGenderVariant } from '@dialectiva/db';
import { PrismaService } from './prisma/prisma.service';
import { isFlaggedContent } from './content-filter';
import { LlmFallbackChain } from './llm/llm-fallback-chain';
import {
  ALL_PROVIDER_KEYS,
  DomainPromptItem,
  LlmProvider,
  LlmProviderKey,
  parseDomainPromptItemArray,
} from './llm/llm-provider.interface';
import { OpenAiProvider } from './llm/openai.provider';
import { DeepSeekProvider } from './llm/deepseek.provider';
import { AnthropicProvider } from './llm/anthropic.provider';

const DEFAULT_PROVIDER_ORDER: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

/**
 * Bulk-pregenerates "Domain Conversation" scenario prompts (see DomainPrompt
 * in schema.prisma) via an admin-configured LLM fallback chain, and inserts
 * them -- deduped by scenarioKey, wordlist-filtered -- into the DomainPrompt
 * table, ready for DomainConversationsService.pickDomainPrompt to serve.
 * Deliberately a separate deployable from word-generator-job (own copy of
 * the LLM chain/providers, per that service's own "one deployable per
 * generation concern" convention -- see AGENTS.md "Database access": this
 * service, like word-generator-job and settlement-job, only ever consumes
 * the already-generated @dialectiva/db client; api owns the schema).
 *
 * Gated by a SINGLE platform-wide toggle (domainConversationGenerationEnabled),
 * unlike word-generator-job's per-country/per-dialect layering -- Domain
 * Conversation prompts are deliberately dialect-agnostic (the same prompt
 * pool serves every trainer regardless of dialect), so there is no
 * per-dialect gate to check.
 */
@Injectable()
export class DomainPromptGeneratorService {
  private readonly logger = new Logger(DomainPromptGeneratorService.name);
  private readonly providersByKey: Record<LlmProviderKey, LlmProvider>;
  private readonly chain: LlmFallbackChain;

  constructor(private readonly prisma: PrismaService) {
    this.providersByKey = {
      openai: new OpenAiProvider(),
      deepseek: new DeepSeekProvider(),
      anthropic: new AnthropicProvider(),
    };
    this.chain = new LlmFallbackChain(this.providersByKey);
  }

  async run(): Promise<void> {
    const settings = await this.getSettings();

    if (!settings.domainConversationGenerationEnabled) {
      this.logger.log('Domain Conversation prompt generation disabled; skipping run');
      return;
    }

    const providerOrder = this.parseProviderOrder(settings.domainConversationProviderOrder);
    const promptsPerRun = settings.domainConversationPromptsPerRun;
    const maxPoolSize = settings.domainConversationMaxPromptPoolSize;

    const currentPoolSize = await this.prisma.domainPrompt.count();
    if (currentPoolSize >= maxPoolSize) {
      this.logger.log(
        `Domain Conversation prompt generation skipped: pool cap reached (current=${currentPoolSize} max=${maxPoolSize})`,
      );
      return;
    }

    // Each scenario yields 3 rows (NEUTRAL/MALE/FEMALE) -- cap the number of
    // SCENARIOS requested so the resulting row count doesn't overshoot
    // maxPoolSize by more than one batch.
    const remainingRowHeadroom = maxPoolSize - currentPoolSize;
    const effectiveScenarioCount = Math.max(
      0,
      Math.min(promptsPerRun, Math.floor(remainingRowHeadroom / 3)),
    );
    if (effectiveScenarioCount === 0) {
      this.logger.log('Domain Conversation prompt generation skipped: no row headroom remaining');
      return;
    }

    const prompt = this.buildGenerationPrompt(effectiveScenarioCount);
    let items: DomainPromptItem[];
    try {
      const result = await this.chain.generateStructured(
        prompt,
        providerOrder,
        parseDomainPromptItemArray,
      );
      items = result.items;
    } catch (err) {
      this.logger.error(`Domain Conversation prompt generation failed: ${(err as Error).message}`);
      return;
    }

    let scenariosInserted = 0;
    let rowsInserted = 0;
    let flaggedOrDuplicateSkipped = 0;

    for (const item of items) {
      if (
        isFlaggedContent(item.domain) ||
        isFlaggedContent(item.neutralText) ||
        isFlaggedContent(item.maleText) ||
        isFlaggedContent(item.femaleText)
      ) {
        flaggedOrDuplicateSkipped += 1;
        continue;
      }

      const existing = await this.prisma.domainPrompt.findFirst({
        where: { scenarioKey: item.scenarioKey },
        select: { id: true },
      });
      if (existing) {
        flaggedOrDuplicateSkipped += 1;
        continue;
      }

      await this.prisma.domainPrompt.createMany({
        data: [
          {
            scenarioKey: item.scenarioKey,
            domain: item.domain,
            genderVariant: DomainPromptGenderVariant.NEUTRAL,
            text: item.neutralText,
            source: 'llm',
          },
          {
            scenarioKey: item.scenarioKey,
            domain: item.domain,
            genderVariant: DomainPromptGenderVariant.MALE,
            text: item.maleText,
            source: 'llm',
          },
          {
            scenarioKey: item.scenarioKey,
            domain: item.domain,
            genderVariant: DomainPromptGenderVariant.FEMALE,
            text: item.femaleText,
            source: 'llm',
          },
        ],
      });
      scenariosInserted += 1;
      rowsInserted += 3;
    }

    this.logger.log(
      `Domain Conversation prompt generation run complete: ${scenariosInserted} scenarios (${rowsInserted} rows) inserted, ${flaggedOrDuplicateSkipped} flagged/duplicate skipped`,
    );
  }

  private buildGenerationPrompt(scenarioCount: number): string {
    return [
      `Generate ${scenarioCount} DISTINCT everyday conversation scenarios for a language-training app.`,
      'Each scenario describes a short real-world situation (e.g. buying goods at a market, ordering food at a restaurant, greeting a colleague at the office, asking a teacher a question at school) that a speaker would record themselves conversing/monologuing about.',
      'Cover a variety of domains (Market, Office, School, Restaurant, Transport, Home, Healthcare, etc.) -- do not repeat the same domain more than a few times.',
      '',
      'Return ONLY a raw JSON array (no markdown fences, no prose) of objects shaped exactly like:',
      '{"domain": string, "scenarioKey": string, "neutralText": string, "maleText": string, "femaleText": string}',
      '',
      'Rules:',
      '- "domain" is a short category label, e.g. "Market", "Office", "School".',
      '- "scenarioKey" is a short kebab-case slug unique to this scenario, e.g. "market-buy-rice".',
      '- "neutralText", "maleText", and "femaleText" are three variants of the SAME instruction/prompt shown to the trainer -- they must describe the identical scenario and differ ONLY in the gendered noun phrase used to address the speaker (e.g. "As a market vendor..." / "As a market man..." / "As a market woman...").',
      '- Every text variant must instruct the reader to record a short conversation/monologue in that scenario, in their own language/dialect.',
      '- The scenario descriptions themselves must be language/dialect-agnostic, universal, and appropriate for any culture -- write them in English; the trainer records their own dialect.',
      '- Keep each text variant to one or two sentences.',
    ].join('\n');
  }

  private async getSettings() {
    return this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private parseProviderOrder(csv: string): LlmProviderKey[] {
    const parts = csv.split(',').map((part) => part.trim()) as LlmProviderKey[];
    const isValidPermutation =
      parts.length === ALL_PROVIDER_KEYS.length &&
      ALL_PROVIDER_KEYS.every((key) => parts.includes(key)) &&
      new Set(parts).size === ALL_PROVIDER_KEYS.length;

    if (!isValidPermutation) {
      this.logger.warn(
        `domainConversationProviderOrder "${csv}" is not a valid permutation of ${ALL_PROVIDER_KEYS.join(',')}; using default order`,
      );
      return DEFAULT_PROVIDER_ORDER;
    }
    return parts;
  }
}
