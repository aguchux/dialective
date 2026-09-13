import { PlatformSettingsService } from './platform-settings.service';
import { encryptWhatsappField } from '../common/whatsapp-crypto.util';

beforeAll(() => {
  process.env.WHATSAPP_SETTINGS_ENCRYPTION_KEY ??= 'test-only-passphrase-not-used-in-prod';
});

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

describe('PlatformSettingsService.getWhatsappConfig', () => {
  it('returns null when whatsappOtpEnabled is false, even if every other field is set', async () => {
    const encrypted = encryptWhatsappField('test-api-key');
    const { service } = setup({
      whatsappOtpEnabled: false,
      whatsappSenderId: '15550001234',
      whatsappTemplateId: 'otp_code',
      whatsappApiKeyEncrypted: encrypted.encryptedValue,
      whatsappApiKeyIv: encrypted.iv,
      whatsappApiKeyAuthTag: encrypted.authTag,
    });

    await expect(service.getWhatsappConfig()).resolves.toBeNull();
  });

  it('returns null when enabled but the sender id is missing', async () => {
    const encrypted = encryptWhatsappField('test-api-key');
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappSenderId: null,
      whatsappTemplateId: 'otp_code',
      whatsappApiKeyEncrypted: encrypted.encryptedValue,
      whatsappApiKeyIv: encrypted.iv,
      whatsappApiKeyAuthTag: encrypted.authTag,
    });

    await expect(service.getWhatsappConfig()).resolves.toBeNull();
  });

  it('returns null when enabled but no API key has ever been saved', async () => {
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappSenderId: '15550001234',
      whatsappTemplateId: 'otp_code',
      whatsappApiKeyEncrypted: null,
      whatsappApiKeyIv: null,
      whatsappApiKeyAuthTag: null,
    });

    await expect(service.getWhatsappConfig()).resolves.toBeNull();
  });

  it('decrypts and returns the full config when enabled and fully configured', async () => {
    const encrypted = encryptWhatsappField('test-api-key');
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappSenderId: '15550001234',
      whatsappTemplateId: 'otp_code',
      whatsappApiKeyEncrypted: encrypted.encryptedValue,
      whatsappApiKeyIv: encrypted.iv,
      whatsappApiKeyAuthTag: encrypted.authTag,
    });

    await expect(service.getWhatsappConfig()).resolves.toEqual({
      provider: 'mailersend',
      apiKey: 'test-api-key',
      senderId: '15550001234',
      templateId: 'otp_code',
    });
  });
});

describe('PlatformSettingsService.getWhatsappConfig (meta_direct)', () => {
  it('returns null when the active provider is meta_direct but the access token is missing', async () => {
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappProvider: 'meta_direct',
      whatsappMetaPhoneNumberId: '123456789',
      whatsappMetaTemplateName: 'otp_code',
      whatsappMetaTemplateLanguage: 'en_US',
      whatsappMetaAccessTokenEncrypted: null,
      whatsappMetaAccessTokenIv: null,
      whatsappMetaAccessTokenAuthTag: null,
    });

    await expect(service.getWhatsappConfig()).resolves.toBeNull();
  });

  it('returns null when the active provider is meta_direct but the phone number id is missing', async () => {
    const encrypted = encryptWhatsappField('meta-access-token');
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappProvider: 'meta_direct',
      whatsappMetaPhoneNumberId: null,
      whatsappMetaTemplateName: 'otp_code',
      whatsappMetaTemplateLanguage: 'en_US',
      whatsappMetaAccessTokenEncrypted: encrypted.encryptedValue,
      whatsappMetaAccessTokenIv: encrypted.iv,
      whatsappMetaAccessTokenAuthTag: encrypted.authTag,
    });

    await expect(service.getWhatsappConfig()).resolves.toBeNull();
  });

  it('decrypts and returns the Meta direct config when enabled and fully configured, ignoring MailerSend fields', async () => {
    const encrypted = encryptWhatsappField('meta-access-token');
    const { service } = setup({
      whatsappOtpEnabled: true,
      whatsappProvider: 'meta_direct',
      whatsappSenderId: null,
      whatsappTemplateId: null,
      whatsappApiKeyEncrypted: null,
      whatsappMetaPhoneNumberId: '123456789',
      whatsappMetaTemplateName: 'otp_code',
      whatsappMetaTemplateLanguage: 'en_US',
      whatsappMetaAccessTokenEncrypted: encrypted.encryptedValue,
      whatsappMetaAccessTokenIv: encrypted.iv,
      whatsappMetaAccessTokenAuthTag: encrypted.authTag,
    });

    await expect(service.getWhatsappConfig()).resolves.toEqual({
      provider: 'meta_direct',
      accessToken: 'meta-access-token',
      phoneNumberId: '123456789',
      templateName: 'otp_code',
      templateLanguage: 'en_US',
    });
  });
});

describe('PlatformSettingsService.update WhatsApp API key handling', () => {
  // update()'s return path needs a fully-shaped row (every Decimal-like
  // field calling .toString()); these tests only care about what gets
  // written, so upsert rejects to short-circuit before that return
  // construction runs, and each assertion happens on the call args captured
  // before the (expected, ignored) rejection.
  function setupWriteOnly() {
    const prisma = {
      platformSettings: {
        upsert: jest.fn().mockRejectedValue(new Error('stop before return construction')),
      },
    };
    const service = new PlatformSettingsService(prisma as never);
    return { service, prisma };
  }

  it('encrypts a plaintext whatsappApiKey before persisting and never writes the plaintext field', async () => {
    const { service, prisma } = setupWriteOnly();

    await service.update({ whatsappApiKey: 'my-new-key' }).catch(() => {});

    const writeCall = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(writeCall.update.whatsappApiKey).toBeUndefined();
    expect(writeCall.update.whatsappApiKeyEncrypted).toEqual(expect.any(String));
    expect(writeCall.update.whatsappApiKeyIv).toEqual(expect.any(String));
    expect(writeCall.update.whatsappApiKeyAuthTag).toEqual(expect.any(String));
  });

  it('clears the stored key when whatsappApiKey is the empty string', async () => {
    const { service, prisma } = setupWriteOnly();

    await service.update({ whatsappApiKey: '' }).catch(() => {});

    const writeCall = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(writeCall.update.whatsappApiKeyEncrypted).toBeNull();
    expect(writeCall.update.whatsappApiKeyIv).toBeNull();
    expect(writeCall.update.whatsappApiKeyAuthTag).toBeNull();
  });

  it('leaves the stored key untouched when whatsappApiKey is omitted', async () => {
    const { service, prisma } = setupWriteOnly();

    await service.update({ whatsappSenderId: '15550001234' }).catch(() => {});

    const writeCall = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(writeCall.update.whatsappApiKeyEncrypted).toBeUndefined();
    expect(writeCall.update.whatsappApiKeyIv).toBeUndefined();
    expect(writeCall.update.whatsappApiKeyAuthTag).toBeUndefined();
  });

  it('encrypts a plaintext whatsappMetaAccessToken before persisting and never writes the plaintext field', async () => {
    const { service, prisma } = setupWriteOnly();

    await service.update({ whatsappMetaAccessToken: 'meta-token' }).catch(() => {});

    const writeCall = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(writeCall.update.whatsappMetaAccessToken).toBeUndefined();
    expect(writeCall.update.whatsappMetaAccessTokenEncrypted).toEqual(expect.any(String));
    expect(writeCall.update.whatsappMetaAccessTokenIv).toEqual(expect.any(String));
    expect(writeCall.update.whatsappMetaAccessTokenAuthTag).toEqual(expect.any(String));
  });

  it('clears the stored Meta access token when whatsappMetaAccessToken is the empty string', async () => {
    const { service, prisma } = setupWriteOnly();

    await service.update({ whatsappMetaAccessToken: '' }).catch(() => {});

    const writeCall = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(writeCall.update.whatsappMetaAccessTokenEncrypted).toBeNull();
    expect(writeCall.update.whatsappMetaAccessTokenIv).toBeNull();
    expect(writeCall.update.whatsappMetaAccessTokenAuthTag).toBeNull();
  });

  it('rejects an otpChannel value other than "sms" or "whatsapp"', async () => {
    const { service } = setup({});

    await expect(service.update({ otpChannel: 'carrier-pigeon' })).rejects.toThrow(
      'otpChannel must be "sms" or "whatsapp"',
    );
  });

  it('rejects a whatsappProvider value other than "mailersend" or "meta_direct"', async () => {
    const { service } = setup({});

    await expect(service.update({ whatsappProvider: 'twilio' })).rejects.toThrow(
      'whatsappProvider must be "mailersend" or "meta_direct"',
    );
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

  it('returns the L1/L2/L3 approval bonus percents and reassignment penalty percent as numbers', async () => {
    const { service } = setup({
      validatorL1ApprovalBonusPercent: { toNumber: () => 5 },
      validatorL2ApprovalBonusPercent: { toNumber: () => 10 },
      validatorL3ApprovalBonusPercent: { toNumber: () => 15 },
      validatorReassignmentPenaltyPercent: { toNumber: () => 0 },
    });

    await expect(service.getValidatorL1ApprovalBonusPercent()).resolves.toBe(5);
    await expect(service.getValidatorL2ApprovalBonusPercent()).resolves.toBe(10);
    await expect(service.getValidatorL3ApprovalBonusPercent()).resolves.toBe(15);
    await expect(service.getValidatorReassignmentPenaltyPercent()).resolves.toBe(0);
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
      validatorL1ApprovalBonusPercent: { toString: () => '5' },
      validatorL2ApprovalBonusPercent: { toString: () => '10' },
      validatorL3ApprovalBonusPercent: { toString: () => '15' },
      validatorReassignmentPenaltyPercent: { toString: () => '0' },
      domainConversationQualityWeightNoise: { toString: () => '40' },
      domainConversationQualityWeightQuality: { toString: () => '30' },
      domainConversationQualityWeightLiveness: { toString: () => '30' },
      domainConversationMinQualityScoreForPayout: { toString: () => '50' },
      domainConversationTaskTokenCost: null,
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
      validatorL1ApprovalBonusPercent: { toString: () => '5' },
      validatorL2ApprovalBonusPercent: { toString: () => '10' },
      validatorL3ApprovalBonusPercent: { toString: () => '15' },
      validatorReassignmentPenaltyPercent: { toString: () => '0' },
      domainConversationQualityWeightNoise: { toString: () => '40' },
      domainConversationQualityWeightQuality: { toString: () => '30' },
      domainConversationQualityWeightLiveness: { toString: () => '30' },
      domainConversationMinQualityScoreForPayout: { toString: () => '50' },
      domainConversationTaskTokenCost: null,
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

  it('getPublicClientSettings surfaces domainConversationTaskEnabled so the trainer dashboard can show/hide the task card', async () => {
    const { service } = setup({
      domainConversationTaskEnabled: true,
      manualPhoneVerificationFeeTokens: { toNumber: () => 0 },
      supportChatMode: 'TAWK',
      kycMinWithdrawalTokens: { toNumber: () => 0 },
      testimonyTextRewardTokens: { toString: () => '0' },
      testimonyVideoRewardTokens: { toString: () => '0' },
    });

    const result = await service.getPublicClientSettings();
    expect(result.domainConversationTaskEnabled).toBe(true);
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
      validatorL1ApprovalBonusPercent: { toString: () => '5' },
      validatorL2ApprovalBonusPercent: { toString: () => '10' },
      validatorL3ApprovalBonusPercent: { toString: () => '15' },
      validatorReassignmentPenaltyPercent: { toString: () => '0' },
      domainConversationQualityWeightNoise: { toString: () => '40' },
      domainConversationQualityWeightQuality: { toString: () => '30' },
      domainConversationQualityWeightLiveness: { toString: () => '30' },
      domainConversationMinQualityScoreForPayout: { toString: () => '50' },
      domainConversationTaskTokenCost: null,
    });

    await expect(
      service.update({ sessionIdleTimeoutMinutes: 15, sessionMaxHours: 8 }),
    ).resolves.toMatchObject({ sessionIdleTimeoutMinutes: 15, sessionMaxHours: 8 });
  });
});

describe('PlatformSettingsService Domain Conversation settings', () => {
  it('getDomainConversationMinDurationSeconds/MaxDurationSeconds reflect the row, falling back to defaults when null', async () => {
    const { service } = setup({
      domainConversationMinDurationSeconds: null,
      domainConversationMaxDurationSeconds: null,
    });
    await expect(service.getDomainConversationMinDurationSeconds()).resolves.toBe(15);
    await expect(service.getDomainConversationMaxDurationSeconds()).resolves.toBe(60);
  });

  it('getDomainConversationMinDurationSeconds/MaxDurationSeconds reflect an admin override', async () => {
    const { service } = setup({
      domainConversationMinDurationSeconds: 20,
      domainConversationMaxDurationSeconds: 90,
    });
    await expect(service.getDomainConversationMinDurationSeconds()).resolves.toBe(20);
    await expect(service.getDomainConversationMaxDurationSeconds()).resolves.toBe(90);
  });

  it('getDomainConversationQualityWeights returns the three weights as numbers', async () => {
    const { service } = setup({
      domainConversationQualityWeightNoise: { toNumber: () => 40 },
      domainConversationQualityWeightQuality: { toNumber: () => 30 },
      domainConversationQualityWeightLiveness: { toNumber: () => 30 },
    });
    await expect(service.getDomainConversationQualityWeights()).resolves.toEqual({
      noise: 40,
      quality: 30,
      liveness: 30,
    });
  });

  it('update rejects domainConversationMinDurationSeconds >= domainConversationMaxDurationSeconds', async () => {
    const { service } = setup({
      domainConversationMinDurationSeconds: 15,
      domainConversationMaxDurationSeconds: 60,
    });
    await expect(
      service.update({ domainConversationMinDurationSeconds: 60, domainConversationMaxDurationSeconds: 60 }),
    ).rejects.toThrow(
      'domainConversationMinDurationSeconds must be less than domainConversationMaxDurationSeconds',
    );
  });

  it('update rejects a domainConversationQualityWeight* trio that does not sum to 100', async () => {
    const { service } = setup({});
    await expect(
      service.update({
        domainConversationQualityWeightNoise: 40,
        domainConversationQualityWeightQuality: 40,
        domainConversationQualityWeightLiveness: 40,
      }),
    ).rejects.toThrow(
      'domainConversationQualityWeightNoise/Quality/Liveness must sum to 100',
    );
  });

  it('update rejects an invalid domainConversationProviderOrder', async () => {
    const { service } = setup({});
    await expect(
      service.update({ domainConversationProviderOrder: 'openai,openai,anthropic' }),
    ).rejects.toThrow(
      'domainConversationProviderOrder must list openai, deepseek, and anthropic exactly once each',
    );
  });
});
