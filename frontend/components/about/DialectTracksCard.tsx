'use client';

import { useEffect, useState } from 'react';
import { useGetCountriesQuery, useGetDialectsQuery } from '@/store/api';

const selectClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink dark:bg-surface-muted';

export function DialectTracksCard() {
  const { data: countries, isLoading: isLoadingCountries } = useGetCountriesQuery();
  const [countryId, setCountryId] = useState('');

  useEffect(() => {
    if (!countryId && countries && countries.length > 0) {
      setCountryId(countries[0].id);
    }
  }, [countries, countryId]);

  const { data: dialects, isLoading: isLoadingDialects } = useGetDialectsQuery(countryId, { skip: !countryId });

  return (
    <aside className="grid content-start gap-3 rounded-lg border border-[rgba(5,5,5,0.1)] bg-surface p-4">
      <h2 className="text-xl font-black">Current dialect tracks</h2>

      <div className="grid gap-1">
        <label className="text-xs font-bold uppercase text-muted" htmlFor="about-country">
          Country
        </label>
        {isLoadingCountries ? (
          <p className="text-muted">Loading countries...</p>
        ) : (
          <select
            className={selectClass}
            id="about-country"
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
          >
            {countries?.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoadingDialects && <p className="text-muted">Loading dialects...</p>}
      {!isLoadingDialects && dialects && dialects.length === 0 && (
        <p className="text-muted">No dialects listed for this country yet.</p>
      )}
      {!isLoadingDialects && dialects && dialects.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {dialects.map((dialect) => (
            <span className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold" key={dialect.id}>
              {dialect.name}
            </span>
          ))}
        </div>
      )}

      <p className="leading-relaxed text-muted">
        Coverage expands through registered model and prompt support, not by silently substituting a different
        language model.
      </p>
    </aside>
  );
}
