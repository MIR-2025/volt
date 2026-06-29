// date-port.js — derive an app's dev port from its start date.
//
// Convention: two-digit year + month (no leading zero) + two-digit day,
// concatenated → e.g. 2026-06-28 → 26628. Readable, and unique per date
// (year and day are fixed-width, so the month's 1-vs-2-digit width is
// unambiguous).
//
// Caveat: for Oct–Dec the month is two digits, so the value is 6 digits
// (e.g. 2026-10-10 → 261010) — above the max TCP port (65535). When the
// readable form overflows, fall back to a deterministic in-range port
// derived from the full date: 1024 + (YYYYMMDD % 64512) ∈ [1024, 65535].
// Always valid, always the same for a given date.
export function datePort(d) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1); // no leading zero
  const dd = String(d.getDate()).padStart(2, "0");
  const readable = Number(`${yy}${mm}${dd}`);
  if (readable <= 65535) return readable;
  const ymd = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return 1024 + (ymd % 64512);
}
