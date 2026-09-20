'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, ImageUp } from 'lucide-react';

type Target = {
  name: string;
  topic: string | null;
  expiresAt: string;
  currentPhotoUrl: string | null;
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Where a 48-hour speaker photo link lands.
 *
 * The link token is the only credential -- there is no account to log in
 * to, because a speaker may not be a Dialect Library member at all. The
 * token is exchanged server-side for a short-lived presigned PUT, so the
 * long-lived thing in the speaker's inbox is never itself an upload
 * credential.
 */
function PhotoUpload() {
  const token = useSearchParams().get('token') ?? '';
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its code. Please use the link from your email.');
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`/api/photo?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        if (!response.ok) {
          setLoadError(data.message ?? 'This link is no longer valid.');
          return;
        }
        setTarget(data as Target);
      } catch {
        setLoadError('We could not check this link. Please try again shortly.');
      }
    })();
  }, [token]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const signResponse = await fetch(`/api/photo?token=${encodeURIComponent(token)}&step=sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type }),
      });
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed.message ?? 'Could not start the upload.');

      // Straight to object storage -- the image never passes through our
      // servers, same as every other upload in this platform.
      const put = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-amz-acl': 'public-read' },
        body: file,
      });
      if (!put.ok) throw new Error('The upload did not complete. Please try again.');

      const completeResponse = await fetch(
        `/api/photo?token=${encodeURIComponent(token)}&step=complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: signed.key }),
        },
      );
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.message ?? 'Could not save your photo.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function pick(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(selected.type)) {
      setError('Please choose a JPEG, PNG or WebP image.');
      setFile(null);
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError('That image is larger than 6MB. Please choose a smaller one.');
      setFile(null);
      return;
    }
    setFile(selected);
  }

  if (loadError) {
    return (
      <main className="photo-page">
        <div className="photo-card">
          <h1>This link has expired</h1>
          <p className="photo-body">{loadError}</p>
          <p className="photo-body">
            Email <a href="mailto:hello@dialectlibrary.com">hello@dialectlibrary.com</a> and we will
            send you a new one.
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="photo-page">
        <div className="photo-card">
          <div className="photo-success">
            <BadgeCheck size={38} />
          </div>
          <h1>Photo received</h1>
          <p className="photo-body">
            Thank you. Your photo will appear alongside your talk on the Connect 2026 page.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="photo-page">
      <div className="photo-card">
        <span className="photo-kicker">Dialect Library Connect 2026</span>
        <h1>Add your speaker photo</h1>
        {target ? (
          <>
            <p className="photo-body">
              Hi {target.name}
              {target.topic ? (
                <>
                  , your talk: <strong>{target.topic}</strong>
                </>
              ) : null}
              .
            </p>
            {target.currentPhotoUrl ? (
              <p className="photo-note">
                You already uploaded a photo. Choosing a new one replaces it.
              </p>
            ) : null}

            <label className="photo-drop">
              <ImageUp size={26} />
              <span>{file ? file.name : 'Choose a photo (JPEG, PNG or WebP, up to 6MB)'}</span>
              <input
                accept={ACCEPTED.join(',')}
                onChange={(event) => pick(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>

            {error ? <p className="photo-error">{error}</p> : null}

            <button disabled={!file || busy} onClick={() => void upload()} type="button">
              {busy ? 'Uploading…' : 'Upload photo'}
            </button>

            <p className="photo-note">
              This link works until{' '}
              <strong>{new Date(target.expiresAt).toLocaleString()}</strong>.
            </p>
          </>
        ) : (
          <p className="photo-body">Checking your link…</p>
        )}
      </div>
    </main>
  );
}

export default function PhotoPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<main className="photo-page" />}>
      <PhotoUpload />
    </Suspense>
  );
}
