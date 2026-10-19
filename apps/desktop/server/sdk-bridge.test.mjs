import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createSdkBridge } from "./sdk-bridge.mjs";
async function setup(t) {
  let bridge;
  const server = http.createServer(
    (req, res) => void bridge.middleware(req, res, () => res.end()),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  bridge = createSdkBridge({ controlOrigin: origin });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return { bridge, origin };
}
test("SDK ingestion is disabled by default and local controls reject foreign origins", async (t) => {
  const { origin } = await setup(t);
  assert.equal(
    (await fetch(origin + "/__edith_sdk/events", { method: "POST" })).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/__edith_sdk/status", {
        headers: { Origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(origin + "/__edith_sdk/enable", { method: "POST" })).status,
    403,
  );
});
test("paired origins may ingest; malformed protocol batches are rejected atomically; disable revokes token", async (t) => {
  const { origin, bridge } = await setup(t);
  const status = await fetch(origin + "/__edith_sdk/status").then((r) =>
    r.json(),
  );
  const enabled = await fetch(origin + "/__edith_sdk/enable", {
    method: "POST",
    headers: { "X-Edith-Token": status.controlToken },
  }).then((r) => r.json());
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${enabled.pairingToken}`,
    Origin: "http://localhost:3000",
  };
  const payload = {
    version: 1,
    appId: "app",
    appName: "My app",
    instanceId: "one",
    events: [{ type: "log", data: { level: "INFO", message: "hello" } }],
  };
  const accepted = await fetch(origin + "/__edith_sdk/events", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(accepted.status, 202);
  assert.equal(
    accepted.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.equal(bridge.state(0).events[0].data.message, "hello");
  const rejected = await fetch(origin + "/__edith_sdk/events", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      events: [...payload.events, { type: "network", data: {} }],
    }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(bridge.state(0).events.length, 1);
  const preflight = await fetch(origin + "/__edith_sdk/events", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(preflight.status, 204);
  await fetch(origin + "/__edith_sdk/disable", {
    method: "POST",
    headers: { "X-Edith-Token": status.controlToken },
  });
  assert.equal(
    (
      await fetch(origin + "/__edith_sdk/events", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
    ).status,
    403,
  );
  assert.equal(bridge.state(0).events.length, 0);
});
