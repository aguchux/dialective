import { Response } from 'express';

/**
 * No CSV/file-download precedent exists anywhere in this repo (the one
 * prior report, TrainerReportService, returns plain JSON) -- this is a
 * minimal hand-rolled writer rather than a new dependency, sized for
 * report-shaped tabular data (a few dozen to a few thousand flat rows).
 * Quotes a field only when it contains a comma, quote, or newline.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvField(row[h])).join(','));
  }
  return lines.join('\n');
}

/** Shared JSON-or-CSV responder for every report endpoint -- `format=csv` streams a download, anything else returns the JSON shape untouched. */
export function respondJsonOrCsv<T extends { rows: Record<string, unknown>[] }>(
  res: Response,
  filename: string,
  format: string | undefined,
  jsonBody: T,
): void {
  if (format !== 'csv') {
    res.json(jsonBody);
    return;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(jsonBody.rows));
}
