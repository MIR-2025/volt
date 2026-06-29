// Reactive core — signal / computed / effect. DOM-free, runs under `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, computed, effect } from "../packages/create-volt/templates/default/public/volt.js";

test("signal reads and writes", () => {
  const n = signal(1);
  assert.equal(n(), 1);
  n(2);
  assert.equal(n(), 2);
});

test("computed derives and stays in sync", () => {
  const n = signal(2);
  const double = computed(() => n() * 2);
  assert.equal(double(), 4);
  n(5);
  assert.equal(double(), 10);
});

test("effect runs immediately and re-runs on dependency change", () => {
  const n = signal(0);
  const seen = [];
  effect(() => seen.push(n()));
  assert.deepEqual(seen, [0]); // ran once on creation
  n(1);
  n(2);
  assert.deepEqual(seen, [0, 1, 2]);
});

test("effect dispose stops further runs", () => {
  const n = signal(0);
  const seen = [];
  const dispose = effect(() => seen.push(n()));
  n(1);
  dispose();
  n(2);
  assert.deepEqual(seen, [0, 1]); // no run for n(2)
});

test("effect only re-runs when a read dependency actually changes", () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    runs += 1;
    a(); // depends on a only
  });
  assert.equal(runs, 1);
  b(99); // unrelated signal — must not trigger
  assert.equal(runs, 1);
  a(1);
  assert.equal(runs, 2);
});
