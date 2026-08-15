import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown by AuthService.assertNotInAuthMaintenance for every new sign-in/
 * sign-up attempt while an admin has scheduled maintenance. 503 (not 403) --
 * this is "temporarily unavailable," not "you're not allowed." authUntil is
 * forwarded through HttpExceptionFilter's extra-fields passthrough so the
 * frontend can render a countdown without a second request.
 */
export class AuthMaintenanceException extends HttpException {
  constructor(authMaintenanceUntil: Date, authMaintenanceMessage: string | null) {
    super(
      {
        message: 'Login and signup are temporarily unavailable for scheduled maintenance.',
        error: 'AuthMaintenance',
        authMaintenanceUntil: authMaintenanceUntil.toISOString(),
        authMaintenanceMessage,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
