import { VerificationFlow } from '@/components/VerificationFlow';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-black">Missing verification link</h1>
        <p className="text-sm text-muted">
          Please start identity verification from your Dialect Library dashboard.
        </p>
      </main>
    );
  }

  return <VerificationFlow token={token} />;
}
