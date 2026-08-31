'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminFaq,
  normalizeErrorMessage,
  useCreateFaqMutation,
  useUpdateFaqMutation,
} from '@/store/api';

const inputClass =
  'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function FaqEditorDialog({
  open,
  onOpenChange,
  faq,
  initialQuestion,
  sourceMessageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faq?: AdminFaq | null;
  /** A question sourced from an AI conversation is protected until the admin explicitly edits it. */
  initialQuestion?: string;
  /** The AI-conversation message this FAQ is being created from, if any. */
  sourceMessageId?: string;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionEditable, setQuestionEditable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createFaq, { isLoading: isCreating }] = useCreateFaqMutation();
  const [updateFaq, { isLoading: isUpdating }] = useUpdateFaqMutation();
  const isEditing = Boolean(faq);
  const isSaving = isCreating || isUpdating;

  useEffect(() => {
    if (!open) return;
    setQuestion(faq?.question ?? initialQuestion ?? '');
    setAnswer(faq?.answer ?? '');
    setQuestionEditable(Boolean(faq) || !initialQuestion);
    setError(null);
  }, [faq, initialQuestion, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (question.trim().length < 8 || answer.trim().length < 8) {
      setError('Enter a clear question and answer of at least 8 characters each.');
      return;
    }
    try {
      if (faq) {
        await updateFaq({
          id: faq.id,
          body: { question: question.trim(), answer: answer.trim() },
        }).unwrap();
      } else {
        await createFaq({
          question: question.trim(),
          answer: answer.trim(),
          sourceMessageId,
        }).unwrap();
      }
      onOpenChange(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this FAQ.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isEditing ? 'Edit FAQ' : initialQuestion ? initialQuestion : 'Create FAQ'}
        description={
          initialQuestion
            ? 'Turn this user question into a reviewed, public FAQ.'
            : 'Published FAQs are available publicly and help the AI assistant answer common questions.'
        }
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-bold" htmlFor="faq-question">
                Question
              </label>
              {!questionEditable && (
                <button
                  className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:text-accent-dark"
                  onClick={() => setQuestionEditable(true)}
                  type="button"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit question
                </button>
              )}
            </div>
            <textarea
              className={`${inputClass} min-h-24 resize-y font-semibold`}
              disabled={!questionEditable}
              id="faq-question"
              maxLength={240}
              onChange={(event) => setQuestion(event.target.value)}
              value={question}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-bold" htmlFor="faq-answer">
              Answer
            </label>
            <textarea
              className={`${inputClass} min-h-36 resize-y leading-relaxed`}
              id="faq-answer"
              maxLength={4000}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Write the approved, trainer-facing answer."
              value={answer}
            />
          </div>

          {error && (
            <p className="text-sm font-bold leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink hover:bg-surface-muted"
                type="button"
              >
                Cancel
              </button>
            </DialogClose>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel={isEditing ? 'Saving' : 'Publishing'}
              type="submit"
            >
              {isEditing ? 'Save changes' : 'Publish FAQ'}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
