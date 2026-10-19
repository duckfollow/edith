import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "./overview-model.ts";
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
