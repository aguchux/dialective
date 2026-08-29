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
