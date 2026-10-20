import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createGatewayManager } from "./gateway-manager.mjs";
async function listen(s) {
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  return s.address().port;
}
async function close(s) {
  const done = new Promise((resolve) => s.close(resolve));
  s.closeAllConnections();
  await done;
}
async function port() {
  const s = http.createServer();
  const p = await listen(s);
  await close(s);
  return p;
}
test("multiple listeners share backend, retain distinct capture identities and stop independently; reject collisions and cycles", async () => {
  const backend = http.createServer((req, res) => {
    res.writeHead(req.url === "/error" ? 503 : 200, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify({ path: req.url }));
  });
  const target = await listen(backend),
    control = http.createServer(),
    controlPort = await listen(control);
  const manager = createGatewayManager({
    controlOrigin: `http://127.0.0.1:${controlPort}`,
  });
  control.on("request", (req, res) => {
    void manager.middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  const base = `http://127.0.0.1:${controlPort}/__edith_gateway`;
  async function status(id) {
    return (await fetch(`${base}/status?gateway=${id}`)).json();
  }
  async function change(id, action, body) {
    const s = await status(id);
    const r = await fetch(`${base}/${action}?gateway=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Edith-Token": s.token },
      body: JSON.stringify(body || {}),
    });
    return { code: r.status, data: await r.json() };
  }
  const config = (p) => ({
    port: p,
    routes: [
      {
        id: "api",
        path: "/api",
        target: `http://127.0.0.1:${target}`,
        enabled: true,
        strip: true,
        connected: true,
      },
    ],
  });
  try {
    const a = await port(),
      b = await port();
    assert.equal((await change("default", "start", config(a))).code, 200);
    assert.equal((await change("second", "start", config(b))).code, 200);
    for (const p of [a, b]) {
      const r = await fetch(`http://127.0.0.1:${p}/api/users`);
      assert.equal(r.status, 200);
      assert.equal((await r.json()).path, "/users");
    }
    let r = await fetch(`http://127.0.0.1:${b}/api/error`);
    await r.text();
    const events = await (await fetch(base + "/events")).json();
    assert.deepEqual(
      new Set(events.records.map((r) => r.gatewayId)),
      new Set(["default", "second"]),
    );
    assert.equal(new Set(events.records.map((r) => r.id)).size, 3);
    assert.match(events.logs[0].source, new RegExp(`:${b}`));
    assert.equal((await change("third", "start", config(a))).code, 400);
    const loop = config(await port());
    loop.routes[0].target = `http://127.0.0.1:${a}`;
    assert.equal((await change("third", "start", loop)).code, 400);
    await change("default", "stop");
    assert.equal((await status("second")).running, true);
    r = await fetch(`http://127.0.0.1:${b}/api/health`);
    assert.equal(r.status, 200);
    await r.text();
    assert.equal((await status("default")).running, false);
  } finally {
    await manager.stop();
    await close(control);
    await close(backend);
  }
});
