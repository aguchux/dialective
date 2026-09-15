import { SecondaryButton } from './ui';

/** Google/GitHub OAuth is not yet wired up server-side (no registered OAuth app credentials for either provider) -- shown disabled so the login/register shell matches the target design, without offering a dead end. */
export function SocialAuthButtons() {
  const className =
    'w-full min-w-0 min-h-[46px] rounded-[7px] border-catalogue-line bg-catalogue-bg text-[15px] font-medium text-catalogue-ink disabled:cursor-not-allowed disabled:opacity-100 hover:bg-catalogue-surface-hover';

  return (
    <div className="grid min-w-0 gap-2">
      <SecondaryButton
        aria-describedby="social-auth-note"
        className={className}
        disabled
        title="Coming soon"
        type="button"
      >
        <GoogleIcon />
        Continue with Google
      </SecondaryButton>
      <SecondaryButton
        aria-describedby="social-auth-note"
        className={className}
        disabled
        title="Coming soon"
        type="button"
      >
        <GithubIcon />
        Continue with GitHub
      </SecondaryButton>
      <span className="sr-only" id="social-auth-note">
        Social sign-in is coming soon.
      </span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-[18px]" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.85C6.71 7.3 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg aria-hidden="true" className="size-[18px]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
