# QRAC: Quality Recordings Affirmation Check

## Purpose

QRAC means **Quality Recordings Affirmation Check**. It is the training-time
check-in that asks a trainer to confirm the recording conditions required for
useful dialect data before the platform gives them more work.

The objective is preventive quality control. QRAC reminds trainers to make a
clear, private, single-speaker recording before submitting voice data that may
be reviewed, scored, and used in the Dialect Library dataset workflow. It is
not itself a score, a payout decision, an identity-verification method, or a
replacement for the Voice Data Agreement accepted when a training session
starts.

## Trainer experience

When QRAC is due, the training dialog opens a blocking check-in. The trainer
must select every statement and choose **Confirm and continue**. The dialog
cannot be dismissed with the backdrop, Escape key, or a close button because
the trainer must either make the affirmation or explicitly end the session.

The trainer can select **End session instead** at any time. This ends the
active training session without giving the next assignment. They can return
later and start another session.

The QRAC checklist currently asks the trainer to confirm all of the following:

1. There is no background noise while recording translations in their dialect.
2. They speak clearly and audibly into the microphone.
3. They stay within the recording timeframe and stop when finished.
4. They have completed all required platform courses.
5. They are the only speaker in every submitted recording.
6. They are recording from a quiet, private place without interruption.
7. They understand that submissions are reviewed for quality and that an
   inaccurate affirmation may affect the account.

The trainer should not sign the checklist if any statement is untrue. They
should improve the recording conditions or end the session instead of trying
to work around the quality gate.

## Admin controls

QRAC is configured in **Admin > Settings > Voice Quality Gate**. The settings
are stored on the singleton `PlatformSettings` record and take effect on the
next attempt to load an assignment.

| Setting | Behaviour |
| --- | --- |
| `qracEnabled` | Master switch. When off, QRAC does not block any training assignment. |
| `qracRequiredAtSessionStart` | Selects session-start mode. When on with QRAC enabled, a trainer must sign QRAC before the first assignment in every new task session. |
| `qracIntervalMinutes` | Selects the periodic mode interval. It is used only when QRAC is enabled and session-start mode is off. |

### Modes

#### Disabled

Set `qracEnabled` to `false`. Trainers do not see QRAC and the interval is not
applied.

#### Required at every new task session

Set `qracEnabled` and `qracRequiredAtSessionStart` to `true`. After a trainer
accepts the Voice Data Agreement and starts a session, the first assignment is
held back until QRAC is signed. Once signed, that session can receive further
assignments without periodic QRAC interruptions.

This mode is appropriate when the platform wants a fresh quality affirmation
at the beginning of every training visit.

#### Periodic QRAC

Set `qracEnabled` to `true` and `qracRequiredAtSessionStart` to `false`.
QRAC is evaluated each time the trainer asks for the next assignment. It is due
when the configured interval has passed since the latest QRAC signing in that
session. If the trainer has never signed in that session, the interval is
measured from the session start time.

This is the default compatibility mode. Turning off **Require at every new
task session** returns the platform to this behaviour.

## Enforcement flow

QRAC is enforced by the API, not only by the browser UI:

1. The trainer starts a word-training session with
   `POST /api/v1/words/sessions` after accepting the Voice Data Agreement.
2. The browser asks for work through the next-assignment endpoint.
3. `WordsService.nextAssignment` checks that the session belongs to the
   trainer, is still open, is not on audit hold, and still meets required
   course conditions.
4. If QRAC is enabled, the API evaluates the selected QRAC mode before it
   creates a `WordTrainingAssignment`.
5. When due, the API returns a `403` response with `qracRequired: true` and
   the current checklist. No assignment is created or returned.
6. The frontend shows `QracDialog`. After every item is checked, it calls
   `POST /api/v1/words/sessions/:sessionId/qrac`.
7. On success, the frontend retries the same next-assignment request and
   training continues.

Because assignment creation happens after this check, a user cannot bypass
QRAC by calling the API directly or by hiding the dialog in the browser.

## Data recorded

Every successful affirmation creates an append-only
`QracAffirmationSubmission` record. The record contains:

| Field | Meaning |
| --- | --- |
| `userId` | Trainer who made the affirmation. |
| `sessionId` | Training session associated with the affirmation. |
| `signedAt` | Timestamp of the successful server-side signing. |
| `version` | Per-trainer sequential record version, such as `1.0`, `1.1`, then `2.0`. This identifies the signing sequence, not the checklist wording. |
| `checklistVersion` | Version of the checklist text that was affirmed. The current version is `v1`. |

The same transaction updates `TrainingSession.lastQracAt`. That timestamp is
used by periodic mode to determine when the trainer must re-affirm. A session
that has ended cannot receive a QRAC signing or another assignment.

QRAC submission records are append-only: later signings create new rows rather
than overwriting an earlier affirmation. This gives operations and audit tools
an attributable history of quality confirmations.

## Checklist versioning

The QRAC wording is intentionally fixed in code and mirrored between the API
and frontend. It is not an editable free-text admin setting. The canonical
source is:

- API: `services/api/src/words/qrac.util.ts`
- Frontend mirror: `frontend/lib/qrac-checklist.ts`

When the wording changes, increment `CHECKLIST_VERSION` before deployment.
Existing `QracAffirmationSubmission` records retain their previous
`checklistVersion`, so they remain attributable to the version the trainer
actually signed. Keep the API and frontend lists textually identical.

## Relationship to other controls

QRAC works alongside, rather than replaces, the following controls:

- **Voice Data Agreement:** accepted at session creation; records consent to
  the training-data terms.
- **Required courses:** checked at session start and again before every next
  assignment. A QRAC signing cannot bypass incomplete required courses.
- **Audit holds:** checked before assignments; QRAC cannot release an audit
  hold.
- **Recording limits and quality scoring:** recording duration, noise,
  liveness, transcription, consensus, and settlement are independent stages.
  Signing QRAC does not guarantee a score, payout, approval, or task quality.

## Operational guidance

- Use session-start mode when a visible fresh affirmation is needed for every
  task visit.
- Use periodic mode when long sessions need recurring reminders instead.
- Keep QRAC disabled only when another approved process provides the required
  quality check-in.
- Review QRAC history together with recordings and score/audit signals when
  investigating a quality issue; do not treat an affirmation alone as proof of
  recording quality.
- Change the checklist wording deliberately. It affects trainer-facing
  commitments and should be versioned, tested, and communicated before use.

## Implementation references

- `services/api/src/words/words.service.ts` - session creation, QRAC signing,
  and server-side next-assignment gate.
- `services/api/src/words/qrac.util.ts` - canonical checklist and versioning.
- `services/api/prisma/schema.prisma` - `TrainingSession`,
  `QracAffirmationSubmission`, and QRAC platform settings.
- `frontend/components/trainer/QracDialog.tsx` - non-dismissible trainer
  check-in dialog.
- `frontend/components/trainer/WordTrainingDialog.tsx` - session-start and
  periodic retry flow.
- `frontend/app/admin/settings/QualityGateSettingsPanel.tsx` - administrator
  controls.
