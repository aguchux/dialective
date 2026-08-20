/**
 * Word count for a Prompt's text -- shared by SubmissionsController and
 * PromptsController so the dictation recording countdown/duration gate is
 * computed identically wherever it's needed, never duplicated inline.
 * Mirrors WordTrainingDialog.tsx's countPromptWords on the frontend.
 */
export function countPromptWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, words.length);
}
