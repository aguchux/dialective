'use client';

import { FormEvent, useState } from 'react';
import { useSubmitValidationMutation, type ValidationDimensions } from '@/store/api';
import { Card, ErrorText, FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '@/components/ui';

const DIMENSIONS: { key: keyof Omit<ValidationDimensions, 'overallScore' | 'notes'>; label: string }[] = [
  { key: 'transcriptAccuracy', label: 'Transcript accuracy' },
  { key: 'pronunciationAccuracy', label: 'Pronunciation accuracy' },
  { key: 'dialectAuthenticity', label: 'Dialect authenticity' },
  { key: 'speechClarity', label: 'Speech clarity' },
  { key: 'audioQuality', label: 'Audio quality' },
];

export function ValidationForm({
  recordingId,
  onClose,
}: {
  recordingId: string;
  onClose: () => void;
}) {
  const [submit, { isLoading }] = useSubmitValidationMutation();
  const [scores, setScores] = useState<Record<string, string>>({
    transcriptAccuracy: '90',
    pronunciationAccuracy: '90',
    dialectAuthenticity: '90',
    speechClarity: '90',
    audioQuality: '90',
    overallScore: '90',
  });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await submit({
        recordingId,
        dto: {
          transcriptAccuracy: Number(scores.transcriptAccuracy),
          pronunciationAccuracy: Number(scores.pronunciationAccuracy),
          dialectAuthenticity: Number(scores.dialectAuthenticity),
          speechClarity: Number(scores.speechClarity),
          audioQuality: Number(scores.audioQuality),
          overallScore: Number(scores.overallScore),
          notes: notes.trim() || undefined,
        },
      }).unwrap();
      onClose();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to submit this validation.');
    }
  }

  return (
    <Card className="mt-3 p-4">
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {DIMENSIONS.map((dim) => (
            <div key={dim.key}>
              <FieldLabel>{dim.label}</FieldLabel>
              <TextInput
                max={100}
                min={0}
                onChange={(e) => setScores((prev) => ({ ...prev, [dim.key]: e.target.value }))}
                type="number"
                value={scores[dim.key]}
              />
            </div>
          ))}
          <div>
            <FieldLabel>Overall score</FieldLabel>
            <TextInput
              max={100}
              min={0}
              onChange={(e) => setScores((prev) => ({ ...prev, overallScore: e.target.value }))}
              type="number"
              value={scores.overallScore}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Notes (private to your organization)</FieldLabel>
          <TextInput onChange={(e) => setNotes(e.target.value)} value={notes} />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Submitting...' : 'Submit validation'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose} type="button">
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </Card>
  );
}
