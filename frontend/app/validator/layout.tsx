import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export default async function ValidatorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login?callbackUrl=/validator');
  }
  if (session.user?.role !== 'VALIDATOR') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
