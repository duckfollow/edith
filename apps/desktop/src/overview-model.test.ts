import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCalendar, summarize } from "./overview-model.ts";
import { parseHar, demoHar, parseLogs, demoLogs } from "./debug-model.ts";
test("overview excludes successful CONNECT from HTTP statuses, failures and duration statistics", () => {
  const requests = parseHar(demoHar());
  const tunnel = {
    ...requests[0],
    method: "CONNECT",
    captureKind: "tunnel" as const,
    duration: 99999,
  };
  const result = summarize([...requests, tunnel], parseLogs(demoLogs));
  assert.equal(result.http, 5);
  assert.equal(result.tunnels, 1);
  assert.equal(result.failure, 1);
  assert.equal(result.failureRate, 20);
  assert.equal(result.p95, 5031);
  assert.equal(result.logErrors, 1);
  assert.equal(
    result.buckets.reduce((total, b) => total + b.count, 0),
    5,
  );
});
test("time windows are anchored to latest recorded event rather than current wall clock", () => {
  const requests = parseHar(demoHar());
  const old = { ...requests[0], timestamp: "2026-10-19T14:00:00.000Z" };
  const result = summarize([...requests, old], [], "60s");
  assert.equal(result.http, 5);
  assert.equal(result.buckets.length, 24);
  assert.equal(
    result.buckets.reduce((n, b) => n + b.count, 0),
    5,
  );
  assert.equal(result.latest, Date.parse(requests[4].timestamp));
});
test("empty data and invalid timestamps produce honest empty charts and no fabricated latency", () => {
  const empty = summarize([], []);
  assert.equal(empty.p95, null);
  assert.equal(empty.average, null);
  assert.equal(empty.buckets.length, 0);
  const request = {
    ...parseHar(demoHar())[0],
    timestamp: "invalid",
    duration: NaN,
    status: 0,
  };
  const result = summarize([request], []);
  assert.equal(result.http, 1);
  assert.equal(result.failure, 1);
  assert.equal(result.p95, null);
  assert.equal(result.undated, true);
  assert.equal(result.buckets.length, 0);
  assert.equal(summarize([request], [], "60s").http, 0);
});
test("single timestamp and endpoint buckets retain every event", () => {
  const request = parseHar(demoHar())[0];
  const result = summarize([request, request], []);
  assert.equal(result.buckets.length, 24);
  assert.equal(result.buckets[result.buckets.length - 1]?.count, 2);
  assert.equal(result.methods[0][1], 2);
});

test("activity calendar has 365 local days, Sunday-first weeks, and no fabricated counts", () => {
  const request = parseHar(demoHar())[0];
  const time = new Date(2026, 9, 20, 12).toISOString();
  const result = activityCalendar([
    { ...request, timestamp: time },
    { ...request, timestamp: time },
    { ...request, timestamp: time, method: "CONNECT" },
  ]);
  assert.equal(result.days.length, 371);
  assert.equal(result.days.filter((d) => d.inRange).length, 365);
  assert.equal(result.total, 2);
  assert.equal(result.activeDays, 1);
  assert.equal(result.days.filter((d) => d.count > 0)[0].level, 4);
  result.days.forEach((day, i) =>
    assert.equal(new Date(day.timestamp).getDay(), i % 7),
  );
  assert.equal(new Set(result.days.map((d) => d.key)).size, 371);
});
test("calendar excludes old and undated records and scales levels within its actual year", () => {
  const request = parseHar(demoHar())[0],
    time = new Date(2026, 9, 20, 12).toISOString(),
    old = new Date(2020, 0, 1, 12).toISOString();
  const result = activityCalendar([
    { ...request, timestamp: time },
    ...Array.from({ length: 20 }, () => ({ ...request, timestamp: old })),
    { ...request, timestamp: "invalid" },
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.undated, 1);
  assert.equal(result.days.find((d) => d.count === 1)?.level, 4);
  const empty = activityCalendar([], new Date(2026, 2, 9, 12).valueOf());
  assert.equal(empty.total, 0);
  assert.ok(empty.days.every((d) => d.count === 0 && d.level === 0));
});
