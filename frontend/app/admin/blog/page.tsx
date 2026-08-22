'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  type BlogPost,
  normalizeErrorMessage,
  useDeleteBlogPostMutation,
  useGetAdminBlogPostsQuery,
  useReorderBlogPostsMutation,
  useUpdateBlogPostMutation,
} from '@/store/api';

export default function AdminBlogPage() {
  const { data, isLoading } = useGetAdminBlogPostsQuery();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'PUBLISHED'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [deletePost] = useDeleteBlogPostMutation();
  const [updatePost] = useUpdateBlogPostMutation();
  const [reorder] = useReorderBlogPostsMutation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => setPosts(data ?? []), [data]);
  const visible = filter === 'ALL' ? posts : posts.filter((post) => post.status === filter);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || filter !== 'ALL') return;
    const oldIndex = posts.findIndex((post) => post.id === active.id);
    const newIndex = posts.findIndex((post) => post.id === over.id);
    const next = arrayMove(posts, oldIndex, newIndex);
    setPosts(next);
    try {
      await reorder({
        items: next.map((post, sortOrder) => ({ id: post.id, sortOrder })),
      }).unwrap();
    } catch (mutationError) {
      setPosts(posts);
      setError(normalizeErrorMessage(mutationError, 'Unable to reorder blog posts.'));
    }
  };

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">Blog</h1>
            <p className="mt-1 text-muted">Create, publish, and order editorial content.</p>
          </div>
          <Link
            className="rounded-lg bg-accent px-4 py-2.5 font-extrabold text-white no-underline hover:bg-accent-dark"
            href="/admin/blog/new"
          >
            Create post
          </Link>
        </header>

        <div
          className="flex w-fit rounded-lg border border-line bg-white p-1"
          role="group"
          aria-label="Filter posts"
        >
          {(['ALL', 'DRAFT', 'PUBLISHED'] as const).map((option) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${filter === option ? 'bg-surface-muted text-accent' : 'text-muted'}`}
              key={option}
              onClick={() => setFilter(option)}
              type="button"
            >
              {option === 'ALL' ? 'All' : option === 'DRAFT' ? 'Drafts' : 'Published'}
            </button>
          ))}
        </div>

        {error && (
          <p className="leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}

        <section
          className="overflow-hidden rounded-lg border border-line bg-white"
          aria-label="Blog posts"
        >
          <div className="hidden grid-cols-[40px_minmax(0,1fr)_130px_150px_180px] gap-3 border-b border-line bg-surface-muted px-4 py-3 text-xs font-extrabold uppercase text-muted md:grid">
            <span />
            <span>Post</span>
            <span>Status</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {isLoading && <p className="p-5 text-muted">Loading posts...</p>}
          {!isLoading && visible.length === 0 && (
            <p className="p-8 text-center text-muted">No posts in this view.</p>
          )}
          <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <SortableContext
              items={visible.map((post) => post.id)}
              strategy={verticalListSortingStrategy}
            >
              {visible.map((post) => (
                <SortablePostRow
                  key={post.id}
                  post={post}
                  dragDisabled={filter !== 'ALL'}
                  onDelete={async () => {
                    if (!window.confirm(`Delete "${post.title}"?`)) return;
                    setError(null);
                    try {
                      await deletePost(post.id).unwrap();
                    } catch (mutationError) {
                      setError(normalizeErrorMessage(mutationError, 'Unable to delete this post.'));
                    }
                  }}
                  onToggle={async () => {
                    setError(null);
                    try {
                      await updatePost({
                        id: post.id,
                        body: { status: post.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' },
                      }).unwrap();
                    } catch (mutationError) {
                      setError(normalizeErrorMessage(mutationError, 'Unable to update this post.'));
                    }
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </section>
      </div>
    </AdminShell>
  );
}

function SortablePostRow({
  post,
  dragDisabled,
  onDelete,
  onToggle,
}: {
  post: BlogPost;
  dragDisabled: boolean;
  onDelete: () => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    disabled: dragDisabled,
  });
  const [pendingAction, setPendingAction] = useState<'toggle' | 'delete' | null>(null);

  const runAction = async (action: 'toggle' | 'delete', callback: () => Promise<void>) => {
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  };
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid gap-3 border-b border-line px-4 py-4 last:border-0 md:grid-cols-[40px_minmax(0,1fr)_130px_150px_180px] md:items-center ${isDragging ? 'relative z-10 bg-white shadow-lg' : ''}`}
    >
      <button
        className="hidden size-8 cursor-grab place-items-center rounded-md text-muted hover:bg-surface-muted disabled:cursor-default disabled:opacity-30 md:grid"
        disabled={dragDisabled}
        type="button"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <DragIcon />
      </button>
      <div className="min-w-0">
        <Link
          className="font-extrabold text-ink no-underline hover:text-accent"
          href={`/admin/blog/${post.id}`}
        >
          {post.title}
        </Link>
        <p className="mt-1 truncate text-sm text-muted">/{post.slug}</p>
      </div>
      <span
        className={`w-fit rounded-md px-2.5 py-1 text-xs font-extrabold ${post.status === 'PUBLISHED' ? 'bg-accent-soft text-accent-dark' : 'bg-surface-muted text-muted'}`}
      >
        {post.status === 'PUBLISHED' ? 'Published' : 'Draft'}
      </span>
      <time className="text-sm text-muted" dateTime={post.updatedAt}>
        {new Date(post.updatedAt).toLocaleDateString()}
      </time>
      <div className="flex items-center gap-2">
        <Link
          className="rounded-md border border-line px-3 py-1.5 text-sm font-bold text-ink no-underline hover:bg-surface-muted"
          href={`/admin/blog/${post.id}`}
        >
          Edit
        </Link>
        <ActionButton
          className="rounded-md border border-line px-3 py-1.5 text-sm font-bold hover:bg-surface-muted"
          disabled={pendingAction !== null}
          onClick={() => runAction('toggle', onToggle)}
          pending={pendingAction === 'toggle'}
          pendingLabel={post.status === 'PUBLISHED' ? 'Unpublishing' : 'Publishing'}
          type="button"
        >
          {post.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
        </ActionButton>
        <ActionButton
          aria-label={`Delete ${post.title}`}
          className="grid size-8 place-items-center rounded-md text-[#a3242f] hover:bg-[#fff1f2]"
          disabled={pendingAction !== null}
          onClick={() => runAction('delete', onDelete)}
          pending={pendingAction === 'delete'}
          pendingLabel={<span className="sr-only">Deleting</span>}
          title="Delete"
          type="button"
        >
          <TrashIcon />
        </ActionButton>
      </div>
    </article>
  );
}

function DragIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="8" cy="7" r="1.5" />
      <circle cx="16" cy="7" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
      <circle cx="8" cy="17" r="1.5" />
      <circle cx="16" cy="17" r="1.5" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="17"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="17"
    >
      <path
        d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
