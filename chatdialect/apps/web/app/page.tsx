import Link from 'next/link';

// Minimal landing/demo entry -- doc §18. Not the product UI; just points at
// /demo, which is where Phase 1/2 work actually lands.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">ChatDialect</h1>
      <p className="text-neutral-500">
        A voice-first conversational assistant with a locally rendered 3D face.
      </p>
      <Link className="rounded-lg bg-neutral-900 px-4 py-2 text-white" href="/demo">
        Open demo
      </Link>
    </main>
  );
}
