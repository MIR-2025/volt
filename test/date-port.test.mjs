import { test } from "node:test";
import assert from "node:assert/strict";
import { datePort } from "../packages/create-volt/lib/date-port.js";

const d = (y, m, day) => new Date(y, m - 1, day);

test("readable date-port for single-digit months (Jan–Sep)", () => {
  assert.equal(datePort(d(2026, 6, 28)), 26628); // volt
  assert.equal(datePort(d(2026, 6, 29)), 26629);
  assert.equal(datePort(d(2026, 1, 10)), 26110);
  assert.equal(datePort(d(2026, 9, 30)), 26930);
  assert.equal(datePort(d(2026, 6, 8)), 26608); // day zero-padded
});

test("Oct–Dec fall back to a valid in-range port (no overflow)", () => {
  for (const [m, day] of [[10, 1], [10, 10], [11, 15], [12, 31]]) {
    const p = datePort(d(2026, m, day));
    assert.ok(Number.isInteger(p) && p >= 1024 && p <= 65535, `${m}/${day} → ${p} must be 1024–65535`);
  }
  // matches the documented formula: 1024 + (YYYYMMDD % 64512)
  assert.equal(datePort(d(2026, 10, 10)), 1024 + (20261010 % 64512));
});

test("deterministic — same date, same port", () => {
  assert.equal(datePort(d(2026, 10, 10)), datePort(d(2026, 10, 10)));
  assert.equal(datePort(d(2026, 12, 31)), datePort(d(2026, 12, 31)));
});

test("never exceeds the max TCP port for any day of the year", () => {
  for (let m = 1; m <= 12; m++) {
    for (let day = 1; day <= 28; day++) {
      const p = datePort(d(2026, m, day));
      assert.ok(p >= 1 && p <= 65535, `${m}/${day} → ${p} out of range`);
    }
  }
});
