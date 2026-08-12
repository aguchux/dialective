import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WordGeneratorService } from './word-generator.service';

/**
 * Manual, one-off entrypoint (not scheduled) that classifies every
 * pre-existing Word/WordTranslation still missing partOfSpeech and
 * segments every Prompt still missing PromptWord rows -- see
 * WordGeneratorService.backfillClassification's doc comment. Run via
 * `npm run backfill` against a real DATABASE_URL/LLM API keys; not part
 * of the scheduled CronJob (see k8s/base/word-generator-cronjob.yaml,
 * which still invokes main.ts's run()).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const generator = app.get(WordGeneratorService);

  try {
    await generator.backfillClassification();
    await app.close();
    process.exit(0);
  } catch (err) {
    await app.close();
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

bootstrap();
