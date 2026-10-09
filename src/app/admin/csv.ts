// CSV export (RFC 4180) that opens cleanly in Excel and Google Sheets.

/** Cells starting with these can run as formulas in spreadsheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Builds a CSV document: CRLF line endings, quoted cells where needed, and a UTF-8 BOM
 * so Excel reads accented names correctly.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
