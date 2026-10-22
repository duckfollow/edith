import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { openWorkspaceDatabase } from "./database.mjs";
import { createAccounts } from "./accounts.mjs";
import { createGatewayManager } from "./gateway-manager.mjs";
import { createAccessMiddleware } from "./access-policy.mjs";
const owner = {
  id: "owner",
  username: "owner",
  role: "admin",
  disabled: false,
  salt: "a".repeat(32),
  hash: "b".repeat(128),
};
const config = {
  version: 1,
  security: {
    enabled: true,
    allowedMethods: ["GET", "POST"],
    maxBodyBytes: 1048576,
    requestsPerMinute: 120,
  },
  port: 8080,
  routes: [
    {
      id: "api",
      path: "/api",
      target: "http://127.0.0.1:3000",
      strip: true,
      enabled: true,
      connected: true,
    },
  ],
};
async function temporary(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "edith-sqlite-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("SQLite migrates legacy accounts once, preserves source, reopens configs and rolls back conflicts", () =>
  temporary(async (dir) => {
    const file = path.join(dir, "edith.sqlite"),
      legacy = path.join(dir, "accounts.json");
    const text = JSON.stringify({ version: 1, users: [owner] });
    await writeFile(legacy, text);
    let db = await openWorkspaceDatabase({ file, legacyAccounts: legacy });
    assert.deepEqual(db.loadUsers(), [owner]);
    db.saveUsers([{ ...owner, username: "renamed" }]);
    db.saveGateway("first", config);
    assert.throws(() => db.saveGateway("second", config));
    assert.equal(db.loadGateways().length, 1);
    assert.throws(() =>
      db.saveUsers([{ ...owner }, { ...owner, id: "second" }]),
    );
    assert.equal(db.loadUsers()[0].username, "renamed");
    db.close();
    db = await openWorkspaceDatabase({ file, legacyAccounts: legacy });
    assert.equal(db.loadUsers()[0].username, "renamed");
    assert.deepEqual(db.loadGateways(), [{ id: "first", config }]);
    db.close();
    assert.equal(await readFile(legacy, "utf8"), text);
  }));
test("invalid legacy store never silently resets accounts", () =>
  temporary(async (dir) => {
    const file = path.join(dir, "edith.sqlite"),
      legacy = path.join(dir, "accounts.json");
    await writeFile(legacy, '{"version":1,"users":[]}');
    await assert.rejects(
      openWorkspaceDatabase({ file, legacyAccounts: legacy }),
    );
  }));
test("accounts persist in SQLite and authenticate after restart without persisted sessions", () =>
  temporary(async (dir) => {
    const file = path.join(dir, "edith.sqlite");
    let db = await openWorkspaceDatabase({ file });
    const server = http.createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    let accounts = await createAccounts({
      store: db,
      controlOrigin: base,
      setupToken: "test-bootstrap-token-long-enough",
    });
    server.on("request", (req, res) => {
      void accounts.middleware(req, res, () => res.end());
    });
    const call = (name, body) =>
      fetch(base + "/__edith_auth/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      let r = await call("setup", {
        username: "owner",
        password: "sqlite-test-password",
        setupToken: "test-bootstrap-token-long-enough",
      });
      assert.equal(r.status, 201);
      const cookie = r.headers.get("set-cookie").split(";")[0];
      await r.json();
      db.close();
      db = await openWorkspaceDatabase({ file });
      accounts = await createAccounts({ store: db, controlOrigin: base });
      assert.equal(accounts.initialized(), true);
      assert.equal(accounts.identity({ headers: { cookie } }), null);
      r = await call("login", {
        username: "owner",
        password: "sqlite-test-password",
      });
      assert.equal(r.status, 200);
      await r.json();
      assert.equal(db.loadUsers().length, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  }));
test("Gateway config API saves to SQLite, requires control token and workspace write role", () =>
  temporary(async (dir) => {
    const db = await openWorkspaceDatabase({
      file: path.join(dir, "edith.sqlite"),
    });
    const server = http.createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const manager = createGatewayManager({ store: db, controlOrigin: base });
    let role = "admin";
    server.on("request", (req, res) =>
      createAccessMiddleware({ role, controlOrigin: base })(req, res, () => {
        void manager.middleware(req, res, () => {
          res.statusCode = 404;
          res.end();
        });
      }),
    );
    try {
      const state = await (
        await fetch(base + "/__edith_gateway/status?gateway=first")
      ).json();
      const url = base + "/__edith_gateway/config?gateway=first";
      let r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      assert.equal(r.status, 403);
      await r.text();
      r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Edith-Token": state.token,
        },
        body: JSON.stringify(config),
      });
      assert.equal(r.status, 200);
      await r.text();
      const list = await (
        await fetch(base + "/__edith_gateway/configs")
      ).json();
      assert.equal(list.gateways[0].id, "first");
      assert.equal(list.gateways[0].config.port, 8080);
      role = "viewer";
      r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Edith-Token": state.token,
        },
        body: JSON.stringify({ ...config, port: 8081 }),
      });
      assert.equal(r.status, 403);
      await r.text();
      assert.equal(db.loadGateways()[0].config.port, 8080);
    } finally {
      await manager.stop();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  }));
