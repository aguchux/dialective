/**
 * "in 3 hours" / "in 25 minutes" -- how long until a rolling-window limit
 * clears, phrased for a trainer rather than as a timestamp.
 *
 * Shared by the daily cap's two enforcement points (the tasking gate in
 * WordsService and SubmissionDailyLimitGuard) so both phrase the wait
 * identically; a trainer who hits the gate and then retries the submit
 * endpoint should not be told two different things.
 */
export function formatResumeWindow(msUntilResume: number): string {
  const minutes = Math.ceil(msUntilResume / 60_000);
  if (minutes <= 1) return 'in a minute';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'in an hour' : `in ${hours} hours`;
}
