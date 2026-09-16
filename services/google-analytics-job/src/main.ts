import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GoogleAnalyticsService } from './google-analytics.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const googleAnalytics = app.get(GoogleAnalyticsService);

  try {
    await googleAnalytics.run();
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
