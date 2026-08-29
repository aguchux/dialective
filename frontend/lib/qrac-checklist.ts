/**
 * Mirrors services/api/src/words/qrac.util.ts's QRAC_CHECKLIST verbatim so
 * the rendered form and the backend's qracChecklist response never drift.
 */
export const QRAC_CHECKLIST = [
  'I ensure there is no background noise when recording translations in my dialect.',
  'I speak clearly and audibly into my microphone.',
  'I stay within the given timeframe and stop the recording when I am done speaking.',
  'I have completed all the required courses for this platform.',
  'I am the only speaker in every recording I submit.',
  'I am recording from a quiet, private location free of interruptions.',
  'I understand my submissions are reviewed for quality and inaccurate affirmations may affect my account.',
] as const;
