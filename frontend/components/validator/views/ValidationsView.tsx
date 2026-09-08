'use client';

import { useState } from 'react';
import { ClipboardCheck, Play } from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { TaskMode } from './TaskMode';

/**
 * The Validations tab's landing screen -- deliberately NOT the recording
 * catalogue itself. Per the Validation Workspace mobile spec's "Home /
 * Queue and Start Task" design, this is a lightweight on-ramp: a single
 * prominent Start Task action that launches the full-screen TaskMode
 * workspace (catalogue, mini-player, expanded player) as its own focused
 * mode, with the outer ValidatorHeader/ValidatorMobileNavigation visually
 * hidden for the duration -- see TaskMode.tsx for that overlay.
 */
export function ValidationsView() {
  const [isTaskActive, setIsTaskActive] = useState(false);

  if (isTaskActive) {
    return <TaskMode onEndTask={() => setIsTaskActive(false)} />;
  }

  return (
    <div className="grid gap-4">
      <div className={`${cardClass} grid gap-4 p-6 text-center`}>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent/10 text-accent">
          <ClipboardCheck className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-black">Ready to review recordings?</h2>
          <p className="mt-1 text-sm text-muted">
            Start a task to browse the recording pool, play audio, and add recordings to your
            decks.
          </p>
        </div>
        <button
          className="mx-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-extrabold text-white hover:bg-accent/90"
          onClick={() => setIsTaskActive(true)}
          type="button"
        >
          <Play className="size-4" aria-hidden="true" />
          Start Task
        </button>
      </div>
    </div>
  );
}
