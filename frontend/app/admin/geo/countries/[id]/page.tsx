'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DialectsTable } from '@/components/admin/geo/DialectsTable';
import { useGetAdminCountriesQuery, useGetAdminDialectsQuery } from '@/store/api';

export default function AdminCountryDialectsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: countries, isLoading: isLoadingCountries } = useGetAdminCountriesQuery();
  const { data: dialects, isLoading: isLoadingDialects } = useGetAdminDialectsQuery();

  const country = countries?.find((c) => c.id === id);
  const countryDialects = dialects?.filter((d) => d.country.id === id);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Link className="text-sm font-bold text-accent no-underline hover:text-accent-dark" href="/admin/geo">
            &larr; Coverage
          </Link>
          {!isLoadingCountries && !country ? (
            <h1 className="text-3xl font-black">Country not found</h1>
          ) : (
            <>
              <h1 className="text-3xl font-black">{country ? `${country.name} dialects` : 'Loading...'}</h1>
              <p className="leading-relaxed text-muted">
                Dialects belonging to {country ? country.name : 'this country'} -- word generation, keyboard layouts, and deletion.
              </p>
            </>
          )}
        </div>

        {!isLoadingCountries && !country ? (
          <p className="text-muted">No country matches this link. It may have been deleted.</p>
        ) : (
          <DialectsTable dialects={countryDialects} isLoading={isLoadingCountries || isLoadingDialects} />
        )}
      </div>
    </AdminShell>
  );
}
