'use client';

import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  useGetAdminCommunitySettingsQuery,
  useUpdateAdminCommunitySettingsMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function CommunitySettingsPanel() {
  const { data: settings, isLoading } = useGetAdminCommunitySettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateAdminCommunitySettingsMutation();

  const [postingEnabled, setPostingEnabled] = useState(true);
  const [repliesEnabled, setRepliesEnabled] = useState(true);
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [newMemberPostingDelayMinutes, setNewMemberPostingDelayMinutes] = useState('0');
  const [requireApprovalForNewMembers, setRequireApprovalForNewMembers] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPostingEnabled(settings.postingEnabled);
    setRepliesEnabled(settings.repliesEnabled);
    setAttachmentsEnabled(settings.attachmentsEnabled);
    setReactionsEnabled(settings.reactionsEnabled);
    setNewMemberPostingDelayMinutes(String(settings.newMemberPostingDelayMinutes));
    setRequireApprovalForNewMembers(settings.requireApprovalForNewMembers);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const delayMinutes = Number(newMemberPostingDelayMinutes);
    if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080) {
      setError(
        'New-member posting delay must be a whole number between 0 and 10,080 minutes (7 days).',
      );
      return;
    }
    try {
      await updateSettings({
        postingEnabled,
        repliesEnabled,
        attachmentsEnabled,
        reactionsEnabled,
        newMemberPostingDelayMinutes: delayMinutes,
        requireApprovalForNewMembers,
      }).unwrap();
      setMessage('Community settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Community settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Community</h2>
        <p className="leading-relaxed text-muted">
          Gates that control what members can do in community.dialectlibrary.com. Disabling any of
          these does not affect existing content -- only new activity of that kind.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="community-posting-enabled"
            >
              <input
                checked={postingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="community-posting-enabled"
                onChange={(event) => setPostingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Posting enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Members can start new discussions. Turning this off does not hide existing posts.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="community-replies-enabled"
            >
              <input
                checked={repliesEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="community-replies-enabled"
                onChange={(event) => setRepliesEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Replies enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Members can reply to existing discussions.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="community-attachments-enabled"
            >
              <input
                checked={attachmentsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="community-attachments-enabled"
                onChange={(event) => setAttachmentsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Attachments enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Members can attach images, audio, or documents to posts and replies.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="community-reactions-enabled"
            >
              <input
                checked={reactionsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="community-reactions-enabled"
                onChange={(event) => setReactionsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Reactions enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Members can like posts and replies. Unliking is never blocked.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="community-require-approval"
            >
              <input
                checked={requireApprovalForNewMembers}
                className="mt-0.5 size-5 accent-accent"
                id="community-require-approval"
                onChange={(event) => setRequireApprovalForNewMembers(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Require moderator approval for new members</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  For now this simply blocks a new member's post attempt with a message asking them
                  to wait for approval -- there is no moderation queue to approve them from yet.
                </span>
              </span>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-bold" htmlFor="community-new-member-delay">
            New-member posting delay (minutes)
            <input
              className={inputClass}
              id="community-new-member-delay"
              max={10080}
              min={0}
              onChange={(event) => setNewMemberPostingDelayMinutes(event.target.value)}
              type="number"
              value={newMemberPostingDelayMinutes}
            />
            <span className="text-sm font-normal text-muted">
              A brand-new member cannot post until this many minutes after their Community profile
              was created. 0 means no delay.
            </span>
          </label>

          {message && <p className="font-bold text-emerald-700 dark:text-emerald-400">{message}</p>}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save changes
            </ActionButton>
          </div>
        </form>
      )}
    </section>
  );
}
