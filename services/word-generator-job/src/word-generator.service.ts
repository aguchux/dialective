import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { isFlaggedContent } from './content-filter';
import { LlmFallbackChain } from './llm/llm-fallback-chain';
import {
  ALL_PROVIDER_KEYS,
  LlmProvider,
  LlmProviderKey,
  PART_OF_SPEECH_VALUES,
  PosItem,
  parsePosItemArray,
} from './llm/llm-provider.interface';
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
    const maxTotalGeneratedItems = settings.llmMaxTotalGeneratedItems;
    const maxPoolPerDialect = settings.llmMaxPoolPerDialect;
    const backfillItemsPerDialectPerRun = settings.llmBackfillItemsPerDialectPerRun;

    const generatedItemsCount = await this.getGeneratedItemsCount(wordsPerItem);
    const remainingGlobalHeadroom = Math.max(0, maxTotalGeneratedItems - generatedItemsCount);
    if (remainingGlobalHeadroom <= 0) {
      this.logger.log(
        `Generation skipped: global cap reached (generated=${generatedItemsCount} maxTotalGeneratedItems=${maxTotalGeneratedItems})`,
      );
      return;
    }
    const effectiveItemsPerRun = Math.min(itemsPerRun, remainingGlobalHeadroom);

    const enabledDialectTags = await this.getEnabledDialectTags();
    const underCapDialectTags = await this.filterDialectsUnderPoolCap(enabledDialectTags, maxPoolPerDialect);
    const skippedDialects = enabledDialectTags.filter((tag) => !underCapDialectTags.includes(tag));
    this.logger.log(
      `Generation run starting: wordsPerItem=${wordsPerItem} itemsPerRun=${itemsPerRun} effectiveItemsPerRun=${effectiveItemsPerRun} ` +
        `maxTotalGeneratedItems=${maxTotalGeneratedItems} generatedItemsCount=${generatedItemsCount} ` +
        `providerOrder=${providerOrder.join('>')} maxPoolPerDialect=${maxPoolPerDialect} ` +
        `backfillItemsPerDialectPerRun=${backfillItemsPerDialectPerRun} ` +
        `translationDialects=${underCapDialectTags.length ? underCapDialectTags.join(',') : 'none'} ` +
        `poolCappedDialects=${skippedDialects.length ? skippedDialects.join(',') : 'none'}`,
    );

    // Backfill existing English backlog into every under-cap dialect BEFORE
    // generating any brand-new English content this run -- this is what lets
    // a newly-enabled dialect (pool size 0, maximally under-cap) catch up on
    // existing content instead of only ever growing via the shared trickle
    // of new items below. Re-filter afterward so a dialect just topped up to
    // its cap by backfill doesn't also receive new-English translations past
    // the cap in this same run.
    let backfilled = 0;
    let backfillSkippedDuplicate = 0;
    let backfillFailures = 0;
    if (underCapDialectTags.length > 0) {
      const poolSizeByDialect = await this.getPoolSizesByDialect(underCapDialectTags);
      for (const dialectTag of underCapDialectTags) {
        const headroom = maxPoolPerDialect - (poolSizeByDialect.get(dialectTag) ?? 0);
        const maxItemsThisRun = Math.max(0, Math.min(backfillItemsPerDialectPerRun, headroom));
        const result = await this.backfillDialectTranslations(dialectTag, wordsPerItem, providerOrder, maxItemsThisRun);
        backfilled += result.backfilled;
        backfillSkippedDuplicate += result.skippedDuplicate;
        backfillFailures += result.failed;
      }
    }
    const dialectTags = await this.filterDialectsUnderPoolCap(underCapDialectTags, maxPoolPerDialect);

    let inserted = 0;
    let skippedDuplicate = 0;
    let translationsInserted = 0;
    let translationsSkipped = 0;
    let translationFailures = 0;
    let promptWordFailures = 0;

    if (wordsPerItem === 1) {
      const prompt = this.buildWordGenerationPrompt(effectiveItemsPerRun);
      const { items: rawItems, provider: englishProvider } = await this.chain.generateStructured(prompt, providerOrder, parsePosItemArray);
      const { accepted, filteredCount } = this.filterAndValidatePosItems(rawItems, 1);
      this.logger.log(`Generation run starting: provider=${englishProvider} generated=${rawItems.length} filteredOut=${filteredCount}`);

      const result = await this.insertWords(accepted);
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
      const prompt = this.buildGenerationPrompt(wordsPerItem, effectiveItemsPerRun);
      const { items: rawItems, provider: englishProvider } = await this.chain.generate(prompt, providerOrder);
      const { accepted: englishItems, filteredCount } = this.filterAndValidate(rawItems, wordsPerItem);
      this.logger.log(`Generation run starting: provider=${englishProvider} generated=${rawItems.length} filteredOut=${filteredCount}`);

      const result = await this.insertPrompts(englishItems);
      inserted = result.inserted;
      skippedDuplicate = result.skippedDuplicate;

      for (const promptRow of result.insertedRows) {
        promptWordFailures += await this.segmentAndLinkPromptWords(promptRow.id, promptRow.text, 'en-us', providerOrder);

        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkPrompt(promptRow.id, promptRow.text, dialectTag, providerOrder);
          if (outcome === 'inserted') translationsInserted += 1;
          else if (outcome === 'duplicate') translationsSkipped += 1;
          else translationFailures += 1;

          if (outcome === 'inserted') {
            const translatedText = await this.getPromptTranslationText(promptRow.id, dialectTag);
            if (translatedText) promptWordFailures += await this.segmentAndLinkPromptWords(promptRow.id, translatedText, dialectTag, providerOrder);
          }
        }
      }
    }

    this.logger.log(
      `Generation run complete: inserted=${inserted} skippedDuplicate=${skippedDuplicate} ` +
        `translationsInserted=${translationsInserted} translationsSkippedDuplicate=${translationsSkipped} ` +
        `translationFailures=${translationFailures} promptWordFailures=${promptWordFailures} ` +
        `backfilled=${backfilled} backfillSkippedDuplicate=${backfillSkippedDuplicate} backfillFailures=${backfillFailures}`,
    );
  }

  /**
   * One-off backfill for content that predates part-of-speech
   * classification/PromptWord segmentation (the static seed list, and any
   * generation run before this feature shipped). Idempotent -- only
   * touches Word/WordTranslation rows with partOfSpeech IS NULL and
   * Prompt rows with zero PromptWord rows for a given dialect, so it's
   * safe to re-run if interrupted. Not scheduled; invoked manually via
   * `npm run backfill` (see main.backfill.ts).
   */
  async backfillClassification(): Promise<void> {
    const settings = await this.getSettings();
    const providerOrder = this.parseProviderOrder(settings.llmProviderOrder);
    const dialectTags = await this.getEnabledDialectTags();

    const unclassifiedWords = await this.prisma.word.findMany({ where: { partOfSpeech: null }, select: { id: true, text: true } });
    this.logger.log(`Backfill: classifying ${unclassifiedWords.length} unclassified word(s)`);
    let wordsClassified = 0;
    for (const word of unclassifiedWords) {
      try {
        const prompt = `Classify the part of speech of the English word "${word.text}" as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}. Respond with ONLY a JSON object of the exact shape {"items": [{"text": "${word.text}", "partOfSpeech": "NOUN"}]}. No other text.`;
        const { items } = await this.chain.generateStructured(prompt, providerOrder, parsePosItemArray);
        const partOfSpeech = items[0]?.partOfSpeech ?? 'OTHER';
        await this.prisma.word.update({ where: { id: word.id }, data: { partOfSpeech } });
        wordsClassified += 1;
      } catch (err) {
        this.logger.warn(`Backfill classification failed word=${word.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const unclassifiedTranslations = await this.prisma.wordTranslation.findMany({
      where: { partOfSpeech: null },
      select: { id: true, text: true, dialectTag: true },
    });
    this.logger.log(`Backfill: classifying ${unclassifiedTranslations.length} unclassified word translation(s)`);
    let translationsClassified = 0;
    for (const translation of unclassifiedTranslations) {
      try {
        const dialect = await this.prisma.dialect.findUnique({ where: { tag: translation.dialectTag }, select: { name: true } });
        if (!dialect) continue;
        const prompt = `Classify the part of speech of the ${dialect.name} word "${translation.text}" as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}. Respond with ONLY a JSON object of the exact shape {"items": [{"text": "${translation.text}", "partOfSpeech": "NOUN"}]}. No other text.`;
        const { items } = await this.chain.generateStructured(prompt, providerOrder, parsePosItemArray);
        const partOfSpeech = items[0]?.partOfSpeech ?? 'OTHER';
        await this.prisma.wordTranslation.update({ where: { id: translation.id }, data: { partOfSpeech } });
        translationsClassified += 1;
      } catch (err) {
        this.logger.warn(`Backfill classification failed translation=${translation.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const prompts = await this.prisma.prompt.findMany({ select: { id: true, text: true, dialectTag: true } });
    this.logger.log(`Backfill: checking ${prompts.length} prompt(s) for missing PromptWord segmentation`);
    let promptWordFailures = 0;
    let promptsSegmented = 0;
    for (const promptRow of prompts) {
      const existingCount = await this.prisma.promptWord.count({ where: { promptId: promptRow.id, dialectTag: promptRow.dialectTag } });
      if (existingCount > 0) continue;
      promptWordFailures += await this.segmentAndLinkPromptWords(promptRow.id, promptRow.text, promptRow.dialectTag, providerOrder);
      promptsSegmented += 1;
    }

    this.logger.log(
      `Backfill complete: wordsClassified=${wordsClassified}/${unclassifiedWords.length} ` +
        `translationsClassified=${translationsClassified}/${unclassifiedTranslations.length} ` +
        `promptsSegmented=${promptsSegmented} promptWordFailures=${promptWordFailures} ` +
        `translationDialects=${dialectTags.length ? dialectTags.join(',') : 'none'}`,
    );
  }

  // --- English generation -------------------------------------------------

  private buildWordGenerationPrompt(itemsPerRun: number): string {
    return [
      `Generate exactly ${itemsPerRun} distinct items for a language-learning dictation/vocabulary app used by adult learners.`,
      'Each item must be exactly one word each (a single word, no spaces, no punctuation).',
      'Use common, everyday English vocabulary that an ordinary adult would recognize -- plain words are fine even if their origin is Latin or Greek (e.g. "family", "photograph"), but avoid rare, obscure, archaic, overly technical, or academic vocabulary.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Do not repeat any item.',
      `For each word, also classify its part of speech as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}.`,
      `Respond with ONLY a JSON object of the exact shape {"items": [{"text": "...", "partOfSpeech": "NOUN"}, ...]} containing exactly ${itemsPerRun} items. No other text.`,
    ].join(' ');
  }

  private buildGenerationPrompt(wordsPerItem: number, itemsPerRun: number): string {
    const lengthInstruction = `exactly ${wordsPerItem} words each (a short natural phrase or sentence, exactly ${wordsPerItem} words when split on whitespace)`;

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

  private buildWordTranslationPrompt(sourceText: string, dialectName: string): string {
    return [
      `Translate the following English word into ${dialectName}: "${sourceText}"`,
      'Provide the natural, everyday equivalent a native speaker would actually say -- not a literal word-for-word translation.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      `Also classify the translation's part of speech as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')} (it may differ from the English word's part of speech).`,
      'Respond with ONLY a JSON object of the exact shape {"items": [{"text": "<translation>", "partOfSpeech": "NOUN"}]} containing exactly one item. No other text.',
    ].join(' ');
  }

  private buildSegmentationPrompt(sentence: string, dialectName: string): string {
    return [
      `Break this ${dialectName} sentence into its individual words, in original order: "${sentence}"`,
      'Preserve each word/token exactly as it appears in the sentence (including any inflection), just split it out -- do not translate, correct, or normalize spelling.',
      `For each word, classify its part of speech as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}.`,
      'Respond with ONLY a JSON object of the exact shape {"items": [{"text": "...", "partOfSpeech": "..."}, ...]} in original sentence order. No other text.',
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

  private filterAndValidatePosItems(rawItems: PosItem[], wordsPerItem: number): { accepted: PosItem[]; filteredCount: number } {
    const seen = new Set<string>();
    const accepted: PosItem[] = [];
    let filteredCount = 0;

    for (const raw of rawItems) {
      const text = raw.text.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      if (text.split(/\s+/).length !== wordsPerItem) continue;
      if (isFlaggedContent(text)) {
        filteredCount += 1;
        continue;
      }
      seen.add(key);
      accepted.push({ text, partOfSpeech: raw.partOfSpeech });
    }

    return { accepted, filteredCount };
  }

  // --- Insert (English source) --------------------------------------------

  private async insertWords(items: PosItem[]): Promise<{ inserted: number; skippedDuplicate: number; insertedRows: { id: string; text: string }[] }> {
    if (items.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };

    const texts = items.map((item) => item.text);
    const existing = await this.prisma.word.findMany({
      where: { text: { in: texts, mode: 'insensitive' } },
      select: { text: true },
    });
    const existingSet = new Set(existing.map((row) => row.text.toLowerCase()));
    const newItems = items.filter((item) => !existingSet.has(item.text.toLowerCase()));

    if (newItems.length === 0) {
      return { inserted: 0, skippedDuplicate: items.length, insertedRows: [] };
    }

    await this.prisma.word.createMany({
      data: newItems.map((item) => ({ text: item.text, partOfSpeech: item.partOfSpeech })),
      skipDuplicates: true,
    });
    const insertedRows = await this.prisma.word.findMany({
      where: { text: { in: newItems.map((item) => item.text) } },
      select: { id: true, text: true },
    });

    return { inserted: insertedRows.length, skippedDuplicate: items.length - newItems.length, insertedRows };
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

      const prompt = this.buildWordTranslationPrompt(sourceText, dialect.name);
      const { items } = await this.chain.generateStructured(prompt, providerOrder, parsePosItemArray);
      const item = items[0];
      if (!item?.text || isFlaggedContent(item.text)) return 'failed';

      await this.prisma.wordTranslation.create({ data: { wordId, dialectTag, text: item.text, partOfSpeech: item.partOfSpeech } });
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

  private async getPromptTranslationText(promptId: string, dialectTag: string): Promise<string | null> {
    const row = await this.prisma.promptTranslation.findUnique({ where: { promptId_dialectTag: { promptId, dialectTag } } });
    return row?.text ?? null;
  }

  /**
   * Segments a Prompt's sentence (English source or a dialect translation)
   * into its constituent words, in order, mapping each to (or creating) a
   * classified Word + WordTranslation and inserting the corresponding
   * PromptWord row -- this is the ordered fragment sequence the
   * SENTENCE_REBUILD trainer exercise shuffles and asks the trainer to
   * reassemble. Returns the number of items that failed to link (for
   * logging only; a partial segmentation still leaves a usable, just
   * shorter, exercise -- WordsService.nextAssignment requires >=2
   * PromptWord rows to offer an assignment).
   */
  private async segmentAndLinkPromptWords(
    promptId: string,
    sentence: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
  ): Promise<number> {
    try {
      const existingCount = await this.prisma.promptWord.count({ where: { promptId, dialectTag } });
      if (existingCount > 0) return 0;

      const dialect = dialectTag === 'en-us' ? { name: 'English' } : await this.prisma.dialect.findUnique({ where: { tag: dialectTag }, select: { name: true } });
      if (!dialect) return 1;

      const prompt = this.buildSegmentationPrompt(sentence, dialect.name);
      const { items } = await this.chain.generateStructured(prompt, providerOrder, parsePosItemArray);
      if (items.length < 2) return 1;

      let failures = 0;
      let position = 0;
      for (const item of items) {
        try {
          const word = await this.findOrCreateWordForFragment(item, dialectTag, providerOrder);
          if (!word) {
            failures += 1;
            continue;
          }
          await this.prisma.promptWord.create({
            data: { promptId, dialectTag, position, wordId: word.id, text: item.text },
          });
          position += 1;
        } catch {
          failures += 1;
        }
      }
      return failures;
    } catch (err) {
      this.logger.warn(`Segmentation failed prompt=${promptId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  /**
   * Resolves a segmented fragment back to a real, classified Word row.
   * English fragments (dialectTag 'en-us') map directly onto Word.text;
   * dialect fragments look up an existing WordTranslation with matching
   * text first (case-insensitive), and only mint a brand-new bootstrap
   * Word (English text = the fragment itself, best-effort) if nothing
   * matches -- this keeps PromptWord always backed by a real classified
   * Word without requiring every fragment to already exist in the word
   * bank ahead of time.
   */
  private async findOrCreateWordForFragment(
    item: PosItem,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
  ): Promise<{ id: string } | null> {
    if (dialectTag === 'en-us') {
      const existing = await this.prisma.word.findFirst({ where: { text: { equals: item.text, mode: 'insensitive' } }, select: { id: true } });
      if (existing) return existing;
      const created = await this.prisma.word.create({ data: { text: item.text, partOfSpeech: item.partOfSpeech }, select: { id: true } });
      return created;
    }

    const existingTranslation = await this.prisma.wordTranslation.findFirst({
      where: { dialectTag, text: { equals: item.text, mode: 'insensitive' } },
      select: { wordId: true },
    });
    if (existingTranslation) return { id: existingTranslation.wordId };

    // No matching translation yet -- bootstrap a new Word using the
    // fragment's own text as a same-text placeholder English entry (best
    // effort; word-generator-job's regular translation pass will never
    // touch this row since it isn't in dialectTags' generation flow, but
    // it's enough to satisfy PromptWord's real-Word requirement and gives
    // admins a classified row to review/fix).
    const englishWord = await this.prisma.word.create({
      data: { text: item.text },
      select: { id: true },
    });
    await this.prisma.wordTranslation.create({
      data: { wordId: englishWord.id, dialectTag, text: item.text, partOfSpeech: item.partOfSpeech },
    });
    return englishWord;
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

  /**
   * Consensus scoring and peer reverse-validation both need multiple
   * trainers submitting the *same* prompt/word in a dialect -- growing the
   * pool of distinct dialect content faster than that dialect's trainer
   * base can cover means most of it never accumulates enough submissions to
   * score (AGENTS.md/consensus-scorer's MIN_QUORUM). This throttles new
   * translations per dialect once that dialect's existing pool (active
   * Prompt translations + WordTranslation rows) already meets the
   * admin-configured ceiling, so the pool only grows again once an admin
   * raises the limit deliberately (e.g. as that dialect's trainer count
   * grows) rather than automatically every scheduled run.
   */
  private async filterDialectsUnderPoolCap(dialectTags: string[], maxPoolPerDialect: number): Promise<string[]> {
    if (dialectTags.length === 0) return [];
    const poolSizeByDialect = await this.getPoolSizesByDialect(dialectTags);
    return dialectTags.filter((tag) => (poolSizeByDialect.get(tag) ?? 0) < maxPoolPerDialect);
  }

  /** Combined active-Prompt + translated-Word count per dialect tag -- the same "how full is this dialect's pool" signal filterDialectsUnderPoolCap and the backfill step's remaining-headroom calculation both need. */
  private async getPoolSizesByDialect(dialectTags: string[]): Promise<Map<string, number>> {
    const poolSizeByDialect = new Map<string, number>();
    if (dialectTags.length === 0) return poolSizeByDialect;

    const [promptCounts, wordTranslationCounts] = await Promise.all([
      this.prisma.prompt.groupBy({ by: ['dialectTag'], where: { dialectTag: { in: dialectTags }, active: true }, _count: { _all: true } }),
      this.prisma.wordTranslation.groupBy({ by: ['dialectTag'], where: { dialectTag: { in: dialectTags } }, _count: { _all: true } }),
    ]);

    for (const row of promptCounts) poolSizeByDialect.set(row.dialectTag, (poolSizeByDialect.get(row.dialectTag) ?? 0) + row._count._all);
    for (const row of wordTranslationCounts) poolSizeByDialect.set(row.dialectTag, (poolSizeByDialect.get(row.dialectTag) ?? 0) + row._count._all);

    return poolSizeByDialect;
  }

  /**
   * Translates pre-existing English Word/Prompt rows (oldest first) into a
   * single dialect that doesn't have a translation for them yet, up to
   * maxItemsThisRun. This is what lets a newly-enabled dialect (pool size 0)
   * catch up on the existing backlog instead of only ever growing via the
   * shared per-run trickle of brand-new content -- called once per dialect
   * from run() BEFORE any new English generation happens that run. Reuses
   * the exact same translateAndLinkWord/translateAndLinkPrompt/
   * segmentAndLinkPromptWords helpers the main generation loop uses, so
   * content-filtering, dedup, and PromptWord segmentation behave identically
   * whether a translation came from fresh generation or backfill.
   */
  private async backfillDialectTranslations(
    dialectTag: string,
    wordsPerItem: number,
    providerOrder: LlmProviderKey[],
    maxItemsThisRun: number,
  ): Promise<{ backfilled: number; skippedDuplicate: number; failed: number }> {
    if (maxItemsThisRun <= 0) return { backfilled: 0, skippedDuplicate: 0, failed: 0 };

    let backfilled = 0;
    let skippedDuplicate = 0;
    let failed = 0;

    if (wordsPerItem === 1) {
      const words = await this.prisma.word.findMany({
        where: { translations: { none: { dialectTag } } },
        orderBy: { createdAt: 'asc' },
        take: maxItemsThisRun,
        select: { id: true, text: true },
      });

      for (const word of words) {
        const outcome = await this.translateAndLinkWord(word.id, word.text, dialectTag, providerOrder);
        if (outcome === 'inserted') backfilled += 1;
        else if (outcome === 'duplicate') skippedDuplicate += 1;
        else failed += 1;
      }
    } else {
      const prompts = await this.prisma.prompt.findMany({
        where: { dialectTag: 'en-us', active: true, translations: { none: { dialectTag } } },
        orderBy: { createdAt: 'asc' },
        take: maxItemsThisRun,
        select: { id: true, text: true },
      });

      for (const promptRow of prompts) {
        const outcome = await this.translateAndLinkPrompt(promptRow.id, promptRow.text, dialectTag, providerOrder);
        if (outcome === 'inserted') {
          backfilled += 1;
          const translatedText = await this.getPromptTranslationText(promptRow.id, dialectTag);
          if (translatedText) await this.segmentAndLinkPromptWords(promptRow.id, translatedText, dialectTag, providerOrder);
        } else if (outcome === 'duplicate') {
          skippedDuplicate += 1;
        } else {
          failed += 1;
        }
      }
    }

    return { backfilled, skippedDuplicate, failed };
  }

  private async getGeneratedItemsCount(wordsPerItem: number): Promise<number> {
    if (wordsPerItem === 1) {
      return this.prisma.word.count();
    }
    return this.prisma.prompt.count({ where: { dialectTag: 'en-us' } });
  }
}
