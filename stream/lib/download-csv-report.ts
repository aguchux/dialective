import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';

/**
 * Report CSV endpoints require a bearer token (this API has no cookie
 * session), so a plain <a href> download link can't carry auth -- fetch the
 * CSV with the same Authorization header RTK Query attaches, then trigger a
 * client-side blob download.
 */
export async function downloadCsvReport(path: string, filename: string): Promise<void> {
  const session = await getCurrentSession().catch(() => null);
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/voice-stream${path}`, {
    headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
  if (!response.ok) {
    throw new Error('Unable to download this report.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
