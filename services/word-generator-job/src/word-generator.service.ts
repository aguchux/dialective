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

// A composed sentence below this token count is almost certainly a
// fragment (e.g. a bare noun phrase like "big dog"), not a complete,
// translatable statement -- reject it before it reaches Sentence/
// SentenceTranslation persistence.
const MIN_COMPOSITION_TOKENS = 3;

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
 * Generates new English words/sentences via an admin-configured LLM
 * fallback chain, translates each into every dialect currently opted into
 * generation (Country.llmGenerationEnabled AND Dialect.llmGenerationEnabled
 * both true), and inserts everything -- deduped, wordlist-filtered -- into
 * the existing Word/Sentence tables so it's immediately available to
 * trainers through WordsService's assignment picker with no further
 * wiring. Runs as a scheduled CronJob, same cadence as settlement-job (see
 * AGENTS.md "Database access" -- this service, like settlement-job, only
 * ever consumes the already-generated @dialectiva/db client; api owns the
 * schema).
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
    const wordsPerItem = 1;
    const itemsPerRun = settings.llmItemsPerRun;
    const maxWordGeneratedItems = settings.llmMaxTotalGeneratedItems;
    const maxSentenceGeneratedItems = settings.llmMaxSentenceGeneratedItems;
    const maxPoolPerDialect = settings.llmMaxPoolPerDialect;
    const backfillItemsPerDialectPerRun = settings.llmBackfillItemsPerDialectPerRun;

    // Word and sentence generation each have their OWN cap and headroom --
    // deliberately not a combined total. A prior version of this method
    // checked one shared cap and `return`ed the whole run once it was
    // reached, which silently skipped sentence generation entirely whenever
    // word generation (alone) had used up the shared budget, even with
    // sentenceGenerationEnabled on. Computing each independently means
    // neither type can ever block the other.
    const [generatedWordCount, generatedSentenceCount] = await Promise.all([
      this.getGeneratedWordCount(),
      this.getGeneratedSentenceCount(),
    ]);
    const remainingWordHeadroom = Math.max(0, maxWordGeneratedItems - generatedWordCount);
    const remainingSentenceHeadroom = Math.max(0, maxSentenceGeneratedItems - generatedSentenceCount);
    const wordCapReached = remainingWordHeadroom <= 0;
    const sentenceCapReached = remainingSentenceHeadroom <= 0;
    if (wordCapReached) {
      this.logger.log(
        `Word generation skipped: cap reached (generated=${generatedWordCount} maxWordGeneratedItems=${maxWordGeneratedItems})`,
      );
    }
    if (sentenceCapReached) {
      this.logger.log(
        `Sentence generation skipped: cap reached (generated=${generatedSentenceCount} maxSentenceGeneratedItems=${maxSentenceGeneratedItems})`,
      );
    }
    const effectiveItemsPerRun = Math.min(itemsPerRun, remainingWordHeadroom);
    const effectiveSentenceItemsPerRun = Math.min(itemsPerRun, remainingSentenceHeadroom);

    const enabledDialectTags = await this.getEnabledDialectTags();
    const underCapDialectTags = await this.filterDialectsUnderPoolCap(
      enabledDialectTags,
      maxPoolPerDialect,
    );
    const skippedDialects = enabledDialectTags.filter((tag) => !underCapDialectTags.includes(tag));
    this.logger.log(
      `Generation run starting: wordsPerItem=${wordsPerItem} itemsPerRun=${itemsPerRun} effectiveItemsPerRun=${effectiveItemsPerRun} effectiveSentenceItemsPerRun=${effectiveSentenceItemsPerRun} ` +
        `maxWordGeneratedItems=${maxWordGeneratedItems} generatedWordCount=${generatedWordCount} ` +
        `maxSentenceGeneratedItems=${maxSentenceGeneratedItems} generatedSentenceCount=${generatedSentenceCount} ` +
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

    if (!settings.wordGenerationEnabled) {
      this.logger.log(
        'Word generation disabled (wordGenerationEnabled=false); skipping word branch',
      );
    } else if (wordCapReached) {
      // Logged above (`Word generation skipped: global cap reached`) --
      // nothing further to log here, just skip the branch.
    } else {
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
    }

    if (!settings.sentenceGenerationEnabled) {
      this.logger.log('Sentence generation disabled (sentenceGenerationEnabled=false); skipping sentence branch');
    } else if (sentenceCapReached) {
      // Logged above (`Sentence generation skipped: cap reached`) -- nothing
      // further to log here, just skip the branch.
    } else {
      try {
        const { items, provider: sentenceProvider } = await this.chain.generate(
          this.buildSentenceGenerationPrompt(effectiveSentenceItemsPerRun, settings.sentenceWordCount),
          providerOrder,
        );
        const accepted = items
          .map((item) => item.trim())
          .filter((text) => this.isGeneratedConversationSentence(text, settings.sentenceWordCount));
        const result = await this.insertGeneratedSentences(accepted);
        inserted += result.inserted;
        skippedDuplicate += result.skippedDuplicate;
        this.logger.log(
          `Sentence generation complete: provider=${sentenceProvider} generated=${items.length} accepted=${accepted.length} inserted=${result.inserted}`,
        );
        for (const sentenceRow of result.insertedRows) {
          for (const dialectTag of dialectTags) {
            if ((await this.translateAndLinkSentence(sentenceRow.id, sentenceRow.text, dialectTag, providerOrder)) === 'failed') {
              translationFailures += 1;
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Sentence generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.log(
      `Generation run complete: inserted=${inserted} skippedDuplicate=${skippedDuplicate} ` +
        `translationsInserted=${translationsInserted} translationsSkippedDuplicate=${translationsSkipped} ` +
        `translationFailures=${translationFailures} ` +
        `backfilled=${backfilled} backfillSkippedDuplicate=${backfillSkippedDuplicate} backfillFailures=${backfillFailures}`,
    );

  }

  /**
   * One-off backfill for content that predates part-of-speech
   * classification (the static seed list, and any generation run before
   * this feature shipped). Idempotent -- only touches Word/WordTranslation
   * rows with partOfSpeech IS NULL, so it's safe to re-run if interrupted.
   * Not scheduled; invoked manually via `npm run backfill` (see
   * main.backfill.ts).
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

    this.logger.log(
      `Backfill complete: wordsClassified=${wordsClassified}/${unclassifiedWords.length} ` +
        `translationsClassified=${translationsClassified}/${unclassifiedTranslations.length} ` +
        `translationDialects=${dialectTags.length ? dialectTags.join(',') : 'none'}`,
    );
  }

  // --- English generation -------------------------------------------------

  private buildWordGenerationPrompt(itemsPerRun: number): string {
    return [
      `Generate exactly ${itemsPerRun} distinct items for a language-learning dictation/vocabulary app used by beginner adult learners who are still building basic vocabulary.`,
      'Each item must be exactly one word each (a single word, no spaces, no punctuation).',
      'Use only short, high-frequency, everyday words that a beginner would meet in their first months of learning the language -- the kind of vocabulary found in a basic picture dictionary: common nouns (house, water, mother, dog), common verbs (go, eat, sleep, help), common adjectives (big, hot, happy), everyday numbers, colors, family terms, foods, and household items.',
      'Prefer words with 1-2 syllables. Avoid rare, obscure, archaic, technical, academic, abstract, or multi-syllable Latin/Greek-derived words (no words like "photograph", "obligation", "consequence", or "phenomenon") -- a word that is hard to translate into another language or hard to picture in your mind does not belong in this list.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Do not repeat any item.',
      `For each word, also classify its part of speech as exactly one of: ${PART_OF_SPEECH_VALUES.join(', ')}.`,
      `Respond with ONLY a JSON object of the exact shape {"items": [{"text": "...", "partOfSpeech": "NOUN"}, ...]} containing exactly ${itemsPerRun} items. No other text.`,
    ].join(' ');
  }

  private buildSentenceGenerationPrompt(itemsPerRun: number, wordCount: number): string {
    return [
      `Generate exactly ${itemsPerRun} distinct basic English conversational sentences for beginner adult language learners.`,
      `Each sentence must contain at most ${wordCount} simple everyday words (any count from 2 up to ${wordCount} is fine), excluding punctuation from the count.`,
      'Use natural situations people talk about at home, in the market, at work, when asking for help, or describing how they feel.',
      'Use short, common words with direct meanings that are easy to translate into local dialects. Prefer plain present or simple past tense.',
      'Do not use technical, academic, abstract, rare, idiomatic, literary, or difficult vocabulary. Do not compose sentences from an existing word bank and do not copy any supplied source words.',
      'Use one clear statement or question per sentence. No semicolons, lists, explanations, slashes, or quotation marks. Avoid profanity, slurs, sexual content, and violence.',
      `Examples of the style: "What is your name?", "How much does this cost?", "I am going to the market to buy yam."`,
      `Respond with ONLY a JSON object of the exact shape {"items": ["..."]} containing exactly ${itemsPerRun} items. No other text.`,
    ].join(' ');
  }

  /**
   * wordCount is a CEILING, not an exact target -- LLMs are unreliable at
   * hitting a precise word count, so requiring an exact match (the original
   * behavior) rejected the vast majority of otherwise-usable candidates
   * every run (observed: ~0-1 accepted out of 5 generated, for days, with
   * sentenceWordCount=4). Any sentence from 2 up to wordCount tokens is
   * accepted -- the floor is 2, not 1, since a single word is what word
   * generation already covers; this branch is specifically for sentences.
   */
  private isGeneratedConversationSentence(text: string, wordCount: number): boolean {
    if (!text || isFlaggedContent(text)) return false;
    if (!/^[A-Za-z][A-Za-z' ,.?!-]*[.?!]$/.test(text)) return false;
    const tokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
    if (tokens.length < 2 || tokens.length > wordCount || tokens.some((token) => token.length > 15)) {
      return false;
    }
    return true;
  }

  private async insertGeneratedSentences(items: string[]): Promise<{
    inserted: number;
    skippedDuplicate: number;
    insertedRows: { id: string; text: string }[];
  }> {
    if (items.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };
    const existing = await this.prisma.sentence.findMany({ select: { text: true } });
    const existingSet = new Set(existing.map((row) => row.text.trim().toLowerCase()));
    const unique = [...new Map(items.map((text) => [text.trim().toLowerCase(), text.trim()])).values()];
    const newItems = unique.filter((text) => !existingSet.has(text.toLowerCase()));
    const insertedRows: { id: string; text: string }[] = [];
    for (const text of newItems) {
      insertedRows.push(await this.prisma.sentence.create({
        data: { text, wordCount: text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0 },
        select: { id: true, text: true },
      }));
    }
    return { inserted: insertedRows.length, skippedDuplicate: items.length - insertedRows.length, insertedRows };
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
      'You are composing one short sentence for a language-learning dictation app used by beginner adult learners, so that trainers can use the same word list to build and translate it into their own dialect.',
      `Using ONLY these words: ${wordList}.`,
      'You may inflect or conjugate them as needed for correct grammar (e.g. "run" -> "runs", "walk" -> "walked"), and add ordinary function words (articles, prepositions, pronouns) if the sentence needs them to read naturally, but do NOT introduce any new content words (nouns, verbs, adjectives, adverbs) beyond the list above.',
      'Use every word from the list at least once.',
      'Keep the sentence short and simple: one main clause only, plain subject-verb-object word order, no subordinate clauses, no semicolons, no relative clauses ("that", "which", "who"), and no compound sentences joined with commas.',
      'The result must be a complete, meaningful, self-contained statement (a full sentence with a clear subject and verb, ending in a period) -- not a sentence fragment, list, or phrase missing a verb -- so that it makes sense and can be understood and translated on its own.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Respond with ONLY a JSON object of the exact shape {"items": ["<sentence>"]} containing exactly one string. No other text.',
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

  private buildSentenceTranslationPrompt(sourceText: string, dialectName: string): string {
    return [
      `Translate the following English sentence into ${dialectName}: "${sourceText}"`,
      'Provide the natural, everyday equivalent a native speaker would actually say -- not a literal word-for-word translation.',
      'Do not include profanity, slurs, sexual content, violence, or anything inappropriate for a general audience.',
      'Respond with ONLY a JSON object of the exact shape {"items": [{"text": "<translation>", "partOfSpeech": "OTHER"}]} containing exactly one item. No other text.',
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
   * contract never reach Prompt or Word persistence. Also rejects sentence
   * fragments (see MIN_COMPOSITION_TOKENS/terminal-punctuation checks
   * below) -- the composition prompt asks the LLM for a complete,
   * translatable statement, but instructions alone aren't reliable enough
   * to trust without a code-level backstop.
   */
  private isEnglishComposition(
    text: string,
    wordSet: { id: string; text: string }[],
  ): boolean {
    if (!/^[A-Za-z\s'.,!?;:-]+$/.test(text)) return false;
    if (!/[.!?]$/.test(text.trim())) return false;

    const tokens = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
    if (!tokens || tokens.length < MIN_COMPOSITION_TOKENS) return false;

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
   * Inserts composed sentences as Sentence rows -- always English, since
   * trainers read/record them in their own dialect from their own fluency
   * (see WordsService.pickSentenceSource). wordCount is stamped from the
   * actual composed text so the tier-gated trainer-side picker can filter
   * on it directly without re-splitting text at pick time.
   */
  private async insertComposedSentences(
    items: { text: string; wordSet: { id: string; text: string }[] }[],
  ): Promise<{
    inserted: number;
    skippedDuplicate: number;
    insertedRows: { id: string; text: string }[];
  }> {
    if (items.length === 0) return { inserted: 0, skippedDuplicate: 0, insertedRows: [] };

    const existing = await this.prisma.sentence.findMany({ select: { text: true } });
    const existingSet = new Set(existing.map((row) => row.text.trim().toLowerCase()));
    const newItems = items.filter((item) => !existingSet.has(item.text.toLowerCase()));

    const insertedRows: { id: string; text: string }[] = [];
    for (const item of newItems) {
      const row = await this.prisma.sentence.create({
        data: {
          text: item.text,
          wordCount: item.text.trim().split(/\s+/).length,
        },
        select: { id: true, text: true },
      });
      insertedRows.push(row);
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

  /**
   * Mirrors translateAndLinkWord's shape but for Sentence -- curation/
   * reference only (see SentenceTranslation's schema doc comment), never a
   * second trainer-facing Sentence row the way Prompt used to work.
   */
  private async translateAndLinkSentence(
    sentenceId: string,
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

      const existing = await this.prisma.sentenceTranslation.findUnique({
        where: { sentenceId_dialectTag: { sentenceId, dialectTag } },
      });
      if (existing) return 'duplicate';

      const prompt = this.buildSentenceTranslationPrompt(sourceText, dialect.name);
      const { items } = await this.chain.generateStructured(
        prompt,
        providerOrder,
        parsePosItemArray,
      );
      const item = items[0];
      if (!item?.text || isFlaggedContent(item.text)) return 'failed';

      await this.prisma.sentenceTranslation.create({
        data: { sentenceId, dialectTag, text: item.text },
      });
      return 'inserted';
    } catch (err) {
      this.logger.warn(
        `Translation failed sentence=${sentenceId} dialect=${dialectTag}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
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
        const noun = this.pickWordFavoringShorter(nouns);
        chosen.set(noun.id, noun as { id: string; text: string; partOfSpeech: string });
      }
      if (wordsPerItem >= 2 && verbs.length > 0 && chosen.size < wordsPerItem) {
        const verb = this.pickWordFavoringShorter(verbs);
        chosen.set(verb.id, verb as { id: string; text: string; partOfSpeech: string });
      }

      let remaining = classified.filter((w) => !chosen.has(w.id));
      while (chosen.size < wordsPerItem && remaining.length > 0) {
        const word = this.pickWordFavoringShorter(remaining);
        chosen.set(word.id, word as { id: string; text: string; partOfSpeech: string });
        remaining = remaining.filter((w) => w.id !== word.id);
      }

      if (chosen.size < wordsPerItem) break; // pool exhausted -- return what we could build
      sets.push(Array.from(chosen.values()));
    }

    return sets;
  }

  /**
   * Weighted random pick that favors shorter words -- a proxy for
   * simplicity, since the Word bank has no explicit difficulty rating.
   * Weight is 1/wordLength, so a 4-letter word is ~2x as likely to be
   * picked as an 8-letter word, without fully excluding longer words when
   * the pool is short on simple ones.
   */
  private pickWordFavoringShorter<T extends { text: string }>(pool: T[]): T {
    const weights = pool.map((word) => 1 / Math.max(1, word.text.length));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
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
   * Peer reverse-validation needs multiple trainers submitting the *same*
   * sentence/word in a dialect -- growing the pool of distinct dialect
   * content faster than that dialect's trainer base can cover means most of
   * it never accumulates enough reverse-validations. This throttles new
   * translations per dialect once that dialect's existing pool (translated
   * SentenceTranslation + WordTranslation rows) already meets the
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

  /** Combined translated-Sentence + translated-Word count per dialect tag -- the same "how full is this dialect's pool" signal filterDialectsUnderPoolCap and the backfill step's remaining-headroom calculation both need. Excludes translations whose parent Word/Sentence is admin-disabled, since a disabled item is no longer part of the servable pool and shouldn't count against the cap. */
  private async getPoolSizesByDialect(dialectTags: string[]): Promise<Map<string, number>> {
    const poolSizeByDialect = new Map<string, number>();
    if (dialectTags.length === 0) return poolSizeByDialect;

    const [sentenceTranslationCounts, wordTranslationCounts] = await Promise.all([
      this.prisma.sentenceTranslation.groupBy({
        by: ['dialectTag'],
        where: { dialectTag: { in: dialectTags }, sentence: { isDisabled: false } },
        _count: { _all: true },
      }),
      this.prisma.wordTranslation.groupBy({
        by: ['dialectTag'],
        where: { dialectTag: { in: dialectTags }, word: { isDisabled: false } },
        _count: { _all: true },
      }),
    ]);

    for (const row of sentenceTranslationCounts)
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
   * Translates pre-existing English Word rows (oldest first) into a single
   * dialect that doesn't have a translation for them yet, up to
   * maxItemsThisRun. This is what lets a newly-enabled dialect (pool size 0)
   * catch up on the existing backlog instead of only ever growing via the
   * shared per-run trickle of brand-new content -- called once per dialect
   * from run() BEFORE any new English generation happens that run. Reuses
   * the exact same translateAndLinkWord helper the main generation loop
   * uses, so content-filtering and dedup behave identically whether a
   * translation came from fresh generation or backfill.
   *
   * Word-only (wordsPerItem === 1): composed sentences (Sentence rows) are
   * translated inline as each one is inserted (see run()'s composition
   * branch/translateAndLinkSentence), so there's no separate Sentence
   * backfill needed here. wordsPerItem > 1 runs are a no-op here.
   */
  private async backfillDialectTranslations(
    dialectTag: string,
    wordsPerItem: number,
    providerOrder: LlmProviderKey[],
    maxItemsThisRun: number,
  ): Promise<{ backfilled: number; skippedDuplicate: number; failed: number }> {
    if (maxItemsThisRun <= 0 || wordsPerItem !== 1) {
      return { backfilled: 0, skippedDuplicate: 0, failed: 0 };
    }

    let backfilled = 0;
    let skippedDuplicate = 0;
    let failed = 0;

    const words = await this.prisma.word.findMany({
      where: { isDisabled: false, translations: { none: { dialectTag } } },
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

    return { backfilled, skippedDuplicate, failed };
  }

  private async getGeneratedWordCount(): Promise<number> {
    return this.prisma.word.count({ where: { isDisabled: false } });
  }

  private async getGeneratedSentenceCount(): Promise<number> {
    return this.prisma.sentence.count({ where: { isDisabled: false } });
  }
}
