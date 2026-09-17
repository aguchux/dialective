'use client';

import { useState } from 'react';
import { Download, TriangleAlert } from 'lucide-react';
import {
  useGetDatasetQualityReportQuery,
  useGetValidationContributionReportQuery,
  useListStreamDecksQuery,
  useGetProvenanceReportQuery,
  useGetAnomalyEventsQuery,
} from '@/store/api';
import { Card, FieldLabel, PageHeading, SecondaryButton } from '@/components/ui';
import { downloadCsvReport } from '@/lib/download-csv-report';

function ExportButton({
  path,
  filename,
  label,
}: {
  path: string;
  filename: string;
  label?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleExport() {
    setDownloading(true);
    try {
      await downloadCsvReport(path, filename);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SecondaryButton disabled={downloading} onClick={() => void handleExport()} type="button">
      <Download aria-hidden="true" className="size-3.5" />
      {downloading ? 'Exporting...' : (label ?? 'Export CSV')}
    </SecondaryButton>
  );
}

function DatasetQualitySection() {
  const { data, isLoading } = useGetDatasetQualityReportQuery();

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-ink">Dataset Quality</p>
          <p className="text-sm text-muted">
            Confidence-tier breakdown of the full eligible catalogue.
          </p>
        </div>
        <ExportButton
          filename="dataset-quality-report.csv"
          path="/reports/dataset-quality?format=csv"
        />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Eligible recordings" value={data.totalEligibleRecordings.toLocaleString()} />
          <Stat
            label="Premium Verified"
            value={data.tierCounts.premium_verified.toLocaleString()}
          />
          <Stat label="High Confidence" value={data.tierCounts.high.toLocaleString()} />
          <Stat label="Mean ISVS" value={data.meanIsvs?.toFixed(1) ?? '—'} />
          <Stat label="Mean agreement" value={data.meanAgreement?.toFixed(1) ?? '—'} />
        </div>
      ) : null}
    </Card>
  );
}

function ValidationContributionSection() {
  const { data, isLoading } = useGetValidationContributionReportQuery();

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-ink">Validation Contribution</p>
          <p className="text-sm text-muted">Your organization&apos;s ISVP validation footprint.</p>
        </div>
        <ExportButton
          filename="validation-contribution-report.csv"
          path="/reports/validation-contributions?format=csv"
        />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : data && data.totalRecordingsValidated > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Recordings validated"
            value={data.totalRecordingsValidated.toLocaleString()}
          />
          <Stat
            label="Avg. validators/recording"
            value={data.averageValidatorCount?.toFixed(1) ?? '—'}
          />
          <Stat label="Avg. score contributed" value={data.averageMeanScore?.toFixed(1) ?? '—'} />
        </div>
      ) : (
        <p className="text-sm text-muted">No validation contributions yet.</p>
      )}
    </Card>
  );
}

function ProvenanceSection() {
  const { data: decks } = useListStreamDecksQuery();
  const [deckId, setDeckId] = useState('');
  const [version, setVersion] = useState('');
  const { data, isFetching, isError } = useGetProvenanceReportQuery(
    deckId && version ? { deckId, version: Number(version) } : (undefined as any),
    { skip: !deckId || !version },
  );

  return (
    <Card className="p-5">
      <div className="mb-4">
        <p className="font-bold text-ink">Model-Training Provenance</p>
        <p className="text-sm text-muted">
          Frozen per-recording score/ISVS provenance for a specific Stream Deck version.
        </p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel>Deck</FieldLabel>
          <select
            className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(e) => setDeckId(e.target.value)}
            value={deckId}
          >
            <option value="">Select a deck...</option>
            {(decks ?? []).map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Version</FieldLabel>
          <input
            className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
            min={1}
            onChange={(e) => setVersion(e.target.value)}
            type="number"
            value={version}
          />
        </div>
        {deckId && version && data && (
          <div className="flex items-end">
            <ExportButton
              filename={`provenance-report-v${version}.csv`}
              path={`/reports/provenance/${deckId}/${version}?format=csv`}
            />
          </div>
        )}
      </div>
      {isFetching && <p className="text-sm text-muted">Loading...</p>}
      {isError && <p className="text-sm text-danger">Could not load this version.</p>}
      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Items" value={data.itemCount.toLocaleString()} />
          <Stat label="Created" value={new Date(data.createdAt).toLocaleDateString()} />
          <Stat label="Reason" value={data.createdReason} />
        </div>
      )}
    </Card>
  );
}

const ANOMALY_RULE_LABELS: Record<string, string> = {
  denial_rate_spike: 'Spike in denied requests',
  new_ip_burst: 'Burst of requests from new IPs',
  request_volume_spike: 'Spike in request volume',
};

function AnomalyEventsSection() {
  const { data, isLoading } = useGetAnomalyEventsQuery();

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4">
        <p className="font-bold text-ink">Anomaly Alerts</p>
        <p className="text-sm text-muted">
          Automatically detected unusual activity on your Stream Keys and OAuth clients (checked
          hourly).
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : data && data.rows.length > 0 ? (
        <div className="divide-y divide-line">
          {data.rows.map((row, i) => (
            <div className="flex items-start gap-3 py-3" key={i}>
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-bold text-ink">
                  {ANOMALY_RULE_LABELS[row.ruleKey] ?? row.ruleKey}
                </p>
                <p className="text-xs text-muted">
                  {new Date(row.windowStart).toLocaleString()} -{' '}
                  {new Date(row.windowEnd).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No anomalies detected.</p>
      )}
    </Card>
  );
}

function AuditExportsSection() {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <p className="font-bold text-ink">Audit Exports</p>
        <p className="text-sm text-muted">
          Raw request logs, webhook delivery history, and org activity -- for compliance or your own
          analysis.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ExportButton
          filename="access-log-export.csv"
          label="Export access log"
          path="/reports/access-log?format=csv"
        />
        <ExportButton
          filename="webhook-deliveries-export.csv"
          label="Export webhook deliveries"
          path="/reports/webhook-deliveries?format=csv"
        />
        <ExportButton
          filename="activity-export.csv"
          label="Export activity timeline"
          path="/reports/activity?format=csv"
        />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-black text-ink">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div>
      <PageHeading
        subtitle="Point-in-time commercial reports for dataset quality, your validation contributions, and model-training provenance."
        title="Reports"
      />
      <DatasetQualitySection />
      <ValidationContributionSection />
      <ProvenanceSection />
      <div className="mt-6">
        <AnomalyEventsSection />
      </div>
      <AuditExportsSection />
    </div>
  );
}
