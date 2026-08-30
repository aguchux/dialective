import { PlatformSettingsService } from './platform-settings.service';

function setup(row: Record<string, unknown>) {
  const prisma = {
    platformSettings: {
      upsert: jest.fn().mockResolvedValue({ id: 'default', ...row }),
    },
  };
  const service = new PlatformSettingsService(prisma as never);
  return { service, prisma };
}

describe('PlatformSettingsService.getTawkToWidget', () => {
  it('returns disabled with no IDs when the master switch is off, even if IDs are set', async () => {
    const { service } = setup({
      tawkToEnabled: false,
      tawkToPropertyId: 'prop-1',
      tawkToWidgetId: 'widget-1',
    });

    await expect(service.getTawkToWidget()).resolves.toEqual({
      enabled: false,
      propertyId: null,
      widgetId: null,
    });
  });

  it('returns disabled with no IDs when enabled but propertyId is missing', async () => {
    const { service } = setup({
      tawkToEnabled: true,
      tawkToPropertyId: null,
      tawkToWidgetId: 'widget-1',
    });

    await expect(service.getTawkToWidget()).resolves.toEqual({
      enabled: false,
      propertyId: null,
      widgetId: null,
    });
  });

  it('returns disabled with no IDs when enabled but widgetId is missing', async () => {
    const { service } = setup({
      tawkToEnabled: true,
      tawkToPropertyId: 'prop-1',
      tawkToWidgetId: null,
    });

    await expect(service.getTawkToWidget()).resolves.toEqual({
      enabled: false,
      propertyId: null,
      widgetId: null,
    });
  });

  it('returns enabled with both IDs only when the switch is on and both IDs are set', async () => {
    const { service } = setup({
      tawkToEnabled: true,
      tawkToPropertyId: 'prop-1',
      tawkToWidgetId: 'widget-1',
    });

    await expect(service.getTawkToWidget()).resolves.toEqual({
      enabled: true,
      propertyId: 'prop-1',
      widgetId: 'widget-1',
    });
  });
});

describe('PlatformSettingsService.isWeeklyTrainerReportEnabled', () => {
  it('reflects the row value, defaulting true per the schema default', async () => {
    const { service } = setup({ weeklyTrainerReportEnabled: true });
    await expect(service.isWeeklyTrainerReportEnabled()).resolves.toBe(true);
  });

  it('returns false once an admin turns the toggle off', async () => {
    const { service } = setup({ weeklyTrainerReportEnabled: false });
    await expect(service.isWeeklyTrainerReportEnabled()).resolves.toBe(false);
  });
});

describe('PlatformSettingsService submission rate limit settings', () => {
  it('isSubmissionRateLimitEnabled reflects the row value, defaulting false per the schema default', async () => {
    const { service } = setup({ submissionRateLimitEnabled: false });
    await expect(service.isSubmissionRateLimitEnabled()).resolves.toBe(false);
  });

  it('isSubmissionRateLimitEnabled returns true once an admin turns the toggle on', async () => {
    const { service } = setup({ submissionRateLimitEnabled: true });
    await expect(service.isSubmissionRateLimitEnabled()).resolves.toBe(true);
  });

  it('getSubmissionRateLimitPerHour reflects the admin-configured value', async () => {
    const { service } = setup({ submissionRateLimitPerHour: 45 });
    await expect(service.getSubmissionRateLimitPerHour()).resolves.toBe(45);
  });
});

describe('PlatformSettingsService QRAC settings', () => {
  it('isQracEnabled reflects the row value, defaulting false per the schema default', async () => {
    const { service } = setup({ qracEnabled: false });
    await expect(service.isQracEnabled()).resolves.toBe(false);
  });

  it('isQracEnabled returns true once an admin turns the toggle on', async () => {
    const { service } = setup({ qracEnabled: true });
    await expect(service.isQracEnabled()).resolves.toBe(true);
  });

  it('getQracIntervalMinutes reflects the admin-configured value', async () => {
    const { service } = setup({ qracIntervalMinutes: 45 });
    await expect(service.getQracIntervalMinutes()).resolves.toBe(45);
  });
});

describe('PlatformSettingsService testimony settings', () => {
  it('isTestimonyEnabled reflects the row value, defaulting false per the schema default', async () => {
    const { service } = setup({ testimonyEnabled: false });
    await expect(service.isTestimonyEnabled()).resolves.toBe(false);
  });

  it('isTestimonyEnabled returns true once an admin turns the toggle on', async () => {
    const { service } = setup({ testimonyEnabled: true });
    await expect(service.isTestimonyEnabled()).resolves.toBe(true);
  });

  it('getTestimonyMaxTextLength reflects the admin-configured value', async () => {
    const { service } = setup({ testimonyMaxTextLength: 280 });
    await expect(service.getTestimonyMaxTextLength()).resolves.toBe(280);
  });

  it('getTestimonyMaxVideoSeconds reflects the admin-configured value', async () => {
    const { service } = setup({ testimonyMaxVideoSeconds: 45 });
    await expect(service.getTestimonyMaxVideoSeconds()).resolves.toBe(45);
  });

  it('getTestimonyLandingLimit reflects the admin-configured landing count', async () => {
    const { service } = setup({ testimonyLandingLimit: 12 });
    await expect(service.getTestimonyLandingLimit()).resolves.toBe(12);
  });

  it('returns the independently configured text and video reward values', async () => {
    const { service } = setup({
      testimonyTextRewardTokens: { toNumber: () => 3.5 },
      testimonyVideoRewardTokens: { toNumber: () => 9 },
    });
    await expect(service.getTestimonyTextRewardTokens()).resolves.toBe(3.5);
    await expect(service.getTestimonyVideoRewardTokens()).resolves.toBe(9);
  });
});

describe('PlatformSettingsService.isSpeechExpressionEnabled', () => {
  it('returns false by default', async () => {
    const { service } = setup({ speechExpressionEnabled: false });

    await expect(service.isSpeechExpressionEnabled()).resolves.toBe(false);
  });

  it('returns true once an admin turns it on', async () => {
    const { service } = setup({ speechExpressionEnabled: true });

    await expect(service.isSpeechExpressionEnabled()).resolves.toBe(true);
  });
});

describe('PlatformSettingsService.getLandingVisibility', () => {
  it('maps each landingShow* column to its stat key', async () => {
    const { service } = setup({
      landingShowCountries: true,
      landingShowDialects: false,
      landingShowTrainers: true,
      landingShowPoolVolume: false,
      landingShowPayout: true,
    });

    await expect(service.getLandingVisibility()).resolves.toEqual({
      countries: true,
      dialects: false,
      trainers: true,
      totalRecordings: false,
      payout: true,
    });
  });
});
