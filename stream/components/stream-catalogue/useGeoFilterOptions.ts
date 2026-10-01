'use client';

import { useMemo } from 'react';
import {
  useGetCatalogueCountriesQuery,
  useGetCatalogueDialectsQuery,
  useGetCatalogueSubdialectsQuery,
} from '@/store/api';
import type { CatalogueFilters, FilterKey } from './types';

/** Fixed bands, not reference data -- there is no table of score cutoffs. */
const QUALITY_BANDS = ['9.5+', '9.0+', '8.5+'];

/**
 * Country, dialect and subdialect options read from the database.
 *
 * The cascade is driven by ids, but the filters store display names
 * (FilterBar renders the selected value, and the catalogue matches
 * collections on `collection.country` / `.dialect`). So each level resolves
 * the chosen name back to its id to fetch the next: pick "Nigeria", find
 * its id, load that country's dialects. Picking a dialect that no longer
 * exists under a newly-chosen country resolves to nothing and the next
 * level comes back empty, which is the correct outcome -- the cascade rule
 * in CatalogueSearchContext has already cleared it by then.
 *
 * The two dependent queries skip until their parent is chosen, so a page
 * with no country selected makes exactly one request.
 *
 * License stays derived from the collections themselves: it is a property
 * of a licence agreement, not a geographic table, so there is nothing in
 * geo to read it from.
 */
export function useGeoFilterOptions(
  filters: CatalogueFilters,
  licenseOptions: string[],
): { options: Record<FilterKey, string[]>; isLoading: boolean } {
  const { data: countries, isLoading: countriesLoading } = useGetCatalogueCountriesQuery();

  const countryId = useMemo(
    () => countries?.find((country) => country.name === filters.country)?.id,
    [countries, filters.country],
  );

  const { data: dialects, isFetching: dialectsFetching } = useGetCatalogueDialectsQuery(
    countryId as string,
    { skip: !countryId },
  );

  const dialectId = useMemo(
    () => dialects?.find((dialect) => dialect.name === filters.dialect)?.id,
    [dialects, filters.dialect],
  );

  const { data: variants, isFetching: variantsFetching } = useGetCatalogueSubdialectsQuery(
    dialectId as string,
    { skip: !dialectId },
  );

  const options = useMemo<Record<FilterKey, string[]>>(
    () => ({
      country: (countries ?? []).map((country) => country.name),
      dialect: (dialects ?? []).map((dialect) => dialect.name),
      subdialect: (variants ?? []).map((variant) => variant.name),
      quality: QUALITY_BANDS,
      license: licenseOptions,
    }),
    [countries, dialects, variants, licenseOptions],
  );

  return {
    options,
    isLoading: countriesLoading || dialectsFetching || variantsFetching,
  };
}
