/**
 * Hardcoded QRAC ("Quality Recordings Affirmation Check") checklist --
 * shared verbatim with the frontend copy (frontend/lib/qrac-checklist.ts)
 * so the backend's qracChecklist response and the client's rendered form
 * never drift. Not admin-editable; bump CHECKLIST_VERSION if this wording
 * ever changes so existing QracAffirmationSubmission rows stay attributable
 * to the version they actually agreed to.
 */
export const CHECKLIST_VERSION = 'v1';

export const QRAC_CHECKLIST: readonly string[] = [
  'I ensure there is no background noise when recording translations in my dialect.',
  'I speak clearly and audibly into my microphone.',
  'I stay within the given timeframe and stop the recording when I am done speaking.',
  'I have completed all the required courses for this platform.',
  'I am the only speaker in every recording I submit.',
  'I am recording from a quiet, private location free of interruptions.',
  'I understand my submissions are reviewed for quality and inaccurate affirmations may affect my account.',
];

/**
 * Per-user sequential "major.minor" counter -- unrelated to
 * CHECKLIST_VERSION/checklist content. A user's 1st signing is "1.0", 10th
 * is "1.9", 11th rolls over to "2.0". Pass the user's most recent
 * QracAffirmationSubmission.version (or null if they've never signed).
 */
export function nextQracVersion(previousVersion: string | null): string {
  if (!previousVersion) return '1.0';
  const [majorStr, minorStr] = previousVersion.split('.');
  const major = Number(majorStr);
  const minor = Number(minorStr);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return '1.0';
  return minor >= 9 ? `${major + 1}.0` : `${major}.${minor + 1}`;
}
