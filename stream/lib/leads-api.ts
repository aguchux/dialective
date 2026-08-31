import { PUBLIC_API_V1_BASE_URL } from './public-api';

export interface Country {
  id: string;
  code: string;
  name: string;
}

export interface Dialect {
  id: string;
  tag: string;
  name: string;
}

export interface DialectVariant {
  id: string;
  tag: string;
  name: string;
}

export interface DataAccessLeadInterestInput {
  countryId: string;
  dialectTags: string[];
  subdialectTags: string[];
}

class LeadsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PUBLIC_API_V1_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new LeadsApiError(res.status, body.message ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

/**
 * Voice Stream's request-access form (this app's /register) submits into
 * the same admin-reviewed lead pipeline as the trainer site's /data-access
 * page -- see leads.controller.ts. These are plain fetches, not RTK Query,
 * since /geo/* and /leads/* sit outside store/api.ts's /voice-stream-
 * prefixed baseQuery and this form is a one-off pre-account surface, not
 * part of the ongoing authenticated API.
 */
export const leadsApi = {
  getCountries: () => fetchJson<Country[]>('/geo/countries'),
  getDialects: (countryId: string) => fetchJson<Dialect[]>(`/geo/countries/${countryId}/dialects`),
  getDialectVariants: (dialectId: string) =>
    fetchJson<DialectVariant[]>(`/geo/dialects/${dialectId}/variants`),
  createDataAccessLead: (input: {
    firstName: string;
    lastName: string;
    email: string;
    organization: string;
    website: string;
    interests: DataAccessLeadInterestInput[];
  }) =>
    fetchJson<{ id: string; status: string }>('/leads/data-access', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export { LeadsApiError };
