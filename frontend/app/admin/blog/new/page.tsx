import { AdminShell } from '@/components/admin/AdminShell';
import { BlogEditorForm } from '@/components/blog/BlogEditorForm';

export default function NewBlogPostPage() {
  return (
    <AdminShell>
      <BlogEditorForm />
    </AdminShell>
  );
}
