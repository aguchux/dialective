import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';

function setup(row: Record<string, unknown>) {
  const prisma = {
    platformSettings: {
      upsert: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
    },
  };
  const service = new PlatformSettingsService(prisma as never);
  return { service, prisma };
}

const baseRow = {
  id: 'default',
  tokenUsdRate: null,
  minWithdrawalTokens: null,
  resendFromAddress: null,
  leadsNotificationAddress: null,
  referralCookiePersistSeconds: null,
  referralInviteExpirySeconds: null,
  wordTrainingRecordingTimeoutSeconds: null,
  wordTrainingRecordingMaxTimeoutSeconds: null,
  trainingPayoutBonusCapMultiple: null,
  taskTokenCost: null,
  reverseWordTrainingEnabled: false,
  adminPayoutOtpEnabled: false,
  wordStuckTimeoutMinutes: 1440,
  scoringSlaMinutes: 60,
  noFailOnTrainEnabled: false,
  minScoreRange: { toString: () => '10', toNumber: () => 10 },
  maxScoreRange: { toString: () => '30', toNumber: () => 30 },
  llmGenerationEnabled: false,
  llmProviderOrder: 'openai,deepseek,anthropic',
  llmWordsPerItem: 1,
  llmItemsPerRun: 15,
  llmMaxTotalGeneratedItems: 5000,
  llmMaxPoolPerDialect: 50,
  llmBackfillItemsPerDialectPerRun: 10,
  qualityGateEnabled: false,
  qualityWeightConsensus: { toString: () => '60', toNumber: () => 60 },
  qualityWeightNoise: { toString: () => '15', toNumber: () => 15 },
  qualityWeightQuality: { toString: () => '10', toNumber: () => 10 },
  qualityWeightLiveness: { toString: () => '15', toNumber: () => 15 },
  spellingNormalizationEnabled: false,
  spellingNormalizationProviderOrder: 'openai,deepseek,anthropic',
  sentenceRebuildEnabled: false,
  smsProviderOrder: 'termii,twilio,africastalking',
  smslive247NativeOtpEnabled: false,
  smsTransactionalProviderOrder: 'termii,twilio,africastalking,smslive247',
  p2pSmsTradeCreatedEnabled: false,
  p2pSmsPaymentMarkedEnabled: false,
  p2pSmsTokensReleasedEnabled: false,
  p2pSmsCancelledEnabled: false,
  cryptoWithdrawalsEnabled: true,
  nowPaymentsPayoutsEnabled: false,
  allowedWithdrawalCurrencies: 'USDT',
  allowedWithdrawalNetworks: 'TRC20',
  withdrawalFeeMode: 'platform',
  withdrawalFeeTokenAmount: { toString: () => '0' },
  withdrawalFeePercent: { toString: () => '0' },
  autoSubmitAfterApproval: false,
  authMaintenanceEnabled: false,
  authMaintenanceUntil: null,
  authMaintenanceMessage: null,
  authMaintenanceBlockLogin: true,
  authMaintenanceBlockSignup: true,
  authMaintenanceBlockSessions: false,
  authMaintenanceExcludeAdmin: true,
  authMaintenanceExcludePartner: false,
  updatedAt: new Date(),
  createdAt: new Date(),
};

describe('PlatformSettingsService auth maintenance', () => {
  const disabledStatus = {
    enabled: false,
    until: null,
    message: null,
    blockLogin: false,
    blockSignup: false,
    blockSessions: false,
    excludeAdmin: true,
    excludePartner: false,
  };

  it('reports disabled when authMaintenanceEnabled is false', async () => {
    const { service } = setup({ ...baseRow });
    const status = await service.getAuthMaintenanceStatus();
    expect(status).toEqual(disabledStatus);
  });

  it('reports enabled with the scheduled end time and scope flags while still in the future', async () => {
    const until = new Date(Date.now() + 60_000);
    const { service, prisma } = setup({
      ...baseRow,
      authMaintenanceEnabled: true,
      authMaintenanceUntil: until,
      authMaintenanceMessage: 'Upgrading things',
      authMaintenanceBlockLogin: true,
      authMaintenanceBlockSignup: false,
      authMaintenanceBlockSessions: true,
      authMaintenanceExcludeAdmin: true,
      authMaintenanceExcludePartner: true,
    });
    const status = await service.getAuthMaintenanceStatus();
    expect(status).toEqual({
      enabled: true,
      until,
      message: 'Upgrading things',
      blockLogin: true,
      blockSignup: false,
      blockSessions: true,
      excludeAdmin: true,
      excludePartner: true,
    });
    expect(prisma.platformSettings.update).not.toHaveBeenCalled();
  });

  it('self-clears the flag in the DB once authMaintenanceUntil has elapsed', async () => {
    const until = new Date(Date.now() - 1000);
    const { service, prisma } = setup({
      ...baseRow,
      authMaintenanceEnabled: true,
      authMaintenanceUntil: until,
      authMaintenanceMessage: 'Upgrading things',
    });

    const status = await service.getAuthMaintenanceStatus();

    expect(status).toEqual(disabledStatus);
    expect(prisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'default' },
      data: { authMaintenanceEnabled: false, authMaintenanceUntil: null, authMaintenanceMessage: null },
    });
  });

  it('rejects enabling maintenance without a future authMaintenanceUntil', async () => {
    const { service } = setup({ ...baseRow });
    await expect(service.update({ authMaintenanceEnabled: true })).rejects.toThrow(BadRequestException);
    await expect(
      service.update({ authMaintenanceEnabled: true, authMaintenanceUntil: new Date(Date.now() - 1000) }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects enabling maintenance with all three block scopes off', async () => {
    const until = new Date(Date.now() + 60_000);
    const { service } = setup({ ...baseRow, authMaintenanceBlockLogin: false, authMaintenanceBlockSignup: false });
    await expect(
      service.update({
        authMaintenanceEnabled: true,
        authMaintenanceUntil: until,
        authMaintenanceBlockLogin: false,
        authMaintenanceBlockSignup: false,
        authMaintenanceBlockSessions: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts enabling maintenance with a future authMaintenanceUntil', async () => {
    const until = new Date(Date.now() + 60_000);
    const { service, prisma } = setup({ ...baseRow, authMaintenanceEnabled: true, authMaintenanceUntil: until });
    await service.update({ authMaintenanceEnabled: true, authMaintenanceUntil: until });
    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ authMaintenanceEnabled: true, authMaintenanceUntil: until }),
      }),
    );
  });

  it('allows turning maintenance off without requiring a timestamp', async () => {
    const { service, prisma } = setup({ ...baseRow });
    await service.update({ authMaintenanceEnabled: false, authMaintenanceUntil: null, authMaintenanceMessage: null });
    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ authMaintenanceEnabled: false, authMaintenanceUntil: null }),
      }),
    );
  });
});
