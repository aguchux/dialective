import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main>
      <h1>Dialectiva</h1>
      {session ? <p>Signed in as {session.user.email}</p> : <p>Not signed in.</p>}
    </main>
  );
}
