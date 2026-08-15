import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export default async function DistributorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login?callbackUrl=/distributor');
  }
  if (session.user?.role !== 'DISTRIBUTOR') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
