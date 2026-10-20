import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createGateway, validateGateway } from "./gateway.mjs";
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function close(server) {
  const done = new Promise((resolve) => server.close(resolve));
  server.closeAllConnections();
  await done;
}
async function freePort() {
  const s = http.createServer();
  const port = await listen(s);
  await close(s);
  return port;
}
const route = (path, target, strip = true) => ({
  path,
  target,
  strip,
  enabled: true,
  connected: true,
});
test("gateway forwards method, body and query, matches path boundaries and longest prefix, and stops", async () => {
  const upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          path: req.url,
          method: req.method,
          body,
          host: req.headers.host,
        }),
      );
    });
  });
  const backend = await listen(upstream),
    port = await freePort(),
    gateway = createGateway();
  try {
    await gateway.start({
      port,
      routes: [
        route("/api", `http://127.0.0.1:${backend}`),
        route("/api/admin", `http://127.0.0.1:${backend}/special`),
        route("/keep", `http://127.0.0.1:${backend}`, false),
      ],
    });
    const base = `http://127.0.0.1:${port}`;
    let r = await fetch(base + "/api/users?q=hello", {
      method: "POST",
      body: "request body",
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), {
      path: "/users?q=hello",
      method: "POST",
      body: "request body",
      host: `127.0.0.1:${backend}`,
    });
    r = await fetch(base + "/api/admin/users");
    assert.equal((await r.json()).path, "/special/users");
    r = await fetch(base + "/keep/users");
    assert.equal((await r.json()).path, "/keep/users");
    r = await fetch(base + "/apix");
    assert.equal(r.status, 404);
    await r.text();
    await assert.rejects(gateway.start({ port, routes: [] }));
    await gateway.stop();
    assert.equal(gateway.snapshot().running, false);
    await assert.rejects(fetch(base + "/api/users"));
    await gateway.start({
      port,
      routes: [route("/api", `http://127.0.0.1:${backend}`)],
    });
    assert.equal(gateway.snapshot().running, true);
  } finally {
    await gateway.stop();
    await close(upstream);
  }
});
test("gateway rejects loops and normalized duplicates; bind failure is recoverable; upstream failure returns 502", async () => {
  assert.throws(() =>
    validateGateway({
      port: 8080,
      routes: [route("/api", "http://localhost:8080")],
    }),
  );
  assert.throws(() =>
    validateGateway({
      port: 8080,
      routes: [
        route("/api", "http://localhost:3000"),
        route("/api/", "http://localhost:3000"),
      ],
    }),
  );
  const occupied = http.createServer(),
    port = await listen(occupied),
    backend = await freePort(),
    gateway = createGateway();
  const config = { port, routes: [route("/", `http://127.0.0.1:${backend}`)] };
  try {
    await assert.rejects(gateway.start(config));
    assert.equal(gateway.snapshot().running, false);
    await close(occupied);
    await gateway.start(config);
    const r = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(r.status, 502);
    await r.text();
  } finally {
    await gateway.stop();
    if (occupied.listening) await close(occupied);
  }
});
test("control endpoints require local origin and token; authorized start and stop work", async () => {
  const server = http.createServer();
  const controlPort = await listen(server);
  const gateway = createGateway({
    controlOrigin: `http://127.0.0.1:${controlPort}`,
  });
  server.on("request", (req, res) => {
    void gateway.middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  const base = `http://127.0.0.1:${controlPort}/__edith_gateway`;
  try {
    let r = await fetch(base + "/status", {
      headers: { Origin: "https://foreign.example" },
    });
    assert.equal(r.status, 403);
    await r.text();
    r = await fetch(base + "/status");
    const status = await r.json();
    r = await fetch(base + "/stop", { method: "POST" });
    assert.equal(r.status, 403);
    await r.text();
    const port = await freePort();
    r = await fetch(base + "/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Edith-Token": status.token,
      },
      body: JSON.stringify({
        port,
        routes: [route("/api", "http://127.0.0.1:3000")],
      }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).running, true);
    r = await fetch(base + "/stop", {
      method: "POST",
      headers: { "X-Edith-Token": status.token },
    });
    assert.equal((await r.json()).running, false);
  } finally {
    await gateway.stop();
    await close(server);
  }
});

test("capture is bounded without truncating forwarded bodies, supports cursors and logs backend errors", async () => {
  const payload = "x".repeat(40000);
  const upstream = http.createServer((req, res) => {
    if (req.url === "/error") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end('{"error":"demo"}');
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "text/plain");
      res.end(body || payload);
    });
  });
  const backend = await listen(upstream),
    control = http.createServer(),
    controlPort = await listen(control);
  const gateway = createGateway({
    controlOrigin: `http://127.0.0.1:${controlPort}`,
  });
  control.on("request", (req, res) => {
    void gateway.middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  const port = await freePort();
  try {
    await gateway.start({
      port,
      routes: [route("/api", `http://127.0.0.1:${backend}`)],
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: payload,
    });
    assert.equal(await response.text(), payload);
    const error = await fetch(`http://127.0.0.1:${port}/api/error`);
    assert.equal(error.status, 503);
    await error.text();
    const events = await (
      await fetch(
        `http://127.0.0.1:${controlPort}/__edith_gateway/events?after=0`,
      )
    ).json();
    assert.equal(events.records.length, 2);
    const entry = events.records[0];
    assert.equal(entry.captureKind, "gateway");
    assert.equal(entry.routePath, "/api");
    assert.equal(entry.requestBody.length, 32768);
    assert.equal(entry.responseBody.length, 32768);
    assert.equal(entry.requestTruncated, true);
    assert.equal(entry.responseTruncated, true);
    assert.equal(entry.size, 40000);
    assert.equal(events.logs.length, 1);
    assert.equal(events.logs[0].level, "ERROR");
    const empty = await (
      await fetch(
        `http://127.0.0.1:${controlPort}/__edith_gateway/events?after=${events.lastId}`,
      )
    ).json();
    assert.equal(empty.records.length, 0);
    assert.equal(empty.logs.length, 0);
    for (let i = 0; i < 257; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/api/error`);
      await r.text();
    }
    const bounded = await (
      await fetch(`http://127.0.0.1:${controlPort}/__edith_gateway/events`)
    ).json();
    assert.equal(bounded.records.length, 256);
    assert.equal(bounded.logs.length, 256);
  } finally {
    await gateway.stop();
    await close(upstream);
    await close(control);
  }
});
