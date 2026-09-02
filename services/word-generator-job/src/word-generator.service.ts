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
import { PHRASE_TIERS } from './phrase-tiers.const';

const DEFAULT_PROVIDER_ORDER: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

// Composition may add only these English grammar words around the selected
// source vocabulary. This prevents a provider from inserting dialect words
// into the English prompt/Word bank when it ignores the composition prompt.
const ENGLISH_FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'must', 'not', 'no', 'yes', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with',
  'without', 'into', 'onto', 'over', 'under', 'before', 'after', 'between', 'through',
  'during', 'about', 'as', 'like', 'near', 'around', 'up', 'down', 'out', 'off', 'away',
  'here', 'there', 'where', 'when', 'why', 'how', 'who', 'what', 'which', 'while',
  'very', 'more', 'most', 'less', 'least', 'all', 'any', 'some', 'many', 'much', 'each',
  'every', 'both', 'either', 'neither', 'one', 'two', 'three', 'again', 'also', 'just',
  'now', 'today', 'tomorrow', 'yesterday', 'please', 'not', 'never', 'always', 'often',
  'can\'t', 'cannot', 'don\'t', 'doesn\'t', 'didn\'t', 'isn\'t', 'aren\'t', 'wasn\'t',
  'weren\'t', 'won\'t', 'wouldn\'t', 'shouldn\'t', 'couldn\'t', 'i\'m', 'you\'re',
  'we\'re', 'they\'re', 'it\'s', 'that\'s', 'there\'s', 'i\'ve', 'you\'ve', 'we\'ve',
  'they\'ve', 'i\'ll', 'you\'ll', 'we\'ll', 'they\'ll', 'i\'d', 'you\'d', 'we\'d', 'they\'d',
]);

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
      // Still run phrase-tier generation below -- it has its own enable
      // flag and per-tier item budget (phraseTierGenerationEnabled,
      // phraseTierItemsPerTierPerRun) and is meant to pre-populate
      // independently of the main wordsPerItem-driven pass's global cap.
      this.logger.log(
        `Main generation skipped: global cap reached (generated=${generatedItemsCount} maxTotalGeneratedItems=${maxTotalGeneratedItems})`,
      );
      await this.runPhraseTierGeneration();
      return;
    }
    const effectiveItemsPerRun = Math.min(itemsPerRun, remainingGlobalHeadroom);

    const enabledDialectTags = await this.getEnabledDialectTags();
    const underCapDialectTags = await this.filterDialectsUnderPoolCap(
      enabledDialectTags,
      maxPoolPerDialect,
    );
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
        const result = await this.backfillDialectTranslations(
          dialectTag,
          wordsPerItem,
          providerOrder,
          maxItemsThisRun,
        );
        backfilled += result.backfilled;
        backfillSkippedDuplicate += result.skippedDuplicate;
        backfillFailures += result.failed;
      }
    }
    const dialectTags = await this.filterDialectsUnderPoolCap(
      underCapDialectTags,
      maxPoolPerDialect,
    );

    let inserted = 0;
    let skippedDuplicate = 0;
    let translationsInserted = 0;
    let translationsSkipped = 0;
    let translationFailures = 0;
    let promptWordFailures = 0;

    if (wordsPerItem === 1 && !settings.singleWordGenerationEnabled) {
      // Narrower than llmGenerationEnabled above -- stops ONLY the
      // single-word branch. Composition (llmWordsPerItem 2-20) and
      // runPhraseTierGeneration below are unaffected by this flag; set
      // llmWordsPerItem to 2-20 separately to get composition output
      // (short phrases up through full sentences) from this pass while
      // single-word generation stays off.
      this.logger.log(
        'Single-word generation disabled (singleWordGenerationEnabled=false) and llmWordsPerItem=1; skipping main generation pass',
      );
    } else if (wordsPerItem === 1) {
      const prompt = this.buildWordGenerationPrompt(effectiveItemsPerRun);
      const { items: rawItems, provider: englishProvider } = await this.chain.generateStructured(
        prompt,
        providerOrder,
        parsePosItemArray,
      );
      const { accepted, filteredCount } = this.filterAndValidatePosItems(rawItems, 1);
      this.logger.log(
        `Generation run starting: provider=${englishProvider} generated=${rawItems.length} filteredOut=${filteredCount}`,
      );

      const result = await this.insertWords(accepted);
      inserted = result.inserted;
      skippedDuplicate = result.skippedDuplicate;

      for (const word of result.insertedRows) {
        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkWord(
            word.id,
            word.text,
            dialectTag,
            providerOrder,
          );
          if (outcome === 'inserted') translationsInserted += 1;
          else if (outcome === 'duplicate') translationsSkipped += 1;
          else translationFailures += 1;
        }
      }
    } else {
      const wordSets = await this.selectWordsForComposition(wordsPerItem, effectiveItemsPerRun);
      if (wordSets.length < effectiveItemsPerRun) {
        this.logger.warn(
          `Composition requested ${effectiveItemsPerRun} item(s) but only found enough classified Word rows for ${wordSets.length} -- ` +
            'run llmWordsPerItem=1 generation (or the backfillClassification script) to grow the classified single-word pool first.',
        );
      }

      const composed: { text: string; wordSet: { id: string; text: string }[] }[] = [];
      let filteredCount = 0;
      for (const wordSet of wordSets) {
        try {
          const prompt = this.buildCompositionPrompt(wordSet);
          const { items } = await this.chain.generate(prompt, providerOrder);
          const text = items[0]?.trim();
          if (!text) continue;
          if (isFlaggedContent(text)) {
            filteredCount += 1;
            continue;
          }
          composed.push({ text, wordSet });
        } catch (err) {
          this.logger.warn(
            `Composition failed for word set [${wordSet.map((w) => w.text).join(', ')}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.logger.log(
        `Generation run starting: composed=${composed.length}/${wordSets.length} filteredOut=${filteredCount}`,
      );

      const { accepted, filteredCount: lengthFilteredCount } =
        this.filterAndValidateComposed(composed);
      filteredCount += lengthFilteredCount;

      const result = await this.insertComposedPrompts(accepted);
      inserted = result.inserted;
      skippedDuplicate = result.skippedDuplicate;

      for (const promptRow of result.insertedRows) {
        promptWordFailures += await this.segmentAndLinkPromptWords(
          promptRow.id,
          promptRow.text,
          'en-us',
          providerOrder,
          promptRow.wordSet,
        );

        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkPrompt(
            promptRow.id,
            promptRow.text,
            dialectTag,
            providerOrder,
          );
          if (outcome === 'inserted') translationsInserted += 1;
          else if (outcome === 'duplicate') translationsSkipped += 1;
          else translationFailures += 1;

          if (outcome === 'inserted') {
            const translatedText = await this.getPromptTranslationText(promptRow.id, dialectTag);
            if (translatedText)
              promptWordFailures += await this.segmentAndLinkPromptWords(
                promptRow.id,
                translatedText,
                dialectTag,
                providerOrder,
              );
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

    await this.runPhraseTierGeneration();
  }

  /**
   * Composes AI phrases sized for each PHRASE_TIERS band (see
   * phrase-tiers.const.ts) into the SAME Prompt/PromptWord tables the
   * regular composition path above uses, tagged with phraseWordCountMin/Max
   * so WordsService.pickPhraseSource can find them by tier -- see that
   * service's PHRASE_TO_DIALECT escalation feature. Runs independently of
   * the regular wordsPerItem-driven composition/generation above (own
   * enable flag, own per-tier item budget) so the phrase pool can
   * pre-populate on its own schedule.
   */
  private async runPhraseTierGeneration(): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.phraseTierGenerationEnabled) {
      this.logger.log('Phrase-tier generation disabled (phraseTierGenerationEnabled=false); skipping');
      return;
    }

    const providerOrder = this.parseProviderOrder(settings.llmProviderOrder);
    const itemsPerTier = settings.phraseTierItemsPerTierPerRun;
    const dialectTags = await this.getEnabledDialectTags();

    let totalInserted = 0;
    let totalSkippedDuplicate = 0;
    let totalOutOfRange = 0;

    for (const tier of PHRASE_TIERS) {
      const wordSets = await this.selectWordsForComposition(tier.wordCountMax, itemsPerTier);
      if (wordSets.length < itemsPerTier) {
        this.logger.warn(
          `Phrase-tier generation (threshold=${tier.threshold}) requested ${itemsPerTier} item(s) but only found enough classified Word rows for ${wordSets.length}`,
        );
      }

      const composed: { text: string; wordSet: { id: string; text: string }[] }[] = [];
      for (const wordSet of wordSets) {
        try {
          const prompt = this.buildCompositionPrompt(wordSet);
          const { items } = await this.chain.generate(prompt, providerOrder);
          const text = items[0]?.trim();
          if (!text || isFlaggedContent(text)) continue;
          const wordCount = text.split(/\s+/).length;
          if (wordCount < tier.wordCountMin || wordCount > tier.wordCountMax) {
            totalOutOfRange += 1;
            continue;
          }
          composed.push({ text, wordSet });
        } catch (err) {
          this.logger.warn(
            `Phrase-tier composition failed (threshold=${tier.threshold}) for word set [${wordSet.map((w) => w.text).join(', ')}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const { accepted, filteredCount } = this.filterAndValidateComposed(composed);
      totalSkippedDuplicate += filteredCount;
      const result = await this.insertComposedPrompts(accepted, tier);
      totalInserted += result.inserted;
      totalSkippedDuplicate += result.skippedDuplicate;

      for (const promptRow of result.insertedRows) {
        await this.segmentAndLinkPromptWords(
          promptRow.id,
          promptRow.text,
          'en-us',
          providerOrder,
          promptRow.wordSet,
        );

        for (const dialectTag of dialectTags) {
          const outcome = await this.translateAndLinkPrompt(
            promptRow.id,
            promptRow.text,
            dialectTag,
            providerOrder,
            tier,
          );
          if (outcome === 'inserted') {
            const translatedText = await this.getPromptTranslationText(promptRow.id, dialectTag);
            if (translatedText) {
              await this.segmentAndLinkPromptWords(promptRow.id, translatedText, dialectTag, providerOrder);
            }
          }
        }
      }
    }

    this.logger.log(
      `Phrase-tier generation complete: inserted=${totalInserted} skippedDuplicate=${totalSkippedDuplicate} outOfRange=${totalOutOfRange}`,
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

    const unclassifiedWords = await this.prisma.word.findMany({
      where: { partOfSpeech: null },
      select: { id: true, text: true },
    });
    this.logger.log(`Backfill: classifying ${unclassifiedWords.length} unclassified word(s)`);
    let wordsClassified = 0;
    for (const word of unclassifiedWords) {
      try {
        const prompt = `Classify the part of speech of the English word "${word.text}" as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}. Respond with ONLY a JSON object of the exact shape {"items": [{"text": "${word.text}", "partOfSpeech": "NOUN"}]}. No other text.`;
        const { items } = await this.chain.generateStructured(
          prompt,
          providerOrder,
          parsePosItemArray,
        );
        const partOfSpeech = items[0]?.partOfSpeech ?? 'OTHER';
        await this.prisma.word.update({ where: { id: word.id }, data: { partOfSpeech } });
        wordsClassified += 1;
      } catch (err) {
        this.logger.warn(
          `Backfill classification failed word=${word.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const unclassifiedTranslations = await this.prisma.wordTranslation.findMany({
      where: { partOfSpeech: null },
      select: { id: true, text: true, dialectTag: true },
    });
    this.logger.log(
      `Backfill: classifying ${unclassifiedTranslations.length} unclassified word translation(s)`,
    );
    let translationsClassified = 0;
    for (const translation of unclassifiedTranslations) {
      try {
        const dialect = await this.prisma.dialect.findUnique({
          where: { tag: translation.dialectTag },
          select: { name: true },
        });
        if (!dialect) continue;
        const prompt = `Classify the part of speech of the ${dialect.name} word "${translation.text}" as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}. Respond with ONLY a JSON object of the exact shape {"items": [{"text": "${translation.text}", "partOfSpeech": "NOUN"}]}. No other text.`;
        const { items } = await this.chain.generateStructured(
          prompt,
          providerOrder,
          parsePosItemArray,
        );
        const partOfSpeech = items[0]?.partOfSpeech ?? 'OTHER';
        await this.prisma.wordTranslation.update({
          where: { id: translation.id },
          data: { partOfSpeech },
        });
        translationsClassified += 1;
      } catch (err) {
        this.logger.warn(
          `Backfill classification failed translation=${translation.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const prompts = await this.prisma.prompt.findMany({
      select: { id: true, text: true, dialectTag: true },
    });
    this.logger.log(
      `Backfill: checking ${prompts.length} prompt(s) for missing PromptWord segmentation`,
    );
    let promptWordFailures = 0;
    let promptsSegmented = 0;
    for (const promptRow of prompts) {
      const existingCount = await this.prisma.promptWord.count({
        where: { promptId: promptRow.id, dialectTag: promptRow.dialectTag },
      });
      if (existingCount > 0) continue;
      promptWordFailures += await this.segmentAndLinkPromptWords(
        promptRow.id,
        promptRow.text,
        promptRow.dialectTag,
        providerOrder,
      );
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

  /**
   * Composes ONE phrase/sentence per call, constrained to a specific,
   * caller-selected set of existing classified Word rows -- replaces the
   * retired buildGenerationPrompt, which let the LLM invent its own
   * vocabulary. The LLM still owns grammar/word order (no code here
   * validates dialect-specific sentence structure -- see AGENTS.md "Word
   * composition"), but the vocabulary source is fixed to what was selected,
   * not free choice, so the resulting Prompt is genuinely built FROM the
   * word bank rather than generated alongside it.
   */
  private buildCompositionPrompt(words: { text: string; partOfSpeech: string }[]): string {
    const wordList = words.map((w) => `"${w.text}" (${w.partOfSpeech})`).join(', ');
    return [
      'You are composing one short sentence or phrase for a language-learning dictation app used by adult learners.',
      `Using ONLY these words: ${wordList}.`,
      'You may inflect or conjugate them as needed for correct grammar (e.g. "run" -> "runs", "walk" -> "walked"), and add ordinary function words (articles, prepositions, pronouns) if the sentence needs them to read naturally, but do NOT introduce any new content words (nouns, verbs, adjectives, adverbs) beyond the list above.',
      'Use every word from the list at least once. Produce one natural, grammatically correct English sentence or short phrase.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Respond with ONLY a JSON object of the exact shape {"items": ["<sentence>"]} containing exactly one string. No other text.',
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

  /**
   * Dedup pass for composed sentences -- content filtering and per-item
   * validity already happened inline in run() (each composition is its own
   * LLM call, unlike the old batched buildGenerationPrompt), so this only
   * needs to drop exact-text duplicates across the batch (e.g. two
   * different word sets composing to the same short phrase by chance).
   */
  private filterAndValidateComposed(
    items: { text: string; wordSet: { id: string; text: string }[] }[],
  ): {
    accepted: { text: string; wordSet: { id: string; text: string }[] }[];
    filteredCount: number;
  } {
    const seen = new Set<string>();
    const accepted: { text: string; wordSet: { id: string; text: string }[] }[] = [];
    let filteredCount = 0;

    for (const item of items) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) {
        filteredCount += 1;
        continue;
      }
      if (!this.isEnglishComposition(item.text, item.wordSet)) {
        filteredCount += 1;
        continue;
      }
      seen.add(key);
      accepted.push(item);
    }

    return { accepted, filteredCount };
  }

  /**
   * A multi-word source prompt is English only when every token is either
   * an English grammar word or a selected source word (including a narrow,
   * predictable inflection). Responses that violate the source-vocabulary
   * contract never reach Prompt or Word persistence.
   */
  private isEnglishComposition(
    text: string,
    wordSet: { id: string; text: string }[],
  ): boolean {
    if (!/^[A-Za-z\s'.,!?;:-]+$/.test(text)) return false;

    const tokens = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
    if (!tokens || tokens.length < 2) return false;

    const sourceWords = wordSet.map((word) => word.text.toLowerCase());
    if (!sourceWords.every((source) => this.isEnglishWord(source))) return false;

    return (
      tokens.every(
        (token) =>
          ENGLISH_FUNCTION_WORDS.has(token) ||
          sourceWords.some((source) => this.isSourceWordVariant(token, source)),
      ) &&
      sourceWords.every((source) =>
        tokens.some((token) => this.isSourceWordVariant(token, source)),
      )
    );
  }

  private isEnglishWord(text: string): boolean {
    return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(text.trim());
  }

  private isSourceWordVariant(token: string, source: string): boolean {
    if (token === source) return true;

    const directSuffixes = ['s', 'es', 'ed', 'ing', 'er', 'est', 'ly'];
    if (directSuffixes.some((suffix) => token === `${source}${suffix}`)) return true;

    if (source.endsWith('e')) {
      const stem = source.slice(0, -1);
      if (token === `${stem}ing` || token === `${stem}ed`) return true;
    }
    if (source.endsWith('y')) {
      const stem = source.slice(0, -1);
      if (token === `${stem}ies` || token === `${stem}ied`) return true;
    }

    for (const suffix of ['ing', 'ed']) {
      if (!token.endsWith(suffix)) continue;
      const stem = token.slice(0, -suffix.length);
      if (stem.length > 1 && stem.at(-1) === stem.at(-2) && stem.slice(0, -1) === source)
        return true;
    }
    return false;
  }

  private filterAndValidatePosItems(
    rawItems: PosItem[],
    wordsPerItem: number,
  ): { accepted: PosItem[]; filteredCount: number } {
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

  private async insertWords(items: PosItem[]): Promise<{
    inserted: number;
    skippedDuplicate: number;
    insertedRows: { id: string; text: string }[];
  }> {
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

    return {
      inserted: insertedRows.length,
      skippedDuplicate: items.length - newItems.length,
      insertedRows,
    };
  }

  /**
   * Inserts composed sentences as origin: WORD_COMPOSED Prompt rows,
   * carrying each row's source word set through to the caller so
   * segmentAndLinkPromptWords can set PromptWord.sourceWordId on the
   * English fragments that came from a selected Word.
   */
  private async insertComposedPrompts(
    items: { text: string; wordSet: { id: string; text: string }[] }[],
    phraseTier?: { wordCountMin: number; wordCountMax: number },
  ): Promise<{
    inserted: number;
    skippedDuplicate: number;
    insertedRows: { id: string; text: string; wordSet: { id: string; text: string }[] }[];
  }> {
    if (items.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };

    const existing = await this.prisma.prompt.findMany({
      where: { dialectTag: 'en-us' },
      select: { text: true },
    });
    const existingSet = new Set(existing.map((row) => row.text.trim().toLowerCase()));
    const newItems = items.filter((item) => !existingSet.has(item.text.toLowerCase()));

    const insertedRows: { id: string; text: string; wordSet: { id: string; text: string }[] }[] =
      [];
    for (const item of newItems) {
      const row = await this.prisma.prompt.create({
        data: {
          dialectTag: 'en-us',
          text: item.text,
          active: true,
          origin: 'WORD_COMPOSED',
          ...(phraseTier
            ? { phraseWordCountMin: phraseTier.wordCountMin, phraseWordCountMax: phraseTier.wordCountMax }
            : {}),
        },
        select: { id: true, text: true },
      });
      insertedRows.push({ ...row, wordSet: item.wordSet });
    }

    return {
      inserted: insertedRows.length,
      skippedDuplicate: items.length - newItems.length,
      insertedRows,
    };
  }

  // --- Translations ---------------------------------------------------------

  private async translateAndLinkWord(
    wordId: string,
    sourceText: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
  ): Promise<'inserted' | 'duplicate' | 'failed'> {
    try {
      const dialect = await this.prisma.dialect.findUnique({
        where: { tag: dialectTag },
        select: { name: true },
      });
      if (!dialect) return 'failed';

      const existing = await this.prisma.wordTranslation.findUnique({
        where: { wordId_dialectTag: { wordId, dialectTag } },
      });
      if (existing) return 'duplicate';

      const prompt = this.buildWordTranslationPrompt(sourceText, dialect.name);
      const { items } = await this.chain.generateStructured(
        prompt,
        providerOrder,
        parsePosItemArray,
      );
      const item = items[0];
      if (!item?.text || isFlaggedContent(item.text)) return 'failed';

      await this.prisma.wordTranslation.create({
        data: { wordId, dialectTag, text: item.text, partOfSpeech: item.partOfSpeech },
      });
      return 'inserted';
    } catch (err) {
      this.logger.warn(
        `Translation failed word=${wordId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
  }

  private async translateAndLinkPrompt(
    promptId: string,
    sourceText: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
    phraseTier?: { wordCountMin: number; wordCountMax: number },
  ): Promise<'inserted' | 'duplicate' | 'failed'> {
    try {
      const dialect = await this.prisma.dialect.findUnique({
        where: { tag: dialectTag },
        select: { name: true },
      });
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

      // Phrase-pool prompts stamp the same tier range on the translated
      // dialect row too -- pickPhraseSource (services/api) queries by
      // dialectTag directly against Prompt, not via PromptTranslation, so
      // the translated row needs its own phraseWordCountMin/Max to be
      // independently discoverable.
      await this.prisma.$transaction([
        this.prisma.promptTranslation.create({ data: { promptId, dialectTag, text } }),
        this.prisma.prompt.create({
          data: {
            dialectTag,
            text,
            active: true,
            ...(phraseTier
              ? { phraseWordCountMin: phraseTier.wordCountMin, phraseWordCountMax: phraseTier.wordCountMax }
              : {}),
          },
        }),
      ]);
      return 'inserted';
    } catch (err) {
      this.logger.warn(
        `Translation failed prompt=${promptId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
  }

  private async getPromptTranslationText(
    promptId: string,
    dialectTag: string,
  ): Promise<string | null> {
    const row = await this.prisma.promptTranslation.findUnique({
      where: { promptId_dialectTag: { promptId, dialectTag } },
    });
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
   *
   * `sourceWordSet`, when given (WORD_COMPOSED English pass only -- see
   * insertComposedPrompts), lets each resulting fragment be matched back to
   * the Word it was originally selected from (case-insensitive text match
   * against the fragment as segmented, which may be inflected -- a
   * same-stem match is good enough for audit purposes, an exact-form match
   * isn't required). Fragments that don't match any selected word (e.g. an
   * added function word like "the") simply leave sourceWordId null, same as
   * every non-composed PromptWord already does.
   */
  private async segmentAndLinkPromptWords(
    promptId: string,
    sentence: string,
    dialectTag: string,
    providerOrder: LlmProviderKey[],
    sourceWordSet?: { id: string; text: string }[],
  ): Promise<number> {
    try {
      const existingCount = await this.prisma.promptWord.count({ where: { promptId, dialectTag } });
      if (existingCount > 0) return 0;

      const dialect =
        dialectTag === 'en-us'
          ? { name: 'English' }
          : await this.prisma.dialect.findUnique({
              where: { tag: dialectTag },
              select: { name: true },
            });
      if (!dialect) return 1;

      const prompt = this.buildSegmentationPrompt(sentence, dialect.name);
      const { items } = await this.chain.generateStructured(
        prompt,
        providerOrder,
        parsePosItemArray,
      );
      if (items.length < 2) return 1;

      const sourceWordByText = new Map(
        (sourceWordSet ?? []).map((w) => [w.text.toLowerCase(), w.id] as const),
      );

      let failures = 0;
      let position = 0;
      for (const item of items) {
        try {
          const word = await this.findOrCreateWordForFragment(item, dialectTag);
          if (!word) {
            failures += 1;
            continue;
          }
          await this.prisma.promptWord.create({
            data: {
              promptId,
              dialectTag,
              position,
              wordId: word.id,
              text: item.text,
              sourceWordId: sourceWordByText.get(item.text.toLowerCase()) ?? null,
            },
          });
          position += 1;
        } catch {
          failures += 1;
        }
      }
      return failures;
    } catch (err) {
      this.logger.warn(
        `Segmentation failed prompt=${promptId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 1;
    }
  }

  /**
   * Resolves a segmented fragment back to a real, classified Word row.
   * English fragments (dialectTag 'en-us') map directly onto Word.text;
   * dialect fragments look up an existing WordTranslation with matching
   * text first (case-insensitive). Unlinked dialect fragments are skipped;
   * they must never become new English Word rows.
   */
  private async findOrCreateWordForFragment(
    item: PosItem,
    dialectTag: string,
  ): Promise<{ id: string } | null> {
    if (dialectTag === 'en-us') {
      if (!this.isEnglishWord(item.text)) return null;
      const existing = await this.prisma.word.findFirst({
        where: { text: { equals: item.text, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) return existing;
      const created = await this.prisma.word.create({
        data: { text: item.text, partOfSpeech: item.partOfSpeech },
        select: { id: true },
      });
      return created;
    }

    const existingTranslation = await this.prisma.wordTranslation.findFirst({
      where: { dialectTag, text: { equals: item.text, mode: 'insensitive' } },
      select: { wordId: true },
    });
    if (existingTranslation) return { id: existingTranslation.wordId };

    // A dialect fragment that has no known English WordTranslation must not
    // manufacture a Word row with dialect text. Word is the English source
    // bank; leave this fragment unlinked until a real translation exists.
    return null;
  }

  // --- Composition ---------------------------------------------------------

  /**
   * Picks `count` distinct sets of `wordsPerItem` existing classified Word
   * rows each (no repeated word within a single set), for
   * buildCompositionPrompt to compose a sentence from. Only classified
   * words (partOfSpeech IS NOT NULL) are eligible -- an unclassified word
   * carries no signal for what role it can play in a sentence. When at
   * least one NOUN and one VERB are available, every set is biased to
   * include one of each (a bare list of e.g. three adjectives has no verb
   * to build a real sentence around) -- the remaining slots are filled from
   * the full classified pool at random. Returns fewer than `count` sets
   * (down to zero) if the classified pool is too small to fill them all;
   * callers must handle a short result rather than assuming exactly `count`
   * comes back -- see the warning logged in run() when this happens.
   */
  private async selectWordsForComposition(
    wordsPerItem: number,
    count: number,
  ): Promise<{ id: string; text: string; partOfSpeech: string }[][]> {
    if (count <= 0) return [];

    const classified = (await this.prisma.word.findMany({
      where: { partOfSpeech: { not: null } },
      select: { id: true, text: true, partOfSpeech: true },
    })).filter((word) => this.isEnglishWord(word.text));
    if (classified.length < wordsPerItem) return [];

    const nouns = classified.filter((w) => w.partOfSpeech === 'NOUN');
    const verbs = classified.filter((w) => w.partOfSpeech === 'VERB');

    const sets: { id: string; text: string; partOfSpeech: string }[][] = [];
    for (let i = 0; i < count; i++) {
      const chosen = new Map<string, { id: string; text: string; partOfSpeech: string }>();

      if (wordsPerItem >= 2 && nouns.length > 0) {
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        chosen.set(noun.id, noun as { id: string; text: string; partOfSpeech: string });
      }
      if (wordsPerItem >= 2 && verbs.length > 0 && chosen.size < wordsPerItem) {
        const verb = verbs[Math.floor(Math.random() * verbs.length)];
        chosen.set(verb.id, verb as { id: string; text: string; partOfSpeech: string });
      }

      const remaining = classified.filter((w) => !chosen.has(w.id));
      while (chosen.size < wordsPerItem && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        const word = remaining.splice(idx, 1)[0];
        chosen.set(word.id, word as { id: string; text: string; partOfSpeech: string });
      }

      if (chosen.size < wordsPerItem) break; // pool exhausted -- return what we could build
      sets.push(Array.from(chosen.values()));
    }

    return sets;
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
      this.logger.warn(
        `llmProviderOrder "${csv}" is not a valid permutation of ${ALL_PROVIDER_KEYS.join(',')}; using default order`,
      );
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
  private async filterDialectsUnderPoolCap(
    dialectTags: string[],
    maxPoolPerDialect: number,
  ): Promise<string[]> {
    if (dialectTags.length === 0) return [];
    const poolSizeByDialect = await this.getPoolSizesByDialect(dialectTags);
    return dialectTags.filter((tag) => (poolSizeByDialect.get(tag) ?? 0) < maxPoolPerDialect);
  }

  /** Combined active-Prompt + translated-Word count per dialect tag -- the same "how full is this dialect's pool" signal filterDialectsUnderPoolCap and the backfill step's remaining-headroom calculation both need. */
  private async getPoolSizesByDialect(dialectTags: string[]): Promise<Map<string, number>> {
    const poolSizeByDialect = new Map<string, number>();
    if (dialectTags.length === 0) return poolSizeByDialect;

    const [promptCounts, wordTranslationCounts] = await Promise.all([
      this.prisma.prompt.groupBy({
        by: ['dialectTag'],
        where: { dialectTag: { in: dialectTags }, active: true },
        _count: { _all: true },
      }),
      this.prisma.wordTranslation.groupBy({
        by: ['dialectTag'],
        where: { dialectTag: { in: dialectTags } },
        _count: { _all: true },
      }),
    ]);

    for (const row of promptCounts)
      poolSizeByDialect.set(
        row.dialectTag,
        (poolSizeByDialect.get(row.dialectTag) ?? 0) + row._count._all,
      );
    for (const row of wordTranslationCounts)
      poolSizeByDialect.set(
        row.dialectTag,
        (poolSizeByDialect.get(row.dialectTag) ?? 0) + row._count._all,
      );

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
        const outcome = await this.translateAndLinkWord(
          word.id,
          word.text,
          dialectTag,
          providerOrder,
        );
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
        const outcome = await this.translateAndLinkPrompt(
          promptRow.id,
          promptRow.text,
          dialectTag,
          providerOrder,
        );
        if (outcome === 'inserted') {
          backfilled += 1;
          const translatedText = await this.getPromptTranslationText(promptRow.id, dialectTag);
          if (translatedText)
            await this.segmentAndLinkPromptWords(
              promptRow.id,
              translatedText,
              dialectTag,
              providerOrder,
            );
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
