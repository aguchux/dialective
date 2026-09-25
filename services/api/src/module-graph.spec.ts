import { SettingsModule } from './settings/settings.module';
import { TrainingEconomyModule } from './training-economy/training-economy.module';
import { MailModule } from './mail/mail.module';
import { SmsModule } from './sms/sms.module';
import { OtpModule } from './otp/otp.module';

/**
 * Guards the import direction into the @Global SettingsModule.
 *
 * Every other spec in this repo builds a controller or service directly with
 * hand-made mocks, so none of them exercises Nest's dependency scan. A
 * circular import is invisible to all of them: the API typechecks, builds,
 * passes the whole suite, and then crash-loops on boot with "the module at
 * index [0] of the MailModule imports array is undefined".
 *
 * That is exactly what happened when OtpModule was added to SettingsModule,
 * closing Settings -> Otp -> Mail -> Settings. Production caught it, tests
 * did not.
 *
 * Compiling the real graph would be the thorough check, but importing
 * AppModule drags in ESM-only dependencies Jest is not configured to
 * transform. So this asserts the one invariant that actually broke:
 * SettingsModule is @Global and must stay a SINK. Anything it imports must
 * not, directly or transitively, import it back.
 */
function importsOf(moduleClass: unknown): unknown[] {
  return (Reflect.getMetadata('imports', moduleClass as object) as unknown[]) ?? [];
}

describe('module graph', () => {
  it('keeps SettingsModule free of anything that imports it back', () => {
    // The three that do import SettingsModule today. If SettingsModule ever
    // imports one of these -- or a module that reaches one -- the API will
    // not boot.
    const importsSettingsBack = [MailModule, SmsModule, OtpModule];
    const settingsImports = importsOf(SettingsModule);

    for (const offender of importsSettingsBack) {
      expect(settingsImports).not.toContain(offender);
    }
  });

  it('holds the OTP dependency in a leaf module instead', () => {
    // Where OtpModule legitimately lives for the training-economy step-up:
    // downstream of SettingsModule, never upstream of it.
    expect(importsOf(TrainingEconomyModule)).toContain(OtpModule);
    expect(importsOf(TrainingEconomyModule)).not.toContain(SettingsModule);
  });

  it('confirms MailModule really does import SettingsModule', () => {
    // The premise of the first test. If this ever stops being true the guard
    // above is checking nothing, and should be revisited rather than left
    // quietly passing.
    expect(importsOf(MailModule)).toContain(SettingsModule);
  });
});
