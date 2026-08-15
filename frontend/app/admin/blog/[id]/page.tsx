'use client';

import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { BlogEditorForm } from '@/components/blog/BlogEditorForm';
import { useGetAdminBlogPostQuery } from '@/store/api';

export default function EditBlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useGetAdminBlogPostQuery(id);
  return (
    <AdminShell>
      {isLoading && <p className="text-muted">Loading post...</p>}
      {Boolean(error) && <p className="text-[#a3242f]">Could not load this post.</p>}
      {data && <BlogEditorForm post={data} />}
    </AdminShell>
  );
}
