import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { createLocalProxy, BODY_LIMIT } from "./local-proxy.mjs";
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function close(server) {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}
function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function events(proxy, count = 1) {
  for (let i = 0; i < 100; i++) {
    const s = proxy.snapshot();
    if (s.records.length >= count) return s;
    await sleep(5);
  }
  throw new Error("Timed out waiting for capture");
}

test("HTTP proxy forwards real POST data and headers, records status/body, strips hop headers", async (t) => {
  let received;
  const upstream = http.createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      received = { headers: req.headers, body: text, path: req.url };
      res.writeHead(201, {
        "Content-Type": "application/json",
        "X-Test": "present",
      });
      res.end(JSON.stringify({ created: true }));
    });
  });
  const upstreamPort = await listen(upstream);
  const proxy = createLocalProxy();
  t.after(async () => {
    await proxy.stop();
    await close(upstream);
  });
  const started = await proxy.start(0);
  assert.equal(started.state, "running");
  const result = await request(
    started.port,
    `http://127.0.0.1:${upstreamPort}/items?x=1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Proxy-Authorization": "should-not-forward",
        Connection: "x-remove",
        "X-Remove": "remove-me",
      },
      body: '{"item":42}',
    },
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.toString(), '{"created":true}');
  assert.equal(received.body, '{"item":42}');
  assert.equal(received.path, "/items?x=1");
  assert.equal(received.headers["proxy-authorization"], undefined);
  assert.equal(received.headers["x-remove"], undefined);
  const captured = (await events(proxy)).records[0];
  assert.equal(captured.captureKind, "http");
  assert.equal(captured.requestBody, '{"item":42}');
  assert.equal(captured.responseBody, '{"created":true}');
  assert.equal(captured.status, 201);
  assert.ok(captured.duration >= 0);
});
test("bounded capture never truncates the forwarded response", async (t) => {
  const body = "A".repeat(BODY_LIMIT * 3);
  const upstream = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end(body);
  });
  const upstreamPort = await listen(upstream);
  const proxy = createLocalProxy();
  t.after(async () => {
    await proxy.stop();
    await close(upstream);
  });
  const started = await proxy.start(0);
  const response = await request(
    started.port,
    `http://127.0.0.1:${upstreamPort}/large`,
  );
  assert.equal(response.body.length, body.length);
  const item = (await events(proxy)).records[0];
  assert.equal(item.responseBody.length, BODY_LIMIT);
  assert.equal(item.responseTruncated, true);
  assert.equal(item.size, body.length);
});
test("upstream failure is captured and stop closes existing idle connections", async (t) => {
  const unavailable = http.createServer();
  const port = await listen(unavailable);
  await close(unavailable);
  const proxy = createLocalProxy();
  t.after(() => proxy.stop());
  const started = await proxy.start(0);
  const response = await request(
    started.port,
    `http://127.0.0.1:${port}/missing`,
  );
  assert.equal(response.status, 502);
  assert.ok((await events(proxy)).records[0].error);
  const socket = net.connect({ host: "127.0.0.1", port: started.port });
  await once(socket, "connect");
  let shutdownError;
  socket.on("error", (error) => {
    shutdownError = error;
  });
  // An explicit server shutdown can produce either EOF or ECONNRESET.
  const closed = new Promise((resolve) => socket.once("close", resolve));
  await proxy.stop();
  await closed;
  assert.ok(!shutdownError || shutdownError.code === "ECONNRESET");
  assert.equal(socket.destroyed, true);
  assert.equal(proxy.snapshot().state, "stopped");
});
test("CONNECT forwards tunnel bytes without decoding and records only connection metadata", async (t) => {
  const echo = net.createServer((socket) => socket.pipe(socket));
  const echoPort = await listen(echo);
  const proxy = createLocalProxy({
    dial: () => net.connect({ host: "127.0.0.1", port: echoPort }),
  });
  const started = await proxy.start(0);
  let client;
  t.after(async () => {
    client?.destroy();
    await proxy.stop();
    await close(echo);
  });
  client = net.connect({ host: "127.0.0.1", port: started.port });
  await once(client, "connect");
  client.write(
    "CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n",
  );
  const [connected] = await once(client, "data");
  assert.match(connected.toString(), /200 Connection Established/);
  client.write("opaque-test-bytes");
  const [echoed] = await once(client, "data");
  assert.equal(echoed.toString(), "opaque-test-bytes");
  const captured = (await events(proxy)).records[0];
  assert.equal(captured.captureKind, "tunnel");
  assert.equal(captured.method, "CONNECT");
  assert.equal(captured.requestBody, "");
  assert.match(captured.responseBody, /not decrypted/);
  assert.equal(captured.size, 0);
});
test("concurrent starts share one listener; stops are idempotent; new sessions reset records", async (t) => {
  const proxy = createLocalProxy();
  t.after(() => proxy.stop());
  const [a, b] = await Promise.all([proxy.start(0), proxy.start(0)]);
  assert.equal(a.port, b.port);
  await Promise.all([proxy.stop(), proxy.stop()]);
  assert.equal(proxy.snapshot().state, "stopped");
  const c = await proxy.start(0);
  assert.notEqual(c.sessionId, a.sessionId);
  assert.equal(c.total, 0);
});
test("control endpoints enforce host/origin/token and reject invalid ports", async (t) => {
  let proxy;
  const control = http.createServer((req, res) => {
    void proxy.middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  const controlPort = await listen(control);
  const origin = `http://127.0.0.1:${controlPort}`;
  proxy = createLocalProxy({ controlOrigin: origin });
  t.after(async () => {
    await proxy.stop();
    await close(control);
  });
  const status = await request(controlPort, "/__edith_proxy/status");
  const token = JSON.parse(status.body).token;
  assert.equal(typeof token, "string");
  const unauth = await request(controlPort, "/__edith_proxy/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauth.status, 403);
  const foreign = await request(controlPort, "/__edith_proxy/status", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(foreign.status, 403);
  const rebound = await request(controlPort, "/__edith_proxy/status", {
    headers: { Host: "attacker.example" },
  });
  assert.equal(rebound.status, 403);
  const invalid = await request(controlPort, "/__edith_proxy/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Edith-Token": token,
      Origin: origin,
    },
    body: '{"port":80}',
  });
  assert.equal(invalid.status, 400);
  assert.equal(proxy.snapshot().state, "stopped");
});
test("invalid proxy targets and self-target loops are rejected", async (t) => {
  const proxy = createLocalProxy();
  t.after(() => proxy.stop());
  const status = await proxy.start(0);
  assert.equal((await request(status.port, "/relative-path")).status, 400);
  assert.equal(
    (await request(status.port, `http://127.0.0.1:${status.port}/loop`)).status,
    400,
  );
});

test("capture retention is bounded and cursors paginate without duplicates", async (t) => {
  const upstream = http.createServer((_req, res) => res.end("ok"));
  const upstreamPort = await listen(upstream);
  const proxy = createLocalProxy();
  t.after(async () => {
    await proxy.stop();
    await close(upstream);
  });
  const started = await proxy.start(0);
  for (let i = 0; i < 260; i++)
    await request(started.port, `http://127.0.0.1:${upstreamPort}/${i}`);
  const snapshot = proxy.snapshot();
  assert.equal(snapshot.total, 260);
  assert.equal(snapshot.evicted, 4);
  assert.equal(snapshot.oldestId, 5);
  assert.equal(snapshot.records.length, 50);
  assert.equal(snapshot.lastId, 260);
  const next = proxy.snapshot(snapshot.records.at(-1).id);
  assert.equal(next.records[0].id, 55);
  assert.equal(proxy.snapshot(260).records.length, 0);
});
test("a bind failure leaves the service stopped and restartable", async (t) => {
  const occupied = http.createServer();
  const port = await listen(occupied);
  const proxy = createLocalProxy();
  t.after(async () => {
    await proxy.stop();
    await close(occupied);
  });
  await assert.rejects(proxy.start(port), /EADDRINUSE/);
  assert.equal(proxy.snapshot().state, "stopped");
  assert.equal((await proxy.start(0)).state, "running");
});

test("authorized controls start capture, return live events and stop via API", async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end("live API test");
  });
  const upstreamPort = await listen(upstream);
  let proxy;
  const control = http.createServer((req, res) => {
    void proxy.middleware(req, res, () => res.end("not found"));
  });
  const controlPort = await listen(control);
  const origin = `http://127.0.0.1:${controlPort}`;
  proxy = createLocalProxy({ controlOrigin: origin });
  const reservation = http.createServer();
  const proxyPort = await listen(reservation);
  await close(reservation);
  t.after(async () => {
    await proxy.stop();
    await close(control);
    await close(upstream);
  });
  const status = JSON.parse(
    (await request(controlPort, "/__edith_proxy/status")).body,
  );
  const headers = {
    "Content-Type": "application/json",
    "X-Edith-Token": status.token,
    Origin: origin,
  };
  const start = await request(controlPort, "/__edith_proxy/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ port: proxyPort }),
  });
  assert.equal(start.status, 200);
  assert.equal(JSON.parse(start.body).state, "running");
  await request(proxyPort, `http://127.0.0.1:${upstreamPort}/live`);
  await events(proxy);
  const captured = JSON.parse(
    (await request(controlPort, "/__edith_proxy/events?after=0")).body,
  );
  assert.equal(captured.records[0].responseBody, "live API test");
  assert.equal(captured.records[0].captureKind, "http");
  const alias = await request(controlPort, "/__edith_proxy/status", {
    headers: {
      Host: `localhost:${controlPort}`,
      Origin: `http://localhost:${controlPort}`,
    },
  });
  assert.equal(alias.status, 200);
  const stopped = await request(controlPort, "/__edith_proxy/stop", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(JSON.parse(stopped.body).state, "stopped");
});
