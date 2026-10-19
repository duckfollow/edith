import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createEdith } from "./index.mjs";
import { createSdkBridge } from "../../../apps/desktop/server/sdk-bridge.mjs";
async function fixture(t) {
  let bridge;
  const server = http.createServer((req, res) => {
    if (req.url === "/large") {
      res.setHeader("Content-Type", "text/plain");
      res.end("A".repeat(9000));
      return;
    }
    if (req.url === "/app") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Set-Cookie", "private=value");
      res.end('{"ok":true}');
      return;
    }
    void bridge.middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
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
  const state = await fetch(origin + "/__edith_sdk/status").then((r) =>
    r.json(),
  );
  const enabled = await fetch(origin + "/__edith_sdk/enable", {
    method: "POST",
    headers: { "X-Edith-Token": state.controlToken },
  }).then((r) => r.json());
  return { origin, bridge, token: enabled.pairingToken };
}
test("SDK captures actual fetch, redacts credentials, and delivers logs/errors through authenticated bridge", async (t) => {
  const { origin, bridge, token } = await fixture(t);
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token,
    appName: "Test app",
    captureBodies: true,
  });
  t.after(() => client.dispose());
  const response = await client.fetch(origin + "/app", {
    headers: { Authorization: "Bearer private" },
  });
  assert.deepEqual(await response.json(), { ok: true });
  client.log("info", "hello", { count: 1 });
  client.captureError(new Error("broken test"));
  const status = await client.flush();
  assert.equal(status.dropped, 0);
  const events = bridge.state(0).events;
  assert.equal(events.length, 3);
  const network = events.find((e) => e.type === "network").data;
  assert.equal(network.status, 200);
  assert.equal(network.captureKind, "sdk");
  assert.equal(
    network.requestHeaders.find((h) => h.name === "authorization").value,
    "[redacted]",
  );
  assert.equal(
    network.responseHeaders.find((h) => h.name === "set-cookie").value,
    "[redacted]",
  );
  assert.equal(network.responseBody, '{"ok":true}');
  assert.ok(
    events.find((e) => e.type === "error").data.raw.includes("broken test"),
  );
});
test("disabled SDK does not connect, wrap global fetch, or queue events", async () => {
  const before = globalThis.fetch;
  const client = createEdith({ enabled: false });
  client.install({ captureConsole: true });
  client.log("info", "ignored");
  assert.equal(globalThis.fetch, before);
  assert.equal((await client.flush()).sent, 0);
  assert.equal(client.status().pending, 0);
  client.dispose();
});
test("global installation restores fetch and console without swallowing application errors", async (t) => {
  const { origin, token } = await fixture(t);
  const before = globalThis.fetch,
    consoleBefore = console.warn;
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token,
  });
  client.install({ captureConsole: true });
  assert.notEqual(globalThis.fetch, before);
  const response = await fetch(origin + "/app");
  assert.equal(response.status, 200);
  client.uninstall();
  assert.equal(globalThis.fetch, before);
  assert.equal(console.warn, consoleBefore);
  client.dispose();
});
test("receiver failure does not change a successful app response; network failures still reject", async (t) => {
  const { origin } = await fixture(t);
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token: "wrong",
  });
  t.after(() => client.dispose());
  assert.equal((await client.fetch(origin + "/app")).status, 200);
  const result = await client.flush();
  assert.ok(result.dropped > 0);
  assert.ok(result.lastError.includes("403"));
  await assert.rejects(client.fetch("http://127.0.0.1:1/unreachable"));
  await client.flush();
});
test("body capture is opt-in and SDK rejects remote receivers", async (t) => {
  const { origin, bridge, token } = await fixture(t);
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token,
  });
  t.after(() => client.dispose());
  await client.fetch(origin + "/app");
  await client.flush();
  assert.equal(bridge.state(0).events[0].data.responseBody, "");
  assert.throws(
    () =>
      createEdith({
        enabled: true,
        endpoint: "https://external.example/events",
        token,
      }),
    /loopback/,
  );
});
test("queue is bounded and circular log data is safe", async (t) => {
  const { origin, token } = await fixture(t);
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token,
  });
  t.after(() => client.dispose());
  const circular = {};
  circular.self = circular;
  for (let i = 0; i < 150; i++) client.log("info", circular);
  assert.equal(client.status().pending, 100);
  assert.ok(client.status().dropped >= 50);
  await client.flush();
});

test("body previews are bounded while callers receive the full original response", async (t) => {
  const { origin, bridge, token } = await fixture(t);
  const client = createEdith({
    enabled: true,
    endpoint: origin + "/__edith_sdk/events",
    token,
    captureBodies: true,
  });
  t.after(() => client.dispose());
  const response = await client.fetch(origin + "/large");
  assert.equal((await response.text()).length, 9000);
  await client.flush();
  const event = bridge.state(0).events[0].data;
  assert.equal(event.responseBody.length, 4096);
  assert.equal(event.responseTruncated, true);
});

test("the executable demo reports real network/log/error events and exits cleanly in one-shot mode", async (t) => {
  const { origin, bridge, token } = await fixture(t);
  const run = promisify(execFile);
  const file = new URL("../../../examples/sdk/demo.mjs", import.meta.url);
  const { stdout } = await run(process.execPath, [file.pathname, "--once"], {
    env: {
      ...process.env,
      EDITH_TOKEN: token,
      EDITH_ENDPOINT: origin + "/__edith_sdk/events",
    },
    timeout: 5000,
  });
  assert.match(stdout, /events delivered/);
  const events = bridge.state(0).events;
  assert.equal(events.filter((e) => e.type === "network").length, 2);
  assert.equal(events.filter((e) => e.type === "log").length, 2);
  assert.equal(events.filter((e) => e.type === "error").length, 1);
});
