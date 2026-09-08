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

describe('PlatformSettingsService validator settings', () => {
  it('returns the flat per-recording validation reward as a number', async () => {
    const { service } = setup({
      validationRewardPerRecording: { toNumber: () => 2.5 },
    });

    await expect(service.getValidationRewardPerRecording()).resolves.toBe(2.5);
  });

  it('returns the configured max items per validator deck', async () => {
    const { service } = setup({ validatorDeckMaxItems: 500 });

    await expect(service.getValidatorDeckMaxItems()).resolves.toBe(500);
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

  it('isQracRequiredAtSessionStart reflects the selected QRAC mode', async () => {
    const { service } = setup({ qracRequiredAtSessionStart: true });
    await expect(service.isQracRequiredAtSessionStart()).resolves.toBe(true);
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

describe('PlatformSettingsService wordTrainingEnabled / sentenceTrainingEnabled gates', () => {
  it('isWordTrainingEnabled/isSentenceTrainingEnabled reflect the row, defaulting true per the schema default', async () => {
    const { service } = setup({ wordTrainingEnabled: true, sentenceTrainingEnabled: true });

    await expect(service.isWordTrainingEnabled()).resolves.toBe(true);
    await expect(service.isSentenceTrainingEnabled()).resolves.toBe(true);
  });

  it('update allows setting both wordTrainingEnabled and sentenceTrainingEnabled off at once -- intentionally supported (falls back to reverse-validation-only in nextAssignment)', async () => {
    const { service, prisma } = setup({ wordTrainingEnabled: true, sentenceTrainingEnabled: true });
    prisma.platformSettings.upsert.mockResolvedValue({
      id: 'default',
      wordTrainingEnabled: false,
      sentenceTrainingEnabled: false,
      minWalletBalanceTokens: { toString: () => '0' },
      minScoreRange: { toString: () => '0' },
      maxScoreRange: { toString: () => '100' },
      manualPhoneVerificationFeeTokens: { toString: () => '0' },
      testimonyTextRewardTokens: { toString: () => '0' },
      testimonyVideoRewardTokens: { toString: () => '0' },
      qualityWeightConsensus: { toString: () => '60' },
      qualityWeightNoise: { toString: () => '15' },
      qualityWeightQuality: { toString: () => '10' },
      qualityWeightLiveness: { toString: () => '15' },
      qualityWeightAsrMatch: { toString: () => '0' },
      kycMinWithdrawalTokens: { toString: () => '0' },
      withdrawalFeePercent: { toString: () => '0' },
      withdrawalFeeTokenAmount: { toString: () => '0' },
      validationRewardPerRecording: { toString: () => '0' },
    });

    await expect(
      service.update({ wordTrainingEnabled: false, sentenceTrainingEnabled: false }),
    ).resolves.toMatchObject({ wordTrainingEnabled: false, sentenceTrainingEnabled: false });
  });

  it('update allows turning one off when the other stays on', async () => {
    const { service, prisma } = setup({ wordTrainingEnabled: true, sentenceTrainingEnabled: true });
    prisma.platformSettings.upsert.mockResolvedValue({
      id: 'default',
      wordTrainingEnabled: false,
      sentenceTrainingEnabled: true,
      minWalletBalanceTokens: { toString: () => '0' },
      minScoreRange: { toString: () => '0' },
      maxScoreRange: { toString: () => '100' },
      manualPhoneVerificationFeeTokens: { toString: () => '0' },
      testimonyTextRewardTokens: { toString: () => '0' },
      testimonyVideoRewardTokens: { toString: () => '0' },
      qualityWeightConsensus: { toString: () => '60' },
      qualityWeightNoise: { toString: () => '15' },
      qualityWeightQuality: { toString: () => '10' },
      qualityWeightLiveness: { toString: () => '15' },
      qualityWeightAsrMatch: { toString: () => '0' },
      kycMinWithdrawalTokens: { toString: () => '0' },
      withdrawalFeePercent: { toString: () => '0' },
      withdrawalFeeTokenAmount: { toString: () => '0' },
      validationRewardPerRecording: { toString: () => '0' },
    });

    await expect(service.update({ wordTrainingEnabled: false })).resolves.toMatchObject({
      wordTrainingEnabled: false,
      sentenceTrainingEnabled: true,
    });
  });
});

describe('PlatformSettingsService session idle/absolute timeout settings', () => {
  it('getSessionIdleTimeoutMinutes/getSessionMaxHours reflect the row, defaulting per the schema default', async () => {
    const { service } = setup({ sessionIdleTimeoutMinutes: 30, sessionMaxHours: 12 });

    await expect(service.getSessionIdleTimeoutMinutes()).resolves.toBe(30);
    await expect(service.getSessionMaxHours()).resolves.toBe(12);
  });

  it('getPublicClientSettings surfaces both thresholds so the frontend can enforce them client-side', async () => {
    const { service } = setup({
      sessionIdleTimeoutMinutes: 45,
      sessionMaxHours: 8,
      manualPhoneVerificationFeeTokens: { toNumber: () => 0 },
      supportChatMode: 'TAWK',
      kycMinWithdrawalTokens: { toNumber: () => 0 },
      testimonyTextRewardTokens: { toString: () => '0' },
      testimonyVideoRewardTokens: { toString: () => '0' },
    });

    const result = await service.getPublicClientSettings();
    expect(result.sessionIdleTimeoutMinutes).toBe(45);
    expect(result.sessionMaxHours).toBe(8);
  });

  it('update rejects sessionIdleTimeoutMinutes below 1', async () => {
    const { service } = setup({ sessionIdleTimeoutMinutes: 30, sessionMaxHours: 12 });
    await expect(service.update({ sessionIdleTimeoutMinutes: 0 })).rejects.toThrow(
      'sessionIdleTimeoutMinutes must be >= 1',
    );
  });

  it('update rejects sessionMaxHours below 1', async () => {
    const { service } = setup({ sessionIdleTimeoutMinutes: 30, sessionMaxHours: 12 });
    await expect(service.update({ sessionMaxHours: 0 })).rejects.toThrow(
      'sessionMaxHours must be >= 1',
    );
  });

  it('update persists a new idle timeout and max hours', async () => {
    const { service, prisma } = setup({ sessionIdleTimeoutMinutes: 30, sessionMaxHours: 12 });
    prisma.platformSettings.upsert.mockResolvedValue({
      id: 'default',
      sessionIdleTimeoutMinutes: 15,
      sessionMaxHours: 8,
      minWalletBalanceTokens: { toString: () => '0' },
      minScoreRange: { toString: () => '0' },
      maxScoreRange: { toString: () => '100' },
      manualPhoneVerificationFeeTokens: { toString: () => '0' },
      testimonyTextRewardTokens: { toString: () => '0' },
      testimonyVideoRewardTokens: { toString: () => '0' },
      qualityWeightConsensus: { toString: () => '60' },
      qualityWeightNoise: { toString: () => '15' },
      qualityWeightQuality: { toString: () => '10' },
      qualityWeightLiveness: { toString: () => '15' },
      qualityWeightAsrMatch: { toString: () => '0' },
      kycMinWithdrawalTokens: { toString: () => '0' },
      withdrawalFeePercent: { toString: () => '0' },
      withdrawalFeeTokenAmount: { toString: () => '0' },
      validationRewardPerRecording: { toString: () => '0' },
    });

    await expect(
      service.update({ sessionIdleTimeoutMinutes: 15, sessionMaxHours: 8 }),
    ).resolves.toMatchObject({ sessionIdleTimeoutMinutes: 15, sessionMaxHours: 8 });
  });
});
