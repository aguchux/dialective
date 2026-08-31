'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { leadsApi, LeadsApiError, type DataAccessLeadInterestInput } from '@/lib/leads-api';
import { AuthShell } from '@/components/AuthShell';
import { CountryDialectPicker } from '@/components/CountryDialectPicker';
import { Card, ErrorText, FieldLabel, PrimaryButton, TextInput } from '@/components/ui';

/**
 * Subscriber onboarding is admin-invite-only (see leads.controller.ts /
 * subscriber-auth.service.ts's provisionOrganizationFromLead): a visitor
 * requests access here, an admin reviews the request and reaches out, then
 * invites the org via the admin dashboard. There is no self-serve org
 * creation -- this form only ever creates a DataAccessLead, the same
 * pipeline the trainer site's /data-access page feeds.
 */
export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [website, setWebsite] = useState('');
  const [interests, setInterests] = useState<DataAccessLeadInterestInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (interests.length === 0) {
      setError('Select at least one country and dialect you’re interested in.');
      return;
    }
    setPending(true);
    try {
      await leadsApi.createDataAccessLead({
        firstName,
        lastName,
        email,
        organization,
        website,
        interests,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof LeadsApiError ? err.message : 'Unable to submit your request.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow={
        <>
          <ShieldCheck aria-hidden="true" className="size-3.5 text-accent" />
          Secure enterprise access
        </>
      }
    >
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink">Request access</h1>
        <p className="mt-1 text-sm text-muted">
          Tell us about your organization and we&apos;ll follow up about coverage and licensing.
        </p>
      </div>
      <Card className="p-6">
        {submitted ? (
          <div className="grid gap-2 text-center">
            <p className="text-sm font-bold text-ink">Thanks — request received</p>
            <p className="text-sm text-muted">
              We&apos;ll reach out at the email you provided to discuss your needs and onboarding.
            </p>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>First name</FieldLabel>
                <TextInput onChange={(e) => setFirstName(e.target.value)} required value={firstName} />
              </div>
              <div>
                <FieldLabel>Last name</FieldLabel>
                <TextInput onChange={(e) => setLastName(e.target.value)} required value={lastName} />
              </div>
            </div>
            <div>
              <FieldLabel>Work email</FieldLabel>
              <TextInput
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acme.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div>
              <FieldLabel>Company / organization</FieldLabel>
              <TextInput
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Acme AI Ltd"
                required
                value={organization}
              />
            </div>
            <div>
              <FieldLabel>Website</FieldLabel>
              <TextInput
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                required
                type="url"
                value={website}
              />
            </div>
            <CountryDialectPicker onChange={setInterests} value={interests} />
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton disabled={pending} type="submit">
              {pending ? 'Submitting request...' : 'Request access'}
            </PrimaryButton>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link className="font-bold text-accent hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
