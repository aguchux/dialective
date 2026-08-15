'use client';

import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { CourseEditorForm } from '@/components/courses/CourseEditorForm';
import { useGetAdminCourseQuery } from '@/store/api';

export default function EditCoursePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useGetAdminCourseQuery(id);
  return (
    <AdminShell>
      {isLoading && <p className="text-muted">Loading course...</p>}
      {Boolean(error) && <p className="text-[#a3242f]">Could not load this course.</p>}
      {data && <CourseEditorForm course={data} />}
    </AdminShell>
  );
}
