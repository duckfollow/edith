import { test } from "node:test";
import assert from "node:assert/strict";
import {
  retainSamples,
  systemSeries,
  validSystemSample,
  SYSTEM_HISTORY_LIMIT,
} from "./system-model.ts";
import type { SystemSample } from "./system-model.ts";
const sample: SystemSample = {
  timestamp: 1000,
  cpuPercent: null,
  cores: [null],
  memoryTotalBytes: 1000,
  memoryFreeBytes: 400,
  memoryUsedBytes: 600,
  memoryPercent: 60,
  cpuModel: "Test CPU",
  logicalCores: 1,
  platform: "test",
  arch: "test",
  source: "node-os",
};
test("history stays bounded and rejects duplicate/out-of-order samples", () => {
  let history: SystemSample[] = [];
  for (let i = 1; i <= 350; i++)
    history = retainSamples(history, { ...sample, timestamp: i * 1000 });
  assert.equal(history.length, SYSTEM_HISTORY_LIMIT);
  assert.equal(history[0].timestamp, 51000);
  const same = retainSamples(history, { ...sample, timestamp: 1000 });
  assert.equal(same, history);
});
test("sample charts preserve missing intervals and unknown CPU baselines rather than inventing zeros", () => {
  const history = [sample, { ...sample, timestamp: 4000, cpuPercent: 50 }];
  const cpu = systemSeries(history, 4, "cpuPercent");
  assert.deepEqual(
    cpu.map((b) => b.average),
    [null, null, null, 50],
  );
  const ram = systemSeries(history, 4, "memoryPercent");
  assert.deepEqual(
    ram.map((b) => b.average),
    [60, null, null, 60],
  );
  assert.equal(systemSeries([], 60, "cpuPercent").length, 0);
});
test("sample validation rejects invalid percentages and impossible memory", () => {
  assert.ok(validSystemSample(sample));
  assert.ok(!validSystemSample({ ...sample, cpuPercent: 101 }));
  assert.ok(!validSystemSample({ ...sample, memoryFreeBytes: 2000 }));
  assert.ok(!validSystemSample({ ...sample, cores: [NaN] }));
  assert.ok(!validSystemSample(null));
});
