import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAccounts } from "./accounts.mjs";
import { createAccessMiddleware } from "./access-policy.mjs";
test("Team accounts: setup, hashed persistence, session roles, admin isolation, revocation, last Admin and logout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "edith-accounts-")),
    file = path.join(directory, "accounts.json");
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const accounts = await createAccounts({
      file,
      controlOrigin: base,
      setupToken: "test-setup-token-at-least-24-characters",
    }),
    guard = createAccessMiddleware({
      controlOrigin: base,
      identity: accounts.identity,
    });
  server.on("request", (req, res) => {
    void accounts.middleware(req, res, () =>
      guard(req, res, () => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ responseBody: "private", token: "pair-secret" }),
        );
      }),
    );
  });
  async function call(
    endpoint,
    { cookie = "", body, method = body ? "POST" : "GET", origin } = {},
  ) {
    const r = await fetch(base + endpoint, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      code: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      headers: r.headers,
    };
  }
  const auth = "/__edith_auth";
  const password = "example-long-password";
  try {
    assert.equal((await call("/__edith_gateway/events")).code, 401);
    assert.equal(
      (
        await call(auth + "/setup", {
          body: { username: "owner", password, setupToken: "wrong" },
        })
      ).code,
      403,
    );
    const setup = await call(auth + "/setup", {
      body: {
        username: "owner",
        password,
        setupToken: "test-setup-token-at-least-24-characters",
      },
    });
    assert.equal(setup.code, 201);
    const owner = setup.cookie;
    assert.ok(setup.headers.get("set-cookie").includes("HttpOnly"));
    assert.ok(setup.headers.get("set-cookie").includes("SameSite=Strict"));
    assert.equal(
      (
        await call(auth + "/setup", {
          body: {
            username: "other",
            password,
            setupToken: "test-setup-token-at-least-24-characters",
          },
        })
      ).code,
      409,
    );
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.ok(!JSON.stringify(saved).includes(password));
    assert.equal(saved.users[0].hash.length, 128);
    const viewer = await call(auth + "/users", {
      cookie: owner,
      body: { username: "reader", password, role: "viewer" },
    });
    assert.equal(viewer.code, 201);
    const bad = await call(auth + "/login", {
      body: { username: "reader", password: "wrong" },
    });
    assert.equal(bad.code, 401);
    const login = await call(auth + "/login", {
      body: { username: "reader", password },
    });
    assert.equal(login.code, 200);
    const reader = login.cookie;
    assert.equal((await call(auth + "/users", { cookie: reader })).code, 403);
    assert.equal(
      (await call("/__edith_gateway/start", { cookie: reader, body: {} })).code,
      403,
    );
    const policy = await call("/__edith_access/policy", { cookie: reader });
    assert.equal(policy.data.role, "viewer");
    assert.equal(policy.data.mode, "team");
    const records = await call("/__edith_gateway/events", { cookie: reader });
    assert.equal(
      records.data.responseBody,
      "[Body hidden by workspace policy]",
    );
    assert.equal(records.data.token, "[REDACTED]");
    assert.equal(
      (
        await call(auth + "/users/update", {
          cookie: owner,
          body: { id: setup.data.user.id, role: "viewer", disabled: false },
        })
      ).code,
      409,
    );
    assert.equal(
      (
        await call(auth + "/users/update", {
          cookie: owner,
          body: { id: viewer.data.user.id, role: "developer", disabled: false },
        })
      ).code,
      200,
    );
    assert.equal(
      (await call("/__edith_access/policy", { cookie: reader })).code,
      401,
    );
    const developer = await call(auth + "/login", {
      body: { username: "reader", password },
    });
    assert.equal(
      (await call("/__edith_access/policy", { cookie: developer.cookie })).data
        .role,
      "developer",
    );
    await call(auth + "/users/update", {
      cookie: owner,
      body: { id: viewer.data.user.id, role: "developer", disabled: true },
    });
    assert.equal(
      (await call("/__edith_access/policy", { cookie: developer.cookie })).code,
      401,
    );
    assert.equal(
      (await call(auth + "/login", { body: { username: "reader", password } }))
        .code,
      401,
    );
    const cross = await call(auth + "/logout", {
      cookie: owner,
      body: {},
      origin: "https://foreign.example",
    });
    assert.equal(cross.code, 403);
    await call(auth + "/logout", { cookie: owner, body: {} });
    assert.equal(
      (await call("/__edith_access/policy", { cookie: owner })).code,
      401,
    );
    const restarted = await createAccounts({ file, controlOrigin: base });
    assert.equal(restarted.initialized(), true);
    assert.equal(restarted.identity({ headers: { cookie: owner } }), null);
  } finally {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});
test("corrupt account store fails closed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "edith-accounts-"));
  const file = path.join(directory, "accounts.json");
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, '{"version":1,"users":[]}');
    await assert.rejects(createAccounts({ file }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
