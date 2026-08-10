'use client';

import { Suspense } from 'react';
import { TrainerDashboard } from '@/components/trainer/TrainerDashboard';

export default function TrainerDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <TrainerDashboard />
    </Suspense>
  );
}
