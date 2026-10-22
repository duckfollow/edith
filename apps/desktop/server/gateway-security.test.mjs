import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createGateway } from "./gateway.mjs";
import { createRateLimiter, validateSecurity } from "./gateway-security.mjs";
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function freePort() {
  const s = http.createServer();
  const p = await listen(s);
  await new Promise((r) => s.close(r));
  return p;
}
test("security validation and fixed-window rate reset use trusted peer identity", () => {
  let now = 0;
  const allow = createRateLimiter(2, () => now);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  now = 60000;
  assert.equal(allow("a"), true);
  assert.throws(() =>
    validateSecurity({
      enabled: true,
      allowedMethods: [],
      maxBodyBytes: 1,
      requestsPerMinute: 1,
    }),
  );
  assert.throws(() =>
    validateSecurity({
      enabled: true,
      allowedMethods: ["GET"],
      maxBodyBytes: -1,
      requestsPerMinute: 1,
    }),
  );
});
test("method, declared/chunked body limits and rate limit block before backend; captures reasons and WARN logs", async () => {
  let received = 0;
  const upstream = http.createServer((req, res) => {
    received++;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => res.end(body || "ok"));
  });
  const backend = await listen(upstream),
    port = await freePort(),
    gateway = createGateway();
  const config = {
    port,
    routes: [
      {
        id: "api",
        path: "/api",
        target: `http://127.0.0.1:${backend}`,
        enabled: true,
        connected: true,
        strip: true,
      },
    ],
    security: {
      enabled: true,
      allowedMethods: ["GET", "POST"],
      maxBodyBytes: 4,
      requestsPerMinute: 100,
    },
  };
  async function request(options, parts = []) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/users`,
        { ...options, agent: false },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, body, headers: res.headers }),
          );
        },
      );
      req.on("error", reject);
      for (const part of parts) req.write(part);
      req.end();
    });
  }
  try {
    await gateway.start(config);
    assert.equal((await request({ method: "GET" })).status, 200);
    assert.equal((await request({ method: "DELETE" })).status, 405);
    assert.equal(
      (
        await request({ method: "POST", headers: { "Content-Length": "5" } }, [
          "12345",
        ])
      ).status,
      413,
    );
    assert.equal(
      (
        await request(
          { method: "POST", headers: { "Transfer-Encoding": "chunked" } },
          ["123", "456"],
        )
      ).status,
      413,
    );
    assert.equal((await request({ method: "POST" }, ["1234"])).status, 200);
    assert.equal(received, 2);
    // Capture API is exercised via middleware so records are verified as clients see them.
    const control = http.createServer((req, res) => {
      req.headers.host = "127.0.0.1:1420";
      void gateway.middleware(req, res, () => res.end());
    });
    const cp = await listen(control);
    try {
      const records = await (
        await fetch(`http://127.0.0.1:${cp}/__edith_gateway/events`)
      ).json();
      assert.equal(records.records.filter((r) => r.blockedReason).length, 3);
      assert.equal(records.logs.filter((r) => r.level === "WARN").length, 3);
    } finally {
      control.closeAllConnections();
      await new Promise((r) => control.close(r));
    }
    await gateway.stop();
    await gateway.start({
      ...config,
      security: { ...config.security, requestsPerMinute: 1 },
    });
    assert.equal(
      (
        await request({
          method: "GET",
          headers: { "X-Forwarded-For": "1.1.1.1" },
        })
      ).status,
      200,
    );
    const limited = await request({
      method: "GET",
      headers: { "X-Forwarded-For": "2.2.2.2" },
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "60");
    assert.equal(received, 3);
  } finally {
    await gateway.stop();
    upstream.closeAllConnections();
    await new Promise((r) => upstream.close(r));
  }
});
