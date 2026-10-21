import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  accessPolicy,
  protectData,
  createAccessMiddleware,
} from "./access-policy.mjs";
test("policies fail on invalid roles and protect nested headers, URL credentials and bodies", () => {
  assert.throws(() => accessPolicy("owner"));
  assert.equal(accessPolicy("viewer").manageGateway, false);
  assert.equal(accessPolicy("developer").revealCredentials, false);
  const input = {
    url: "http://user:pass@localhost/users?access_token=secret&ok=1",
    requestHeaders: [{ name: "Authorization", value: "Bearer secret" }],
    requestBody: '{"password":"secret","name":"Alice"}',
    responseBody: "private",
    nested: { api_key: "secret" },
  };
  const viewer = protectData(input, accessPolicy("viewer"));
  assert.equal(viewer.requestBody, "[Body hidden by workspace policy]");
  assert.equal(viewer.responseBody, "[Body hidden by workspace policy]");
  assert.equal(viewer.requestHeaders[0].value, "[REDACTED]");
  assert.ok(!viewer.url.includes("secret"));
  assert.equal(viewer.nested.api_key, "[REDACTED]");
  const dev = protectData(input, accessPolicy("developer"));
  assert.equal(JSON.parse(dev.requestBody).password, "[REDACTED]");
  assert.equal(JSON.parse(dev.requestBody).name, "Alice");
  assert.deepEqual(protectData(input, accessPolicy("admin")), input);
  assert.equal(input.requestHeaders[0].value, "Bearer secret");
});
test("viewer server enforcement blocks mutations and strips records before transmission; cannot elevate using client headers", async () => {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const middleware = createAccessMiddleware({
    role: "viewer",
    controlOrigin: base,
  });
  server.on("request", (req, res) =>
    middleware(req, res, () => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          records: [
            {
              requestBody: "secret",
              responseHeaders: [{ name: "Set-Cookie", value: "secret" }],
            },
          ],
        }),
      );
    }),
  );
  try {
    for (const path of [
      "/__edith_gateway/start",
      "/__edith_gateway/stop",
      "/__edith_proxy/start",
      "/__edith_sdk/enable",
    ]) {
      const r = await fetch(base + path, {
        method: "POST",
        headers: { "X-Edith-Role": "admin" },
      });
      assert.equal(r.status, 403);
      await r.text();
    }
    const r = await fetch(base + "/__edith_gateway/events");
    const data = await r.json();
    assert.equal(
      data.records[0].requestBody,
      "[Body hidden by workspace policy]",
    );
    assert.equal(data.records[0].responseHeaders[0].value, "[REDACTED]");
    const policy = await (await fetch(base + "/__edith_access/policy")).json();
    assert.equal(policy.role, "viewer");
    const foreign = await fetch(base + "/__edith_access/policy", {
      headers: { Origin: "https://foreign.example" },
    });
    assert.equal(foreign.status, 403);
    await foreign.text();
  } finally {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }
});
