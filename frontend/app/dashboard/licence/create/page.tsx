'use client';

import { VdclPageShell } from '@/components/vdcl/VdclPageShell';
import { VdclCreateForm } from '@/components/vdcl/VdclCreateForm';

/**
 * The permissions form, on its own screen.
 *
 * One route covers both creating a first licence and updating an existing
 * one, because they are the same act: a new version is drafted either way
 * (a signed manifest is immutable, so there is no edit-in-place to
 * distinguish). The form reads the current state to title itself.
 */
export default function VdclCreatePage() {
  return (
    <VdclPageShell>
      <VdclCreateForm />
    </VdclPageShell>
  );
}
