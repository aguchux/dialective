import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { isFlaggedContent } from './content-filter';
import { LlmFallbackChain } from './llm/llm-fallback-chain';
import { ALL_PROVIDER_KEYS, LlmProvider, LlmProviderKey } from './llm/llm-provider.interface';
import { OpenAiProvider } from './llm/openai.provider';
import { DeepSeekProvider } from './llm/deepseek.provider';
import { AnthropicProvider } from './llm/anthropic.provider';

const DEFAULT_PROVIDER_ORDER: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

/**
 * Generates new English words/phrases via an admin-configured LLM fallback
 * chain, translates each into every dialect currently opted into generation
 * (Country.llmGenerationEnabled AND Dialect.llmGenerationEnabled both true),
 * and inserts everything -- deduped, wordlist-filtered -- into the existing
 * Word/Prompt tables so it's immediately available to trainers through the
 * existing random-pick flows (WordsService's assignment picker, Prompts
 * Controller.getRandom) with no further wiring. Runs as a scheduled
 * CronJob, same cadence as settlement-job (see AGENTS.md "Database access"
 * -- this service, like settlement-job, only ever consumes the
 * already-generated @dialectiva/db client; api owns the schema).
 */
@Injectable()
export class WordGeneratorService {
  private readonly logger = new Logger(WordGeneratorService.name);
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

    if (!settings.llmGenerationEnabled) {
      this.logger.log('Word generation disabled (llmGenerationEnabled=false); skipping run');
      return;
    }

    const providerOrder = this.parseProviderOrder(settings.llmProviderOrder);
    const wordsPerItem = settings.llmWordsPerItem;
    const itemsPerRun = settings.llmItemsPerRun;

    const dialectTags = await this.getEnabledDialectTags();
    this.logger.log(
      `Generation run starting: wordsPerItem=${wordsPerItem} itemsPerRun=${itemsPerRun} ` +
        `providerOrder=${providerOrder.join('>')} translationDialects=${dialectTags.length ? dialectTags.join(',') : 'none'}`,
    );

    const prompt = this.buildGenerationPrompt(wordsPerItem, itemsPerRun);
    const { items: rawItems, provider: englishProvider } = await this.chain.generate(prompt, providerOrder);

    const { accepted: englishItems, filteredCount } = this.filterAndValidate(rawItems, wordsPerItem);

    let inserted = 0;
    let skippedDuplicate = 0;
    let translationsInserted = 0;
    let translationsSkipped = 0;
    let translationFailures = 0;

    if (wordsPerItem === 1) {
      const result = await this.insertWords(englishItems);
      inserted = result.inserted;
      skippedDuplicate = result.skippedDuplicate;

      for (const word of result.insertedRows) {
        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkWord(word.id, word.text, dialectTag, providerOrder);
          if (outcome === 'inserted') translationsInserted += 1;
          else if (outcome === 'duplicate') translationsSkipped += 1;
          else translationFailures += 1;
        }
      }
    } else {
      const result = await this.insertPrompts(englishItems);
      inserted = result.inserted;
      skippedDuplicate = result.skippedDuplicate;

      for (const promptRow of result.insertedRows) {
        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkPrompt(promptRow.id, promptRow.text, dialectTag, providerOrder);
          if (outcome === 'inserted') translationsInserted += 1;
          else if (outcome === 'duplicate') translationsSkipped += 1;
          else translationFailures += 1;
        }
      }
    }

    this.logger.log(
      `Generation run complete: provider=${englishProvider} generated=${rawItems.length} ` +
        `filteredOut=${filteredCount} inserted=${inserted} skippedDuplicate=${skippedDuplicate} ` +
        `translationsInserted=${translationsInserted} translationsSkippedDuplicate=${translationsSkipped} ` +
        `translationFailures=${translationFailures}`,
    );
  }

  // --- English generation -------------------------------------------------

  private buildGenerationPrompt(wordsPerItem: number, itemsPerRun: number): string {
    const lengthInstruction =
      wordsPerItem === 1
        ? 'exactly one word each (a single word, no spaces, no punctuation)'
        : `exactly ${wordsPerItem} words each (a short natural phrase or sentence, exactly ${wordsPerItem} words when split on whitespace)`;

    return [
      `Generate exactly ${itemsPerRun} distinct items for a language-learning dictation/vocabulary app used by adult learners.`,
      `Each item must be ${lengthInstruction}.`,
      'Use common, everyday English vocabulary that an ordinary adult would recognize -- plain words are fine even if their origin is Latin or Greek (e.g. "family", "photograph"), but avoid rare, obscure, archaic, overly technical, or academic vocabulary.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Do not repeat any item.',
      `Respond with ONLY a JSON object of the exact shape {"items": ["...", "..."]} containing exactly ${itemsPerRun} strings. No other text.`,
    ].join(' ');
  }

  private buildTranslationPrompt(sourceText: string, dialectName: string): string {
    return [
      `Translate the following English text into ${dialectName}: "${sourceText}"`,
      'Provide the natural, everyday equivalent a native speaker would actually say -- not a literal word-for-word translation.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Respond with ONLY a JSON object of the exact shape {"items": ["<translation>"]} containing exactly one string. No other text.',
    ].join(' ');
  }

  private filterAndValidate(rawItems: string[], wordsPerItem: number): { accepted: string[]; filteredCount: number } {
    const seen = new Set<string>();
    const accepted: string[] = [];
    let filteredCount = 0;

    for (const raw of rawItems) {
      const text = raw.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      if (text.split(/\s+/).length !== wordsPerItem) continue;
      if (isFlaggedContent(text)) {
        filteredCount += 1;
        continue;
      }
      seen.add(key);
      accepted.push(text);
    }

    return { accepted, filteredCount };
  }

  // --- Insert (English source) --------------------------------------------

  private async insertWords(texts: string[]): Promise<{ inserted: number; skippedDuplicate: number; insertedRows: { id: string; text: string }[] }> {
    if (texts.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };

    const existing = await this.prisma.word.findMany({
      where: { text: { in: texts, mode: 'insensitive' } },
      select: { text: true },
    });
    const existingSet = new Set(existing.map((row) => row.text.toLowerCase()));
    const newTexts = texts.filter((text) => !existingSet.has(text.toLowerCase()));

    if (newTexts.length === 0) {
      return { inserted: 0, skippedDuplicate: texts.length, insertedRows: [] };
    }

    await this.prisma.word.createMany({ data: newTexts.map((text) => ({ text })), skipDuplicates: true });
    const insertedRows = await this.prisma.word.findMany({
      where: { text: { in: newTexts } },
      select: { id: true, text: true },
    });

    return { inserted: insertedRows.length, skippedDuplicate: texts.length - newTexts.length, insertedRows };
  }

  private async insertPrompts(texts: string[]): Promise<{ inserted: number; skippedDuplicate: number; insertedRows: { id: string; text: string }[] }> {
    if (texts.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };

    const existing = await this.prisma.prompt.findMany({
      where: { dialectTag: 'en-us' },
      select: { text: true },
    });
    const existingSet = new Set(existing.map((row) => row.text.trim().toLowerCase()));
    const newTexts = texts.filter((text) => !existingSet.has(text.toLowerCase()));

    const insertedRows: { id: string; text: string }[] = [];
    for (const text of newTexts) {
      const row = await this.prisma.prompt.create({
        data: { dialectTag: 'en-us', text, active: true },
        select: { id: true, text: true },
      });
      insertedRows.push(row);
    }

    return { inserted: insertedRows.length, skippedDuplicate: texts.length - newTexts.length, insertedRows };
  }

  // --- Translations ---------------------------------------------------------

  private async translateAndLinkWord(
    wordId: string,
    sourceText: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
  ): Promise<'inserted' | 'duplicate' | 'failed'> {
    try {
      const dialect = await this.prisma.dialect.findUnique({ where: { tag: dialectTag }, select: { name: true } });
      if (!dialect) return 'failed';

      const existing = await this.prisma.wordTranslation.findUnique({
        where: { wordId_dialectTag: { wordId, dialectTag } },
      });
      if (existing) return 'duplicate';

      const prompt = this.buildTranslationPrompt(sourceText, dialect.name);
      const { items } = await this.chain.generate(prompt, providerOrder);
      const text = items[0]?.trim();
      if (!text || isFlaggedContent(text)) return 'failed';

      await this.prisma.wordTranslation.create({ data: { wordId, dialectTag, text } });
      return 'inserted';
    } catch (err) {
      this.logger.warn(`Translation failed word=${wordId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`);
      return 'failed';
    }
  }

  private async translateAndLinkPrompt(
    promptId: string,
    sourceText: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
  ): Promise<'inserted' | 'duplicate' | 'failed'> {
    try {
      const dialect = await this.prisma.dialect.findUnique({ where: { tag: dialectTag }, select: { name: true } });
      if (!dialect) return 'failed';

      const existingLink = await this.prisma.promptTranslation.findUnique({
        where: { promptId_dialectTag: { promptId, dialectTag } },
      });
      if (existingLink) return 'duplicate';

      const prompt = this.buildTranslationPrompt(sourceText, dialect.name);
      const { items } = await this.chain.generate(prompt, providerOrder);
      const text = items[0]?.trim();
      if (!text || isFlaggedContent(text)) return 'failed';

      const existingPrompt = await this.prisma.prompt.findFirst({
        where: { dialectTag, text: { equals: text, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingPrompt) return 'duplicate';

      await this.prisma.$transaction([
        this.prisma.promptTranslation.create({ data: { promptId, dialectTag, text } }),
        this.prisma.prompt.create({ data: { dialectTag, text, active: true } }),
      ]);
      return 'inserted';
    } catch (err) {
      this.logger.warn(`Translation failed prompt=${promptId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`);
      return 'failed';
    }
  }

  // --- Settings / coverage --------------------------------------------------

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
      this.logger.warn(`llmProviderOrder "${csv}" is not a valid permutation of ${ALL_PROVIDER_KEYS.join(',')}; using default order`);
      return DEFAULT_PROVIDER_ORDER;
    }
    return parts;
  }

  private async getEnabledDialectTags(): Promise<string[]> {
    const dialects = await this.prisma.dialect.findMany({
      where: { llmGenerationEnabled: true, country: { llmGenerationEnabled: true } },
      select: { tag: true },
    });
    return dialects.map((row) => row.tag);
  }
}
