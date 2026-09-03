/**
 * A hold is active once auditHoldAt is set and stays active until released
 * AFTER it was set -- an older release doesn't clear a newer hold. Shared
 * between AuthService.toPublicUser (display) and WordsService (gate + set)
 * so both agree on the exact same definition of "currently on hold".
 */
export function isOnAuditHold(user: {
  auditHoldAt: Date | null;
  auditHoldReleasedAt: Date | null;
}): boolean {
  if (!user.auditHoldAt) return false;
  if (!user.auditHoldReleasedAt) return true;
  return user.auditHoldReleasedAt.getTime() < user.auditHoldAt.getTime();
}

export const AUDIT_HOLD_MESSAGE =
  'Your account is temporarily on hold for a routine review. You will be able to resume training once the review is complete.';
