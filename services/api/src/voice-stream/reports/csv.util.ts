import { Response } from 'express';

// Fields report data can contain (org-supplied webhook URLs, User-Agent
// strings, raw error messages, etc.) are untrusted -- a value starting with
// one of these triggers formula evaluation when the CSV is opened in
// Excel/Sheets/LibreOffice, which is a real code-execution path via
// exported data (CSV injection / "formula injection").
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

/**
 * No CSV/file-download precedent exists anywhere in this repo (the one
 * prior report, TrainerReportService, returns plain JSON) -- this is a
 * minimal hand-rolled writer rather than a new dependency, sized for
 * report-shaped tabular data (a few dozen to a few thousand flat rows).
 * Quotes a field only when it contains a comma, quote, or newline.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (FORMULA_TRIGGER_CHARS.test(str)) {
    // A leading apostrophe is the standard mitigation: every mainstream
    // spreadsheet app renders the cell as literal text instead of
    // evaluating it as a formula, at the cost of a visible leading `'`.
    str = `'${str}`;
  }
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
