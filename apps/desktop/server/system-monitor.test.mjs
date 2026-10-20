import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuPercent, createSystemMonitor } from "./system-monitor.mjs";
import http from "node:http";
import { once } from "node:events";
const cpu = (user, idle) => ({
  model: "Fixture CPU",
  times: { user, nice: 0, sys: 0, idle, irq: 0 },
});
test("CPU is normalized across cores and first/reset/counter rollback samples are unknown", () => {
  assert.deepEqual(cpuPercent(null, [cpu(10, 90)]), {
    total: null,
    cores: [null],
  });
  const result = cpuPercent([cpu(0, 0), cpu(0, 0)], [cpu(100, 0), cpu(0, 100)]);
  assert.equal(result.total, 50);
  assert.deepEqual(result.cores, [100, 0]);
  assert.equal(cpuPercent([cpu(100, 100)], [cpu(0, 0)]).total, null);
  assert.equal(cpuPercent([cpu(0, 0)], [cpu(1, 1), cpu(1, 1)]).total, null);
  assert.equal(cpuPercent([cpu(1, 1)], [cpu(1, 1)]).total, null);
});
test("sampler caches fast requests, resets baselines, and reports consistent physical memory", () => {
  let clock = 1000,
    ticks = 0;
  const provider = {
    cpus: () => [cpu(++ticks * 25, ticks * 75)],
    totalmem: () => 1000,
    freemem: () => 400,
    platform: () => "test",
    arch: () => "test",
  };
  const sampler = createSystemMonitor({ provider, now: () => clock });
  const first = sampler.sample();
  assert.equal(first.cpuPercent, null);
  assert.equal(first.memoryUsedBytes, 600);
  assert.equal(first.memoryPercent, 60);
  assert.equal(sampler.sample().timestamp, 1000);
  clock = 2000;
  assert.equal(sampler.sample().cpuPercent, 25);
  clock = 3000;
  assert.equal(sampler.sample(true).cpuPercent, null);
});
test("real host sampler returns measured memory and CPU baseline without fabricated samples", () => {
  const sample = createSystemMonitor().sample();
  assert.equal(sample.source, "node-os");
  assert.ok(sample.memoryTotalBytes > 0);
  assert.ok(sample.logicalCores > 0);
  assert.equal(
    sample.memoryUsedBytes + sample.memoryFreeBytes,
    sample.memoryTotalBytes,
  );
  assert.equal(sample.cpuPercent, null);
});
test("system endpoint denies cross-origin/foreign host and returns real same-origin data", async (t) => {
  let monitor;
  const server = http.createServer((req, res) =>
    monitor.middleware(req, res, () => res.end("not found")),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  monitor = createSystemMonitor({ controlOrigin: origin });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const response = await fetch(origin + "/__edith_system/snapshot");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const sample = await response.json();
  assert.ok(sample.memoryTotalBytes > 0);
  assert.equal(
    (
      await fetch(origin + "/__edith_system/snapshot", {
        headers: { Origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  const foreignHost = await new Promise((resolve, reject) => {
    const request = http.get(
      origin + "/__edith_system/snapshot",
      { headers: { Host: "foreign.example" } },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", reject);
  });
  assert.equal(foreignHost, 403);
  assert.equal(
    (await fetch(origin + "/__edith_system/snapshot", { method: "POST" }))
      .status,
    405,
  );
});
