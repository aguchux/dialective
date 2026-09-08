'use client';

import { Suspense } from 'react';
import { ValidatorDashboard } from '@/components/validator/ValidatorDashboard';

export default function ValidatorDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <ValidatorDashboard />
    </Suspense>
  );
}
