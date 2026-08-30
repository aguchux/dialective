import Link from 'next/link';
import { PrimaryButton, SecondaryButton } from '@/components/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-accent">Dialect Library</p>
      <h1 className="mt-2 max-w-2xl text-4xl font-black tracking-tight text-ink">Voice Stream</h1>
      <p className="mt-4 max-w-xl text-muted">
        Search it. Validate it. Build your Deck. Stream it into your model.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register">
          <PrimaryButton type="button">Get started</PrimaryButton>
        </Link>
        <Link href="/login">
          <SecondaryButton type="button">Sign in</SecondaryButton>
        </Link>
      </div>
    </main>
  );
}
